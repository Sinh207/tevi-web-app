/**
 * `/my-membership`'s content column — **612px from `md`, full width below it, and no side padding
 * at any width.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`. Written as a literal for the reason
 * `CHANNEL_SETTINGS_CONTAINER` and `MY_STAR_CONTAINER` both spell out: Tailwind's `sm` is 24rem
 * *and* this repo's `sm` breakpoint is itself 612px, so `max-w-sm` would be wrong twice over.
 *
 * **No padding**, unlike `MY_STAR_CONTAINER`, and the difference is what the column holds. My Star
 * is a stack of rounded cards, and a rounded card flush against the bezel has its corners cut in
 * half. This screen is one full-bleed list panel below `md` — its rows run edge to edge on a phone,
 * as the mobile app's do — so a `px-4` here would inset the panel by 16px at every width with
 * nothing the panel could do about it. Identical call, and identical value, to
 * `/settings/blocked-accounts`.
 *
 * The search field is **inside** that panel rather than above it, so its 16px inset (the same the DS
 * list row gives its avatar) is padding within the card and not padding on this column. The payment
 * filter needs none at all: it lives in the page's bar.
 *
 * Duplicated rather than imported from `features/channel`: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for.
 */
export const MY_MEMBERSHIP_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * Height of the page's sticky back bar, which the status tabs park under.
 *
 * The DS App Bar shell is 60 tall, which is what `PageBackBar` renders. Stated here rather than
 * inlined at the call site so the tab row and any future in-panel anchor read the same number.
 */
export const MY_MEMBERSHIP_BAR_HEIGHT = 60
