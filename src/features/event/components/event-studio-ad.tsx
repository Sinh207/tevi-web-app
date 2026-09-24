'use client'

import { useMyChannel } from '@features/channel'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import Image from 'next/image'
import type { EventChannel } from '../api/types'

/**
 * Legacy's `handleReplaceOriginUrl` — the referral link keeps its path and query and takes **this
 * deployment's** origin. The links point at Tevi's own affiliate redirect, minted against whichever
 * environment created them, so a staging link opened from production would land a reader on
 * staging. Vetted first, so nothing but `http:`/`https:` ever reaches `window.open`.
 */
export function affiliateHref(referralUrl: string | null | undefined): string | null {
    const vetted = safeExternalUrl(referralUrl)
    if (!vetted) return null
    try {
        const url = new URL(vetted)
        const base = new URL(env.NEXT_PUBLIC_BASE_URL)
        return `${base.origin}${url.pathname}${url.search}${url.hash}`
    } catch {
        return null
    }
}

/**
 * **The ad tile** — an 85×85 app icon with an *Ads* ribbon across its corner, bottom-trailing on
 * the stage.
 *
 * Legacy's `liveSession/.../rightPanel/affiliateBanner`, at its numbers: 85×85, 8px radius, the
 * ribbon 80 wide at 45° from 14px down and 20px past the edge, `rgba(0,0,0,0.5)` under a 10px label.
 * The icon is the creator's promoted app (`channel.promote`) and a press opens its referral link in
 * a new tab with neither opener nor referrer, as legacy's does.
 *
 * Absent for a **Premium** reader — ad-free is what Premium sells (`premium_copy_no_ads`) — and for
 * a channel promoting nothing.
 *
 * `unoptimized` because the icon's host is whatever the creator's app store serves from: it cannot
 * be listed in `remotePatterns`, and an 85px icon is not worth an optimiser round trip. `img-src`
 * already admits `https:`. This is backend-decided content, the stated exception to the no-CDN rule.
 */
export function EventStudioAd({ channel }: { channel: EventChannel | null }) {
    const { t } = useTranslation()
    const { isPremium } = useMyChannel()
    const href = affiliateHref(channel?.promote?.referral_url)
    const icon = safeExternalUrl(channel?.promote?.app_icon_url)

    if (isPremium || !href) return null

    return (
        <button
            type="button"
            data-testid="event-studio-ad"
            onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
            className="relative size-[85px] flex-none cursor-pointer overflow-hidden rounded-lg bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
            {icon && (
                <Image
                    src={icon}
                    alt={channel?.promote?.app_name ?? t('event_studio_ads')}
                    fill
                    unoptimized
                    className="object-cover"
                />
            )}
            <span
                aria-hidden
                className="absolute top-3.5 -end-5 w-20 rotate-45 bg-black/50 px-1 type-micro-overline text-center text-white rtl:-rotate-45"
            >
                {t('event_studio_ads')}
            </span>
        </button>
    )
}
