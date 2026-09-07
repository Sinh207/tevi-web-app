/**
 * The dashboard's content column — **612px from `md`, full width below it, with a 16px inset at
 * every width.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`, written as a literal for the reason
 * `EARNINGS_CONTAINER` spells out: Tailwind's `sm` is 24rem and *this repo's* `sm` breakpoint is
 * itself 612px, so `max-w-sm` would be wrong twice over. It is also what `(rail)` assumes — the
 * end rail is anchored 22px past a 612 column, so a wider one would sit under it.
 *
 * The inset survives below `md` because this screen is a **stack of cards** (the metric panel, the
 * range summary, the top-earning list), and a rounded card flush against the bezel has its corners
 * cut in half. `/settings/blocked-accounts` drops its padding instead because its rows run edge to
 * edge; the rule is the same in both cases and the content is a different shape.
 *
 * The page hands this same class to `PageBackBar`, so the back button lines up with the cards.
 *
 * Duplicated rather than imported from `features/earnings`: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for.
 */
export const ANALYTICS_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'
