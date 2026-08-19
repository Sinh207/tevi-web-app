'use client'

import { AffiliateEntry } from '@features/affiliate'
import { GrowYourFansBanner, useCampaigns } from '@features/campaign'
import { CardCarousel } from '@shared/components/card-carousel'
import { useRailVisible } from '@shared/hooks/use-rail-visible'
import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'

/**
 * The owner's promo strip on their own space — legacy's
 * `containers/channel/components/creator/components/content/campaignBanners`.
 *
 * Grow Your Fans and Affiliate Programs, on a carousel, between the action row and the tabs.
 *
 * ## The two cards are not rebuilt here
 *
 * `GrowYourFansBanner` and `AffiliateEntry` are the ones the end rail renders. They read the same
 * `useCampaigns()` query, and TanStack dedupes it — mounting them here costs no extra request
 * whether or not the rail mounted them too. Legacy instead fetches the list *again* from
 * `MyChannelProvider`'s own `useEffect`, into a second `useState` copy, and then patches that copy
 * by hand when the affiliate dialog joins a program (`updateCampaignAffiliate`). Here the join
 * invalidates `campaignKeys.list` and every card that reads it re-renders — which is why the query
 * is the only place this data lives.
 *
 * ## Only where the rail is not — **and this is the first thing to check when it "does not show"**
 *
 * A channel page sits inside the `(rail)` route group, so above 1292 the rail is already showing
 * these two cards; rendering them here as well would print the same campaign twice on one screen.
 * `useRailVisible` is the same answer the rail gates its own cards on, so the two are exclusive by
 * construction: **exactly one surface offers a campaign at any width.** Below 1292 there is no rail
 * at all, which is the gap this file closes — a creator on a phone had no campaign anywhere.
 *
 * The cost is a real trap, and it has already been paid once: on a wide desktop window this file
 * renders **nothing**, by design, and that is indistinguishable from a bug. The rail is where to
 * look at that width. If the rail is empty too, the problem is upstream — `useCampaigns()` returned
 * nothing — and `docs/END_RAIL_OPEN_ITEMS.md` R2 covers why that fails silently.
 *
 * There is no first-paint flash from the gate reading `false` on the server: the campaigns are an
 * authenticated client query, so no card can render before hydration anyway, and `matchMedia` has
 * answered long before the response lands.
 *
 * ## Why it counts the campaigns itself
 *
 * Each card decides on its own whether to render — that is what lets the rail stack them and let
 * the stack collapse. A carousel cannot work that way: a card that returns `null` inside a slide
 * still leaves the slide, its width and its dot, so the strip would page onto an empty screen. So
 * the same two conditions are asked *here*, and only live cards become slides. They have to stay in
 * step with the cards themselves, which is why the `shortlink` check is `safeExternalUrl` and not
 * `Boolean(...)` — `GrowYourFansBanner` drops a `javascript:` destination, and a slide holding a
 * card that dropped its own link is the failure this paragraph is about.
 */
export function ChannelCampaignBanners() {
    const { t } = useTranslation()
    const { campaigns } = useCampaigns()
    const railVisible = useRailVisible()

    const growYourFans = campaigns.MILESTONE
    const affiliate = campaigns.AFFILIATE

    const showGrowYourFans = Boolean(
        growYourFans?.is_active && safeExternalUrl(growYourFans.shortlink),
    )
    const showAffiliate = Boolean(affiliate?.is_active)

    if (railVisible || (!showGrowYourFans && !showAffiliate)) return null

    return (
        /* The header card's own inline padding, so the strip lines up with everything above and
           below it — and the card surface continues under it from `md`, exactly as it does for
           `ChannelPublishBanner`, which occupies this same slot in the other owner state. */
        <div className="px-3 pb-3 md:bg-(--background-surface) md:px-6 md:pb-6">
            <CardCarousel
                label={t('channel_campaigns_label')}
                slideLabel={(index, count) => t('channel_campaigns_slide', { index, count })}
            >
                {/* Legacy's order: the milestone campaign first, affiliate second. */}
                {showGrowYourFans ? <GrowYourFansBanner /> : null}
                {/* The card *and* its dialog — see `AffiliateEntry` for why they travel together. */}
                {showAffiliate ? <AffiliateEntry /> : null}
            </CardCarousel>
        </div>
    )
}
