import { cn } from '@shared/lib/utils'

/**
 * The page's content column: **full width below md, 612px from md up.**
 *
 * The cap is legacy's `<Container maxWidth='sm'>`, written as a literal because Tailwind's
 * `sm` is 24rem (384px) and this repo's `sm` breakpoint is itself 612px — `max-w-sm` would be
 * the wrong number and `sm:max-w-[612px]` would read as if the cap only applied above the cap.
 *
 * Below md the cap is dropped entirely, bar included, so the screen fills a phone the way the
 * mobile app's does: on a 700–899px tablet or a landscape phone, a 612px column leaves a
 * ragged margin either side of a form that is already only a few controls tall, and the
 * sticky action bar has to be full-bleed anyway — it sits against the bottom edge, above the
 * tab bar. `md` rather than `sm` is the switch because md (900) is also where the tab bar
 * gives way to the left rail, i.e. where the layout stops being the phone layout.
 *
 * The 12/24px side padding on the content lives with the content (`px-3 md:px-6`); this
 * constant only decides how wide the column may get.
 */
export const IDENTIFICATION_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The reading surface the content sits on — **from md up only**.
 *
 * Below md the screen is the surface: it is full-bleed by the decision above, so a panel
 * would be a white rectangle with nothing around it, and the two `Card`s inside would be
 * white-on-white — the page loses the one contrast that makes them read as blocks. Mobile
 * therefore stays flat on `--background`, which is also what the mobile app does.
 *
 * From md up the column is 612 of a ≥900 window, and a bare column of content floating on
 * the page background is where it starts to look unplaced. The panel gives it an edge:
 * `--background-surface` (white / Zinc 100), the DS's `--separator-default` hairline, and
 * radius `2xl` — one step above the 16 the cards inside use, so the nesting reads in the
 * right order.
 *
 * `--background-surface`, not `--background-subtle`: subtle resolves to `--zinc-100`, which is
 * `--background` itself in Light (invisible) and the same value as surface in Dark. It is the
 * wrong token for "a plane above the page" in both modes, which is only obvious once you try
 * it in both.
 *
 * **No `overflow-hidden` on it, ever.** It would clip the illustration's shadow prettily and
 * silently break the action bar: `overflow: hidden` makes an element a scroll container, and a
 * `position: sticky` child sticks inside *that* — a box which cannot scroll — so the bar stops
 * following the viewport and parks itself at the bottom of the panel instead.
 */
export const IDENTIFICATION_PANEL = cn(
    /*
     * **`md:grow` — filling the column, and only from md.** Without it the panel hugs its
     * content: on a 900-tall window the error state is a 90px card with two thirds of the screen
     * empty under it, and the intro ends mid-viewport with the action bar floating below a
     * fold's worth of nothing. Growing also pins the action bar to the bottom of the screen,
     * since the bar sits after this box in the same column.
     *
     * A `min-height` would be the other way to say it and a worse one: the number would have to
     * subtract the bar (60), this panel's own top margin, the action bar's height — which is
     * locale-dependent — and, below md, the 84 the tab bar reserves. Flex already knows all of
     * that.
     *
     * **Below md it must NOT grow**, and that is measured, not cautious. The column there has a
     * definite height (`min-h-[var(--window-height)]` minus the tab bar's 84) and every box in
     * the chain to it is `flex-1`, i.e. `flex-basis: 0`. Growing this one makes the column stop
     * overflowing, so the document stops scrolling — while the content inside is still taller
     * than the space, and the sticky bar covers its last ~50px with no way to scroll them into
     * view. On a 390×844 phone that hid the whole "Your data is protected" card
     * (clearance −43px, `scrollHeight === innerHeight`).
     */
    'md:grow',
    /*
     * **No top margin**, matching `PROFILE_PANEL`. It carried `md:mt-4`, which put 16px of page
     * background between the sticky bar and the panel's top edge — a gap that only exists while
     * the page is scrolled to the top, and that leaves the panel looking misaligned with the bar
     * the moment anything scrolls under it. The bar is the page's own chrome, not something the
     * card has to clear.
     */
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)
