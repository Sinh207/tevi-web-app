'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import { PREMIUM_PATH } from '@features/premium/routes'
import { PromoCard } from '@shared/components/promo-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RAIL_ART } from './illustrations'

/**
 * "Subscribe to Premium" — shown to a signed-in account that is not already Premium.
 * Legacy: `campaign/premiumBanner`.
 *
 * `isPremium` comes from `MyChannelProvider`, which holds the account's own channel for the
 * whole app, so this costs no request of its own. Same source legacy reads (`isMyPremium` =
 * `myChannel?.is_premium`).
 *
 * ## Not on `/premium` itself
 *
 * The rail shows from 1292px, so on a wide window this card would sit beside the Premium page
 * advertising it — a promo for what the reader is already reading, with a CTA to the URL they are
 * on. Same call, and the same one-line shape, as `PaymentProvider`'s `isOnGetStarPage`.
 *
 * ## The destination
 *
 * `/premium` — `features/premium`'s own screen, which this card pointed at before the route
 * existed (the address is legacy's, so it needed no edit on the day it landed). Imported from
 * `@features/premium/routes` rather than the barrel: that module is import-free precisely so
 * the shell can read a path without closing a cycle between two barrels.
 */
export function PremiumBanner() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const { isPremium } = useMyChannel()
    const pathname = usePathname()

    if (!isAuthenticated || isPremium || pathname === PREMIUM_PATH) return null

    return (
        <PromoCard
            title={t('rail_premium_title')}
            body={t('rail_premium_body')}
            art={RAIL_ART.premium}
            action={
                <Button
                    data-testid="navigation-end-rail-premium"
                    variant="accent"
                    size="medium"
                    render={<Link href={PREMIUM_PATH} />}
                >
                    {t('rail_premium_cta')}
                </Button>
            }
        />
    )
}
