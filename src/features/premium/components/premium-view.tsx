'use client'

import { useMyChannel } from '@features/channel'
import { useBandPassed } from '@shared/hooks/use-band-passed'
import { cn } from '@shared/lib/utils'
import { usePremiumPlans } from '../hooks/use-premium-plans'
import { usePremiumPrice } from '../hooks/use-premium-price'
import { usePremiumSync } from '../hooks/use-premium-sync'
import { useSubscribePremium } from '../hooks/use-subscribe-premium'
import { PREMIUM_COLUMN } from '../lib/container'
import { PREMIUM_TAIL_RAMP } from '../lib/premium-surface'
import { PremiumAbout } from './premium-about'
import { PremiumBenefits } from './premium-benefits'
import { PremiumHero } from './premium-hero'
import { PremiumPlans } from './premium-plans'
import { PremiumSubscribeConfirm } from './premium-subscribe-confirm'
import { PremiumTopBar } from './premium-top-bar'

/**
 * `/premium` — the whole screen, in one 612 column.
 *
 * ```
 * band      ── the bar, the mark, the pitch or the thank-you, and (for a visitor) the three prices
 * benefits  ── "What's included", each row opening a detail carousel
 * about     ── three paragraphs and the legal line
 * ```
 *
 * ## Why the prices are inside the band
 *
 * They are the offer, and the band is what marks it as one: legacy's gradient runs behind the plan
 * cards and resolves into the page ground below them, so the eye reads "brand, offer" and then
 * "ordinary page, explanation". Nesting them is what keeps that true at any content height — see
 * `PREMIUM_HERO_RAMP`.
 *
 * ## A member is not shown the plans
 *
 * `isPremium` comes from `MyChannelProvider`, so it costs no request and is already refreshed by the
 * `premium_info` socket frame — which means the grid disappears on its own the moment a purchase
 * lands, without this screen watching for a payment. Legacy hides them on the same flag. Offering
 * three Subscribe buttons to somebody who already subscribed is an invitation to be charged twice,
 * and the backend would take it.
 *
 * ## What is *not* here
 *
 * No whole-screen skeleton and no page-level error state: each section resolves independently, and
 * the two that can fail say so in their own box. A screen whose four sections arrive together is a
 * screen that shows nothing until the slowest one does.
 *
 * The **benefits** section is also what a guest is here to read, so nothing above it is gated on a
 * session — the gate is on the Subscribe press (`useSubscribePremium`), which is this app's rule
 * everywhere: gate the action, never the route.
 */
export function PremiumView() {
    const { isPremium } = useMyChannel()
    /*
     * Mounted here rather than in `usePremiumInfo`: it is the *screen* that has to re-read after a
     * purchase, and a hook that re-fetches as a side effect of being read is a hook whose second
     * caller doubles the work. One subscription, at the top.
     */
    usePremiumSync()
    /*
     * The bar's two states, owned here because the band and the bar are siblings — see the hook, and
     * the note on the bar below.
     */
    const band = useBandPassed()
    /*
     * **One flow for the whole screen**, because there are two places to press Subscribe: a plan
     * card and the benefit dialog's footer. Both are legacy's. Created here so there is one pending
     * package, one busy state and one confirmation — see `PremiumSubscribeConfirm`.
     */
    const subscribe = useSubscribePremium()
    /*
     * The About panel's "all for just X/month" — **this screen's own answer**, the monthly
     * subscription's price straight off the catalogue the cards are built from. `PremiumAbout` used
     * to fetch it itself; it is passed now because `/gift-premium` draws the same panel from a
     * different table. Same query the grid reads, so this costs no request.
     */
    const { plans } = usePremiumPlans()
    const price = usePremiumPrice()
    const monthlyPrice = plans.monthly ? price(plans.monthly.price, plans.monthly.currency) : null

    return (
        <div className={PREMIUM_COLUMN}>
            {/*
             * **The bar is a child of the column, not of the band**, and that is what makes it stay:
             * `sticky` is bounded by its containing block, so nested inside the band it left the top
             * of the screen the moment the band did. The band is pulled up underneath it instead
             * (see `PremiumHero`'s negative margin), which is how the gradient ends up behind it —
             * legacy gets the same result by painting the ramp on the container and making the bar
             * its first child.
             */}
            <PremiumTopBar stuck={band.passed} />
            <PremiumHero sentinelRef={band.ref}>
                {!isPremium && <PremiumPlans flow={subscribe} />}
            </PremiumHero>
            {/*
             * **This wrapper carries the band's fade** — `PREMIUM_TAIL_RAMP`, the second half of the
             * hero's gradient, which is why the violet is still behind "What's included" and the top
             * of the benefits panel. That constant is where the reasoning lives, including why it is
             * a background here rather than an overlay in the band.
             *
             * `pt-4` and not more: the band ends flush at its own `pb-6`, so this is the gap between
             * the offer and the explanation — legacy's is about 30px all told. The bottom 24 is the
             * page's air under the last panel; below `md` the tab bar reserves its own space, so
             * nothing has to be subtracted here.
             */}
            <div className={cn('flex flex-col gap-6 pt-4 pb-6', PREMIUM_TAIL_RAMP)}>
                {/*
                 * `null` for a member: the dialog's footer then carries its dots and no button,
                 * which is what legacy shows too (`BtnSubscribe` returns null on `isMyPremium`).
                 */}
                <PremiumBenefits subscribe={isPremium ? null : subscribe} />
                <PremiumAbout monthlyPrice={monthlyPrice} />
            </div>

            {/*
             * The screen's one confirmation, raised by either Subscribe button. A sibling of the
             * column's content rather than a child of the grid, because the press can come from a
             * dialog that is itself portalled over it.
             */}
            <PremiumSubscribeConfirm flow={subscribe} />
        </div>
    )
}
