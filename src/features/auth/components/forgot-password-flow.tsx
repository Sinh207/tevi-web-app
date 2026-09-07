'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { useId, useRef, useState } from 'react'
import { authApi, type Username } from '../api/auth-api'
import { useResendCountdown } from '../hooks/use-resend-countdown'
import { toResetErrorKey } from '../lib/auth-error'
import { AUTH_FIELD_CLASS } from './auth-fields'
import { AuthStepHeader } from './auth-step-header'
import { OtpInput } from './otp-input'

/**
 * Reset a forgotten password, in three steps inside the card.
 *
 * Not its own route: the flow is only reachable from the sign-in form, cancelling has to
 * land back on it, and a half-finished reset behind a URL is something people bookmark
 * and return to with a `sid` that expired days ago. It takes the card over the same way
 * a Turnstile challenge does.
 *
 * **`sid` is the thread that holds it together.** `send-otp` issues it, and every later
 * call has to present it alongside the code — it is how the backend knows which send a
 * given code belongs to. A resend issues a *new* one, so it has to replace the old
 * value; verifying against a stale `sid` fails for a reason nothing on screen explains.
 *
 * ⚠ The payload shape is ported from legacy and **not yet confirmed** — see B7 in
 * `docs/BACKEND_QUESTIONS.md`. If it is wrong, this is where it shows.
 */

type Step = 'request' | 'verify' | 'reset'

/**
 * How long a code is good for, and therefore how long resend stays shut.
 *
 * One timer for both, as legacy does (`hooks/useVerifyCode.js`): the moment it runs out
 * the code is dead *and* a new one may be asked for, so splitting it into two numbers
 * would only create a window where neither works.
 */
const CODE_TTL_SECONDS = 60

/** Digits in the code. The backend decides this; `auth_otp_hint` says it out loud. */
const OTP_LENGTH = 6

const mmss = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`

export function ForgotPasswordFlow({ onCancel }: { onCancel: () => void }) {
    const { t } = useTranslation()
    const [step, setStep] = useState<Step>('request')
    const [email, setEmail] = useState('')
    const [otp, setOtp] = useState('')
    const [password, setPassword] = useState('')
    const [sid, setSid] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const fieldId = useId()
    /**
     * Guards the network call. A ref, not `busy`: `setBusy` lands on the next render, so
     * two calls in the same tick would both read `false` and both hit the network.
     */
    const inFlight = useRef(false)

    /*
     * The clock is `useResendCountdown`'s — three flows held the same `useState` plus the same tick
     * effect. `expired` stays here: it needs the step, which that hook deliberately does not know.
     */
    const { secondsLeft, start: startCountdown } = useResendCountdown(CODE_TTL_SECONDS)

    const username: Username = { kind: 'email', value: email }
    const expired = step === 'verify' && secondsLeft === 0

    /**
     * Every step is the same shape: disable, call, advance or report.
     *
     * The guard is a ref, not `busy`: `setBusy` lands on the next render, so two calls in
     * the same tick would both read `false` and both hit the network.
     */
    async function run(fn: () => Promise<void>) {
        if (inFlight.current) return
        inFlight.current = true
        setBusy(true)
        setErrorKey(null)
        try {
            await fn()
        } catch (error) {
            setErrorKey(toResetErrorKey(error))
        } finally {
            inFlight.current = false
            setBusy(false)
        }
    }

    const requestCode = () =>
        run(async () => {
            const res = await authApi.sendOtp({ username, purpose: 'reset' })
            setSid(res.sid)
            startCountdown()
            setStep('verify')
        })

    const resend = () =>
        run(async () => {
            const res = await authApi.sendOtp({ username, purpose: 'reset' })
            // The new send invalidates the old code, so the old `sid` and whatever the
            // user had typed both have to go with it.
            setSid(res.sid)
            setOtp('')
            startCountdown()
        })

    const verify = (code: string) =>
        run(async () => {
            try {
                await authApi.verifyOtp({ username, otp: code, purpose: 'reset', sid })
                setStep('reset')
            } catch (error) {
                // Clear the boxes so the next attempt starts from an empty field rather
                // than from six digits already known to be wrong.
                setOtp('')
                throw error
            }
        })

    /**
     * The sixth digit submits. This is a change handler rather than an effect watching
     * `otp`: completion *is* an event, so there is nothing to synchronise — and an effect
     * would re-run on every render, needing a dependency list and a guard to undo what
     * the render loop kept doing.
     */
    const onOtpChange = (next: string) => {
        setOtp(next)
        if (next.length === OTP_LENGTH && !expired) void verify(next)
    }

    const submit = (event: React.FormEvent) => {
        event.preventDefault()
        if (step === 'request') return void requestCode()
        if (step === 'verify') return void verify(otp)
        void run(async () => {
            await authApi.resetPassword({ username, otp, new_password: password, sid })
            // Back to sign-in rather than straight in: the reset endpoint does not mint a
            // session, and pretending otherwise would strand them on a signed-out shell.
            onCancel()
        })
    }

    const copy = {
        request: { title: 'auth_forgot_title', hint: 'auth_forgot_hint' },
        verify: { title: 'auth_otp_title', hint: 'auth_otp_hint' },
        reset: { title: 'auth_new_password_title', hint: 'auth_new_password_hint' },
    }[step]

    /**
     * The button's two labels per step, together.
     *
     * Both used to fall back to `common_loading` — "Loading…", which describes nothing the
     * user asked for. A button says what it is doing: sending a code, or saving a
     * password. The code step has no entry because it has no button; its in-flight state
     * is the `Checking…` line under the boxes.
     */
    const cta = {
        request: { idle: 'auth_forgot_send', busy: 'auth_forgot_sending' },
        reset: { idle: 'auth_forgot_save', busy: 'auth_forgot_saving' },
    }

    return (
        <form
            data-testid="auth-forgot-form"
            onSubmit={submit}
            className="flex w-full flex-col gap-4"
        >
            <AuthStepHeader title={t(copy.title)} onBack={onCancel} />

            <p className="type-dense-default text-text-body">
                {t(copy.hint, { email: email || t('auth_email').toLowerCase() })}
            </p>

            {step === 'request' && (
                <input
                    data-testid="auth-forgot-email"
                    id={fieldId}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('auth_email_placeholder')}
                    autoComplete="email"
                    required
                    className={AUTH_FIELD_CLASS}
                />
            )}

            {step === 'verify' && (
                <div className="flex flex-col gap-2">
                    <OtpInput
                        value={otp}
                        onChange={onOtpChange}
                        length={OTP_LENGTH}
                        // Only when the code is dead. **Not** while the request is in
                        // flight: disabling a focused input makes the browser drop focus
                        // to `body`, so after a rejected code the boxes came back enabled
                        // but unfocused — nothing typed went anywhere, and on a phone the
                        // keyboard closed. `inFlight` already stops a second request, so
                        // there is nothing left for `disabled` to protect.
                        disabled={expired}
                        autoFocus
                    />
                    {/* Counting down, this is the reason resend is unavailable; at zero it
                        becomes the control itself. `aria-live` is on the countdown so a
                        screen reader is told when it opens up, without reading every
                        second aloud. */}
                    {/* One line, three jobs. With the Continue button gone this is the
                        only place the step can report itself, so the in-flight state has
                        to live here too — otherwise the sixth digit starts a request that
                        nothing on screen acknowledges. */}
                    {busy ? (
                        <span aria-live="polite" className="type-caption-meta text-text-subtitle">
                            {t('auth_otp_checking')}
                        </span>
                    ) : expired ? (
                        <button
                            data-testid="auth-forgot-resend"
                            type="button"
                            onClick={() => void resend()}
                            className="type-caption-meta cursor-pointer self-start text-text-link underline underline-offset-2 hover:no-underline"
                        >
                            {t('auth_otp_resend')}
                        </button>
                    ) : (
                        <span aria-live="polite" className="type-caption-meta text-text-subtitle">
                            {t('auth_otp_resend_in', { time: mmss(secondsLeft) })}
                        </span>
                    )}
                </div>
            )}

            {step === 'reset' && (
                <input
                    data-testid="auth-forgot-new-password"
                    id={fieldId}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('auth_password_placeholder')}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    className={AUTH_FIELD_CLASS}
                />
            )}

            {/* An expired code is not a failed request, so it is stated even when nothing
                threw — waiting out the timer used to leave the screen silent. A real error
                takes precedence: it is the more specific thing that just happened. */}
            {(errorKey || expired) && (
                <p
                    role="alert"
                    className="type-dense-default w-full rounded-lg bg-(--accents-error-bg-active) px-4 py-3 text-text-error"
                >
                    {t(errorKey ?? 'auth_otp_expired')}
                </p>
            )}

            {/* No button on the code step: the sixth digit submits, so a Continue button
                would spend the whole step disabled and then fire something that has
                already happened. Resend is the only action left there, and it is above. */}
            {step !== 'verify' && (
                <Button
                    data-testid="auth-forgot-submit"
                    type="submit"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={busy}
                >
                    {t(busy ? cta[step].busy : cta[step].idle)}
                </Button>
            )}
        </form>
    )
}
