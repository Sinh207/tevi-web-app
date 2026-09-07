/**
 * `/my-star`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/earnings/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's ASSETS row and the mobile top bar's Star
 * pill. Routed through the main `index.ts`, that is a cycle between two barrels, which ESM resolves by
 * handing one side a half-initialised module: not a build error but an `undefined is not a function` at
 * render time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX, so it is the cheapest possible consumer of a path —
 * and it must stay that way. It imports `@features/my-star/routes`, never `@features/my-star`.
 *
 * ## A new address, and the split it comes from
 *
 * Legacy has one screen at `/my-wallet` with two tabs, Star and Currency. The design splits them and
 * its handoff note says which half keeps the old address: *"bên My wallet bỏ phần Star đi"* — My wallet
 * loses the Star part. So `/my-wallet` stays put and narrows, and this is where the Star half went.
 * Legacy's `/my-wallet/transaction-history?currency=tvs` is redirected here in `proxy.ts`.
 */

/** `/my-star` — the Star balance and its ledger. */
export const MY_STAR_PATH = '/my-star'

/**
 * `/gift-star` — choosing a creator to gift Star to.
 *
 * ## Why the path is here and the screen is not
 *
 * The page renders `features/search`'s `CreatorPickerView` and this feature owns none of its code.
 * What it owns is the **address**: `/my-star`'s *Gift Star* row is the only thing that links there,
 * and the two are one product surface — a Star action and the screen it opens. Putting the constant
 * in `features/search` would make a search screen's route module the home of a word ("gift") that
 * feature is deliberately kept ignorant of.
 *
 * ## Sibling of `/get-star`, deliberately
 *
 * The two rows sit next to each other on `/my-star` and do the same *kind* of thing, so their
 * addresses match. `features/payment/routes.ts` carries the rule both of them follow: a press that
 * **is a navigation** gets a route, and one that would tear down what is behind it gets a dialog.
 * Gift Star was a dialog first — `CreatorPickerView` records what the phone measured and why that
 * was wrong.
 *
 * Nothing to redirect in `proxy.ts`: legacy has no URL for this at all (it is a sheet over
 * `/my-star`), so no address moved — one was added.
 */
export const GIFT_STAR_PATH = '/gift-star'
