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
 * - **The fold keeps `anonymous` alive.** `GET v1/me/` does echo `anonymous: true`
 *   (B1, answered), so on the read path this is now belt *and* braces. It stays because
 *   the other caller is the **write** path — `POST v1/me/` answers with its own body, and
 *   nothing has confirmed that one restates the flag. `mergeAccountUser` is what stops
 *   either from silently promoting an anonymous session to a real one, which used to let
 *   guarded actions through and bounce the visitor off `/login`.
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
