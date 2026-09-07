import { getActiveAccountId } from '@shared/lib/api/token'
import type { TokenResponse } from '../api/auth-api'
import { jwtAccountId } from './jwt'

function randomId(): string {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
}

/**
 * Which account a token response belongs to.
 *
 * The last resort used to be the literal string `'me'`, so any two sign-ins whose
 * response carried no user — and no account was active to inherit from — landed on
 * the *same* id and overwrote each other's tokens. The token itself knows who it is
 * for, so read it before guessing, and if even that is missing take an id that
 * cannot collide over one that silently can.
 *
 * ## The order is not a preference, it is a correctness argument
 *
 * ⚠ **`getActiveAccountId()` is a destructive fallback**, and everything above it exists to
 * keep the code from reaching it. It answers "the account that is signed in *right now*",
 * which is the wrong answer for the response of a sign-in as *somebody else* —
 * `addOrUpdateAccount` would then write the new tokens into the existing account's slot, and
 * `canAddAccount` would wave it through as a re-login. Adding a second account from the
 * switcher would replace the first, silently and with no error.
 *
 * That was live: the token step read a **`sub`** claim, and a Tevi access token has no `sub`
 * (see `jwt.ts`). So on every real sign-in the first two sources were empty — the token
 * endpoints answer no `user` either — and the id came from whichever account was already
 * active, which on a signed-out browser is always the anonymous one this app keeps. It stayed
 * invisible because the *first* sign-in of a session then looks completely normal: the
 * anonymous slot is overwritten by the real account, `refreshUser()` fills in the right `/me`,
 * and the anon purge finds nothing to remove.
 *
 * It is kept as the last-but-one step anyway, because for the one case it is *right* for — a
 * refresh or re-login for the account already active — it is better than a random id that
 * would fork the store. The guard is that nothing reaches it while the token is readable.
 */
export function accountIdOf(res: TokenResponse): string {
    const uid = (res.user?.id ?? res.user?.uid) as string | number | undefined
    return String(
        uid ?? jwtAccountId(res.access_token) ?? getActiveAccountId() ?? `unknown-${randomId()}`,
    )
}
