/**
 * The report's content column — **612px from `md`, full width below it, with a 16px inset at
 * every width.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`, written as a literal for the reason
 * `CHANNEL_CONTAINER` spells out: Tailwind's `sm` is 24rem and *this repo's* `sm` breakpoint is
 * itself 612px, so `max-w-sm` would be wrong twice over.
 *
 * ## Why this one keeps its side padding below `md`, where the settings screens drop theirs
 *
 * `/settings/blocked-accounts` is a **list panel** — its rows run edge to edge on a phone, as the
 * mobile app draws them, so a `px-4` on the column would inset the panel by 16px with nothing the
 * panel could do about it. This screen is a **stack of cards**: each day is a bordered, rounded
 * surface, and a rounded card flush against the bezel has its corners cut in half. Same rule in
 * both cases — the column's padding is whatever makes the content sit right — the content is just
 * a different shape. `/settings/space-visibility` is the same shape and does the same thing.
 *
 * From `md` the column is capped with real space either side, so the inset comes from the margin
 * and `md:px-0` hands the extra 16px back to the cards.
 *
 * The page hands this **same** class to `PageBackBar`, so the back button lines up with the cards
 * rather than with the window edge — see that component's note on why the bar matches the content
 * and not the DS default.
 *
 * Duplicated rather than imported from `features/channel`: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for. Same call
 * `CHANNEL_SETTINGS_CONTAINER` and `IDENTIFICATION_CONTAINER` already make about each other.
 */
export const EARNINGS_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'
