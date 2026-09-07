'use client'

import { ProgramCard } from '@shared/components/program-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { campaignReward } from '../api/types'
import { useCampaignText } from '../hooks/use-campaign-text'
import { useCampaigns } from '../hooks/use-campaigns'
import { CAMPAIGN_ART } from '../lib/illustrations'

/**
 * Affiliate Programs. Legacy: `campaign/affiliatePrograms`.
 *
 * ## It knows nothing about the dialog it opens
 *
 * The programs themselves live in `features/affiliate`, on a different service. This card only knows
 * *whether* they are on offer — one row of `dapp-campaign` — so it takes an `onPress` and leaves the
 * dialog to whoever composes the two (`features/affiliate`'s `AffiliateEntry`).
 *
 * **That direction is deliberate, not incidental.** If this file imported the dialog, the two
 * feature barrels would import each other, and ESM resolves a cycle by handing one side a
 * half-initialised module — not a build error, an `undefined is not a function` at render time, on
 * whichever side evaluated second. `features/my-star/routes.ts` exists because of the same trap. So
 * the edge runs one way: affiliate → campaign.
 *
 * Without `onPress` the card is inert and reports status only, which is what it did before the
 * dialog existed.
 */
export function AffiliateBanner({ onPress }: { onPress?: () => void } = {}) {
    const { t, currentLanguage } = useTranslation()
    const { campaigns } = useCampaigns()
    const campaignText = useCampaignText()

    const campaign = campaigns.AFFILIATE
    if (!campaign?.is_active) return null

    const reward = campaignReward(campaign)

    return (
        <ProgramCard
            data-testid="campaign-affiliate-banner"
            logo={campaign.logo ?? CAMPAIGN_ART.affiliateFallback}
            logoAlt=""
            /* Only the campaign's own logo bypasses the optimiser; our bundled fallback is local
               and goes through it as normal. */
            logoUnoptimized={Boolean(campaign.logo)}
            title={campaignText(campaign.name) || t('campaign_affiliate_title')}
            body={campaignText(campaign.description) || t('campaign_affiliate_body')}
            reward={
                reward === null
                    ? undefined
                    : t('campaign_reward_up_to_per_day', {
                          amount: formatFiatAmount(reward, DEFAULT_CURRENCY, currentLanguage),
                      })
            }
            actionLabel={campaign.user_joined ? t('campaign_manage') : t('campaign_join_now')}
            actionJoined={campaign.user_joined}
            {...(onPress
                ? { as: 'button' as const, onClick: onPress }
                : /* Inert: the pill is then the only place the joined state is stated, so it has to
                     reach a screen reader. With a press target the card's own name covers it. */
                  { actionDecorative: false })}
        />
    )
}
