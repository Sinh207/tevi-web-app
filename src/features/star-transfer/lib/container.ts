/**
 * `/star-transfer`'s content column — **612px from `md`, full-bleed below it, and no side padding at any
 * width.**
 *
 * 612 is legacy's own `<Container maxWidth='sm'>` on this screen, and the number every route in `(rail)`
 * caps at — which is not a coincidence but the condition for joining that group: the end rail is pinned
 * on the assumption of a 612 column (see `(rail)/layout.tsx`).
 *
 * Written as a literal for the reason `MY_STAR_CONTAINER` and `EARNINGS_CONTAINER` both spell out:
 * Tailwind's `sm` is 24rem *and* this repo's `sm` breakpoint is itself 612px, so `max-w-sm` would be
 * wrong twice over.
 *
 * ## No `px-4` below `md`, and the radii go with it
 *
 * It had `px-4`, on the usual argument that a rounded card flush against the bezel has its corners cut
 * in half. Legacy answers that differently and this screen follows it: its container is
 * `padding: {xs: 0, sm: 0, md: 0, lg: 0}` and its surface is `borderRadius: {xs: 0, md: 16}` — **zero
 * padding at every width, and no radius until `md`**. A phone gets the screen's surface edge to edge and
 * the extra 32px goes to the content, which on a 402pt device is the difference between a receiver's
 * name fitting and truncating.
 *
 * So the two decisions are one decision: every surface on this screen (`TransferBalanceCard`, the purple
 * seam, the white panel, the receipt) carries its radius as `md:rounded-*`. Removing the padding without
 * removing the radius is the state that actually looks broken, and it is the only reason that pairing is
 * written down here rather than left to each component.
 *
 * `/settings/blocked-accounts` reached the same shape from the other direction — one full-bleed list
 * panel — and `/my-star` keeps its padding because it is a stack of *separate* cards with page
 * background between them. Same rule in all three: the column's padding is whatever makes the content
 * sit right.
 *
 * The page hands this to `PageBackBar` as well. The bar keeps its own `px-4` below `md` (it applies
 * `md:px-0` itself, before this class): a lone 40px back button hard against the bezel is not the same
 * problem as a full-bleed surface — it is a control, and controls keep their inset.
 */
export const STAR_TRANSFER_CONTAINER = 'mx-auto w-full md:max-w-[612px]'
