import { cn } from '@shared/lib/utils'

/**
 * The channel page's content column: **full width below `md`, 612px from `md` up.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`. Written as a literal rather than `max-w-sm`, twice
 * over: Tailwind's `sm` is 24rem (384px), and **this repo's `sm` breakpoint is itself 612px** — so
 * `max-w-sm` would be wrong and `sm:max-w-[612px]` would read as if the cap only applied above the
 * cap.
 *
 * The cap used to apply at every width, matching legacy. It does not any more: between 612 and 899 —
 * a landscape phone, a small tablet, a narrow window — a 612px column left a margin either side of a
 * header whose cover image wants the whole width, and the page read as a card floating on a page
 * rather than as the page. `md` (900) is the switch because that is where the tab bar gives way to
 * the left rail, i.e. where the layout stops being the phone layout.
 *
 * Two things already agreed with this and did not have to move: the header card's radius flips at
 * `md` (`rounded-none md:rounded-t-[…]`), so full-bleed and square-cornered happen together; and the
 * card's own padding is `p-3 md:p-6`. The bar's padding *did* have to follow — see
 * `channel-top-bar.tsx`, where the old breakpoint was justified by the behaviour this changed.
 *
 * Same value as `CHANNEL_SETTINGS_CONTAINER` today, and deliberately still its own constant — a
 * page's width is a decision it owns, and two screens agreeing on a number now is not a reason for
 * one to move when the other is redesigned.
 */
export const CHANNEL_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * Horizontal padding inside the header card and the tab panels — 12px, 24px from `md`.
 *
 * From legacy's `CardContent` (`p: { xs: 1.5, md: 3 }`, MUI's 8px unit). Note **`p-6`, not `p-5`**:
 * `--spacing-5` is 24px in the Figma ramp but Tailwind's `p-5` is 20px, and the mapping table at
 * the top of the spacing block in `globals.css` exists because that has already bitten.
 */
export const CHANNEL_PADDING = 'p-3 md:p-6'

/**
 * The content column for the channel's **settings** sub-pages — `/settings/space-visibility`
 * and `/settings/blocked-accounts`.
 *
 * Same 612px cap as `CHANNEL_CONTAINER`, dropped below `md` — legacy's `<Container maxWidth='sm'>`
 * again.
 *
 * This used to be the *distinguishing* property: the channel page capped at every width and only the
 * settings screens went full-bleed below `md`, on the grounds that a feed under a cover image reads
 * fine in a fixed column while a stack of full-width cards does not. The channel page has since gone
 * full-bleed below `md` too — a 612px column between 612 and 899 left a margin either side of a cover
 * that wants the whole width — so the two now agree, and the reason they agree is the same reason.
 *
 * `md` (900) is the switch rather than `sm`, because md is also where the tab bar gives way to
 * the left rail — i.e. where the layout stops being the phone layout. Identical reasoning, and
 * identical value, to `IDENTIFICATION_CONTAINER`; not imported from there because a feature may
 * not reach into another feature's internals, and a layout constant is not worth widening a
 * barrel for.
 */
export const CHANNEL_SETTINGS_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The reading surface the edit-profile form sits on — **from md up only**.
 *
 * ## Why the form needed one and the visibility picker did not
 *
 * `/settings/space-visibility` and `/settings/blocked-accounts` are lists of **cards**: each row
 * already carries `--background-surface` and a border, so the page background is the gap between
 * them and a panel underneath would be a surface behind surfaces. This form is the opposite — a
 * cover photo and seven bare controls — so with nothing under it the whole screen was 612px of
 * content floating on `--background` from md up, with no edge anywhere.
 *
 * Same decision, same tokens and the same breakpoint as `IDENTIFICATION_PANEL`, which is the other
 * form-shaped sub-page in this app. Duplicated rather than imported because a feature may not reach
 * into another feature's internals, and a layout constant is not worth widening a barrel for —
 * `CHANNEL_SETTINGS_CONTAINER` says the same about the width beside it.
 *
 * `--background-surface`, not `--background-subtle`: subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light (invisible) and identical to surface in Dark. Wrong token for "a plane
 * above the page" in both modes, and only obvious once you try it in both.
 *
 * ## **No `overflow-hidden`** — the action bar lives in here now
 *
 * It used to have `md:overflow-hidden`, to clip the cover photo's square top corners to the panel's
 * rounded ones. That is incompatible with what the panel now contains: `overflow: hidden` makes an
 * element a scroll container, and a `position: sticky` descendant sticks inside *that* box rather
 * than to the viewport — so the desktop Cancel/Save bar would stop following the screen and park
 * itself at the bottom of the panel.
 *
 * The clip moved to the cover block itself, which needs it and contains nothing sticky. Same
 * warning `IDENTIFICATION_PANEL` carries, arrived at from the other direction.
 */
export const PROFILE_PANEL = cn(
    // Fill the column from md, so a short form does not leave the panel hugging its content with
    // two thirds of a tall window empty beneath it. Below md it must not grow — see
    // `IDENTIFICATION_PANEL`, where that was measured against a phone viewport.
    'md:grow',
    /*
     * **No top margin.** It carried `md:mt-4`, which put a 16px band of page background between
     * the sticky bar and the panel's top edge — a gap that only reads as a gap while the page is
     * scrolled to the top, and reads as a misalignment the rest of the time, since the content
     * scrolls *under* the bar anyway. The bar is the page's own chrome, not a floating element the
     * card has to clear.
     */
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)

/**
 * Height of the page's sticky bar, which the tab row parks under.
 *
 * The DS App Bar shell is 60 tall, which is also what `PageBackBar` renders. Together with the
 * 48px segmented-control track that makes a 108px sticky stack — the number any in-panel anchor
 * needs as `scroll-mt`.
 */
export const CHANNEL_BAR_HEIGHT = 60
