/**
 * `/my-star`'s content column — **612px from `md`, full width below it, with a 16px inset at every
 * width.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`, and the desktop comp's own 628 minus its side padding.
 * Written as a literal for the reason `EARNINGS_CONTAINER` and `CHANNEL_CONTAINER` both spell out:
 * Tailwind's `sm` is 24rem *and* this repo's `sm` breakpoint is itself 612px, so `max-w-sm` would be
 * wrong twice over.
 *
 * The side padding stays below `md` because this screen is a stack of **rounded cards**, and a rounded
 * card flush against the bezel has its corners cut in half. `/settings/blocked-accounts` drops its
 * padding for the opposite reason — that screen is one full-bleed list panel. Same rule in both cases:
 * the column's padding is whatever makes the content sit right.
 *
 * (The comp expands the ledger panel to full-bleed as it reaches the top of the viewport — card → full
 * width, radius to 0, 180ms. **Not implemented in this pass**: it needs a scroll observer on the page
 * container and it is presentation, not data. The panel is a card at every width for now.)
 *
 * The page hands this same class to `PageBackBar`, so the back button lines up with the cards rather
 * than with the window edge.
 *
 * Duplicated rather than imported from `features/my-wallet` or `features/earnings`: a feature may not
 * reach into another feature's internals, and a layout constant is not worth widening a barrel for.
 * Same call `CHANNEL_SETTINGS_CONTAINER`, `IDENTIFICATION_CONTAINER` and `EARNINGS_CONTAINER` already
 * make about each other.
 */
export const MY_STAR_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'
