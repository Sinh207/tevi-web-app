'use client'

import { useCallback, useRef, useState } from 'react'
import { twoFaApi } from '../api/two-fa-api'
import { isCredentialRefusal, toTwoFaChangeErrorKey } from '../lib/auth-error'
import { useAuth } from '../providers/auth-provider'
import { HINT_MAX_LENGTH, PASSCODE_LENGTH } from './use-two-fa-flow'

/**
 * Replacing a passcode the account still **knows** — the three screens behind the *Change* row.
 *
 * `new` → `reenter` → `hint`, then one `PATCH`. The *current* passcode is not collected here: it
 * arrives already proved, because the screen is behind the passcode gate (`TwoFaGate`) and this hook
 * is handed what `verify/` accepted. That split is the point — this file never has to know what
 * "forgot passcode" looks like, and the gate never has to know what is being authorised.
 *
 * ## The hint step is the design's, and it settles a payload question
 *
 * The comps run *New verification code* → *Re-enter new verification code* → **Create hint** with
 * *Skip* and *Continue* (`1081:93328`, `1082:138166`, `1082:138780`). So the reader always decides
 * `passcode_hint` on this path, and the write always carries it — `''` for *Skip*, which is legacy's
 * own `handleSkipHint` and a value rather than an omission. That removes the guess this hook used to
 * make: it re-sent the *existing* hint read back from `GET passcode/`, to survive a `PATCH` that
 * replaces rather than merges. Nothing has to survive anything now.
 *
 * ## A refused write sends the reader back to the gate, not to a retry
 *
 * `PATCH` presents the current passcode a second time, seconds after `verify/` accepted it. A 4xx
 * therefore means one of two things — the endpoints disagree, or the passcode changed on another
 * device in between — and **neither is fixable by pressing the same button again**. So a credential
 * refusal (`isCredentialRefusal`) resets the flow and asks for the passcode again, while a network
 * failure or a 5xx leaves everything on screen and lets the reader retry: the passcode they just
 * chose twice is not something to make them re-choose because a server was briefly down.
 *
 * That asymmetry is the whole reason this is a hook. "A 502 keeps the new passcode and a 401 does
 * not" is a sequence, and a sequence is testable through a `Probe` and invisible in a tree.
 */

export type TwoFaChangeStep = 'new' | 'reenter' | 'hint'

/** Where *Back* goes from each step. `new` is the root — from there Back leaves for the menu. */
const PREVIOUS: Record<TwoFaChangeStep, TwoFaChangeStep | null> = {
    new: null,
    reenter: 'new',
    hint: 'reenter',
}

export interface TwoFaChange {
    step: TwoFaChangeStep
    /** The replacement being chosen. */
    passcode: string
    setPasscode: (next: string) => void
    confirm: string
    setConfirm: (next: string) => void
    hint: string
    setHint: (next: string) => void
    errorKey: string | null
    busy: boolean
    /**
     * The current passcode was refused by the write — the caller must raise the gate again.
     *
     * Rendered on, not reacted to: the screen shows the gate because this is true, rather than in an
     * effect that fires as it becomes true.
     */
    needsReauth: boolean
    canGoBack: boolean
    back: () => void
    /** Write it. `false` is *Skip*, which still sends `passcode_hint: ''`. */
    finish: (withHint: boolean) => void
    restart: () => void
}

export function useTwoFaChange({
    /** What `verify/` accepted. `null` closes the flow — nothing can be written without it. */
    currentPasscode,
    onChanged,
}: {
    currentPasscode: string | null
    onChanged: () => void
}): TwoFaChange {
    const { activeId } = useAuth()
    const [step, setStep] = useState<TwoFaChangeStep>('new')
    const [passcode, setPasscodeState] = useState('')
    const [confirm, setConfirmState] = useState('')
    const [hint, setHintState] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [needsReauth, setNeedsReauth] = useState(false)
    const inFlight = useRef(false)

    const restart = useCallback(() => {
        setStep('new')
        setPasscodeState('')
        setConfirmState('')
        setHintState('')
        setErrorKey(null)
        setBusy(false)
        setNeedsReauth(false)
        inFlight.current = false
    }, [])

    const setPasscode = useCallback((next: string) => {
        setPasscodeState(next)
        setErrorKey(null)
        if (next.length !== PASSCODE_LENGTH) return
        // No network: the replacement is being chosen, not checked.
        setConfirmState('')
        setStep('reenter')
    }, [])

    const setConfirm = useCallback(
        (next: string) => {
            setConfirmState(next)
            setErrorKey(null)
            if (next.length !== PASSCODE_LENGTH) return
            /*
             * A **local** comparison, so a mismatch costs no request and nothing is spent. Legacy
             * words this failure "Wrong code, please try again!" — the same string it uses for a
             * rejected passcode, which is misleading twice over: it is not a code, and it is not
             * wrong.
             */
            if (next !== passcode) {
                setErrorKey('auth_two_fa_mismatch')
                setConfirmState('')
                return
            }
            setStep('hint')
        },
        [passcode],
    )

    const setHint = useCallback((next: string) => {
        setHintState(next.slice(0, HINT_MAX_LENGTH))
        setErrorKey(null)
    }, [])

    const finish = useCallback(
        (withHint: boolean) => {
            if (inFlight.current || !currentPasscode) return
            inFlight.current = true
            setBusy(true)
            setErrorKey(null)
            void (async () => {
                try {
                    await twoFaApi.updatePasscode(
                        {
                            passcode: currentPasscode,
                            newPasscode: passcode,
                            // *Skip* posts `''` rather than omitting the field — see `updatePasscode`.
                            passcodeHint: withHint ? hint.trim() : '',
                        },
                        activeId,
                    )
                    onChanged()
                } catch (caught) {
                    if (isCredentialRefusal(caught)) {
                        /*
                         * Back to the gate, and everything typed goes with it: a replacement chosen
                         * against a credential the server has just rejected is not a value to carry
                         * forward.
                         *
                         * `setErrorKey` **after** `restart`, deliberately — `restart` clears it, and
                         * the message is the one thing that has to survive the reset. It is the
                         * reader's only account of why they are being asked again.
                         */
                        restart()
                        setErrorKey(toTwoFaChangeErrorKey(caught))
                        setNeedsReauth(true)
                        return
                    }
                    /*
                     * A transport failure keeps everything — same passcode, same hint, same step — so
                     * pressing the button again is the retry. Nothing here is spent by a 502.
                     */
                    setErrorKey(toTwoFaChangeErrorKey(caught))
                } finally {
                    inFlight.current = false
                    setBusy(false)
                }
            })()
        },
        [activeId, currentPasscode, hint, onChanged, passcode, restart],
    )

    const back = useCallback(() => {
        /*
         * Refused while the write is in flight: a `PATCH` that resolves *after* the step has been
         * left would call `onChanged` and announce a change the reader had just walked away from.
         */
        if (inFlight.current) return
        const previous = PREVIOUS[step]
        if (!previous) return
        setErrorKey(null)
        /*
         * **The step being entered is cleared, where landing on it full would make it inert.** Every
         * transition here fires on the *last* digit, so a step reached with its boxes already full
         * does nothing until one is deleted and retyped. The passcode itself is left alone: it is the
         * one value a reader goes back *to edit*, and editing it re-fires on its own.
         */
        if (previous === 'reenter') setConfirmState('')
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
        errorKey,
        busy,
        needsReauth,
        canGoBack: PREVIOUS[step] !== null,
        back,
        finish,
        restart,
    }
}
