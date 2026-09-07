/**
 * `/my-wallet`'s content column — 612px from `md`, full width below it, 16px inset at every width.
 *
 * Identical to `MY_STAR_CONTAINER` and duplicated deliberately: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for. That file carries the
 * full reasoning (why 612 is a literal, why the inset stays below `md`, and which comp behaviour is
 * deferred); the same applies here.
 */
export const MY_WALLET_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/**
 * `/my-wallet/transaction-history`'s surface — **one class in two places**: `<main>` and the sticky bar.
 *
 * That page is a **single panel** (`docs/DESIGN_SYSTEM.md` §6): one list, no hero card, no action rows.
 * `/my-wallet` itself is *not* — it stacks a balance card, an alert and three action rows above the
 * ledger, with page colour showing through the `gap-3` between them, which is `web-app`'s own
 * arrangement (`tabCurrency/index.js`: a `Stack gap='12px'` of cards on an ungutter'd container). So
 * the rule applies here and deliberately not one level up.
 *
 * Below `md` both are `--background-surface`, so the surface runs from the status bar to the bottom edge
 * with no seam and the list scrolls *under* the bar rather than past a page-coloured strip. From `md`
 * both return to `--background` and the panel becomes the card.
 *
 * `--background-surface`, never `--background-subtle` — subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light and equals surface in Dark. Wrong in both modes, visible in neither alone.
 */
export const MY_WALLET_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * The box a **state** sits in on that page — the signed-out message, where the list would be.
 *
 * Nothing below `md` (`MY_WALLET_SCREEN` has already painted the screen), the card from `md` up. It is
 * `LedgerPanel`'s own `fullBleed` treatment stated for a caller-supplied node, so a state and the list
 * it replaces are the same object at both ends. Without it the message floats on `--background` while
 * the list is a rounded card, which reads as a page that failed rather than one with nothing in it.
 */
export const MY_WALLET_PANEL = 'flex flex-col md:rounded-xl md:bg-(--background-surface)'
