import { cn } from '@shared/lib/utils'

/**
 * `/monetization`'s content column — 612px from `md`, full width below it, 16px inset at every width.
 *
 * The same string as `MY_WALLET_CONTAINER` and `MY_STAR_CONTAINER`, duplicated for the reason those
 * two give: a feature may not reach into another feature's `lib/`, and a layout constant is not worth
 * widening a barrel for. Legacy sizes this screen the same way — `Container maxWidth='sm'
 * disableGutters` with the content carrying its own `p: {xs: 1.5, md: 0}`.
 *
 * ## No `*_SCREEN` constant, and that is the rule rather than an omission
 *
 * The hub is a **multi-block** screen (`docs/DESIGN_SYSTEM.md` §6): a banner, a revenue card and a
 * list of methods, with page colour showing through the gaps — which is legacy's own arrangement
 * (`Stack spacing={1.5}` of separate white cards on the grey page). So the full-bleed
 * `--background-surface` treatment that `/my-wallet/transaction-history` wears below `md` does not
 * apply here, for the same reason it does not apply to `/my-wallet` itself.
 */
export const MONETIZATION_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/**
 * The screen's plane — **one uninterrupted surface below `md`, page colour from `md`**. One class,
 * two places: the sticky bar and the column.
 *
 * ## Every state, not just the walls — and why that is not the §6 exception it looks like
 *
 * `docs/DESIGN_SYSTEM.md` §6 warns that painting the screen on a *multi-block* layout is "wrong
 * rather than merely different", because the blocks there are `--background-surface` cards and the
 * gaps between them would stop reading as gaps. That failure needs surface-coloured cards floating
 * in the middle of the column, and this screen has none:
 *
 * - the **tier card** is `--primary-50` inside a `--primary-300` hairline, so it reads as a distinct
 *   object against any ground — it never needed page colour to separate it;
 * - the **members panel** is the one block that runs to the bottom, and it is already full-bleed
 *   below `md` (`MEMBERSHIP_LIST_PANEL`), so merging with the plane is the single-panel behaviour
 *   §6 asks for rather than a lost gap. The `ListHeader` rule under *Members* is what divides them.
 *
 * So the phone gets what that section says a phone should get: one plane from the status bar down.
 * From `md` the column stops being the screen and both revert — the panel becomes a card and the
 * page colour comes back around it.
 *
 * ⚠ **The setup form is the one view that does not take this**, and it is the rule working rather
 * than an exception to it: that view *is* a stack of plain `--background-surface` boxes (the name
 * field, the price card, the description), and on a surface-painted screen such a box does not read
 * as a mismatch — it **disappears**. `MembershipDashboard`'s `paintsPlane` is where that is decided.
 *
 * It goes on the **sticky bar as well as the column**, because content scrolls *under* the bar — a
 * page-coloured bar over a surface-coloured screen shows rows sliding past the title. Painting the
 * column is enough in place of `<main>`: below `md` the column *is* the full width.
 *
 * ⚠ **The skeleton has to be painted for this ground too.** §6's own warning is that a skeleton
 * painted like the wrong state makes a returning reader watch the plane change colour underneath it
 * — and here the trap is the other way round from the one that section describes: a
 * `--background-surface` placeholder on a surface screen is not a mismatched colour, it is
 * *invisible*. `MembershipDashboardSkeleton` draws its hero in the tier card's own tint for that
 * reason.
 *
 * `--background-surface`, never `--background-subtle` — subtle resolves to `--zinc-100`, which **is**
 * `--background` in Light and equals surface in Dark. Wrong in both modes, visible in neither alone.
 */
export const MEMBERSHIP_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * The box a single-block **state** sits in — the sign-in wall, the failure, the set-up-your-tier wall.
 *
 * This is the *only* thing that now varies by state: `MEMBERSHIP_SCREEN` paints every state's plane
 * below `md`, so a wall and the dashboard are indistinguishable there, and the two diverge only from
 * `md` up — where a wall becomes a card and the dashboard becomes a stack of them.
 *
 * Nothing below `md` (`MEMBERSHIP_SCREEN` has already painted the screen), the card from `md` up. It
 * is the same pair `MEMBERSHIP_LIST_PANEL` states for the members list, said for a caller-supplied
 * node — so a state and the content it replaces are the same object at both ends. Without it the wall
 * floats on `--background` while the list it stands in for is a card, which reads as a page that
 * *failed* rather than one with nothing in it (§6, *Empty states inside a panel*).
 */
export const MEMBERSHIP_PANEL = 'flex flex-col md:rounded-xl md:bg-(--background-surface)'

/**
 * The members list's own two ends — **full-bleed below `md`, a card from `md` up**.
 *
 * The panel is the one block that runs to the bottom of the screen, and §6 states the rule for
 * exactly that shape: `/my-wallet` stacks a hero card above a ledger and gives the ledger
 * `LedgerPanel`'s `fullBleed`, which is this pair. On a phone the column is already the full width of
 * the screen, so a card there is a card drawn around the whole screen; the hero above it stays a card
 * because it does *not* run to the bottom, and the page colour in the gap is what separates the two.
 *
 * **`-mx-4`, not a width.** The inset belongs to the *column*
 * (`MONETIZATION_CONTAINER`'s `px-4`), so cancelling the margin is what lets the panel meet the bezel
 * without either element having to know the other's padding — `LedgerPanel`'s own note, verbatim,
 * because the reasoning is the same and the trap is copying a `w-screen` instead.
 *
 * A **breakpoint, not a scroll position.** §6 records that this used to be driven by a
 * `useStuckAtTop` hook animating the card to full-bleed as it met the sticky chrome, that `web-app`
 * drives it off the breakpoint with no scroll listener anywhere, and that it must not be
 * reintroduced.
 */
export const MEMBERSHIP_LIST_PANEL = '-mx-4 rounded-none md:mx-0 md:rounded-xl'

/**
 * The brand-tinted **notice** block — a lilac card on a light page, aubergine on a dark one.
 *
 * Two callers on the membership screen wear it: the analytics cross-sell and the setup form's system
 * fee notice. Defined once so they cannot drift, because they are the same object in the design and
 * legacy paints them with two different hard-coded hexes (`#F9F7FD` and `#EEE8F9`) that differ by
 * nothing a reader could name.
 *
 * ## Why this and not `Alert status="info"`
 *
 * The DS alert is the neutral information card: `--background-surface` with an inset ring, a shadow,
 * and an **indigo** glyph. The fee notice shipped as one and measured `#ffffff` / `#007aff` against a
 * design that is purple throughout — the right component for "here is a fact about your account",
 * and the wrong one for a brand-tinted panel.
 *
 * ## The pair is the Primary ramp, and the ink is **not**
 *
 * `--primary-50` inside `--primary-300`: that ramp inverts between modes, so one pair of tokens gives
 * both themes without a variant. The sentence on it is `--text-title` (18:1 at both ends) and only
 * the **mark** takes `--text-brand` — measured **8.43** Light / **3.88** Dark, which clears 3:1 for a
 * graphic and would have failed 4.5:1 as body text. That split is `docs/DESIGN_SYSTEM.md` §6b's, and
 * skipping it is invisible in any light-mode screenshot.
 */
export const BRAND_NOTICE = 'rounded-xl border border-(--primary-300) bg-(--primary-50)'

/**
 * `/monetization/donation`'s plain surface card — the overview's supporter-count tile, and nothing
 * else.
 *
 * It used to dress the setting form's six blocks too; that is now `DONATION_FORM_SECTION`, and its
 * note says why the form needs the opposite treatment.
 *
 * ## The **overview** keeps the page colour, and that is the §6 test rather than a departure from it
 *
 * `/monetization/membership` is painted below `md` (`MEMBERSHIP_SCREEN`) because every block on it
 * carries its own edge: a tinted tier card, a tinted banner, a members panel that runs to the bottom.
 * This screen does not have that shape. Its overview stacks a **bare `--background-surface` tile**
 * — "Total supporters" — in the middle of the column; on a surface-painted screen such a box does
 * not read as a mismatch, it **disappears**, and the `gap-3` that was separating it from the panel
 * below stops separating anything.
 *
 * So the order `docs/DESIGN_SYSTEM.md` §6 asks the question in gives the other answer here: *is any
 * block a bare surface card mid-column?* → yes → page colour, and only the bottom-most block takes
 * `DONATION_PANEL`. It is `/my-wallet`'s arrangement, not `/monetization/membership`'s, and the two
 * sit one route apart on purpose.
 *
 * Legacy agrees, for what it is worth: `Stack spacing={1.5}` of `#ffffff` cards on the grey page.
 */
export const DONATION_CARD = 'rounded-xl bg-(--background-surface)'

/**
 * The block that runs to the bottom of `/monetization/donation` — **full-bleed below `md`, a card
 * from `md` up**.
 *
 * The supporters list wears it, and so does every **state that replaces the screen's content**: the
 * intro wall, the failure, the sign-in wall. That second half is not an afterthought — a wall left
 * floating on `--background` where a panel used to be is what §6 calls "a page that *failed*", and
 * this screen being multi-block does not exempt its walls (the rule is about the block, not the
 * route).
 *
 * `MEMBERSHIP_LIST_PANEL` plus the fill, rather than that constant reused: it deliberately carries no
 * background, because on the membership screen the plane underneath it is already the surface. Here
 * it is not, so the panel has to paint its own — and `-mx-4` is the same trick for the same reason,
 * cancelling the *column's* inset so the panel meets the bezel without either element knowing the
 * other's padding.
 *
 * A **breakpoint, not a scroll position** — see `MEMBERSHIP_LIST_PANEL` for the `useStuckAtTop` hook
 * this replaced and must not become again.
 */
export const DONATION_PANEL = '-mx-4 rounded-none bg-(--background-surface) md:mx-0 md:rounded-xl'

/**
 * The plane a **wall** paints on `/monetization/donation` — surface below `md`, page colour from
 * `md` up. One class, two places: the sticky bar and the column.
 *
 * ## The screen keeps the page colour and its walls do not, and both are the same rule
 *
 * `DONATION_CARD` explains why the *content* views stay on `--background`: the overview and the form
 * are stacks of bare surface cards, and a surface plane would dissolve the gaps between them. A wall
 * is not that shape — it is a **single block**, so §6's single-panel rule applies to it unchanged,
 * and a wall left floating on `--background` where cards used to be is what that section calls "a
 * page that *failed*".
 *
 * So the treatment follows the **state**, not the route: `isWall` in `DonationDashboard`.
 * `/my-space` and `/mcn-partnership` are the two other screens doing this.
 *
 * It goes on the **sticky bar as well as the column**, because content scrolls *under* the bar — a
 * page-coloured bar over a surface-coloured screen shows the wall's top edge sliding past the title,
 * which is exactly the seam a phone screenshot shows and a desktop one does not.
 *
 * `--background-surface`, never `--background-subtle` — subtle resolves to `--zinc-100`, which **is**
 * `--background` in Light and equals surface in Dark. Wrong in both modes, visible in neither alone.
 */
export const DONATION_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * One block of the **donation setting form** — a band on the plane below `md`, a card from `md` up.
 *
 * ## Why the form does not wear `DONATION_CARD`
 *
 * That constant's argument is about the *overview*: a bare surface card floating mid-column needs
 * page colour around it to read as a card at all, which is why that view stays on `--background`.
 * The form was built the same way and it is the wrong shape for it — a phone then pays the inset
 * **twice**, once for the column's `px-4` and again for the card's `p-4`, so a 390px screen renders
 * its fields 326px wide. On a screen that is nothing but fields, 32px is a real amount of the thing
 * the reader came for.
 *
 * So below `md` the form takes §6's single-panel treatment instead: `DONATION_SCREEN` paints the
 * plane, and each block goes **full-bleed** (`-mx-4`, cancelling the column's inset the way
 * `MEMBERSHIP_LIST_PANEL` and `LedgerPanel`'s `fullBleed` do) with its own `p-4` becoming the only
 * gutter. Content gains those 32px and nothing else moves.
 *
 * ## The separation moves from a gap to a hairline, and it has to
 *
 * On a painted plane a surface-coloured block is not a mismatch — it is **invisible**, which is the
 * failure `DONATION_CARD` warns about. It is only survivable here because the blocks stop relying on
 * the gap: the form drops to `gap-0` below `md` and each block carries `border-b`, so the stack
 * reads as a settings list rather than as six things that merged. From `md` the border goes and the
 * gap comes back, and they are cards again.
 *
 * The rule under the **last** block is deliberate too: it closes the list against the Save action
 * below it, which is otherwise the only thing on the plane with nothing marking where the fields end.
 */
export const DONATION_FORM_SECTION = cn(
    '-mx-4 rounded-none border-(--separator-default) border-b bg-(--background-surface)',
    /*
     * The **last** block drops its rule, because `DONATION_FORM_FOOTER` carries one of its own. Two
     * adjacent hairlines is a 2px line, and the footer's has to exist whether or not it is stuck —
     * so the section's is the one that goes.
     */
    'last-of-type:border-b-0',
    'md:mx-0 md:rounded-xl md:border-b-0',
)

/**
 * The setting form's foot — **a bar pinned to the bottom of the viewport, at every width**.
 *
 * The form is 1077px tall on an 844px phone, so Save was two screens down: reaching the primary
 * action meant scrolling past every field to get to it, and legacy has the same problem. Sticky is
 * the product's answer, chosen over leaving it in flow.
 *
 * ## `sticky`, not `fixed`, and that is what makes it safe
 *
 * A sticky element keeps its space in the flow, so nothing above it is ever covered — the last block
 * simply ends where it ends. `fixed` would take the bar out of flow and need a matching bottom
 * padding somewhere else to compensate, which is the pair that silently drifts apart. It also means
 * the bar un-sticks by itself at the end of the scroll rather than hovering over the page's last
 * pixel.
 *
 * The ground is `DONATION_SCREEN`'s own — surface below `md`, page colour from `md` — because
 * content scrolls **under** it and a transparent bar shows fields sliding through the button. Same
 * reasoning as the sticky top bar, at the other end.
 *
 * The `border-t` is at every width and it is not decoration: stuck, it is the only thing separating
 * the bar from the content passing beneath it. That is also why the last section gives its own rule
 * up — see above.
 *
 * Full-bleed below `md` like the blocks above it, while the **button inside keeps the column's
 * inset**: a button meeting both bezels is a bar, not a button. The bar is the thing that runs edge
 * to edge; the control sits in it.
 */
export const DONATION_FORM_FOOTER = cn(
    'sticky bottom-0 z-10 flex flex-col gap-3 pt-3 pb-4',
    '-mx-4 px-4 md:mx-0 md:px-0',
    'border-(--separator-default) border-t',
    DONATION_SCREEN,
)
