import { cn } from '@shared/lib/utils'

/**
 * `/redeem-gift-code`'s content column — **full width below `md`, 612px from `md` up.**
 *
 * The same number as `IDENTIFICATION_CONTAINER`, `MY_STAR_CONTAINER` and
 * `CHANNEL_SETTINGS_CONTAINER`, and for the same two reasons: 612 is legacy's
 * `<Container maxWidth='sm'>` on this exact screen, and it is what the `(rail)` group assumes —
 * the desktop end rail is pinned 22px past a 612 column's trailing edge, so a wider column here
 * would put the rail on top of the form (see `(rail)/layout.tsx`).
 *
 * **No padding of its own**, matching `IDENTIFICATION_CONTAINER`: the side inset belongs to the
 * content, because it changes with the surface. Below `md` the screen *is* the surface, so the
 * content is inset 16px from the bezel; from `md` the content sits inside a card whose own 24px
 * padding does that job. `GIFT_CODE_PANEL` holds both, in one place, next to the border and
 * background they have to agree with.
 *
 * The page hands this same class to `PageBackBar`, so the back button lines up with the content
 * rather than with the window edge — the bar brings its own `px-4` below `md` and drops it at
 * `md`, which is exactly the two insets above.
 *
 * Duplicated rather than imported from another feature: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for. Same call
 * `MY_STAR_CONTAINER` and `EARNINGS_CONTAINER` already make about each other.
 */
export const GIFT_CODE_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * **The surface, at both ends — full-bleed below `md`, a card from `md` up.**
 *
 * Below `md` the *screen* is the surface: `GIFT_CODE_SCREEN` paints `--background-surface` edge to
 * edge, **including behind the sticky bar**, and this panel adds nothing but padding. So there is no
 * card on a phone — no radius, no hairline, nothing inset — because there is nothing for a card to
 * be a card *against*: the column is already full width. What a phone gets is one uninterrupted
 * plane, bar included, which is the treatment this screen is specified with.
 *
 * From `md` up the column is 612 of a ≥900 window, the page background comes back around it, and
 * the same surface becomes a real card: `--background-surface`, the DS `--separator-default`
 * hairline, radius `2xl`.
 *
 * ⚠ This is **not** what `IDENTIFICATION_PANEL` and `PROFILE_PANEL` do — those stay flat on
 * `--background` below `md`, i.e. the phone shows the *page* colour and no surface at all. Same
 * `md:` card, opposite phone. Do not "fix" one to match the other by reading the code; they differ
 * on purpose and this one is the newer call.
 *
 * **`--background-surface`, not `--background-subtle`.** Subtle resolves to `--zinc-100`, which
 * *is* `--background` in Light — an invisible surface — and is the same value as surface in Dark. It
 * is the wrong token in both modes, and it only shows up when both are looked at.
 *
 * **`md:grow`, not a `min-height`.** Without it the card hugs its content and a 900-tall window
 * ends the form mid-viewport with a third of the screen empty beneath it. A `min-height` would
 * have to subtract the bar (60), this column's padding and, below `md`, the 84 the tab bar
 * reserves; flex already knows all of that. Below `md` it must **not** grow — the column there has
 * a definite height and every box down to this one is `flex-1`, so growing this one stops the
 * column overflowing and the document stops scrolling while its content is still taller than the
 * space (measured on a 390×844 phone, in `IDENTIFICATION_PANEL`).
 *
 * `md:justify-center` goes with the growing: this form is ~600px of content, so growth alone left
 * 250px of blank card under the button. It cannot clip anything, because `grow` only ever *adds*
 * free space — the card is never shorter than its content.
 */
/**
 * What paints the screen — and it is **one class in two places**: `<main>` and the sticky bar.
 *
 * Below `md` both are `--background-surface`, so the surface runs from the status bar to the bottom
 * edge with no seam: the bar has to carry it too, because the content scrolls *under* the bar and a
 * transparent one would show rows sliding past the title. `<main>` carries it as well as the panel,
 * so the area under a short form is the same plane rather than a strip of page colour beneath it.
 *
 * From `md` up it returns to `--background` at both ends and the panel takes over as the surface —
 * that is the switch from "the screen is the plane" to "the plane is a card on the page".
 */
export const GIFT_CODE_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * The form's box. The surface it sits on is `GIFT_CODE_SCREEN`'s below `md` and its own from `md`
 * up — see that constant and the note above.
 */
export const GIFT_CODE_PANEL = cn(
    /*
     * `gap-6` is **24px** — the DS ramp's step 5. `gap-5` would be 20px, a number the Figma ramp
     * does not contain: the spacing indices are not Tailwind's from step 5 up (see the mapping
     * table at the top of the spacing block in `globals.css`).
     */
    'flex flex-col items-center gap-6 px-4 py-6',
    'md:grow md:justify-center md:p-6',
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)

/**
 * Re-export of this feature's address, so files inside it reach the path where every other
 * `lib/` helper lives instead of having to know about the split. The definition is one level
 * up, in `routes.ts` — see its own doc for the cycle that forces it there.
 */
export { GIFT_CODE_PATH } from '../routes'
