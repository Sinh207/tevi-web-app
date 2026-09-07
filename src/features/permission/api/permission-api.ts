import { env } from '@shared/config/env'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { type ChannelPermission, normalizeChannelPermission } from './types'

/**
 * The **permission** service: `${W_API}/permission`, `v3`.
 *
 * A service of its own — not `/core`, not `/auth`. Legacy has it as `models/apiPermission.js` on the
 * same base, and getting it wrong 404s.
 *
 * ## One endpoint, on purpose
 *
 * Legacy's `models/permission.js` declares three:
 *
 * | endpoint | ported | why |
 * |---|---|---|
 * | `v3/channel/permission/` | **yes** | the account's grants — everything this feature is |
 * | `v3/channel/{id}/feature/slug/reaction-fee/` | no | **dead in legacy**: declared, never called from anywhere (`grep`) |
 * | `v3/remote-config/ACTION_FEE/` | no | remote config, not permission — and also dead (below) |
 *
 * The third one is worth a sentence because its absence here is a **fix**, not an omission. Legacy's
 * provider holds an `actionFee` state and a `getActionFee` fetcher, and: `initData` never calls it,
 * the value is never put on the context, and its `catch` block calls `setChannelPermission(null)` —
 * the wrong setter, copy-pasted. So the one code path that would have run it wipes the account's
 * *permissions* on any action-fee failure. Porting dead code faithfully would have ported that.
 *
 * When action fees are actually needed they belong to a `remote-config` feature reading
 * `v3/remote-config/*`, which is a different subject: remote config is **platform** configuration
 * (prices, limits, kill switches, the same for everyone), and this endpoint is **per-account**
 * entitlement. Mixing them is how you end up with a provider that refetches everybody's config
 * whenever one person's grants change.
 *
 * ## The account is derived from the bearer, never passed
 *
 * `channel/permission/` takes no id: "which account" is whichever bearer went out. Which makes
 * `accountId` mandatory in practice, for the same reason `authApi.getMe` and `balanceApi.getBalance`
 * spell out — a reader with ten accounts must not get account A's grants filed under account B's key.
 * Here that is not a stale-data annoyance: **it is the payout screen appearing for an account that
 * has no payout grant**, and a request behind it that the backend will refuse.
 *
 * There is **no server-side read**. Grants are the opposite of public content, and this app has no
 * SSR bearer by construction (`shared/lib/api/token.ts`).
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/permission` })

/**
 * Forget the cached grants for one account — **on the `premium_info` frame**, and only then.
 *
 * Same trap, same reason as `forgetMyChannelCache` and `forgetPremiumInfoCache` (**B72**): the
 * refetch this provider starts carries an `If-None-Match`, a `304` replays the body it is trying to
 * replace, and the reader who just bought Premium keeps the grants they had. Gates **fail closed**
 * here, so the failure is silent in the worst direction — a feature Premium just unlocked stays
 * hidden, and the only cure is a reload.
 */
export function forgetChannelPermissionCache(accountId: string | null) {
    return invalidateETagCache(accountId ?? ANON_SCOPE, `${api.apiBase}/v3/channel/permission/`)
}

/**
 * Query keys.
 *
 * Account-scoped for the reason above. `'anon'` stands in for a null account so a key is never
 * malformed; no query here ever runs for an anonymous session, so that slot caches nothing.
 *
 * `all` is exported so a future screen that changes a grant — the payout settings form saving its
 * methods, an agency being switched off — can invalidate the whole feature with one call instead of
 * reconstructing the active account's key.
 */
export const permissionKeys = {
    all: ['permission'] as const,
    channel: (accountId: string | null) => ['permission', 'channel', accountId ?? 'anon'] as const,
}

export const permissionApi = {
    /**
     * Every grant this account has, in one request.
     *
     * Returns a fully-populated `ChannelPermission` even for an account with no grants at all — the
     * payload for an ordinary creator is `{}`, and that is a successful answer meaning "denied", not
     * a failure. The provider is what distinguishes the two.
     *
     * ## One case is deliberately *not* mapped: a 404
     *
     * If the backend answers 404 rather than `{}` for an account with no permission record, that
     * rejects, and a gated screen shows a **retry panel** to an ordinary creator instead of a denial.
     * Gates still fail closed, so nothing leaks — but the reader is offered a retry that can never
     * succeed.
     *
     * It is left unmapped on purpose. Translating 404 to "no grants" would also translate a mistyped
     * path, a renamed version prefix or a moved service into "nobody on this platform has any
     * grants" — silently, in the one direction no test would catch, since fail-closed makes the
     * symptom "the feature quietly never appears". A visible error state is the better failure while
     * B40 is open; the day it is answered this is a two-line change (`isApiError(e, 404)` → an empty
     * `ChannelPermission`) and every gate above it already behaves correctly.
     */
    async getChannelPermission({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<ChannelPermission> {
        const body = await api.get<unknown>('v3/channel/permission/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
        })
        return normalizeChannelPermission(body)
    },
}
