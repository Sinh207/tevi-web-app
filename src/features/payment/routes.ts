/**
 * `/card-management`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/my-star/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's `menu_card_management` row, which shipped
 * with no `href` at all because this feature did not exist yet. Routed through this feature's
 * `index.ts`, that link would be a cycle between two barrels: the payment barrel pulls in
 * `card-management-view.tsx`, which reaches back into `features/channel` and `features/navigation`.
 * ESM resolves a cycle by handing one side a half-initialised module — not a build error, an
 * `undefined is not a function` at render time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX and no hooks, so it is the cheapest possible consumer
 * of a path, and it must stay that way. It imports `@features/payment/routes`, never
 * `@features/payment`.
 *
 * ## A new address
 *
 * Legacy's card screen is a **tab inside** `/my-wallet` (`containers/wallet/cardManagement`), reached
 * by a segmented control rather than by a URL — so there is nothing in `proxy.ts` to redirect: no
 * address moved, one was added. The drawer row is the only entry point either app has ever had.
 *
 * ## Buying Star has **both** a route and a dialog, and that is not a contradiction
 *
 * `/get-star` is legacy's own address and this app keeps it, because half the presses that lead to
 * buying Star *are* navigations: the `+` in the top bar, the *Get Star* row on `/my-star`, the `+` on
 * the transfer card, a bookmark. Answering those with a modal over the screen somebody just left
 * would be the odd move.
 *
 * The dialog stays for the other half — a gift pressed with too little Star (`useRequireStars`) —
 * where "gate the action, never the route"
 * ([`docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md) §3) applies exactly: the
 * livestream behind it must not be torn down to sell somebody a top-up. Both surfaces hold one
 * `useStarCatalogue`, so there is one purchase flow with two frames around it, not two flows.
 */

/** `/card-management` — the account's saved cards. */
export const CARD_MANAGEMENT_PATH = '/card-management'

/**
 * `/get-star` — buying Star, as a destination.
 *
 * Same path as legacy's, so nothing in `proxy.ts` has to redirect and every link the mobile apps and
 * old emails already carry keeps working. `?need=<star>` optionally pre-selects a package that closes
 * a gap — see `SHORTFALL_PARAM` in `hooks/use-get-star.ts` for who is allowed to send it.
 */
export const GET_STAR_PATH = '/get-star'

/**
 * `/get-star/transaction-history` — the reader's own Star purchases.
 *
 * Nested under the screen it belongs to, and named the way its sibling is
 * (`/my-wallet/transaction-history`): the same words for the same kind of list, under whichever
 * screen owns it. It is **not** `/my-star` — that is billy's balance ledger, and a top-up that failed
 * or is still pending never reaches it. See `TransactionHistoryView`.
 *
 * Legacy has no such URL: its history is a modal on the purchase page, so there is nothing in
 * `proxy.ts` to redirect — no address moved, one was added.
 */
export const GET_STAR_TRANSACTIONS_PATH = '/get-star/transaction-history'
