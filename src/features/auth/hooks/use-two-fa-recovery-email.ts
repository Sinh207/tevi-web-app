'use client'

import { useCallback, useRef, useState } from 'react'
import { twoFaApi } from '../api/two-fa-api'
import {
    isCredentialRefusal,
    toSendCodeErrorKey,
    toTwoFaActionErrorKey,
    twoFaWriteErrorText,
} from '../lib/auth-error'
import { useAuth } from '../providers/auth-provider'
import { useResendCountdown } from './use-resend-countdown'
import { PASSCODE_LENGTH } from './use-two-fa-flow'

/**
 * Changing the recovery address — **nominate it, then confirm it with a code mailed to it.**
 *
 * Two screens, matching the app's own flow: *Update recovery email* (Figma `1083:144846`) and then
 * *Recovery Email*, which says the address "needs to be confirmed and is not yet active."
 *
 * ## The two calls, and the two wrong guesses they replaced
 *
 * ✅ `POST v1/recovery-email/verify/ { recovery_email }` mails the code, and
 * `PATCH v1/recovery-email/ { recovery_email, otp }` stores it. **Neither is under `v1/two-fa/`** —
 * the recovery address is its own family at the auth root, which is why sixteen probes under
 * `two-fa/`, `me/` and `user-login/` all answered 404.
 *
 * Both earlier attempts were wrong, and each was caught by a different kind of evidence:
 *
 * 1. `PATCH v1/two-fa/passcode/ { passcode, recovery_email }` — answered
 *    `{ code: "validation_error", message: "Passcode must be 6 digits" }` **live**, because that
 *    route wants `new_passcode` and changes the passcode only.
 * 2. `POST v1/two-fa/passcode/` with the existing passcode — would answer **`422 AU001`** ("already
 *    has a passcode, use PATCH"), so it can never edit one field of an existing record. That one was
 *    never going to work and no amount of probing would have shown it; the contract did.
 *
 * ## What replaced the read-back
 *
 * An earlier version wrote, then re-read `GET two-fa/passcode/` and compared the stored address to
 * what the reader typed — a guard against a 200 that stored nothing. It has to go: **the `GET`
 * returns the address masked** (`u**r@gmail.com`), so the comparison would have failed on every
 * success. The same fact is why this flow does **not** pre-fill the field from the record — the
 * reader would submit the asterisks.
 *
 * What stands in its place is stronger anyway: the write is a real endpoint with real error codes,
 * and the **API's own sentence reaches the screen** (`docs/API_ERRORS.md`, `errorText` before
 * `errorKey`). Shipping without that is how the `PATCH` refusal above surfaced as "Couldn't update
 * your recovery email", the one line that could not diagnose it.
 *
 * ⚠ **`422 AU004` is "already set"**, and this screen exists to change an address that is set. Either
 * that code is narrower than it reads or a different call replaces one — **B92**. The reader sees the
 * backend's own words for it rather than a guess of ours.
 */

export type TwoFaRecoveryEmailStep = 'email' | 'code'

/**
 * How long the emailed code lives, and therefore how long *Resend* stays shut. 60, matching
 * `useTwoFaSetup` and `PasswordSetupFlow`: it is the same `user-login/send-otp/` code (B7), not
 * `recover/`'s 30-second one.
 */
const CODE_TTL_SECONDS = 60

/** Legacy's own permissive test — the address is proved by the code that follows. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface TwoFaRecoveryEmail {
    step: TwoFaRecoveryEmailStep
    email: string
    setEmail: (next: string) => void
    /** Whether the address would pass the format check — what *Continue* reads. */
    isEmailValid: boolean
    otp: string
    setOtp: (next: string) => void
    /** Seconds until the code may be re-sent — and until it dies. `0` means now. */
    resendIn: number
    isCodeExpired: boolean
    /** A translation key of ours. `errorText` outranks it when the backend sent a sentence. */
    errorKey: string | null
    /** The backend's own sentence for a refused write, or `null`. */
    errorText: string | null
    busy: boolean
    canGoBack: boolean
    back: () => void
    /** Ask for a code. `advance` is false for a resend, which stays on the step it is on. */
    sendCode: (advance: boolean) => void
    resend: () => void
    restart: () => void
}

export function useTwoFaRecoveryEmail({
    /** The address is stored. The screen toasts and returns to the menu. */
    onChanged,
}: {
    onChanged: () => void
}): TwoFaRecoveryEmail {
    const { activeId } = useAuth()
    const [step, setStep] = useState<TwoFaRecoveryEmailStep>('email')
    /*
     * **Opens empty**, never on the record's address: `GET two-fa/passcode/` returns it masked
     * (`u**r@gmail.com`), and pre-filling that into an editable field invites the reader to submit
     * the asterisks. This screen is for typing a new address anyway.
     */
    const [email, setEmailState] = useState('')
    const [otp, setOtpState] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [errorText, setErrorText] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const inFlight = useRef(false)
    /*
     * The clock is `useResendCountdown`'s — this flow, `useTwoFaFlow` and `ForgotPasswordFlow` each
     * held the same `useState` plus the same tick effect. The three TTLs stay separate (three
     * endpoints, three answers); only the mechanism is shared.
     */
    const {
        secondsLeft: resendIn,
        start: startCountdown,
        reset: resetCountdown,
    } = useResendCountdown(CODE_TTL_SECONDS)

    const trimmed = email.trim()
    const isEmailValid = EMAIL_RE.test(trimmed)
    // Derived, not stored, and it stays here: the step name is the half the shared hook does not know.
    const isCodeExpired = step === 'code' && resendIn === 0

    /*
     * `useCallback`, so the four callbacks that clear an error can *list* it. As a plain function it
     * was a fresh identity every render — listing it would have defeated their memoisation, and not
     * listing it is what `useExhaustiveDependencies` was flagging. Only setters inside, so `[]` is
     * honest.
     */
    const clearError = useCallback(() => {
        setErrorKey(null)
        setErrorText(null)
    }, [])

    const restart = useCallback(() => {
        setStep('email')
        setEmailState('')
        setOtpState('')
        setErrorKey(null)
        setErrorText(null)
        setBusy(false)
        resetCountdown()
        inFlight.current = false
    }, [resetCountdown])

    const setEmail = useCallback((next: string) => {
        setEmailState(next)
        setErrorKey(null)
        setErrorText(null)
    }, [])

    const sendCode = useCallback(
        (advance: boolean) => {
            if (inFlight.current) return
            if (!isEmailValid) {
                setErrorKey('auth_email_invalid')
                return
            }
            inFlight.current = true
            setBusy(true)
            clearError()
            void (async () => {
                try {
                    await twoFaApi.sendRecoveryEmailOtp(trimmed, activeId)
                    // A new send invalidates the previous code, so whatever was typed goes with it.
                    setOtpState('')
                    startCountdown()
                    if (advance) setStep('code')
                } catch (caught) {
                    setErrorText(twoFaWriteErrorText(caught))
                    setErrorKey(toSendCodeErrorKey(caught))
                } finally {
                    inFlight.current = false
                    setBusy(false)
                }
            })()
        },
        [activeId, isEmailValid, trimmed, clearError, startCountdown],
    )

    const resend = useCallback(() => {
        if (resendIn > 0) return
        sendCode(false)
    }, [resendIn, sendCode])

    const setOtp = useCallback(
        (next: string) => {
            setOtpState(next)
            clearError()
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * **A dead code is never sent.** The countdown *is* the lifetime, so past zero the server
             * has already dropped it — and its refusal would read as "wrong code", which sends
             * somebody re-checking digits that were right.
             */
            if (isCodeExpired) return
            if (inFlight.current) return
            inFlight.current = true
            setBusy(true)
            void (async () => {
                try {
                    await twoFaApi.saveRecoveryEmail(
                        { recoveryEmail: trimmed, otp: next },
                        activeId,
                    )
                    onChanged()
                } catch (caught) {
                    /*
                     * The code is cleared and the reader stays where they can re-send: this call
                     * carries the address and the code, and a mistyped code is much likelier than an
                     * address that parsed a moment ago going bad.
                     */
                    if (isCredentialRefusal(caught)) setOtpState('')
                    setErrorText(twoFaWriteErrorText(caught))
                    setErrorKey(toTwoFaActionErrorKey(caught, 'auth_two_fa_recovery_email_failed'))
                } finally {
                    inFlight.current = false
                    setBusy(false)
                }
            })()
        },
        [activeId, isCodeExpired, onChanged, trimmed, clearError],
    )

    const back = useCallback(() => {
        /*
         * Refused while a request is in flight: a write that resolves *after* the step has been left
         * would call `onChanged` and announce a change the reader had walked away from.
         */
        if (inFlight.current || step !== 'code') return
        clearError()
        // The code belongs to the address being left behind.
        setOtpState('')
        resetCountdown()
        setStep('email')
    }, [step, clearError, resetCountdown])

    return {
        step,
        email,
        setEmail,
        isEmailValid,
        otp,
        setOtp,
        resendIn,
        isCodeExpired,
        errorKey,
        errorText,
        busy,
        canGoBack: step === 'code',
        back,
        sendCode,
        resend,
        restart,
    }
}
