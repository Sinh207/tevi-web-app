'use client'

import { useCallback, useRef, useState } from 'react'
import { twoFaApi } from '../api/two-fa-api'
import {
    toPasscodeErrorKey,
    toTwoFaActionErrorKey,
    toTwoFaRecoverErrorKey,
} from '../lib/auth-error'
import { useAuth } from '../providers/auth-provider'
import { useResendCountdown } from './use-resend-countdown'

/**
 * Digits in a Tevi passcode, and in the emailed recovery code. Both **six** — confirmed, and it is
 * one of the few numbers on this screen that three sources agree on: the live gateway refuses a
 * shorter one outright (`"Passcode must be 6 digits"`), legacy hard-codes 6 in five places, and every
 * comp draws six boxes.
 *
 * ⚠ Worth stating because the **auth contract's examples say `"1234"`** throughout. They are
 * illustrative; do not "fix" this constant to match them. B92 closed on the live behaviour.
 */
export const PASSCODE_LENGTH = 6

/**
 * Characters a hint may carry.
 *
 * ⚠ **Legacy's copy and legacy's code disagree**: the label reads "up to 60 characters" in all eight
 * translated locales, and `createHint/index.js` does `value.slice(0, 50)`. One of them is a bug and
 * there is no schema to settle it, so this takes the *enforced* number — 50 is known to be accepted,
 * where 60 is only claimed — and the label was re-cut with `{{max}}` in place of the literal so the
 * sentence can no longer contradict the field. Raising it is one constant, not nine translations.
 */
export const HINT_MAX_LENGTH = 50

/**
 * How long the emailed recovery code lives — **and** how long *Resend code* stays shut.
 *
 * One number for both, which is `ForgotPasswordFlow`'s call and the same reasoning: the moment it runs
 * out the code is dead *and* a new one may be asked for, so splitting it into two would only create a
 * window where neither works. Legacy's timer is 30 seconds and it uses it for the resend gate alone —
 * the code's lifetime was an open question (B88) until the API team confirmed the two are the same.
 *
 * Note this is **half** `ForgotPasswordFlow`'s 60: that is the password-reset OTP, a different
 * endpoint with its own answer (B7). Do not fold them into one constant.
 */
const CODE_TTL_SECONDS = 30

/**
 * The five screens of two-step verification, in the order they are reached.
 *
 * `enter` is the only one a normal withdrawal sees. The other four are the **recovery** chain behind
 * *Forgot passcode?*, and they exist as one machine rather than four because every step after the
 * first depends on state the first produced — the OTP is the authority for the write four screens
 * later, and losing it means starting from a new email.
 */
export type TwoFaStep = 'enter' | 'recovery' | 'new' | 'reenter' | 'hint'

/** Where *Back* goes from each step. `enter` is the root and has nowhere. */
const PREVIOUS: Record<TwoFaStep, TwoFaStep | null> = {
    enter: null,
    recovery: 'enter',
    new: 'recovery',
    reenter: 'new',
    hint: 'reenter',
}

export interface TwoFaFlow {
    step: TwoFaStep
    /** The `enter` step's code, and — from `new` on — the passcode being set. Legacy reuses one slot too. */
    passcode: string
    setPasscode: (next: string) => void
    /** The code from the recovery email. Kept for the whole chain: `reset/` re-presents it. */
    recoveryCode: string
    setRecoveryCode: (next: string) => void
    /** The `reenter` step's copy, compared locally against `passcode`. */
    confirm: string
    setConfirm: (next: string) => void
    hint: string
    setHint: (next: string) => void
    /**
     * The address `recover/` says it mailed the code to, or `null` when it did not say.
     *
     * Display only — the step names the inbox to open. Withheld rather than guessed: a reader with two
     * addresses checking the wrong one presses Resend at a code that already arrived, and a wrong
     * address printed would send them somewhere worse than a generic sentence.
     */
    recoveryEmail: string | null
    /** Seconds until the recovery code may be re-sent — and until it dies. `0` means now. */
    resendIn: number
    /**
     * The emailed code has run out.
     *
     * Only ever true on the `recovery` step, and it is what stops six digits being sent to a server
     * that has already dropped them: a 4xx for an expired code is indistinguishable on screen from a
     * mistyped one, so somebody would sit re-reading correct digits instead of pressing Resend.
     */
    isCodeExpired: boolean
    /** A translation key, never a backend sentence. `null` when nothing is wrong. */
    errorKey: string | null
    /** A request is in flight — the step says so instead of going quiet. */
    busy: boolean
    /**
     * The passcode was just replaced, and the reader is back on `enter`.
     *
     * A **divergence from legacy**, which calls `resetData()` in a `finally` and drops the reader on
     * an identical *Enter passcode* screen with no acknowledgement — after they typed a code, a new
     * passcode twice and a hint. That reads as the flow having failed at the last step. One line
     * fixes it, and it clears on the first keystroke.
     */
    justReset: boolean
    canGoBack: boolean
    back: () => void
    /** Start the chain: ask the backend to email a recovery code. */
    forgot: () => void
    resend: () => void
    /** Write the new passcode. `withHint: false` is legacy's *Skip*, which still sends `passcode_hint: ''`. */
    finish: (withHint: boolean) => void
    /** Full teardown. The dialog calls it on open — see the note there on why not on close. */
    restart: () => void
}

/**
 * The whole of two-step verification as one machine, so the dialog can be a pure view.
 *
 * A hook rather than state inside the component for the reason `docs/DEFINITION_OF_DONE.md` gives and
 * this repo's `use-update-me.test.tsx` demonstrates: the claims worth pinning here are *sequences* —
 * "a mismatch does not spend the OTP", "the reset carries the code from four screens ago", "one
 * request per completion" — and a sequence is testable through a `Probe` and untestable through a
 * rendered tree.
 *
 * ## Every transition is a change handler, not an effect
 *
 * Legacy watches all three code arrays with `useEffect` and advances when one fills up. Completion
 * *is* an event, so there is nothing to synchronise: an effect re-runs on every render and then needs
 * a dependency list and a guard to undo what the render loop keeps doing. `ForgotPasswordFlow` made
 * the same call for the same reason.
 *
 * ## One `inFlight` latch for the whole flow
 *
 * There is never more than one call in the air — the steps are strictly sequential — so one ref
 * covers all four endpoints. A ref and not `busy`, because `setBusy` lands on the next render: a
 * paste racing an SMS autofill reads `false` twice and fires twice, and on `reset/` that would spend
 * an OTP the reader cannot re-obtain without another email.
 */
export function useTwoFaFlow(onVerified: (passcode: string) => void): TwoFaFlow {
    const { activeId } = useAuth()
    const [step, setStep] = useState<TwoFaStep>('enter')
    const [passcode, setPasscodeState] = useState('')
    const [recoveryCode, setRecoveryCodeState] = useState('')
    const [confirm, setConfirmState] = useState('')
    const [hint, setHintState] = useState('')
    const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null)
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [justReset, setJustReset] = useState(false)
    const inFlight = useRef(false)
    /*
     * The clock is `useResendCountdown`'s — see it for why the mechanism is shared while
     * `CODE_TTL_SECONDS` is not. `isCodeExpired` below stays here, because the step name is the half
     * this hook knows and that one does not.
     */
    const {
        secondsLeft: resendIn,
        start: startCountdown,
        reset: resetCountdown,
    } = useResendCountdown(CODE_TTL_SECONDS)

    /*
     * Derived, not stored: it is a function of the step and the countdown, and a second piece of state
     * saying the same thing is a second thing to get out of step with the timer.
     */
    const isCodeExpired = step === 'recovery' && resendIn === 0

    const restart = useCallback(() => {
        setStep('enter')
        setPasscodeState('')
        setRecoveryCodeState('')
        setConfirmState('')
        setHintState('')
        setRecoveryEmail(null)
        setErrorKey(null)
        setBusy(false)
        setJustReset(false)
        resetCountdown()
        inFlight.current = false
    }, [resetCountdown])

    /**
     * Every step is the same shape: latch, call, advance or report.
     *
     * **The mapper is per step, not per flow.** `toPasscodeErrorKey` reads every 4xx as "wrong code",
     * which is right where the request carries a code and nothing else (`verify/`,
     * `reset/verify-otp/`) and wrong on the two that do not. Passing one mapper for all four reported
     * a recovery email that failed to send as an incorrect code — on a step where no code had been
     * typed yet. `toTwoFaActionErrorKey` is the other half.
     */
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

    const setPasscode = useCallback(
        (next: string) => {
            setPasscodeState(next)
            setErrorKey(null)
            setJustReset(false)
            if (next.length !== PASSCODE_LENGTH) return

            if (step === 'new') {
                /*
                 * **No network here.** The passcode is not checked against anything — it is being
                 * chosen — so the step advances on its own and `reenter` is what validates it. The
                 * write happens once, at the end, with the hint.
                 */
                setConfirmState('')
                setStep('reenter')
                return
            }
            /*
             * **Verify only on `enter`**, stated positively.
             *
             * This slot is shared by the two steps that collect *a* passcode, and the branch above
             * used to be the only guard — so every other step fell through to `verifyPasscode`. Only
             * `enter` and `new` bind this setter today, which made that safe by coincidence rather
             * than by construction; binding it anywhere else would have fired a credential check
             * from a step that has nothing to check.
             */
            if (step !== 'enter') return
            void run(async () => {
                await twoFaApi.verifyPasscode(next, activeId)
                onVerified(next)
            }, toPasscodeErrorKey).catch(() => {
                // Six digits already known to be wrong are six the reader has to delete first.
                setPasscodeState('')
            })
        },
        [activeId, onVerified, run, step],
    )

    const setRecoveryCode = useCallback(
        (next: string) => {
            setRecoveryCodeState(next)
            setErrorKey(null)
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * **A dead code is never sent.** The countdown *is* the lifetime, so past zero the server
             * has already dropped it — and its refusal would read as "wrong code" (every 4xx does),
             * which sends somebody re-checking digits that were right. `isCodeExpired` says so
             * instead, in `auth_otp_expired`'s own words: tap resend.
             */
            if (isCodeExpired) return
            void run(
                async () => {
                    await twoFaApi.verifyResetOtp(next, activeId)
                    setPasscodeState('')
                    setStep('new')
                    /*
                     * **"Incorrect or expired", not "wrong code".** An emailed OTP has a lifetime a
                     * passcode does not, so "wrong" is only half the story and the half that sends
                     * somebody re-reading the digits instead of pressing Resend. Legacy words these two
                     * failures differently for the same reason.
                     */
                },
                error => toTwoFaActionErrorKey(error, 'auth_two_fa_otp_invalid'),
            ).catch(() => setRecoveryCodeState(''))
        },
        [activeId, isCodeExpired, run],
    )

    const setConfirm = useCallback(
        (next: string) => {
            setConfirmState(next)
            setErrorKey(null)
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * A **local** comparison, so a mismatch costs nothing: no request, and the OTP is
             * untouched. Legacy words this failure "Wrong code, please try again!" — the same string
             * it uses for a rejected passcode — which is misleading twice over: it is not a code, and
             * it is not wrong. `auth_two_fa_mismatch` says what happened.
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

    const sendRecoveryEmail = useCallback(
        () =>
            run(
                async () => {
                    setRecoveryEmail(await twoFaApi.recoverPasscode(activeId))
                    setRecoveryCodeState('')
                    startCountdown()
                    setStep('recovery')
                },
                // `AU005` — no recovery email on file — is the one refusal a retry cannot fix,
                // so it gets its own sentence instead of "couldn't send, try again".
                toTwoFaRecoverErrorKey,
            ).catch(() => undefined),
        [activeId, run, startCountdown],
    )

    const forgot = useCallback(() => void sendRecoveryEmail(), [sendRecoveryEmail])

    const resend = useCallback(() => {
        if (resendIn > 0) return
        void sendRecoveryEmail()
    }, [resendIn, sendRecoveryEmail])

    const finish = useCallback(
        (withHint: boolean) => {
            void run(
                async () => {
                    await twoFaApi.resetPasscode(
                        {
                            passcode,
                            // Legacy's *Skip* posts `''` rather than omitting the field — see `resetPasscode`.
                            passcodeHint: withHint ? hint.trim() : '',
                            otp: recoveryCode,
                        },
                        activeId,
                    )
                    /*
                     * Back to `enter`, which is legacy's behaviour and is the safe one: `reset/` returns
                     * no verification, so handing the new passcode straight to `onVerified` would submit
                     * a withdrawal with a code `verify/` never checked. The reader types it once more and
                     * `justReset` tells them why.
                     */
                    restart()
                    setJustReset(true)
                },
                error => toTwoFaActionErrorKey(error, 'auth_two_fa_reset_failed'),
            ).catch(() => undefined)
        },
        [activeId, hint, passcode, recoveryCode, restart, run],
    )

    const back = useCallback(() => {
        const previous = PREVIOUS[step]
        if (!previous) return
        setErrorKey(null)
        /*
         * The step being *left* is cleared, not the one being entered: going back from `reenter`
         * keeps the new passcode on screen, which is the whole point of a back button here — legacy
         * keeps three separate arrays for exactly this. Leaving `recovery` also drops the OTP, since
         * returning to `enter` abandons the chain.
         */
        if (step === 'reenter') setConfirmState('')
        if (step === 'new') {
            setPasscodeState('')
            /*
             * **The code goes too.** Landing back on `recovery` with six already-verified digits still
             * in the boxes makes the step inert: nothing fires until one is deleted and retyped, since
             * the transition is a change handler on completion. Legacy clears nothing and has exactly
             * that dead end. Empty boxes plus — once the 30s is up — an expiry line and Resend is a
             * step that works.
             */
            setRecoveryCodeState('')
        }
        if (step === 'recovery') setRecoveryCodeState('')
        setStep(previous)
    }, [step])

    return {
        step,
        passcode,
        setPasscode,
        recoveryCode,
        setRecoveryCode,
        confirm,
        setConfirm,
        hint,
        setHint,
        recoveryEmail,
        resendIn,
        isCodeExpired,
        errorKey,
        busy,
        justReset,
        canGoBack: PREVIOUS[step] !== null,
        back,
        forgot,
        resend,
        finish,
        restart,
    }
}
