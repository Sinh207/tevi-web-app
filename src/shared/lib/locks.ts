/**
 * Cross-tab mutual exclusion (Web Locks API).
 *
 * Module state is per-tab, so "single-flight" guards only ever hold within one
 * tab: five open tabs still spend the same refresh token five times, and a cold
 * start in three tabs mints three anonymous sessions that clobber each other in
 * the shared account map. Web Locks is the only primitive that serialises work
 * across tabs of an origin.
 *
 * Where it is unavailable (older Safari, non-secure contexts) the callback runs
 * unguarded — that is exactly today's behaviour, and refusing to do the work at
 * all would be worse than doing it twice.
 */
export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) return fn()
    return locks.request(name, fn) as Promise<T>
}

export const LOCKS = {
    /** Serialises token refresh for one account across tabs. */
    refresh: (accountId: string) => `tevi.auth.refresh.${accountId}`,
    /** Serialises "this device needs an anonymous session" across tabs. */
    anonymous: 'tevi.auth.anonymous',
} as const
