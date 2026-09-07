/**
 * The balance feature — **the signed-in account's balance, and nothing else.**
 *
 * One number per unit, available everywhere, the **unit those numbers are shown in**, and the rule for
 * whether an amount of Star can be spent. It owns no screen and no ledger.
 *
 * ```
 * BalanceProvider          app/session-providers.tsx, directly inside AuthProvider
 *   useBalance()           star · usd · isKnown · hasEnoughStars · starShortfall · refresh
 *   useRequireStars()      guard a priced action; diverts to top-up when short
 *   useBalanceDisplay()    the two strings the app shell renders
 *   useCurrency()          the display currency, its list and today's rate — provider-free, opt-in
 * ```
 *
 * ## Why the display currency is here and not on the wallet screen
 *
 * It was on `/my-wallet` while that was the only switcher. The account drawer's balance card now has one
 * too, as legacy's does, and the drawer is the shell's — it cannot import a screen feature (see the
 * module-cycle note in `features/my-wallet/index.ts`). A display unit belongs beside the figure it
 * relabels, and both readers are below this point.
 *
 * It stays **provider-free and opt-in**, which is what keeps that from costing the shell anything:
 * `useCurrency({ enabled })` issues no request until its caller says so, so the drawer waits for `open`
 * and a route that renders no balance card pays nothing at all.
 *
 * ## Where the rest of the wallet lives
 *
 * | | feature | reads |
 * |---|---|---|
 * | the figure, everywhere, and the unit it is shown in | **here** | `billy/v5/billing/balance/`, `exchange/v1/*` |
 * | `/my-star` | `features/my-star` | `billy/v5/billing/tvs-transactions/` |
 * | `/my-wallet` | `features/my-wallet` | `billy/v5/billing/transactions/` |
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
/**
 * The exchange service's query keys. Exported so a caller that changes the display unit elsewhere can
 * drop the pair; `exchangeApi` itself is not exported, for the reason at the bottom of this file.
 */
export { exchangeKeys } from './api/exchange-api'
export type { Balance, LedgerEntry } from './api/types'
/**
 * The wire codes and the ledger parser. Exported for the two screen features, which read the same
 * shape from two different endpoints — the DTO is this feature's subject, the endpoints are theirs.
 */
/**
 * `epochMs` is exported for `features/payout`, which reads the same service and needs the same answer
 * to "what shape is `created_at` this time" — see B37 and the parser's own note.
 */
export { EARNINGS_CURRENCY, epochMs, normalizeLedger, STAR_CURRENCY } from './api/types'
/**
 * The Star amount that drifts off the balance when it moves. Presentation of this feature's own data,
 * like `useBalanceDisplay` — the shell only places it.
 */
export { StarChangeFlash } from './components/star-change-flash'
export type { BalanceDisplay } from './hooks/use-balance-display'
export { useBalanceDisplay } from './hooks/use-balance-display'
export type { UseCurrencyResult } from './hooks/use-currency'
/**
 * The display currency, its list and today's rate. Read by `/my-wallet` and by the account drawer's
 * balance card — the two places that offer the switcher. Pass `{ enabled }` from anything mounted above
 * a route, so the shell issues no exchange request until the control is actually on screen.
 */
export { useCurrency } from './hooks/use-currency'
export { useRequireStars } from './hooks/use-require-stars'
/**
 * The one money formatter that knows what `TVS` means, so it cannot live in `shared/lib/money.ts`.
 * Both screens render a ledger and both need it.
 */
export { formatLedgerAmount, isStarEntry } from './lib/format'
export { BalanceProvider, useBalance } from './providers/balance-provider'

/**
 * Deliberately **not** exported: `balanceApi` and `exchangeApi`.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/earnings/index.ts` spells
 * out. Everything a consumer needs is on the provider.
 */
