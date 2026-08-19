import {
    type AccountUser,
    getAccount,
    mergeAccountUser,
    updateAccountUser,
} from '@shared/lib/api/token'

/**
 * Fold a fresh `/me` body into the copy the token store holds, and hand back the result.
 *
 * Two things happen here and both matter:
 *
 * - **The fold keeps `anonymous` alive.** The backend does not always restate it, and
 *   `mergeAccountUser` is what stops a refresh from silently promoting an anonymous
 *   session to a real one (which used to bounce the visitor off `/login`).
 * - **The write-back is what lets the account switcher and `purgeAnonymousAccounts`
 *   work without a request** — they read the stored snapshot, not the query cache.
 *
 * The *rendered* copy is not written anywhere: it is this function's return value, and
 * the caller files it under `authKeys.me(accountId)`.
 *
 * It lives in its own module because there are now two callers — the `/me` fetch and the
 * `/me` write (`hooks/use-update-me.ts`) — and a profile that arrives by one path and not
 * the other is exactly the drift this prevents.
 */
export function foldAccountUser(accountId: string | null, user: AccountUser): AccountUser {
    const merged = mergeAccountUser(getAccount(accountId)?.user ?? null, user)
    if (accountId) updateAccountUser(accountId, merged)
    return merged
}
