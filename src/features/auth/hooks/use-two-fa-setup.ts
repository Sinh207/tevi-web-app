'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { twoFaApi } from '../api/two-fa-api'
import { toSendCodeErrorKey, toTwoFaCreateErrorKey } from '../lib/auth-error'
import { useAuth } from '../providers/auth-provider'
import { HINT_MAX_LENGTH, PASSCODE_LENGTH } from './use-two-fa-flow'

/**
 * Turning two-step verification **on** — the five screens between "Set it up" and a passcode the
 * backend will start enforcing.
 *
 * `passcode` → `reenter` → `hint` → `email` → `code`, then one write and `done`.
 *
 * ## Why the write is last, and why that order is not ours to shuffle
 *
 * `POST v1/two-fa/passcode/` takes **all four fields at once** — passcode, hint, recovery address and
 * a code proving that address (`twoFaApi.createPasscode`). So nothing can be committed early: the
 * flow is a form spread over five screens, and the last digit of the emailed code is what submits it.
 *
 * That is also the order the mobile app's copy is written in — the passcode first, the address last
 * (`two_step_verification_w2_*` in the legacy locale files, which is where this screen's spec lives:
 * legacy's **web** app never built it). Choosing the passcode first is the right way round for a
 * second reason: it is the decision the reader came to make, and asking for an inbox before they have
 * made it is asking for a favour before saying what for.
 *
 * ## What a failure costs, per step
 *
 * Nothing until `email`. The first three steps make **no request at all** — a passcode is being
 * chosen, not checked, and a mismatch on `reenter` is a local comparison. That is what makes it safe
 * to spend five screens of the reader's attention: the only two calls are at the end, and both are
 * recoverable in place (resend, or a different address).
 *
 * ## Where the emailed code comes from
 *
 * ✅ **`POST v1/recovery-email/verify/`** (`twoFaApi.sendRecoveryEmailOtp`), per the auth contract,
 * which names `POST two-fa/passcode/` as one of that OTP's two consumers.
 *
 * This asked `authApi.sendOtp({ purpose: 'verify' })` for a while — the app's one *other*
 * code-to-an-address call, and the one `PasswordSetupFlow` uses. That is the **login** OTP: a
 * different code from a different family, which `POST passcode/` would have refused. The reasoning
 * behind the guess was sound (`recover/` mails the address the backend already holds, which an
 * account turning this on does not have) and the conclusion was still wrong — which is exactly why
 * the call was kept to one line.
 *
 * `verify-otp/` is deliberately **not** called in between, unlike the password flow, and the reason
 * is simpler than the one written here before: it belongs to a **different OTP family**. This code
 * comes from `recovery-email/verify/`; `user-login/verify-otp/` checks a *login* code and would
 * reject it. `POST passcode/` takes the `otp` and checks it itself, so there is nothing a second
 * call could add.
 *
 * ⚠ The claim this note used to make — that `authApi.verifyOtp` "answers with a token, because it is
 * a sign-in call" — is **wrong**: it answers `{}` and deliberately does not spend the code (auth
 * contract). The conclusion survived the correction; the reasoning did not, and it was the kind that
 * gets copied into the next flow.
 */

/**
 * How long the emailed code lives, and therefore how long *Resend* stays shut.
 *
 * **60**, matching `PasswordSetupFlow` — not `useTwoFaFlow`'s 30. The two numbers belong to two
 * different endpoints: this code comes from `user-login/send-otp/` (B7's answer), that one from
 * `two-fa/passcode/recover/` (B88's). They are not the same lifetime and folding them into one
 * constant would be a guess about whichever endpoint lost.
 */
const CODE_TTL_SECONDS = 60

/**
 * Legacy's own test (`hooks/useConnectEmail.js`), deliberately permissive: the address is proved by
 * the code that follows, so the job here is to catch a typo before a round trip, not to adjudicate
 * RFC 5322.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SETUP_STEPS = ['passcode', 'reenter', 'hint', 'email', 'code'] as const
export type TwoFaSetupStep = (typeof SETUP_STEPS)[number] | 'done'

/** Where *Back* goes. `passcode` is the root; `done` is past the point of going anywhere. */
const PREVIOUS: Record<TwoFaSetupStep, TwoFaSetupStep | null> = {
    passcode: null,
    reenter: 'passcode',
    hint: 'reenter',
    email: 'hint',
    code: 'email',
    done: null,
}

export interface TwoFaSetup {
    step: TwoFaSetupStep
    /** The passcode being chosen. Six digits, and it never leaves this hook until the write. */
    passcode: string
    setPasscode: (next: string) => void
    /** The `reenter` step's copy, compared locally. */
    confirm: string
    setConfirm: (next: string) => void
    hint: string
    setHint: (next: string) => void
    email: string
    setEmail: (next: string) => void
    /** Whether the address would pass the format check — what the *Send code* button reads. */
    isEmailValid: boolean
    otp: string
    setOtp: (next: string) => void
    /** Seconds until the emailed code may be re-sent — and until it dies. `0` means now. */
    resendIn: number
    /** The emailed code has run out. Only ever true on `code`. */
    isCodeExpired: boolean
    /** A translation key, never a backend sentence. */
    errorKey: string | null
    busy: boolean
    canGoBack: boolean
    back: () => void
    /** Leave the hint step. `false` is *Skip*, which still sends `passcode_hint: ''`. */
    submitHint: (withHint: boolean) => void
    /** Ask for a code. `advance` is false for a resend, which stays on the step it is on. */
    sendCode: (advance: boolean) => void
    resend: () => void
    restart: () => void
}

export function useTwoFaSetup({
    /** The profile's address, pre-filled as `PasswordSetupFlow` pre-fills it — still proved by code. */
    initialEmail,
    /** Two-step verification is now on. The screen re-reads `/me` and shows the success step. */
    onEnabled,
}: {
    initialEmail?: string
    onEnabled: () => void
}): TwoFaSetup {
    const { activeId } = useAuth()
    const [step, setStep] = useState<TwoFaSetupStep>('passcode')
    const [passcode, setPasscodeState] = useState('')
    const [confirm, setConfirmState] = useState('')
    const [hint, setHintState] = useState('')
    const [hintToSend, setHintToSend] = useState('')
    const [email, setEmailState] = useState(initialEmail ?? '')
    /*
     * **The profile's address, re-read on every render.**
     *
     * `useState` reads its argument once, and this hook is mounted by `TwoFaSettings` — *above* the
     * bootstrap gate, so the whole screen's back button can walk it. At that first render `/me` has
     * not landed, `accountEmail(currentUser)` is `null`, and the field would be seeded empty and stay
     * empty: the reader reaches the address step four screens later with a blank input and a disabled
     * button, on an account whose address the app already knows.
     *
     * Measured in the browser, and invisible in a test that mounts the hook with the value already
     * present — which is how it survived the move. `restart()` seeds from this ref, and the screen
     * calls `restart()` on the way into the flow.
     */
    const initialEmailRef = useRef(initialEmail)
    initialEmailRef.current = initialEmail
    const [otp, setOtpState] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [resendIn, setResendIn] = useState(0)

    /**
     * One latch for every call in the flow — there is never more than one in the air, the steps being
     * strictly sequential. A ref and not `busy`, because `setBusy` lands on the next render: a paste
     * racing an SMS autofill reads `false` twice and fires twice, and on the create call that would
     * spend an OTP the reader cannot re-obtain without another email.
     */
    const inFlight = useRef(false)

    const trimmedEmail = email.trim()
    const isEmailValid = EMAIL_RE.test(trimmedEmail)
    /*
     * Derived, not stored: it is a function of the step and the countdown, and a second piece of state
     * saying the same thing is a second thing to get out of step with the timer.
     */
    const isCodeExpired = step === 'code' && resendIn === 0

    /*
     * One `setTimeout` per tick rather than a `setInterval`: it re-derives from state each time, so it
     * cannot drift or double up, and React tears it down cleanly on unmount.
     */
    useEffect(() => {
        if (resendIn === 0) return
        const id = setTimeout(() => setResendIn(seconds => seconds - 1), 1000)
        return () => clearTimeout(id)
    }, [resendIn])

    const restart = useCallback(() => {
        setStep('passcode')
        setPasscodeState('')
        setConfirmState('')
        setHintState('')
        setHintToSend('')
        setOtpState('')
        setErrorKey(null)
        setBusy(false)
        setResendIn(0)
        inFlight.current = false
        /*
         * The address is **seeded, not cleared**: it comes from the profile, and a reader who has just
         * finished setting a passcode up is not helped by having to retype an inbox the app already
         * knows. Seeding here rather than in `useState` is what makes it correct when the hook is
         * mounted before the session lands — see `initialEmailRef`.
         */
        setEmailState(initialEmailRef.current ?? '')
    }, [])

    const run = useCallback(
        async (fn: () => Promise<void>, mapError: (error: unknown) => string) => {
            if (inFlight.current) return
            inFlight.current = true
            setBusy(true)
            setErrorKey(null)
            try {
                await fn()
            } catch (caught) {
                setErrorKey(mapError(caught))
                throw caught
            } finally {
                inFlight.current = false
                setBusy(false)
            }
        },
        [],
    )

    const setPasscode = useCallback((next: string) => {
        setPasscodeState(next)
        setErrorKey(null)
        if (next.length !== PASSCODE_LENGTH) return
        /*
         * **No network.** The passcode is being chosen, not checked, so the step advances on its own
         * and `reenter` is what validates it. Same call `useTwoFaFlow` makes on its `new` step.
         */
        setConfirmState('')
        setStep('reenter')
    }, [])

    const setConfirm = useCallback(
        (next: string) => {
            setConfirmState(next)
            setErrorKey(null)
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * A **local** comparison, so a mismatch costs nothing — no request, nothing spent. Legacy
             * words this failure "Wrong code, please try again!", the same string it uses for a
             * rejected passcode, which is misleading twice over: it is not a code, and it is not wrong.
             */
            if (next === passcode) {
                setStep('hint')
                return
            }
            setErrorKey('auth_two_fa_mismatch')
            setConfirmState('')
        },
        [passcode],
    )

    const setHint = useCallback((next: string) => {
        setHintState(next.slice(0, HINT_MAX_LENGTH))
        setErrorKey(null)
    }, [])

    const setEmail = useCallback((next: string) => {
        setEmailState(next)
        setErrorKey(null)
    }, [])

    const submitHint = useCallback(
        (withHint: boolean) => {
            /*
             * The value is frozen here rather than read at write time, and *Skip* freezes `''` — which
             * is legacy's `handleSkipHint` and is a value, not an omission (see `createPasscode`). It
             * matters because the field stays on screen behind the two later steps: going back, editing
             * and coming forward again must re-decide it, and reading `hint` at write time would let a
             * skipped hint arrive filled in.
             */
            setHintToSend(withHint ? hint.trim() : '')
            setErrorKey(null)
            setStep('email')
        },
        [hint],
    )

    const sendCode = useCallback(
        (advance: boolean) => {
            if (!isEmailValid) {
                setErrorKey('auth_email_invalid')
                return
            }
            void run(async () => {
                /*
                 * **No `sid` in this family.** `user-login/send-otp/` issues one and it is the thread
                 * through `/settings/password`'s three steps. Here there is no correlator at all:
                 * `recovery-email/verify/` takes the address, `POST two-fa/passcode/` takes the code,
                 * and neither mentions a `sid`.
                 */
                await twoFaApi.sendRecoveryEmailOtp(trimmedEmail, activeId)
                // A new send invalidates the previous code, so whatever was typed goes with it.
                setOtpState('')
                setResendIn(CODE_TTL_SECONDS)
                if (advance) setStep('code')
            }, toSendCodeErrorKey).catch(() => undefined)
        },
        [activeId, isEmailValid, run, trimmedEmail],
    )

    const resend = useCallback(() => {
        if (resendIn > 0) return
        sendCode(false)
    }, [resendIn, sendCode])

    const setOtp = useCallback(
        (next: string) => {
            setOtpState(next)
            setErrorKey(null)
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * **A dead code is never sent.** The countdown *is* the lifetime, so past zero the server
             * has already dropped it — and its refusal would read as "wrong code", which sends somebody
             * re-checking digits that were right. `isCodeExpired` says so instead.
             */
            if (isCodeExpired) return
            void run(async () => {
                await twoFaApi.createPasscode(
                    {
                        passcode,
                        passcodeHint: hintToSend,
                        recoveryEmail: trimmedEmail,
                        otp: next,
                    },
                    activeId,
                )
                setStep('done')
                /*
                 * After the step, not before: `onEnabled` invalidates `/me`, and the flag it re-reads
                 * is what the *parent* branches on — a refetch landing while this hook still said
                 * `code` would swap the whole screen out from under the success message.
                 */
                onEnabled()
            }, toTwoFaCreateErrorKey).catch(() => {
                // Six digits already known to be refused are six the reader has to delete first.
                setOtpState('')
            })
        },
        [activeId, hintToSend, isCodeExpired, onEnabled, passcode, run, trimmedEmail],
    )

    const back = useCallback(() => {
        /*
         * Refused while a request is in flight, and the control says so: a create that resolves *after*
         * the step has been left would call `setStep('done')` and announce a passcode the reader had
         * just walked away from setting.
         */
        if (inFlight.current) return
        const previous = PREVIOUS[step]
        if (!previous) return
        setErrorKey(null)
        /*
         * **The step being entered is cleared, where landing on it full would make it inert.** Every
         * transition here is a change handler on the *last* digit, so a step reached with its boxes
         * already full fires nothing until one is deleted and retyped — legacy has exactly that dead
         * end. The passcode itself is left alone: it is the one value a reader goes back *to edit*,
         * and editing it re-fires on its own.
         */
        if (previous === 'reenter') setConfirmState('')
        if (previous === 'email') {
            // The code belongs to the address being left behind.
            setOtpState('')
            setResendIn(0)
        }
        setStep(previous)
    }, [step])

    return {
        step,
        passcode,
        setPasscode,
        confirm,
        setConfirm,
        hint,
        setHint,
        email,
        setEmail,
        isEmailValid,
        otp,
        setOtp,
        resendIn,
        isCodeExpired,
        errorKey,
        busy,
        canGoBack: PREVIOUS[step] !== null,
        back,
        submitHint,
        sendCode,
        resend,
        restart,
    }
}
