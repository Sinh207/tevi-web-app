'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { authApi, type Username } from '../../api/auth-api'
import { toOtpStepErrorKey, toSendCodeErrorKey } from '../../lib/auth-error'
import {
    checkPassword,
    confirmationErrorKey,
    isPasswordValid,
    PASSWORD_MAX_LENGTH,
} from '../../lib/password-policy'
import { AuthTextField, PasswordField } from '../auth-fields'
import { OtpInput } from '../otp-input'
import { PasswordChecklist } from './password-checklist'
import { PasswordStepHeader, PasswordStepProgress } from './password-step-header'

/**
 * Adding a **first** password to an account that has only ever signed in with a provider:
 * nominate an address, prove it with a code, choose the password.
 *
 * Ported from legacy's `containers/settingPassword` (connect email → verify code → create
 * password), with its three separate contexts and five hooks collapsed into one component,
 * for the same reason `ForgotPasswordFlow` is one component: the three steps share `sid`,
 * `otp` and the address, and splitting state that is threaded through every step across
 * providers is how the two ended up able to disagree.
 *
 * ## `sid` is the thread
 *
 * `send-otp` issues it and every later call presents it beside the code — it is how the
 * backend knows which send a code belongs to. A resend issues a **new** one, so it must
 * replace the old value, and going back to change the address must drop it: verifying
 * against a stale `sid` fails for a reason nothing on screen explains.
 *
 * ## `purpose: 'verify'`
 *
 * Not `'setup'` — that value does not exist (B7, answered), and `setup-credentials/` sends
 * no `purpose` of its own, so `verify` is what the two OTP calls ahead of it carry. This
 * flow is legacy's `useConnectEmail` → `useVerifyCode` pair, which sends the same. See
 * `OtpPurpose` in `api/auth-api.ts`.
 */

/**
 * How long a code is good for, and therefore how long resend stays shut. One timer for
 * both, as legacy has it (`hooks/useVerifyCode.js`): when it runs out the code is dead
 * *and* a new one may be asked for, so two numbers would only create a window where
 * neither works.
 */
const CODE_TTL_SECONDS = 60

/** Digits in the code. The backend decides this; the hint copy says it out loud. */
const OTP_LENGTH = 6

/** Legacy's own test (`hooks/useConnectEmail.js`). Deliberately permissive — the address is
 * proved by the code that follows, so the only job here is to catch a typo before a round
 * trip, not to adjudicate RFC 5322. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STEPS = ['email', 'code', 'password'] as const
type Step = (typeof STEPS)[number]

const mmss = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`

export function PasswordSetupFlow({
    /** The profile's address, pre-filled as legacy pre-fills it — still verified. */
    initialEmail,
    onCreated,
}: {
    initialEmail?: string
    onCreated: () => void
}) {
    const { t } = useTranslation()

    const [step, setStep] = useState<Step>('email')
    const [email, setEmail] = useState(initialEmail ?? '')
    const [sid, setSid] = useState('')
    const [otp, setOtp] = useState('')
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [secondsLeft, setSecondsLeft] = useState(0)

    /**
     * Guards the network call. A ref, not `busy`: `setBusy` lands on the next render, so two
     * calls in the same tick would both read `false` and both hit the network.
     */
    const inFlight = useRef(false)

    const trimmedEmail = email.trim()
    const username: Username = { kind: 'email', value: trimmedEmail }
    const emailValid = EMAIL_RE.test(trimmedEmail)
    const expired = step === 'code' && secondsLeft === 0
    const checks = checkPassword(password)
    const mismatchKey = confirmationErrorKey(password, confirmation)
    const canCreate = isPasswordValid(password) && confirmation === password

    /**
     * One `setTimeout` per tick rather than a single `setInterval`: it re-derives from state
     * each time, so it cannot drift or double up, and React tears it down cleanly when the
     * step changes or the component unmounts.
     */
    useEffect(() => {
        if (step !== 'code' || secondsLeft === 0) return
        const id = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
        return () => clearTimeout(id)
    }, [step, secondsLeft])

    /**
     * Every call is the same shape: disable, run, advance or report.
     *
     * The mapper is an argument rather than something derived from `step`, because the two
     * do not line up: **resend runs on the code step but is a `send-otp` call**, so keying
     * off the step reported "that code is incorrect or has expired" for a request in which
     * no code was ever checked. The call knows which endpoint it is; the step does not.
     */
    async function run(toErrorKey: (error: unknown) => string, fn: () => Promise<void>) {
        if (inFlight.current) return
        inFlight.current = true
        setBusy(true)
        setErrorKey(null)
        try {
            await fn()
        } catch (error) {
            setErrorKey(toErrorKey(error))
        } finally {
            inFlight.current = false
            setBusy(false)
        }
    }

    const sendCode = (advance: boolean) =>
        run(toSendCodeErrorKey, async () => {
            const res = await authApi.sendOtp({ username, purpose: 'verify' })
            // A new send invalidates the previous code, so the old `sid` and whatever was
            // typed both go with it.
            setSid(res.sid)
            setOtp('')
            setSecondsLeft(CODE_TTL_SECONDS)
            if (advance) setStep('code')
        })

    const verify = (code: string) =>
        run(toOtpStepErrorKey, async () => {
            try {
                await authApi.verifyOtp({ username, otp: code, purpose: 'verify', sid })
                setStep('password')
            } catch (error) {
                // Clear the boxes so the next attempt starts from an empty field rather than
                // from six digits already known to be wrong.
                setOtp('')
                throw error
            }
        })

    /**
     * The sixth digit submits. A change handler rather than an effect watching `otp`:
     * completion *is* an event, so there is nothing to synchronise — and an effect would
     * re-run on every render, needing a dependency list and a guard to undo what the render
     * loop kept doing.
     */
    const onOtpChange = (next: string) => {
        setOtp(next)
        if (next.length === OTP_LENGTH && !expired) void verify(next)
    }

    /**
     * Back to the address, which is the only thing this step cannot fix in place.
     *
     * Refused while a request is in flight, and the button is disabled to say so: a verify
     * that resolves *after* the step has been left would call `setStep('password')` and land
     * the user on a password form for the address they had just walked away from.
     */
    const editEmail = () => {
        if (inFlight.current) return
        // The code and its `sid` belong to the address being left behind.
        setSid('')
        setOtp('')
        setSecondsLeft(0)
        setErrorKey(null)
        setStep('email')
    }

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (step === 'email') {
            if (!emailValid) return setErrorKey('auth_email_invalid')
            return void sendCode(true)
        }
        // A half-typed code cannot be right, and submitting it spends an attempt and
        // clears the boxes. The sixth digit is what normally submits this step; Enter
        // only repeats that, and only when there is something to repeat.
        if (step === 'code') {
            if (otp.length === OTP_LENGTH && !expired) void verify(otp)
            return
        }

        void run(toOtpStepErrorKey, async () => {
            try {
                await authApi.setupCredentials({ username, otp, password, sid })
            } catch (error) {
                /*
                 * The code is presented again here, minutes after it was verified — so the
                 * failure this step actually sees is an expired one, and the place to fix it
                 * is the step before. Dropping the user back with the timer already at zero
                 * puts Resend directly under the error that sent them there.
                 *
                 * The password they typed is kept: they will need it again in a moment, and
                 * clearing it would punish them for the code's timing.
                 */
                if (toOtpStepErrorKey(error) === 'auth_otp_invalid') {
                    setOtp('')
                    setSecondsLeft(0)
                    setStep('code')
                }
                throw error
            }
            onCreated()
        })
    }

    const stepCopy = {
        email: {
            /*
             * **`send`**, standing in for the envelope the comps draw: icons come only from the DS
             * sprite (`/dev/icons`), which has none. The same stand-in as the two-step-verification
             * email steps, so the two connect-email screens agree.
             */
            icon: { name: 'send', weight: 'filled' } as const,
            title: 'password_connect_title',
            description: 'password_connect_description',
        },
        code: {
            icon: { name: 'shield', weight: 'filled' } as const,
            title: 'password_verify_title',
            description: 'password_verify_description',
        },
        password: {
            icon: { name: 'lock-simple', weight: 'filled' } as const,
            title: 'password_create_title',
            description: 'password_create_description',
        },
    }[step]

    return (
        /*
         * `key={step}` remounts the subtree on every step, which is what replays the entrance:
         * React would otherwise reuse the elements and the animation would run once, on mount.
         * The field *values* are unaffected — they live in this component's state, one level
         * up, which is what lets the password survive the bounce back to the code step.
         */
        <form
            data-testid="auth-password-setup-form"
            key={step}
            onSubmit={submit}
            className="flex w-full flex-col gap-4 md:gap-6"
        >
            <PasswordStepHeader
                icon={stepCopy.icon}
                title={t(stepCopy.title)}
                description={t(stepCopy.description)}
                // Not on the first step: the field below *is* the address, and printing it
                // above the input it is being typed into is an echo, not information.
                email={step === 'email' ? undefined : trimmedEmail}
            />

            <div className={cn('flex flex-col gap-4 md:gap-6', RISE)} style={riseDelay(2)}>
                <PasswordStepProgress steps={STEPS} current={step} />

                {step === 'email' && (
                    <AuthTextField
                        data-testid="auth-password-setup-email"
                        label={t('auth_email')}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        // The step exists for nothing else, and it is reached by an explicit
                        // navigation rather than appearing unasked.
                        autoFocus
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder={t('auth_email_placeholder')}
                        hint={t('password_connect_hint')}
                        // Format only, and only once something has been typed — a field cannot
                        // be wrong before it has been filled in.
                        error={trimmedEmail && !emailValid ? t('auth_email_invalid') : undefined}
                    />
                )}

                {step === 'code' && (
                    <div className="flex flex-col gap-2">
                        <OtpInput
                            value={otp}
                            onChange={onOtpChange}
                            length={OTP_LENGTH}
                            /*
                             * Only when the code is dead. **Not** while the request is in
                             * flight: disabling a focused input makes the browser drop focus
                             * to `body`, so after a rejected code the boxes come back enabled
                             * but unfocused — nothing typed goes anywhere, and on a phone the
                             * keyboard closes. `inFlight` already stops a second request.
                             */
                            disabled={expired}
                            autoFocus
                        />
                        {/* One line, three jobs. There is no Continue button on this step —
                            the sixth digit submits — so this is the only place it can report
                            itself. */}
                        {busy ? (
                            <span
                                aria-live="polite"
                                className="type-caption-meta text-(--text-subtitle)"
                            >
                                {t('auth_otp_checking')}
                            </span>
                        ) : expired ? (
                            <button
                                data-testid="auth-password-resend"
                                type="button"
                                onClick={() => void sendCode(false)}
                                className="type-caption-meta cursor-pointer self-start text-(--text-link) underline underline-offset-2 hover:no-underline"
                            >
                                {t('auth_otp_resend')}
                            </button>
                        ) : (
                            <span
                                aria-live="polite"
                                className="type-caption-meta text-(--text-subtitle)"
                            >
                                {t('auth_otp_resend_in', { time: mmss(secondsLeft) })}
                            </span>
                        )}
                    </div>
                )}

                {step === 'password' && (
                    <>
                        {/*
                         * For password managers, not for people. A change/create form with no
                         * username field gets saved against the wrong site or not offered at
                         * all; `sr-only` + `tabIndex={-1}` keeps it out of the visual order and
                         * out of the tab order while leaving it a real, readable field.
                         */}
                        <input
                            type="text"
                            name="username"
                            autoComplete="username"
                            value={trimmedEmail}
                            readOnly
                            tabIndex={-1}
                            aria-hidden
                            className="sr-only"
                        />
                        <PasswordField
                            data-testid="auth-password-setup-new"
                            label={t('password_new_label')}
                            autoComplete="new-password"
                            maxLength={PASSWORD_MAX_LENGTH}
                            autoFocus
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            footer={<PasswordChecklist checks={checks} className="pt-1" />}
                        />
                        <PasswordField
                            data-testid="auth-password-setup-confirm"
                            label={t('password_confirm_label')}
                            autoComplete="new-password"
                            maxLength={PASSWORD_MAX_LENGTH}
                            value={confirmation}
                            onChange={e => setConfirmation(e.target.value)}
                            error={mismatchKey ? t(mismatchKey) : undefined}
                        />
                    </>
                )}

                {/* An expired code is not a failed request, so it is stated even when nothing
                    threw — waiting the timer out would otherwise leave the screen silent. A
                    real error takes precedence: it is the more specific thing that just
                    happened. */}
                {(errorKey || expired) && (
                    <p
                        role="alert"
                        className={cn(
                            'type-dense-default w-full rounded-lg px-4 py-3',
                            'bg-(--accents-error-bg-active) text-(--text-error)',
                            RISE,
                        )}
                    >
                        {t(errorKey ?? 'auth_otp_expired')}
                    </p>
                )}

                {/* No button on the code step: the sixth digit submits, so a Continue button
                    would spend the step disabled and then fire something already done. */}
                {step !== 'code' ? (
                    <Button
                        data-testid="auth-password-setup-submit"
                        type="submit"
                        variant="accent"
                        size="large"
                        fullWidth
                        disabled={busy || (step === 'email' ? !emailValid : !canCreate)}
                        aria-busy={busy || undefined}
                        // A press that moves. The DS draws no pressed state for Button (Figma
                        // models Hover and Disabled only), so this is an addition — one step
                        // smaller than the usual 3%, because a full-width button travelling
                        // that far is a visible lurch.
                        className="active:not-disabled:scale-[0.99]"
                    >
                        {t(step === 'email' ? 'password_send_code' : 'password_create_cta')}
                        {/* The label does not change while working: swapping it moves the
                            text, changes the button's width mid-press and loses the one word
                            that says what is about to happen. `bg-current` on the dots because
                            the DS's own dot colour is a translucent near-black — correct on a
                            page, invisible on a filled button. */}
                        {busy ? <Loader className="size-5 [&>span]:bg-current" /> : null}
                    </Button>
                ) : (
                    <button
                        data-testid="auth-password-edit-email"
                        type="button"
                        onClick={editEmail}
                        disabled={busy}
                        className={cn(
                            'type-caption-meta cursor-pointer self-start text-(--text-link)',
                            'underline underline-offset-2 hover:no-underline',
                            'disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60',
                        )}
                    >
                        {t('password_change_email')}
                    </button>
                )}
            </div>
        </form>
    )
}
