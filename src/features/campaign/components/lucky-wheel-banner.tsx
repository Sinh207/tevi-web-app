'use client'

import { GetAppDialog } from '@shared/components/get-app-dialog'
import { PromoCard } from '@shared/components/promo-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { useState } from 'react'
import { useCampaignText } from '../hooks/use-campaign-text'
import { useCampaigns } from '../hooks/use-campaigns'
import { CAMPAIGN_ART } from '../lib/illustrations'

/**
 * The Lucky Wheel card. Legacy: `campaign/luckyWheel/banner`.
 *
 * Title and body are the campaign's own, run through `useCampaignText` so a pre-translated
 * campaign shows in the reader's language.
 *
 * ## The whole card is the control
 *
 * Legacy puts `onClick` on the container, which leaves the card unreachable by keyboard and
 * unannounced by a screen reader. It is a `<button>` here — the DS card recipe is a `<div>`'s worth
 * of classes, so making it a button costs nothing and buys focus, Enter/Space and a role.
 *
 * ## Where it goes
 *
 * The wheel spins in the native app only, so this asks the reader to install it — same as legacy,
 * whose desktop branch opens a QR dialog. It reuses `GetAppDialog` with the campaign's copy rather
 * than shipping a second QR dialog; the art legacy wraps around its version is not ported, and that
 * file says why.
 *
 * Legacy's mobile branch (`isMobile → redirectToApp()`) is dropped with the rest of AppsFlyer: this
 * card only renders inside a rail that needs a 1292px window.
 */
export function LuckyWheelBanner() {
    const { t } = useTranslation()
    const { campaigns } = useCampaigns()
    const campaignText = useCampaignText()
    const [open, setOpen] = useState(false)

    const campaign = campaigns.LUCKY_WHEEL
    if (!campaign?.is_active) return null

    const title = campaignText(campaign.name) || t('campaign_lucky_wheel_title')
    const body = campaignText(campaign.description) || t('campaign_lucky_wheel_body')

    return (
        <>
            <PromoCard
                data-testid="campaign-lucky-wheel"
                as="button"
                onClick={() => setOpen(true)}
                title={title}
                body={body}
                art={CAMPAIGN_ART.luckyWheel}
                className="cursor-pointer text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            />
            <GetAppDialog
                testId="campaign-lucky-wheel-get-app"
                open={open}
                onOpenChange={setOpen}
                title={title}
                body={t('campaign_lucky_wheel_qr_body')}
            />
        </>
    )
}
