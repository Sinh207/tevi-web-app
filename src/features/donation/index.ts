/**
 * Direct donation — **buying a creator a coffee**, and nothing else.
 *
 * One endpoint (`billy/v1/gifting/direct-donate/{slug}/`), one question: what has this creator asked
 * to be bought, and how do you buy one. It is not the gifting rail (`gifting/send/`, a livestream
 * catalogue), not membership (a recurring subscription with its own checkout), and not the wallet —
 * `features/balance` owns the Star figure and this feature never writes it.
 *
 * ```
 * useDonationOffered(slug)  will a Support block render here? — one query however many components ask
 * <DonateButton/>           the space action row's control + the whole dialog flow
 * <DonateSupportCard/>      the About tab's "Support {creator}" block, contents only
 * ```
 *
 * ## Star only, and that is a stated boundary rather than an omission
 *
 * The offer is priced in **both** Star (`TVS`) and cash (`USD`). The Star path is complete: it
 * debits through `useRequireStars`, posts to the same URL it read, and refreshes the balance. The
 * cash path needs `checkout/v3/checkout/donation/` on the payments service, Stripe Elements and a
 * `clientSecret` round trip — a payment integration this repo does not have at all. So a **cash-only
 * offer renders no button**: opening a dialog whose only action cannot complete is worse than
 * offering nothing, which is the same rule that keeps Membership and Messages off the action row
 * (`features/channel/components/channel-viewer-actions.tsx`).
 *
 * When the payment feature lands, the currency toggle goes back into `DonateDialogs` and
 * `hasStarPrice` stops being a gate — those are the two places to look, and nothing else moves.
 *
 * ## Why it does not import `features/channel`
 *
 * `features/channel` imports this barrel, so the reverse would be a cycle between two features —
 * exactly what `channel-owner-actions.tsx` had to unpick with `@features/earnings/routes`. So the
 * subject of a donation is `DonationTarget`, a three-field shape the caller builds. It is also the
 * right abstraction on its own: a post, a live room and a message will all want to open this flow,
 * and none of them should have to hold a `Channel` to do it.
 */

export type { DirectDonate, DonationIcon, DonationTarget } from './api/types'
export { DonateButton } from './components/donate-button'
export { DonateSupportCard } from './components/donate-support-card'
export { useDonationOffered } from './hooks/use-donation-offered'

/**
 * Deliberately **not** exported: `donationApi`, `donationKeys`, `useDirectDonate`, `useDonateFlow`,
 * `DonateDialogs` and every helper in `lib/`.
 *
 * A component calling the model directly is what `CLAUDE.md`'s "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/balance/index.ts` and
 * `features/channel/index.ts` both spell out. The flow hook is internal for a sharper reason: it
 * owns dialog state, and a second caller mounting it would put a second dialog stack on the page.
 * The two components that do mount it are the two surfaces the design has.
 */
