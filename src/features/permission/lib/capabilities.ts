import type { ChannelPermission } from '../api/types'

/**
 * The app's **capability vocabulary** — the one place a grant's wire spelling is written down.
 *
 * ## Why a registry rather than reading the payload at each call site
 *
 * Because that is what legacy does, and it is measurably where the bugs are. `fiat_agency.is_active`
 * is spelled out by hand in four files and `transfer_star.allowed` in three; one of the four forgets
 * `Boolean()`, and every one of them has to re-remember which of the two flag names this particular
 * feature uses (`allowed`? `is_active`? `enabled`?). Multiply that by the grants the backoffice will
 * add and the client's gating logic becomes a spelling test.
 *
 * So: a call site says `can('payout-agency')` and never learns the field name. Adding a capability is
 * one entry here. Renaming a field on the wire is one edit here. And because the names are a union
 * type, a typo is a **type error** rather than a silently-false gate that hides a screen from
 * everybody — which is exactly the failure mode that a fail-closed design would otherwise make
 * invisible.
 *
 * ## Naming
 *
 * Kebab-case, product language, matching what the thing is called in the UI and in `menu-rows.ts`
 * (`'star-transfer'`, not `'transfer_star'`). The wire name stays on the right-hand side, where it
 * belongs.
 */

/**
 * A predicate over the parsed payload.
 *
 * It takes the whole `ChannelPermission` rather than a slice so a capability can be a function of
 * more than one grant — an entitlement that needs both a grant *and* a configured payout method, say.
 * That happens, and when it does the composition belongs here, in the vocabulary, not in the screen.
 */
type CapabilityPredicate = (permission: ChannelPermission) => boolean

/**
 * Read a grant this client has no named field for.
 *
 * The escape hatch that lets a capability be added for a backend feature that shipped after this
 * schema did — `rawGrant(p, 'new_feature', 'allowed')` — without a schema change and without any call
 * site touching `raw` itself.
 *
 * Strict about what counts as yes, for the same reason `strictBoolean` is: `"false"` is truthy, and an
 * entitlement decided by a string coercion is an entitlement decided by accident.
 */
export function rawGrant(
    permission: ChannelPermission,
    feature: string,
    flag: 'allowed' | 'is_active' | 'enabled' = 'allowed',
): boolean {
    const grant = permission.raw[feature]
    if (!grant || typeof grant !== 'object') return false
    const value = (grant as Record<string, unknown>)[flag]
    return value === true || value === 1
}

/**
 * Read a **number** out of a grant's `meta`.
 *
 * ## Why this exists beside `rawGrant`
 *
 * Not every grant is a yes/no. `post.meta.minimum_price_tvs` is the floor under a paid post's price
 * — legacy reads exactly that (`channelPermission?.post?.meta?.minimum_price_tvs || 1`) and the
 * composer needs it before it can validate what the author typed. `rawGrant` answers booleans and
 * would report this one as `false`, which is not wrong so much as unable to say anything.
 *
 * `null` when the path is absent or not a finite number, so the caller supplies its own floor rather
 * than inheriting a `0` that would let a post be priced at nothing. Strict for the same reason
 * `rawGrant` is: a numeric string is a value somebody typed into a console, and coercing it is how a
 * price ends up being decided by accident.
 */
export function rawGrantNumber(
    permission: ChannelPermission,
    feature: string,
    key: string,
): number | null {
    const grant = permission.raw[feature]
    if (!grant || typeof grant !== 'object') return null
    const meta = (grant as Record<string, unknown>).meta
    if (!meta || typeof meta !== 'object') return null
    const value = (meta as Record<string, unknown>)[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Every gated capability in the app.
 *
 * Two today, because two is what legacy actually gates on — both of them money-moving surfaces, which
 * is why they are gated at all. The registry is the point rather than its current size: the entitlement
 * payload is open-ended, and this is where the next one lands.
 */
export const CAPABILITIES = {
    /**
     * `/star-transfer` — moving Star to another account, singly or in bulk.
     *
     * Granted to partners and agencies. In legacy it gates the whole screen (`AccessDenied` otherwise)
     * *and* its menu row *and* the initial load of its transfer history, which is three call sites
     * reading one flag, and is the argument for this file.
     */
    'star-transfer': permission => permission.canTransferStar,

    /**
     * `/payout` — the agency console: settling other creators' withdrawals, and the fee settings
     * behind it.
     *
     * Note this is **not** "can I withdraw my own earnings" — every creator can do that, and it is not
     * gated here. This is the grant that makes an account an *agency*, which is why the capability is
     * named for the role and not for the route.
     */
    'payout-agency': permission => permission.fiatAgency.isActive,
} satisfies Record<string, CapabilityPredicate>

/** The gated capabilities, as a type. A typo in `can('...')` is a compile error. */
export type Capability = keyof typeof CAPABILITIES

/**
 * Whether a *known* set of grants allows a capability.
 *
 * Takes `ChannelPermission | null` and answers `false` for `null` — **fail closed**. Not a
 * convenience: `null` here means the request has not answered or has failed, and treating an unknown
 * entitlement as granted would put a reader on a screen whose every request the backend then refuses.
 *
 * Consumers that need to *distinguish* the two call `capabilityState` instead; a menu row does not
 * care, and this is what a menu row calls.
 */
export function allows(permission: ChannelPermission | null, capability: Capability): boolean {
    if (!permission) return false
    return CAPABILITIES[capability](permission)
}

/**
 * The four states a gated **screen** can be in.
 *
 * A boolean is enough for a menu row — it is either listed or it is not — but not for a screen that
 * replaces itself with an "Access denied" panel, and this distinction is a bug in legacy rather than a
 * refinement. Its provider sets `isLoading = false` after the fetch *whether or not it succeeded*, and
 * `containers/starTransfer` renders `AccessDenied` for anything that is not explicitly allowed. So an
 * agency whose permission request hit a 502, or who was offline for a second, is told they do not have
 * access to a feature they do have access to — with no retry, because the screen believes the answer.
 *
 * Four states means a screen can render a skeleton, a retry, the feature, or the denial, and be right
 * in each case.
 */
export type CapabilityState = 'loading' | 'error' | 'allowed' | 'denied'

export function capabilityState({
    permission,
    capability,
    isAuthenticated,
    isLoading,
    isError,
}: {
    permission: ChannelPermission | null
    capability: Capability
    /** A guest has no grants and never will — see below. */
    isAuthenticated: boolean
    /**
     * A request is in flight, or the session is still bootstrapping. The provider folds both in, so
     * this file need not know about either.
     */
    isLoading: boolean
    isError: boolean
}): CapabilityState {
    /*
     * Loading wins over everything, and it is first because it subsumes the session bootstrap: during
     * it there is no active account yet, so every other branch below would answer about a session that
     * does not exist. It also wins over `isError`, because a refetch after a failure is a *loading*
     * state and a retry button over an in-flight request is a no-op.
     */
    if (isLoading) return 'loading'
    /*
     * A guest is **denied**, not errored. No request was made for them (nor should be — see the
     * provider), so there is nothing to retry: what they are missing is a session, and a screen shows
     * that with a sign-in prompt. Calling it an error would offer a retry that cannot help.
     */
    if (!isAuthenticated) return 'denied'
    /*
     * **An answer we have outranks an error, and an error outranks the grant check.** Both halves of
     * that ordering are load-bearing:
     *
     * - grants we already hold win over a *failed refetch*. Once an answer has arrived for this
     *   account we know what it says, and a screen the reader is already using must not collapse into
     *   a retry panel because a background revalidation five minutes later hit a blip. Grants change
     *   monthly; the cached answer is almost certainly still true, and `staleTime` exists on that
     *   premise. Checking `isError` first would make every flaky minute a visible outage;
     * - a failure with **no** answer is an error, never a denial. This is the half legacy gets wrong:
     *   a failed request produces the same all-false payload an ordinary creator's `{}` does, so
     *   asking "is it allowed" first turns a 502 into a permanent "Access denied" with no retry.
     */
    if (permission) return CAPABILITIES[capability](permission) ? 'allowed' : 'denied'
    if (isError) return 'error'
    /*
     * Authenticated, no answer, no error, and not (yet) reported as loading: the request has not
     * settled. `loading` rather than `error`, so that a caller whose `isLoading` lags by a render — the
     * tick after `enabled` flips true, before TanStack has marked the query as fetching — shows a
     * skeleton for a frame instead of flashing a retry panel at somebody whose grants are on their way.
     *
     * This is why `isError` is a parameter and not inferred from `permission === null`: those two are
     * different states, and only one of them is worth telling the reader about.
     */
    return 'loading'
}
