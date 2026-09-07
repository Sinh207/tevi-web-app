'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The seconds-until-you-may-ask-again clock behind every emailed code.
 *
 * ## Three copies, one mechanism
 *
 * `ForgotPasswordFlow` (password reset, 60s), `useTwoFaFlow` (passcode recovery, 30s) and
 * `useTwoFaRecoveryEmail` (changing the recovery address, 60s) each held the same `useState` plus the
 * same tick effect, with the same comment paraphrased three ways. The **values** differ legitimately —
 * three different endpoints, three answers from the API team — but the mechanism never did, and three
 * copies of a timer is where the fourth one quietly uses `setInterval`.
 *
 * ## `setTimeout` per tick, not one `setInterval`
 *
 * The reason all three copies gave, kept here once: a timeout re-derives from state on every tick, so
 * it cannot drift or double up, and React tears it down cleanly on unmount. A single interval has to
 * be cleared by hand on every exit path, and the one that gets missed leaks a tick per second for the
 * life of the page.
 *
 * ## What this deliberately does **not** own
 *
 * **"The code has expired."** That is `step === 'code' && secondsLeft === 0` at every call site, and
 * the step name is the half only the caller knows — `'verify'`, `'recovery'` and `'code'` in the three
 * of them. Exposing an `isElapsed` here would read as "expired" while being true *before* the first
 * send too, which is the one moment nothing has expired.
 *
 * It also does not stop on its own when a flow leaves the step: a caller that wants the clock dropped
 * calls `reset()`. `ForgotPasswordFlow`'s old effect had an extra `step !== 'verify'` guard that did
 * that implicitly; nothing reads the value off that step, so the only difference is a timer counting
 * down where nobody is looking.
 */
export function useResendCountdown(ttlSeconds: number) {
    const [secondsLeft, setSecondsLeft] = useState(0)

    useEffect(() => {
        if (secondsLeft === 0) return
        const id = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000)
        return () => clearTimeout(id)
    }, [secondsLeft])

    return {
        /** `0` means "you may ask again now" — and, paired with the caller's step, "it has expired". */
        secondsLeft,
        /** Begin (or restart) the clock. Called when a code has just been sent. */
        start: useCallback(() => setSecondsLeft(ttlSeconds), [ttlSeconds]),
        /** Drop it — a teardown, or a flow abandoning the step. */
        reset: useCallback(() => setSecondsLeft(0), []),
    }
}
