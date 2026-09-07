/**
 * The payout screens' content column — **full width below `md`, 612px from `md` up.**
 *
 * 612 is the number `MY_WALLET_CONTAINER`, `MY_STAR_CONTAINER` and `GIFT_CODE_CONTAINER` all use, and
 * for the same two reasons: it is legacy's `<Container maxWidth='sm'>`, and it is what the `(rail)`
 * group assumes — the desktop end rail is pinned 22px past a 612 column's trailing edge, so a wider
 * column here would put the rail on top of the content.
 *
 * **No padding of its own**, matching `GIFT_CODE_CONTAINER`: the side inset belongs to the content,
 * because it changes with the surface. Below `md` the screen *is* the surface and the rows bring their
 * own 16px (`ListRow` is `px-4`); from `md` the same rows sit inside a card and that padding becomes
 * the card's inset. A `px-4` here would double it at one end and be wrong at the other.
 *
 * The page hands this class to `PageBackBar` too, so the back button lines up with the rows rather than
 * with the window edge — the bar brings its own `px-4` below `md` and drops it at `md`, which is
 * exactly those two insets.
 *
 * Duplicated rather than imported from another feature: a feature may not reach into another feature's
 * internals, and a layout constant is not worth widening a barrel for.
 */
export const PAYOUT_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The column for a payout screen that stacks **cards** rather than filling one panel — today
 * `/my-wallet/payout-method`.
 *
 * Same 612, plus the 16px side inset the cards need at every width. `PAYOUT_CONTAINER` deliberately
 * has none, because the screens it serves put a list flush against the panel's edge and the rows bring
 * their own `px-4`; a card stack is the other case — the inset belongs to the column, and the card's
 * own padding is inside it. `MY_WALLET_CONTAINER` is this exact string for this exact reason, and
 * `/my-wallet` is the screen this one now matches.
 */
export const PAYOUT_CARD_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/**
 * One saved payout method's card — `/my-wallet/payout-method`'s list item.
 *
 * ## A card, not a list row, and the panel rule does not apply to this screen
 *
 * This was built as a `ListRow` inside one full-bleed panel, on the reasoning that a column of white
 * cards on a white screen has invisible separation. That reasoning is wrong here for one concrete
 * reason: **the screen it sits on is a card stack, so it is not a single-panel screen**
 * (`docs/DESIGN_SYSTEM.md` §6, and the note on `MY_WALLET_SCREEN` which draws the same line one level
 * up). The page keeps its own colour, the cards sit on it, and the separation is the gap.
 *
 * That is also legacy's own item — `Paper elevation={0}`, 16px radius, 12px padding, a 36px mark and
 * 10px to the text — and legacy is the spec for these screens. The four lines are kept: which method,
 * whose account, which account, and what is left of today's limit.
 *
 * `rounded-2xl` is 16px, matching that `borderRadius: '16px'` rather than the 12 the panels use: an
 * item is not a panel.
 */
export const PAYOUT_CARD =
    'flex w-full cursor-pointer items-start gap-2.5 rounded-2xl bg-(--background-surface) p-3 text-start transition-colors hover:bg-(--background-segment)'

/**
 * What paints the screen — **one class in two places**: `<main>` and the sticky bar.
 *
 * Below `md` both are `--background-surface`, so the surface runs from the status bar to the bottom
 * edge with no seam. The bar has to carry it too, because the list scrolls *under* the bar and a
 * transparent one would show rows sliding past the title. `<main>` carries it as well as the panel, so
 * the area under a short list — or under an empty state — is the same plane rather than a strip of page
 * colour beneath it.
 *
 * From `md` up both return to `--background` and the panel becomes the card. That is the switch from
 * "the screen is the plane" to "the plane is a card on the page".
 *
 * **`--background-surface`, never `--background-subtle`.** Subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light — an invisible surface — and equals surface in Dark. Wrong in both modes, and
 * only visible when both are looked at.
 *
 * The reference pair for all of this is `GIFT_CODE_SCREEN` / `GIFT_CODE_PANEL`. ⚠ `IDENTIFICATION_PANEL`
 * and `PROFILE_PANEL` still carry the **older** treatment — flat on `--background` below `md` — so do
 * not read those two as the pattern.
 */
export const PAYOUT_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * The list's box: nothing below `md`, a card from `md` up.
 *
 * Below `md` it adds no background, no radius and no inset, because `PAYOUT_SCREEN` has already painted
 * the whole screen — a card there has nothing to be a card *against*, the column being full width
 * already.
 *
 * **`md:grow`, not a `min-height`.** Without it the card hugs its content and a 900-tall window ends
 * the list mid-viewport with a third of the screen empty beneath it. A `min-height` would have to
 * subtract the bar (60), the column's padding and, below `md`, the 84 the tab bar reserves — flex
 * already knows all of that. And below `md` it must **not** grow: the column there has a definite
 * height and every box down to this one is `flex-1`, so growing this one stops the column overflowing
 * and the document stops scrolling while its content is still taller than the space (measured at
 * 390×844 on `IDENTIFICATION_PANEL`).
 *
 * `overflow-clip` and not `overflow-hidden`, at every width: `hidden` makes this a scroll container,
 * which kills the sticky month headers inside it — see `LedgerPanel`'s note, where that cost a whole
 * pass to find.
 */
export const PAYOUT_PANEL =
    'relative flex flex-col overflow-clip md:grow md:rounded-xl md:bg-(--background-surface)'

/**
 * One block on the withdraw-request form — the balance card, the amount card, the method card, an option
 * card, the summary.
 *
 * ## A hairline below `md`, nothing above it
 *
 * That screen paints `PAYOUT_SCREEN` on `<main>`, so below `md` the ground is `--background-surface` —
 * and the blocks are surface-coloured too. Without an edge they run together into one pale sheet: five
 * sections with no boundary, which is the failure §6 warns about when a **multi-block** screen adopts the
 * single-panel treatment.
 *
 * From `md` the page colour returns and the gaps do the separating again, so the border is dropped rather
 * than kept — a card that is already floating on a different colour does not need an outline as well, and
 * legacy has none there.
 *
 * `--separator-default` and not a shadow: the blocks sit flush against each other in a `gap-3` column,
 * and a shadow on each would read as five stacked cards rather than one form.
 */
export const PAYOUT_BLOCK = 'rounded-xl border border-(--separator-default) md:border-transparent'
