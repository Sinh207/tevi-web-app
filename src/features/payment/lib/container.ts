/**
 * `/card-management`'s content column — **612px from `md`, full width below it, and no side padding
 * at any width.**
 *
 * 612 is the number every route in the `(rail)` group caps at, and it has to be: the desktop end
 * rail is pinned 22px past a 612 column (`--end-rail-anchor` in `globals.css`), so a wider column
 * here would have the rail land on top of the rows. Written as a literal for the reason
 * `MY_MEMBERSHIP_CONTAINER` and `MY_STAR_CONTAINER` both spell out — Tailwind's `sm` is 24rem *and*
 * this repo's `sm` breakpoint is itself 612px, so `max-w-sm` would be wrong twice over.
 *
 * **No padding**, and the choice is the same one `/my-membership` makes for the same reason: this
 * screen is one full-bleed list panel below `md`. Its rows run edge to edge on a phone, as the mobile
 * app's do, so a `px-4` here would inset the panel by 16px at every width with nothing the panel
 * could do about it. Compare `MY_STAR_CONTAINER`, which *does* pad — that screen is a stack of
 * rounded cards, and a rounded card flush against the bezel has its corners cut in half.
 *
 * Duplicated rather than imported from `features/membership`: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for.
 */
export const CARD_MANAGEMENT_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * `/get-star`'s content column — **612px from `md`, full width below it, 16px inset at every width.**
 *
 * The same number and the same padding as `MY_STAR_CONTAINER`, and for both of its reasons: 612 is
 * what every route in the `(rail)` group caps at (the desktop end rail is pinned 22px past it), and
 * this screen is a stack of **rounded tiles** — a rounded tile flush against a phone's bezel has its
 * corners cut in half. `CARD_MANAGEMENT_CONTAINER` drops its padding because that screen is one
 * full-bleed list; this one is not.
 *
 * The page hands the same class to `PageBackBar`, so the back button lines up with the tiles rather
 * than with the window edge. The sticky total bar undoes the inset with `-mx-4 md:mx-0`, because a bar
 * that spans the window is the one thing on this screen that should touch both edges of a phone.
 *
 * Written as a literal, not imported from `features/my-star`: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for — the call
 * `CARD_MANAGEMENT_CONTAINER` above already makes.
 */
export const GET_STAR_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/**
 * `/get-star/transaction-history`'s content column — **full width below `md`, 612px from `md` up,
 * and no side padding of its own.**
 *
 * 612 is what every route in the `(rail)` group caps at; the reasoning is on `GET_STAR_CONTAINER`
 * above. The difference is the **padding**, and it is the difference between the two screens: the
 * purchase page is a stack of rounded tiles, so it insets 16px from the bezel or their corners get
 * cut in half. This one is a single full-bleed list, so the inset belongs to the rows
 * (`px-4 py-3`) and the panel runs to both edges — the call `CARD_MANAGEMENT_CONTAINER` already
 * makes for the same shape of screen.
 *
 * The page hands this class to `PageBackBar` too, so the back button lines up with the rows rather
 * than with the window edge — the bar brings its own `px-4` below `md` and drops it at `md`, which
 * is exactly the two insets the rows use.
 */
export const GET_STAR_TRANSACTIONS_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * What paints that screen — **one class in two places**: `<main>` and the sticky bar.
 *
 * Below `md` both are `--background-surface`, so the surface runs from the status bar to the bottom
 * edge with no seam. The bar has to carry it too, because the rows scroll *under* it and a
 * transparent bar would show them sliding past the title; `<main>` carries it as well as the panel,
 * so the area under a two-row history is the same plane rather than a strip of page colour beneath
 * it. There is nothing for a card to be a card *against* on a phone — the column is already full
 * width — so the panel drops its radius there and keeps only the rows' own padding.
 *
 * From `md` up it returns to `--background` at both ends and the panel becomes the card. Same pair,
 * and the same reasoning at length, as `GIFT_CODE_SCREEN` / `GIFT_CODE_PANEL`.
 *
 * **`--background-surface`, not `--background-subtle`.** Subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light — an invisible surface — and equals surface in Dark. Wrong token in both
 * modes, and it only shows up when both are looked at.
 */
export const GET_STAR_TRANSACTIONS_SCREEN = 'bg-(--background-surface) md:bg-(--background)'
