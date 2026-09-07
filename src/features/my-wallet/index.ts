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
 * ## The exchange service used to live here and no longer does
 *
 * The currency list, the rate and `useCurrency` moved to `@features/balance` when the account drawer's
 * balance card gained the same switcher (legacy has had one there all along). The drawer is the shell's and
 * cannot import this barrel — see the cycle below — and a display unit belongs beside the figure it
 * relabels rather than inside one of the two screens that offer it. Nothing was handed to the shell in the
 * process: `useCurrency({ enabled })` requests nothing until its caller asks, so the drawer waits for
 * `open` and this screen still asks on mount.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `features/navigation` links here (the drawer's ASSETS row) and this feature reaches into
 * `features/channel` for `ChannelEmptyState`. Through one barrel each those form a module cycle, which ESM
 * resolves by handing one side a half-initialised module — an `undefined is not a function` at render time
 * rather than a build error. So the address lives in `./routes`, which imports nothing, and
 * `features/navigation` imports **that**. This file must never become the drawer's dependency.
 */

export { walletLedgerKeys } from './api/wallet-ledger-api'
/**
 * The live switcher — the chip plus the dialog behind it. Exported for the same reason and with the
 * same caveat: `/dev/my-wallet` is the only place a design pass can open it, because the real screen
 * needs a signed-in creator *and* the exchange service's list.
 */
/**
 * The `?` beside the balance and the dialog behind it. Exported for `/dev/my-wallet` — on the real
 * screen it sits on a card that needs a signed-in creator's figure.
 */
export { BalanceHelpButton } from './components/balance-help-button'
export { CurrencyPicker } from './components/currency-picker'
export { MyWalletView } from './components/my-wallet-view'
export { TeviCoinAppLink } from './components/tevi-coin-app-link'
/**
 * Exported for `/dev/my-wallet`, for the reason `features/earnings` exports `EarningsDayRow`: the real
 * screen is unreachable without a signed-in creator who has actually earned, so without a preview a design
 * pass on it means faking an API response. Both are pure props.
 */
export { CurrencyChip, TotalBalanceCard } from './components/total-balance-card'
/**
 * `/my-wallet/transaction-history` — the full ledger and its filter. A second screen rather than a
 * prop on the first: see its own doc, and `routes.ts` for why the address is legacy's.
 */
export { WalletTransactionHistoryView } from './components/wallet-transaction-history-view'
export { MY_WALLET_CONTAINER, MY_WALLET_PANEL, MY_WALLET_SCREEN } from './lib/container'
/** Exported for `/dev/my-wallet`, so the preview draws the same artwork the screen does. */
export { MY_WALLET_ART } from './lib/illustrations'
export { MY_WALLET_PATH, MY_WALLET_TRANSACTION_HISTORY_PATH } from './routes'

/**
 * Deliberately **not** exported: `walletLedgerApi`, `useWalletLedger`, `useFirstPayoutFree`, and the
 * transaction-type table.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components" forbids, and
 * exporting it is the invitation. The vocabulary is withheld for a second reason: it is this ledger's, and a
 * caller using it from `/my-star` would be offering filters that endpoint cannot answer.
 */
