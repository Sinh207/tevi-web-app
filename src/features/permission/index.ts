/**
 * The permission feature — **what the signed-in account is allowed to do, and nothing else.**
 *
 * ```
 * PermissionProvider        app/session-providers.tsx, inside AuthProvider beside Balance
 *   usePermission()         permission · isKnown · can() · state() · fiatAgency · grant() · refresh
 *   useCapability(c)        gate a screen: 'loading' | 'error' | 'allowed' | 'denied'
 *   useRequireCapability()  gate a press; composes useRequireAuth
 *   CAPABILITIES            the vocabulary — one entry per gated feature
 * ```
 *
 * One endpoint (`permission/v3/channel/permission/`), one question: **which features does the
 * backoffice have switched on for this account.** Not roles, not scopes, not admin rights, not
 * platform configuration — that last one is remote config, which is a different subject and a
 * different service (`api/permission-api.ts` says why legacy's `ACTION_FEE` call does not live here).
 *
 * ## Two rules, stated once each, and they are the reason this is a feature
 *
 * 1. **Gates fail closed.** An unknown grant is a denied grant, everywhere, because the surfaces
 *    behind these grants move money and offering one to an account without the grant is a dead end
 *    the backend then has to refuse.
 * 2. **A failure is not a denial.** The same all-false payload means "you are an ordinary creator"
 *    *and* "the request 502'd", so a screen that cannot tell them apart tells an agency they have no
 *    access. `capabilityState` separates them into four states; legacy has two and is wrong in one.
 *
 * Everything else here follows from those. `can()` collapses the four states for a *list*, where an
 * unlisted row costs nothing; `useCapability` keeps them for a *screen*, where a wrong denial is the
 * whole bug; `useRequireCapability` keeps three for a *press*, where "we do not know yet" is worth
 * retrying and worth saying honestly.
 *
 * ## Adding a capability
 *
 * One entry in `CAPABILITIES` (`lib/capabilities.ts`) naming the grant in product language and
 * pointing at its wire field. Nothing else — the union type, the gates and the four-state logic all
 * follow. A grant that shipped after this client did can be read with `grant('feature', 'flag')`
 * without any schema change, because the payload is parsed with `looseObject` and carried whole.
 *
 * ## Where the gated features live
 *
 * | capability | surface | feature |
 * |---|---|---|
 * | `star-transfer` | `/star-transfer` + the drawer's SERVICES row | `features/star-transfer` |
 * | `payout-agency` | `/payout` agency console + its drawer row | not built yet |
 *
 * `/star-transfer` is the screen this feature was written ahead of, and it uses both halves of the
 * contract: `useCapability` for the screen (four states — its denial panel is legacy's bug, written
 * down) and `can()` for the drawer row, which is hidden when the grant is missing so the section
 * disappears with it (`features/navigation/lib/menu-rows.ts`, `menu-drawer.tsx`).
 *
 * Payout is still an un-migrated legacy screen (`containers/payout`), so its row is deliberately absent
 * rather than pointing at a 404 — it is one entry in the same SERVICES section when that screen lands.
 *
 * ## Not exported: `permissionApi`
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/balance/index.ts` gives.
 * Everything a consumer needs is on the provider. `permissionKeys` *is* exported, so a screen that
 * changes a grant can invalidate it.
 */

export { permissionKeys } from './api/permission-api'
export type { ChannelPermission, FiatAgency, PayoutMethod } from './api/types'
/**
 * Exported for the two screens that will render an agency's methods, and for tests. The parser is the
 * feature's own subject; the endpoints that will *write* these values belong to the payout screen.
 */
export { normalizeChannelPermission } from './api/types'
export { useCapability } from './hooks/use-capability'
export { useRequireCapability } from './hooks/use-require-capability'
export type { Capability, CapabilityState } from './lib/capabilities'
/**
 * The vocabulary itself, and the pure gate functions over it. Exported so a capability can be gated
 * outside React — a route guard, a `menu-rows`-style data file — without reaching for a hook.
 */
export { allows, CAPABILITIES, capabilityState, rawGrant } from './lib/capabilities'
export { PermissionProvider, usePermission } from './providers/permission-provider'
