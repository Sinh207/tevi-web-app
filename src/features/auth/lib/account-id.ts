import { getActiveAccountId } from '@shared/lib/api/token'
import type { TokenResponse } from '../api/auth-api'
import { jwtSubject } from './jwt'

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
 * for, so read its `sub` before guessing, and if even that is missing take an id
 * that cannot collide over one that silently can.
 */
export function accountIdOf(res: TokenResponse): string {
    const uid = (res.user?.id ?? res.user?.uid) as string | number | undefined
    return String(
        uid ?? jwtSubject(res.access_token) ?? getActiveAccountId() ?? `unknown-${randomId()}`,
    )
}
