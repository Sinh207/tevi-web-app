/**
 * `/search`'s content column: **full width below `md`, 612px from `md` up.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>` for this page. Written as a literal rather than
 * `max-w-sm` for the reason `CHANNEL_CONTAINER` gives: Tailwind's `sm` is 24rem (384px), and
 * **this repo's `sm` breakpoint is itself 612px** — so `max-w-sm` would be wrong and
 * `sm:max-w-[612px]` would read as if the cap only applied above the cap.
 *
 * `md` (900) is the switch, not `sm`, because that is where the tab bar gives way to the left
 * rail — i.e. where the layout stops being the phone layout. Below it the panel is full-bleed and
 * its rows run edge to edge, as the mobile app's do.
 *
 * Same value as `CHANNEL_SETTINGS_CONTAINER` and `IDENTIFICATION_CONTAINER` today, and
 * deliberately still its own constant: a page's width is a decision it owns, and it is not
 * imported from `features/channel` because a feature may not reach into another feature's
 * internals — the note on `CHANNEL_SETTINGS_CONTAINER` says the same about the same number.
 *
 * 612 is also what puts this route in the `(rail)` group: the desktop end rail is pinned on the
 * assumption of a 612 column (see `app/(web)/(main)/(rail)/layout.tsx`), so a wider page would
 * have the rail land on top of its content.
 */
export const SEARCH_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The content surface — the card every state renders inside.
 *
 * Shared by `/search` and `/gift-star`: the two screens are the same panel with different idle
 * states, so a second copy of this class string is a second set of corners to keep in step. It
 * lives here rather than in either component for that reason alone — it is one screen's geometry
 * twice over, not a design-system value.
 *
 * The reasoning is `BlockedAccountsView`'s, and it applies unchanged: `flex-1` rather than
 * `min-h-[calc(100dvh-60px)]`, because the layout's column is already
 * `min-h-[var(--window-height)]` → `<main>` is `flex-1` → the page's column is `flex-1`, so the
 * panel measures **viewport − bar** by claiming what is left instead of by arithmetic that
 * hardcodes the bar's 60px. `app/(web)/(main)/layout.tsx` also says in writing not to put a
 * viewport min-height inside its tab-bar reserve (`--tab-bar-reserve`) — the two add up and put a scrollbar on
 * every mobile page.
 *
 * All four corners are rounded from `md`, with the page's own `md:pb-6` behind the bottom two so
 * they have background to be seen against; below `md` the panel is full-bleed, unrounded, and
 * meets the bottom edge, as the mobile app's screens do.
 *
 * `--background-surface`, not `--background-listing`: Listing is `--white` in Light but plain
 * `--black` in Dark — *the same value as `--background`* — so a Listing card and both of its
 * rounded corners vanish into the page in dark mode. Listing is for a list that **is** the
 * screen; Surface is the elevated card. The rows override the same token for the same reason, in
 * `search-channel-row.tsx`.
 *
 * ## `overflow-hidden`, and what it costs
 *
 * It is what clips the rows' square corners inside the card's rounded ones. The cost is that this
 * element becomes a scroll container, so **the search field cannot be `sticky`** — a sticky
 * descendant sticks inside *this* box rather than to the viewport, and would park itself at the
 * bottom of the panel. Legacy's field *is* sticky; here it scrolls away with the content, and the
 * page's own back bar is the chrome that stays. The alternative — moving the clip to a wrapper
 * around the list only, as `FollowRequestsView` does for its sticky action bar — buys a sticky
 * field at the price of a second nested box, and a field that scrolls off on a long results list
 * is a smaller cost than the one `FollowRequestsView` was paying (an action bar below the fold).
 */
export const SEARCH_PANEL =
    'flex flex-1 flex-col overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * The **screen** behind the panel — `<main>` and its sticky bar.
 *
 * `/search` is a single panel, so below `md` the surface runs full-bleed from the bar to the bottom
 * edge (`docs/DESIGN_SYSTEM.md` §6). The bar had been left on `--background`, which in Dark is
 * `--black` against the panel's `#18181b`, so a page-coloured strip sat above the card. From `md`
 * both return to `--background` and the panel becomes the card. Same constant shape as
 * `MY_WALLET_SCREEN`.
 */
export const SEARCH_SCREEN = 'bg-(--background-surface) md:bg-(--background)'
