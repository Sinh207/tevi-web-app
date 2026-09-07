/**
 * The inbox's content column: **full width below `md`, 612px from `md` up.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>` for this very screen. Written as a literal rather
 * than `max-w-sm` twice over: Tailwind's `sm` is 24rem (384px), and **this repo's `sm` breakpoint
 * is itself 612px** — so `max-w-sm` would be wrong and `sm:max-w-[612px]` would read as if the cap
 * only applied above the cap.
 *
 * `md` (900) rather than `sm` is the switch, matching `CHANNEL_SETTINGS_CONTAINER` and
 * `IDENTIFICATION_CONTAINER`: md is where the mobile tab bar gives way to the desktop rail, i.e.
 * where the layout stops being the phone layout. Below it the panel is full-bleed, because a list
 * whose rows carry their own 16px leading inset should meet the screen's edges the way the mobile
 * app's does.
 *
 * Same value as those two today, and deliberately still its own constant — a page's width is a
 * decision it owns, and two screens agreeing on a number now is not a reason for one to move when
 * the other is redesigned. It is also why this is not imported from `features/channel`: a feature
 * may not reach into another feature's internals, and a layout constant is not worth widening a
 * barrel for.
 */
export const NOTIFICATION_CONTAINER = 'mx-auto w-full md:max-w-[612px]'
