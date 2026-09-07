import { cn } from '@shared/lib/utils'

/**
 * `/premium`'s column — **612px from `md`, full width below it, and it carries the brand band.**
 *
 * 612 is legacy's `<Container maxWidth='sm' disableGutters>` on this exact screen, and it is what
 * the `(rail)` group assumes: the desktop end rail is pinned 22px past a 612 column's trailing edge,
 * so a wider column here would put the rail on top of the plan cards (see `(rail)/layout.tsx`).
 * Written as a literal for the reason `MY_STAR_CONTAINER` spells out — Tailwind's `sm` is 24rem
 * *and* this repo's `sm` breakpoint is itself 612px, so `max-w-sm` would be wrong twice over.
 *
 * ## The whole screen is inside it, and that is the point
 *
 * Legacy puts the gradient **on the container**, not on the page: at desktop width the violet is a
 * 612-wide column with the page's own grey either side, and only on a phone does it read as a
 * full-bleed band. Painting the band full-width instead — which is what this screen did first — turns
 * the hero into a 1700px slab on a desktop and stops looking like the product at all.
 *
 * So the column is `flex-1` and every section is its child. `PREMIUM_INSET` is what holds the
 * content off its edges.
 *
 * Duplicated rather than imported: a feature may not reach into another feature's internals, and a
 * layout constant is not worth widening a barrel for. Same call `MY_STAR_CONTAINER`,
 * `GIFT_CODE_CONTAINER` and `EARNINGS_CONTAINER` already make about each other.
 */
export const PREMIUM_COLUMN = 'mx-auto flex w-full flex-1 flex-col md:max-w-[612px]'

/**
 * The side inset for content inside the column — 16px at every width.
 *
 * The column itself has none (legacy's `disableGutters`), because the **band** has to reach its
 * edges; the content sitting on the band does not. Legacy varies this per block (16 for the plan
 * grid, 8 for the benefits and about panels); one number is used here, because two adjacent panels
 * inset by different amounts reads as a mistake at 612 and is invisible at 390.
 */
export const PREMIUM_INSET = 'px-4'

/**
 * **`var(--radius-xl)` — 16px, the radius every surface on this screen wears.**
 *
 * The two plain plan cards, the annual card's violet inner, the benefits panel and the about panel.
 * One constant so they cannot drift, because they are visibly a set — two of them sit 8px apart.
 *
 * ## The design system's number, not legacy's
 *
 * Legacy draws all four at `borderRadius: '12px'`. The DS draws a card at
 * `border-radius: var(--radius-xl)`, and **the DS wins**: `CLAUDE.md` makes it the source of truth
 * and legacy the reference for *behaviour and values the DS does not cover*. A radius it does cover
 * is not one of those. (`shared/ui/card.tsx`'s `basic` variant is the same 16.)
 *
 * ⚠ **The scale is the DS's, so class names do not mean what Tailwind says.** `globals.css` sets
 * `--radius-lg: 12px`, `--radius-xl: 16px`, `--radius-2xl: 24px`, i.e. every rung is one step up
 * from stock Tailwind. `rounded-xl` here *is* `var(--radius-xl)`. Picking a class by its Tailwind
 * meaning is how this screen first shipped the panels at 24 — and how the annual card's gold ring
 * came to widen at its corners, being a 2px ring between a 24 outer and a 16 inner. A ring of even
 * width needs `outer = inner + ring`, which is the one place a literal is still correct.
 */
export const PREMIUM_SURFACE_RADIUS = 'rounded-xl'

/**
 * **This screen does not follow the single-panel rule, and that is the rule working.**
 *
 * `docs/DESIGN_SYSTEM.md` §6 is about a screen that is *one block of content* — it paints
 * `--background-surface` full-bleed below `md` and becomes a card from `md` up. This screen is four
 * blocks (a hero, the plan cards, the benefits list, the about panel) on a coloured ground, so the
 * page colour has to stay visible **between** them: that is what makes them read as separate
 * things. `/my-star` is the same shape and makes the same call.
 *
 * So `<main>` carries the page ground and nothing else; the band paints itself and each panel below
 * is its own card.
 */
export const PREMIUM_SCREEN = 'bg-(--background)'

/**
 * A card on the page ground — the benefits list and the about panel.
 *
 * `--background-surface`, the DS `--separator-default` hairline, and `PREMIUM_SURFACE_RADIUS` —
 * the same recipe `GIFT_CODE_PANEL` uses from `md` up, applied at **every** width here because this
 * screen is a stack of cards rather than one panel (see above), and at **12** rather than that
 * file's 24 because legacy draws every surface on this screen at 12. No `md:grow`: these hug their
 * content, and the page is already taller than the viewport.
 *
 * ⚠ **`--background-surface`, not `--background-subtle`.** Subtle resolves to `--zinc-100`, which
 * *is* `--background` in Light — an invisible card — and is the same value as surface in Dark. It is
 * the wrong token in both modes, and it only shows up when both are looked at.
 */
export const PREMIUM_PANEL = cn(
    PREMIUM_SURFACE_RADIUS,
    'border border-(--separator-default) bg-(--background-surface)',
    /*
     * **12/16, at every width** — legacy's own `padding: '12px 16px'`, and not the 24 this had
     * first. 24 is the right number for a *form* panel (`GIFT_CODE_PANEL`, the settings screens);
     * on a list of rows it pushes the first row 24px off the card's edge and reads as a panel with
     * a margin inside it. The rows carry their own 10 (see `BenefitRow`), so the first one lands
     * 22px in, which is where legacy's is.
     */
    'px-4 py-3',
)

/**
 * Re-export of this feature's address, so files inside it reach the path where every other `lib/`
 * helper lives instead of having to know about the split. The definition is one level up, in
 * `routes.ts` — see its own doc for the cycle that forces it there.
 */
export { PREMIUM_PATH } from '../routes'

/**
 * `/gift-premium`'s ground — **the page colour, exactly as `/premium`'s.**
 *
 * Its own name rather than a second use of {@link PREMIUM_SCREEN}, because the two screens are not
 * guaranteed to stay the same colour and a page that imports the *other* screen's constant is a
 * page that silently follows it when it changes. Same value today, stated twice on purpose — the
 * call `GIFT_CODE_CONTAINER` and `MY_STAR_CONTAINER` already make about each other.
 *
 * It is `--background` and not a surface for the reason {@link PREMIUM_SCREEN} spells out: this
 * screen is a stack of blocks on a coloured ground rather than one panel, so the page colour has to
 * stay visible *between* them. `docs/DESIGN_SYSTEM.md` §6's single-panel rule is about the other
 * shape of screen.
 */
export const GIFT_PREMIUM_SCREEN = 'bg-(--background)'

/**
 * **The picker step's plane** — `docs/DESIGN_SYSTEM.md` §6's single-panel rule, applied to one step
 * of a three-step screen.
 *
 * The recipient step *is* a single block of content in the 612 column, so it takes that rule: below
 * `md` the screen **is** the surface (one uninterrupted plane from the bar down, because a card on a
 * phone is a card drawn around the whole screen), and from `md` the plane goes back to page colour
 * and the panel becomes a card on it.
 *
 * ## Why it is not on `<main>`, where the rule says to put it
 *
 * Because the other two steps are not single-panel screens: the offer and the success screen are a
 * brand band, a plan grid and an About card on page colour, exactly as `/premium` is — and
 * {@link PREMIUM_SCREEN}'s own note explains why that shape must keep the page colour *between* its
 * blocks. One `<main>` cannot be both, and the step is client state, so the server component that
 * renders `<main>` cannot know which. This class goes on the **picker's own column** instead, which
 * is `flex-1` and therefore covers everything under the bar for exactly the step that wants it.
 *
 * The bar is painted to match by `GiftPremiumTopBar`'s `ground` prop — the rule's other half, and
 * the one that is visible: content scrolls *under* the bar, so a page-coloured bar over this plane
 * shows rows sliding past the title.
 */
export const GIFT_PREMIUM_PICKER_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * The recipient picker's card — **the whole screen below the bar, field included.**
 *
 * Not {@link PREMIUM_PANEL}. That one is a *block on a coloured ground* (the About panel, sitting in
 * a stack with page colour between its neighbours); this is the single-panel shape, so it differs in
 * three ways:
 *
 * - **no background and no radius below `md`** — the plane is {@link GIFT_PREMIUM_PICKER_SCREEN}'s,
 *   painted by the column, and the panel becomes a card only from `md`;
 * - **no hairline** — a bordered card inside a screen that *is* the card draws an edge against
 *   nothing;
 * - **`md:grow`, never `flex-1` and never a `min-height`.** A min-height would have to subtract the
 *   bar, the column's padding and the 84px the tab bar reserves below `md`; flex already knows all
 *   three. And below `md` the panel must **not** grow at all: the column there has a definite height
 *   and every box down to this one is `flex-1`, so growing it stops the column overflowing — the
 *   document stops scrolling while its content is still taller than the space (§6, measured at
 *   390×844). Legacy writes `minHeight: 'calc(100vh - 64px)'` here.
 *
 * ## The search field lives **inside** it, and that is the point of the constant
 *
 * Legacy's card is one white block holding the field, the two lists and the empty states
 * (`components/searchCreator`, `padding: '24px'`), and `/search` is built the same way. A field
 * floated *above* the card reads as two surfaces for one screen: it gets its own inset, so its edges
 * no longer line up with the rows under it, and the gap between them is page colour interrupting a
 * control and the thing it controls. The field is therefore the panel's first child, inset by
 * {@link GIFT_PREMIUM_FIELD_INSET}.
 *
 * ⚠ **`overflow-clip`, never `overflow-hidden`.** The clip is what cuts the rows' square corners
 * inside the card's rounded ones; `hidden` would additionally make this box a **scroll container**,
 * which is how a rounded panel elsewhere in this app silently broke a `sticky` child. (It is also
 * why `/search`'s field cannot be sticky — that panel uses `hidden`.)
 *
 * ⚠ `md:rounded-xl` is written **literally** rather than as `` `md:${PREMIUM_SURFACE_RADIUS}` ``.
 * Tailwind scans source *text* for class names, so a constructed one is a class that never gets
 * generated — the panel would render square-cornered at every width and nothing would fail. It is
 * the same 16 that constant carries; the pairing is stated here so a change to one is findable from
 * the other.
 *
 * `--background-surface`, not `--background-listing`: Listing is `--white` in Light but plain
 * `--black` in Dark — *the same value as `--background`* — so a Listing card and both of its rounded
 * corners vanish into the page in dark mode. The rows override the same token for the same reason.
 */
export const GIFT_PREMIUM_PANEL =
    'flex flex-col overflow-clip md:grow md:rounded-xl md:bg-(--background-surface)'

/**
 * The inset the picker's field wears — **16, which is the DS list row's own**.
 *
 * Its own constant rather than a reuse of {@link PREMIUM_INSET} (also 16 today) because the two
 * answer different questions: that one holds content off the *band's* edges, this one lines the
 * field up with the *rows* beneath it. If the DS moves its row inset, this follows and that does
 * not. `pb-3` rather than a symmetric 16, because the first row brings 8 of its own.
 */
export const GIFT_PREMIUM_FIELD_INSET = 'px-4 pt-4 pb-3'

/**
 * The floor a state with nothing in it stands on — legacy's own `minHeight: 360`.
 *
 * Needed because the panel above is `md:grow` rather than `flex-1`: below `md` it hugs its content,
 * so an invitation or a "no results" block would sit tight under the field with the plane empty
 * beneath it. 360 is what legacy reserves for exactly these two blocks, and it is a *floor* rather
 * than a height — from `md` the panel grows and the `flex-1` on the state centres it in the card.
 */
export const GIFT_PREMIUM_STATE_MIN = 'min-h-[360px]'
