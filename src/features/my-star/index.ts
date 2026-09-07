/**
 * `/my-star` — the Star balance screen and its ledger.
 *
 * ## Its own feature, not part of `features/balance`
 *
 * `features/balance` is a **provider**: one figure per unit, mounted above every route, plus the rule
 * for whether an amount of Star can be spent. It is read on every page. This is a **screen**: one route,
 * one endpoint, eleven filters, an infinite list. Putting them together would mount a screen's worth of
 * state above the whole app to serve a page most sessions never open.
 *
 * So the dependency runs one way. This feature takes the balance, the money vocabulary and the
 * `LedgerEntry` DTO from `@features/balance`; nothing there knows this exists. `/my-wallet` is a third
 * feature in the same position, and the two screens do **not** depend on each other — what they share is
 * in `shared/`:
 *
 * | | where |
 * |---|---|
 * | the ledger's layout, row and skeleton | `shared/components/ledger.tsx` |
 * | the action list | `shared/components/action-rows.tsx` |
 * | the filter control | `shared/components/filter-menu.tsx` |
 * | money and ledger-time formatting | `shared/lib/{money,ledger-time}.ts` |
 *
 * All of those are props-only, so `shared/` still imports nothing from `features/`. Legacy is the
 * counter-example for what happens otherwise: its two ledger components are ~300 near-identical lines
 * each and have already drifted.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `features/navigation` links here (the drawer's ASSETS row, the top bar's Star pill) and this feature
 * reaches into `features/channel` for `ChannelEmptyState`. Through one barrel each, those form a module
 * cycle — and ESM resolves a cycle by handing one side a half-initialised module, which surfaces as
 * `undefined is not a function` at render time rather than as a build error. So the address lives in
 * `./routes`, which imports nothing, and `features/navigation` imports **that**. This file must never
 * become the drawer's dependency.
 *
 * Same shape, and the same class of trap, as `features/earnings`'s `index.ts` / `routes.ts` split.
 */

export { starLedgerKeys } from './api/star-ledger-api'
export { MyStarView } from './components/my-star-view'
/**
 * Exported for `/dev/my-star`, for the reason `features/earnings` exports `EarningsDayRow`: the real
 * screen is unreachable without a signed-in account that has actually earned or spent Star, so without
 * a preview a design pass on it means faking an API response or spending money. Pure props.
 */
export { StarBalanceCard } from './components/star-balance-card'
export { MY_STAR_CONTAINER } from './lib/container'
/** Exported for `/dev/my-star`, so the preview draws the same artwork the screen does. */
export { MY_STAR_ART } from './lib/illustrations'
export { GIFT_STAR_PATH, MY_STAR_PATH } from './routes'

/**
 * Deliberately **not** exported: `starLedgerApi`, `useStarLedger`, and the transaction-type table.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components" forbids,
 * and exporting it is the invitation. The vocabulary is withheld for a second reason: it is this
 * ledger's, and a caller reaching for it from `/my-wallet` would be offering filters that endpoint
 * cannot answer.
 */
