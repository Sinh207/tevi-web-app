import { cn } from '@shared/lib/utils'

/**
 * The event page's content column — **full width below `md`, 612px from `md` up.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`, written as a literal for the two reasons
 * `CHANNEL_CONTAINER` records: Tailwind's `sm` is 24rem, and **this repo's `sm` breakpoint is itself
 * 612px**, so `max-w-sm` would be wrong and `sm:max-w-[612px]` would read as if the cap only applied
 * above the cap.
 *
 * `md` (900) rather than `sm` is where it stops being full-bleed, matching the space page it hangs
 * off: that is where the tab bar gives way to the left rail, i.e. where the layout stops being the
 * phone layout. The two pages are one navigation step apart, so a column that changed width at a
 * different breakpoint would read as a different site.
 *
 * **16px of side padding below `md`**, and it is not decoration: this screen is `docs/DESIGN_SYSTEM.md`
 * §6's *multi-block* branch — a stack of cards with the page colour showing between and around them —
 * so without an inset the cards meet the screen edge with a rounded corner and nothing behind it.
 * 16 rather than 12 because `AppBar` carries `px-4` below `md`, and the bar's back button has to line
 * up with the cards underneath it.
 *
 * ⚠ It shipped with **no** padding, on the reasoning `MCN_INVITATION_CONTAINER` gives — *"the hero is
 * a full-bleed image, and 12px of page colour either side of a 16:9 cover turns the top of a phone
 * screen into a floating card"*. That argument is right and it is about a **single-panel** screen
 * whose hero *is* the panel. Here the banner is the top of one card among four, which is the ordinary
 * shape of a card with art in it (`ChannelEventCard`, `/my-wallet`'s balance card).
 */
export const EVENT_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/**
 * `/report`'s column — the same 612 cap, and **no** inset.
 *
 * That screen is the *other* §6 branch: a **single panel**, one list, full-bleed below `md`. An inset
 * would put the rows' hairlines short of the screen edge and turn a list into a floating card on a
 * phone. Its own constant rather than a prop on `EVENT_CONTAINER`, because which branch a screen is
 * on is a fact about the screen, not a switch a caller flips.
 */
export const EVENT_LIST_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * Padding inside the page's blocks — **16 horizontal / 12 vertical**, 24 horizontal from `md`.
 *
 * Legacy's own pair — `padding: { xs: '12px', md: '12px 24px' }` — which is **12 vertical and 24
 * horizontal** from `md`, not 24 all round.
 *
 * ⚠ **The phone value is 16, not legacy's 12**, and the divergence arrived with `EVENT_CARD` going
 * full-bleed. While the block was inset by the column's `px-4`, its own 12 sat inside 16 and the
 * text was 28px off the bezel. Full-bleed, that 12 *is* the whole gutter — and 16 is the DS's
 * minimum, below which text sits on the bezel. `panel-full-bleed-below-md`'s own note says there is
 * no separate rule for narrow viewports for exactly this reason. Legacy gets away with 12 because
 * it is a native-feeling app shell; this is a website.
 *
 * ⚠ This was `p-3 md:p-6`, i.e. 24px on both axes at `md`, and it is why every card on both screens
 * read as loose: each one carried twice the vertical air legacy gives it, and a report of six stacked
 * cards multiplies that six times. Measured, not noticed — the card header was already `py-3` and
 * only the *body* was wrong, so the two halves of one card disagreed.
 *
 * ⚠ **`px-6`, not `px-5`**: `--spacing-5` is 24px in the Figma ramp but Tailwind's `p-5` is 20px —
 * the mapping table at the top of the spacing block in `globals.css` exists because that has already
 * bitten. Same value `CHANNEL_PADDING` uses, so a card here and a card on the space page it links
 * from have the same inset.
 */
export const EVENT_PADDING = 'px-4 py-3 md:px-6'

/**
 * `/report`'s surface — **one class in three places**: `<main>`, the sticky bar, and `loading.tsx`.
 *
 * `docs/DESIGN_SYSTEM.md` §6's **single-panel** branch, and `/report` is the clearest instance of it
 * in this feature: one list, no hero, no second block. Below `md` the surface runs from under the bar
 * to the bottom edge and the rows scroll *under* a bar of the same colour; from `md` both return to
 * the page colour and `EVENT_PANEL` becomes the card.
 *
 * ⚠ **It does not belong on the event page**, and that is the mistake this doc exists to stop
 * repeating. That screen is *multi-block* — four cards with the page colour between them — so
 * painting the screen dissolves exactly the gaps that separate them: measured on a phone, every card
 * was `transparent` on a `#fff` plane, which is four cards no reader can tell apart. `/my-wallet`
 * makes the same distinction one feature over and states it in the same words: its
 * `MY_WALLET_SCREEN` is for `transaction-history` and *"the rule applies here and deliberately not one
 * level up"*.
 *
 * `--background-surface`, never `--background-subtle` — subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light and **equals surface in Dark**. Wrong in both modes, visible in neither
 * alone.
 */
export const EVENT_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * One card on the event page — **painted, bordered and rounded at every width.**
 *
 * The multi-block half of §6: the page keeps its own colour, and each block carries its own edges so
 * the `gap-4` between them reads as separation. That is what `/my-wallet` does with its balance card,
 * its alert and its action rows, and what legacy's own desktop layout does here.
 *
 * ⚠ It used to be `md:`-only — nothing below the breakpoint, on the assumption that
 * `EVENT_SCREEN` had painted the plane. It had, which is precisely the bug: with the plane painted
 * *and* the blocks unpainted, a phone showed four transparent cards on one white sheet with no rule,
 * no fill and no shadow between them. The fix is both halves — the plane goes back to the page colour
 * (the screens simply stop applying `EVENT_SCREEN`) and the card paints itself.
 */
export const EVENT_CARD = cn(
    /*
     * **Full-bleed and square below `md`, an outlined card from `md`** — the two halves of
     * `docs/DESIGN_SYSTEM.md` §6 that this constant used to get only one of.
     *
     * `-mx-4` cancels the column's own inset so the block meets both window edges, and there is no
     * radius and no border to cut in half against them. From `md` the column is a 612px measure with
     * page colour either side, so the block finally has something to be a card *against*.
     *
     * ## This is legacy's, measured rather than inferred
     *
     * `viewer/…/details/index.js` paints its stack `{ xs: '#fff', sm: '#fff', md: 'transparent' }`,
     * and every card inside it is `borderRadius: { xs: 0, sm: 0, md: 2 }` with `elevation={0}`. So a
     * phone gets one uninterrupted white sheet with 16px of breathing room between sections and no
     * rule, no shadow and no outline anywhere — the structure comes from the content (a banner, a
     * heading, the hairlines *inside* a card), not from the blocks' edges.
     *
     * ## ⚠ It shipped as the opposite, and the bug behind that was real
     *
     * This was `rounded-2xl border bg-(--background-surface)` at every width, with the screens
     * declining to paint the plane. That came out of a genuine defect — the plane had been painted
     * while the blocks were *unpainted*, so a phone showed four transparent cards on one white sheet
     * with nothing between them — but it fixed it the wrong way round: it unpainted the plane and
     * gave the card an outline, where §6 and legacy both say paint the plane and let the block go
     * full-bleed. Two resolutions of one bug; this is the one the rule prescribes.
     *
     * The fill stays below `md` even though the plane is the same colour. It is redundant there and
     * costs nothing, and removing it would make the block depend on an ancestor it does not own —
     * which is how the original bug happened.
     */
    '-mx-4 bg-(--background-surface)',
    'md:mx-0 md:rounded-2xl md:border md:border-(--separator-default)',
)

/**
 * `/report`'s list block — nothing below `md`, the card from `md` up.
 *
 * The counterpart to `EVENT_CARD`, for the other §6 branch: `EVENT_SCREEN` has already painted the
 * plane below `md`, so a fill here would be a second surface behind content that was already on one,
 * and the rounded corners would be cut in half by the screen edge.
 *
 * Same shape, and the same reasoning, as `MY_WALLET_PANEL`.
 */
export const EVENT_PANEL = cn(
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)

/**
 * Height of the page's sticky bar, which anything scrolled-to has to clear.
 *
 * The DS App Bar shell is 60 tall, which is what `PageBackBar` renders.
 */
export const EVENT_BAR_HEIGHT = 60

/**
 * The **orders panel's header block** — the tab track over the search pill, pinned under the bar.
 *
 * A constant rather than a class string in each place, because there are two places and they had
 * already drifted. `EventOrdersPanel` draws it for real; `EventReportSkeleton` reserves it while the
 * route loads — and the skeleton's copy was missing `pt-4` and `border-b`, so it stood **112px**
 * against the real **125**. That is a 13px step plus a hairline appearing, at the moment the reader
 * is looking straight at it, and nothing fails: both blocks are individually correct.
 *
 * The 125 is `pt-4` 16 + the segmented control 36 + `gap-3` 12 + the search bar 48 + `pb-3` 12 +
 * 1px rule, all measured rather than derived — which is also how the skeleton's `h={40}` for a 36px
 * control was found.
 *
 * ⚠ `pt-4` is not optional: without it the tab track sits flush against the panel's top edge and
 * the pill's shadow crosses the rounded corner. `border-b` is not either: without it the rows bleed
 * into the search pill with nothing marking where the header ends.
 */
export const EVENT_ORDERS_HEADER = cn(
    'sticky top-[60px] z-10 flex flex-col gap-3',
    'border-(--separator-default) border-b bg-(--background-surface) px-4 pt-4 pb-3',
)

/** The segmented control's measured height — what the skeleton reserves for it. */
export const EVENT_TABS_HEIGHT = 36

/** The DS `SearchBar`'s measured height. */
export const EVENT_SEARCH_HEIGHT = 48
