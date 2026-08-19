/**
 * The password page's content column: **full width below md, 612px from md up.**
 *
 * The same rule `/identification` uses (`features/identification/lib/container.ts`), and the
 * same reasoning: 612 is legacy's `<Container maxWidth='sm'>`, written as a literal because
 * Tailwind's `sm` is 24rem and this repo's `sm` breakpoint is itself 612px — `max-w-sm` would
 * be the wrong number twice over. Below md the cap is dropped so the screen fills a phone the
 * way the mobile app's does.
 *
 * Not shared with that feature through a common module: a page's own width is a layout
 * decision it owns, and two screens agreeing on a number today is not a reason for one to
 * change when the other is redesigned. The 12/24px side padding lives with the content
 * (`px-3 md:px-6`); this decides only how wide the column may get.
 */
export const PASSWORD_CONTAINER = 'mx-auto w-full md:max-w-[612px]'
