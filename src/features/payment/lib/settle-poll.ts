import type { SettleOutcome } from '../api/types'

/**
 * Asking "did it settle yet?" a **finite** number of times.
 *
 * ## What this replaces
 *
 * Legacy polls the callback endpoint with `setInterval(…, 2000)` in three separate files
 * (`components/stripe/listCard`, `providers/balance/index.js`, `membershipDetails/useMembershipResult`).
 * None of the three has a maximum, a timeout, or an unmount cleanup, and one of them starts a second
 * interval if the effect re-runs. A reader who leaves the tab open on a payment that never resolves
 * keeps a request going every two seconds until they close it.
 *
 * ## The schedule, and why it is not a constant interval
 *
 * A card settles in a second or two; a bank transfer under review can take a minute. Backing off
 * spends the requests where they are likely to answer and then stops asking so often — 13 attempts
 * over ~50 seconds instead of 25 attempts in the same window.
 *
 * Running out is **not a failure** (`EXHAUSTED` → `slow` in `checkout-machine.ts`). The money has
 * left; what has run out is this client's patience for asking.
 *
 * The numbers are a guess until **B65** is answered — nothing states how long `PM0003` can last, and
 * whether a socket event could replace the polling entirely.
 */
export const SETTLE_SCHEDULE_MS: readonly number[] = [
    2000, 2000, 2000, 2000, 2000, 4000, 4000, 4000, 4000, 4000, 8000, 8000, 8000,
]

export const SETTLE_MAX_ATTEMPTS = SETTLE_SCHEDULE_MS.length

/** How long to wait before attempt `n` (0-based), or `null` when the schedule is spent. */
export function settleDelay(attempt: number): number | null {
    if (attempt < 0) return null
    return SETTLE_SCHEDULE_MS[attempt] ?? null
}

/** Total wall-clock the schedule spans, for the copy that says how long this can take. */
export function settleWindowMs(): number {
    return SETTLE_SCHEDULE_MS.reduce((total, delay) => total + delay, 0)
}

export type SettlePollResult =
    | SettleOutcome
    /** Still pending after the whole schedule. */
    | { status: 'exhausted' }
    /** The caller aborted — a dialog unmounted, an account switched. Not an outcome. */
    | { status: 'aborted' }

/** `setTimeout` as a promise, cancellable. Injected in tests so no wall-clock time is spent. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        if (signal?.aborted) return resolve()
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        function onAbort() {
            clearTimeout(timer)
            resolve()
        }
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

export interface SettlePollOptions {
    /** One request. Throws only for transport failures; a refusal is `{ status: 'rejected' }`. */
    check: (attempt: number) => Promise<SettleOutcome>
    /** Injected clock. Real timers by default. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
    signal?: AbortSignal
    /** Fired after each `pending` answer, so the machine can count attempts for the UI. */
    onPending?: (attempt: number) => void
    /**
     * Resolves when the page is worth polling from again — the provider passes a
     * `visibilitychange` waiter. A backgrounded tab that keeps polling is a request every few
     * seconds that nobody is looking at, and mobile browsers throttle the timers anyway.
     */
    waitUntilActive?: () => Promise<void>
    /**
     * Consecutive transport failures tolerated before giving up. A 502 in the middle of settling
     * says nothing about the payment, so it is retried like a `pending` rather than reported as a
     * decline — but not forever, or an outage becomes an infinite loop again.
     */
    maxTransportErrors?: number
}

/**
 * Poll until the payment is settled, refused, aborted, or the schedule runs out.
 *
 * The first check runs **immediately**: by the time the browser is back from a 3DS hop the payment
 * has usually already settled, and waiting two seconds to ask is two seconds of spinner for nothing.
 */
export async function runSettlePoll({
    check,
    sleep = defaultSleep,
    signal,
    onPending,
    waitUntilActive,
    maxTransportErrors = 3,
}: SettlePollOptions): Promise<SettlePollResult> {
    let transportErrors = 0

    for (let attempt = 0; attempt <= SETTLE_MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) return { status: 'aborted' }
        if (waitUntilActive) await waitUntilActive()
        if (signal?.aborted) return { status: 'aborted' }

        try {
            const outcome = await check(attempt)
            transportErrors = 0
            if (outcome.status !== 'pending') return outcome
            onPending?.(attempt)
        } catch (error) {
            if (signal?.aborted) return { status: 'aborted' }
            transportErrors += 1
            if (transportErrors > maxTransportErrors) throw error
        }

        const delay = settleDelay(attempt)
        if (delay === null) return { status: 'exhausted' }
        await sleep(delay, signal)
    }

    return { status: 'exhausted' }
}
