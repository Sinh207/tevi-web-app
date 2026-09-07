'use client'

import { ProgramCard } from '@shared/components/program-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { campaignReward } from '../api/types'
import { useCampaignText } from '../hooks/use-campaign-text'
import { useCampaigns } from '../hooks/use-campaigns'
import { CAMPAIGN_ART } from '../lib/illustrations'

/** The mark sits on the campaign's own red gradient, which is part of its brand rather than ours. */
const GYF_TILE = 'bg-[linear-gradient(183.29deg,#FF001E_70.23%,#580000_97.28%)]'

/**
 * Grow Your Fans — the milestone campaign. Legacy: `campaign/growYourFans`.
 *
 * The only card in the rail whose destination is fully real today: `shortlink` is an absolute URL
 * the service hands us, so the card works end to end with nothing left to build.
 *
 * `milestone_details` wins over `name` / `description` when it is there — the campaign has a name,
 * but the *current milestone* has a title, and the milestone is what a creator is being asked
 * about this week.
 *
 * ## The whole card is the link, and the pill inside it is not a button
 *
 * Legacy wraps everything in one anchor and styles the "Join now" text to look pressable. Kept:
 * a `<button>` inside an `<a>` is invalid HTML and gives a keyboard user two stops for one action.
 * `ProgramCard` renders that pill `aria-hidden`, so the link's accessible name is the title and
 * body — which is what a screen reader should announce anyway.
 *
 * ## `[%s]` is gone
 *
 * Legacy splits its reward string on a `[%s]` sentinel and reassembles it around a `<Typography>`,
 * which pins the figure to one position in the sentence — wrong for any language that puts it
 * first. i18next interpolates instead, so `{{amount}}` lands wherever the translation puts it.
 */
export function GrowYourFansBanner() {
    const { t, currentLanguage } = useTranslation()
    const { campaigns } = useCampaigns()
    const campaignText = useCampaignText()

    const campaign = campaigns.MILESTONE
    /*
     * The destination is a **server-supplied URL going straight into an `href`**, which is the
     * sink `safeExternalUrl` exists for: a `javascript:` or `data:` value there runs as the
     * visitor, on our origin, with their session. Legacy hands `campaignGYF.shortlink` to a link
     * component unchecked. `null` here means the card does not render, which is the same outcome
     * as no shortlink at all.
     */
    const shortlink = safeExternalUrl(campaign?.shortlink)

    // No link, no card: legacy checks the same thing, and a promo card that goes nowhere is worse
    // than no promo card.
    if (!campaign?.is_active || !shortlink) return null

    const reward = campaignReward(campaign)

    /*
     * A plain anchor, not `next/link`: the destination is another origin, so there is no route
     * to prefetch and nothing for the client router to do. `noreferrer noopener` because it
     * opens in a new tab and the campaign host is not ours.
     */
    return (
        <a
            data-testid="campaign-grow-fans"
            href={shortlink}
            target="_blank"
            rel="noreferrer noopener"
            className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
            <ProgramCard
                logo={CAMPAIGN_ART.growYourFans}
                logoAlt=""
                tileClassName={GYF_TILE}
                title={campaignText(campaign.milestone_details?.title ?? campaign.name)}
                body={campaignText(campaign.milestone_details?.subtitle ?? campaign.description)}
                reward={
                    reward === null
                        ? undefined
                        : t('campaign_reward_up_to', {
                              amount: formatFiatAmount(reward, DEFAULT_CURRENCY, currentLanguage),
                          })
                }
                actionLabel={campaign.user_joined ? t('campaign_manage') : t('campaign_join_now')}
                actionJoined={campaign.user_joined}
            />
        </a>
    )
}
