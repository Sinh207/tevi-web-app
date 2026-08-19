/**
 * `/my-wallet` — the withdrawable-earnings screen, its ledger, and the currency it is shown in.
 *
 * ## Its own feature, not part of `features/balance` and not part of `features/my-star`
 *
 * `features/balance` is a **provider**: one figure per unit, mounted above every route, plus the rule for
 * whether Star can be spent. This is a **screen**: one route, two endpoints, twelve filters, an infinite
 * list and a currency switcher. `features/my-star` is a third, in the same position.
 *
 * The dependency runs one way — this feature takes the balance, the money vocabulary and the `LedgerEntry`
 * DTO from `@features/balance`; nothing there knows this exists, and the two screens do **not** know about
 * each other. What they share is in `shared/`, props-only, so `shared/` still imports nothing from
 * `features/`:
 *
 * | | where |
 * |---|---|
 * | the ledger's layout, row and skeleton | `shared/components/ledger.tsx` |
 * | the action list | `shared/components/action-rows.tsx` |
 * | the filter control | `shared/components/filter-menu.tsx` |
 * | money and ledger-time formatting | `shared/lib/{money,ledger-time}.ts` |
 *
 * Legacy is the counter-example for what happens otherwise: its two ledger components are ~300
 * near-identical lines each and have already drifted.
 *
 * ## The exchange service lives here on purpose
 *
 * The currency list and the live rate are **this screen's** — they serve a control that exists on this one
 * page. Putting them on the balance provider would mount two exchange-service queries above the whole app;
 * the app shell shows USD (`useBalanceDisplay`), which needs no rate at all.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `features/navigation` links here (the drawer's ASSETS row) and this feature reaches into
 * `features/channel` for `ChannelEmptyState`. Through one barrel each those form a module cycle, which ESM
 * resolves by handing one side a half-initialised module — an `undefined is not a function` at render time
 * rather than a build error. So the address lives in `./routes`, which imports nothing, and
 * `features/navigation` imports **that**. This file must never become the drawer's dependency.
 */

export { exchangeKeys } from './api/exchange-api'
export { walletLedgerKeys } from './api/wallet-ledger-api'
export { MyWalletView } from './components/my-wallet-view'
/**
 * Exported for `/dev/my-wallet`, for the reason `features/earnings` exports `EarningsDayRow`: the real
 * screen is unreachable without a signed-in creator who has actually earned, so without a preview a design
 * pass on it means faking an API response. Both are pure props.
 */
export { CurrencyChip, TotalBalanceCard } from './components/total-balance-card'
export { MY_WALLET_CONTAINER } from './lib/container'
/** Exported for `/dev/my-wallet`, so the preview draws the same artwork the screen does. */
export { MY_WALLET_ART } from './lib/illustrations'
export { MY_WALLET_PATH } from './routes'

/**
 * Deliberately **not** exported: `walletLedgerApi`, `exchangeApi`, `useCurrency`, `useWalletLedger`,
 * `useFirstPayoutFree`, and the transaction-type table.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components" forbids, and
 * exporting it is the invitation. `useCurrency` is withheld for a second reason: it is the *wallet's*
 * display unit, and another screen reaching for it would be adopting a preference set on a page its reader
 * may never have opened. The vocabulary is withheld for a third: it is this ledger's, and a caller using it
 * from `/my-star` would be offering filters that endpoint cannot answer.
 */
