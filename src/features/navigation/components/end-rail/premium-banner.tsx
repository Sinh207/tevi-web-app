'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import { PromoCard } from '@shared/components/promo-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import Link from 'next/link'
import { RAIL_ART } from './illustrations'

/**
 * "Subscribe to Premium" — shown to a signed-in account that is not already Premium.
 * Legacy: `campaign/premiumBanner`.
 *
 * `isPremium` comes from `MyChannelProvider`, which holds the account's own channel for the
 * whole app, so this costs no request of its own. Same source legacy reads (`isMyPremium` =
 * `myChannel?.is_premium`).
 *
 * ## `/premium` does not exist yet
 *
 * Deliberate, and agreed: the CTA points at the address legacy uses, so the card needs no
 * edit on the day that route lands. Until then it reaches the app's 404. The alternative —
 * a disabled button, or holding the card back — trades a wrong destination for a dead
 * control, and a dead control in a promo card is the worse of the two.
 */
export function PremiumBanner() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const { isPremium } = useMyChannel()

    if (!isAuthenticated || isPremium) return null

    return (
        <PromoCard
            title={t('rail_premium_title')}
            body={t('rail_premium_body')}
            art={RAIL_ART.premium}
            action={
                // TODO: `/premium` is not a route yet — see the note above.
                <Button variant="accent" size="medium" render={<Link href="/premium" />}>
                    {t('rail_premium_cta')}
                </Button>
            }
        />
    )
}
