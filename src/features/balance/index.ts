/**
 * The balance feature — **the signed-in account's balance, and nothing else.**
 *
 * One number per unit, available everywhere, plus the rule for whether an amount of Star can be spent.
 * It owns no screen, no ledger, no currency picker and no other feature's state.
 *
 * ```
 * BalanceProvider          app/session-providers.tsx, directly inside AuthProvider
 *   useBalance()           star · usd · isKnown · hasEnoughStars · starShortfall · refresh
 *   useRequireStars()      guard a priced action; diverts to top-up when short
 *   useBalanceDisplay()    the two strings the app shell renders
 * ```
 *
 * ## Where the rest of the wallet lives
 *
 * | | feature | reads |
 * |---|---|---|
 * | the figure, everywhere | **here** | `billy/v5/billing/balance/` |
 * | `/my-star` | `features/my-star` | `billy/v5/billing/tvs-transactions/` |
 * | `/my-wallet` | `features/my-wallet` | `billy/v5/billing/transactions/`, `exchange/v1/*` |
 *
 * Three features on two services, and the split is by **subject**, not by service: this one answers
 * "how much does this account have", and the other two are screens that explain and manage it. A
 * balance is read on every route; a ledger is read on one. Putting them together would mount a
 * screen's worth of state above the whole app.
 *
 * The two screens depend on this one — for the balance, the money vocabulary and the ledger DTO —
 * through this barrel, like any other feature. Nothing here depends on them, which is what keeps the
 * shell free of their queries.
 *
 * ## Spending Star goes through `useRequireStars`
 *
 * Every price in the app — a gift, a paywalled post, a membership, a paid live — is behind it, and it
 * composes `useRequireAuth`, so a call site states one precondition and gets both. When the purchase
 * flow lands it is a one-line change *inside that hook* and nothing at any call site moves.
 *
 * After anything that spends or adds Star, call `refresh()` from `useBalance()`. Invalidating
 * `balanceKeys.all` refreshes the figure **and** both ledgers, because the two screens nest their keys
 * under it — that agreement is stated on `balanceKeys` and is the only coupling between the three.
 *
 * ## No socket, this pass
 *
 * Legacy's live update is a `balance_change` socket event and it is the *only* thing that refreshes its
 * balance — `getBalance` is exposed for post-purchase invalidation and, per `grep`, never actually
 * called by any consumer. Sockets are a later phase here (CLAUDE.md's third primitive, not yet built),
 * so `refresh()` is the mechanism. When the socket lands it belongs in `BalanceProvider`, invalidating
 * `balanceKeys.all` — and **not** pushed into a store: an event that carries server data must not
 * become the source of it.
 */

export { balanceKeys } from './api/balance-api'
export type { Balance, LedgerEntry } from './api/types'
/**
 * The wire codes and the ledger parser. Exported for the two screen features, which read the same
 * shape from two different endpoints — the DTO is this feature's subject, the endpoints are theirs.
 */
export { EARNINGS_CURRENCY, normalizeLedger, STAR_CURRENCY } from './api/types'
/**
 * The Star amount that drifts off the balance when it moves. Presentation of this feature's own data,
 * like `useBalanceDisplay` — the shell only places it.
 */
export { StarChangeFlash } from './components/star-change-flash'
export type { BalanceDisplay } from './hooks/use-balance-display'
export { useBalanceDisplay } from './hooks/use-balance-display'
export { useRequireStars } from './hooks/use-require-stars'
/**
 * The one money formatter that knows what `TVS` means, so it cannot live in `shared/lib/money.ts`.
 * Both screens render a ledger and both need it.
 */
export { formatLedgerAmount, isStarEntry } from './lib/format'
export { BalanceProvider, useBalance } from './providers/balance-provider'

/**
 * Deliberately **not** exported: `balanceApi`.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/earnings/index.ts` spells
 * out. Everything a consumer needs is on the provider.
 */
