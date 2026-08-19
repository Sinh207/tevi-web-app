'use client'

import { useAuth } from '@features/auth'
import {
    AffiliateBanner,
    type Campaign,
    type CampaignsByType,
    campaignKeys,
    GrowYourFansBanner,
} from '@features/campaign'
import { CardCarousel } from '@shared/components/card-carousel'
import { Button } from '@shared/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * The owner's campaign strip on a channel page, driven by fixtures.
 *
 * The real thing needs a signed-in creator with a live campaign of each kind, which is not
 * reachable on a dev machine — see `docs/END_RAIL_OPEN_ITEMS.md` R2, where the same gap is recorded
 * for the rail. So the cards are the **real** ones and only their data is stubbed, by seeding the
 * cache under the key `useCampaigns` reads: a disabled query still serves cached data, and the hook
 * is gated on auth, so an anonymous dev session gets the fixtures and makes no request.
 *
 * What this page is for is the two states a live strip cannot show you at once: **two campaigns**
 * (a track, dots and autoplay) and **one** (the bare card, no chrome at all) — and both of them in
 * RTL, where the track scrolls the other way and the dots must still count left-to-right off the
 * *first* slide.
 *
 * Two things this page deliberately does **not** exercise, both in `channel-campaign-banners.tsx`:
 * the `is_active` counting that decides how many slides there are (the buttons above stand in for
 * it), and the `useRailVisible` gate that hides the strip above 1292 — so this page keeps showing
 * the cards at a width where the real strip renders nothing. What it covers is everything below
 * those two decisions.
 */
function campaign(type: Campaign['campaign_type'], overrides: Partial<Campaign> = {}): Campaign {
    return {
        campaign_type: type,
        is_active: true,
        name: 'Grow your fans',
        description: 'Hit a follower milestone this month and take a share of the reward pool.',
        shortlink: 'https://example.com/grow-your-fans',
        logo: null,
        total_reward_in_usdt: '25000',
        user_joined: false,
        milestone_details: null,
        ...overrides,
    }
}

const BOTH: CampaignsByType = {
    LUCKY_WHEEL: null,
    MILESTONE: campaign('MILESTONE'),
    AFFILIATE: campaign('AFFILIATE', {
        name: 'Affiliate programs',
        description: 'Earn affiliate commission with one tap.',
        shortlink: null,
        total_reward_in_usdt: '120.5',
        // The joined pill next to a not-joined one, which is the pair worth seeing together.
        user_joined: true,
    }),
}

const ONE: CampaignsByType = { ...BOTH, AFFILIATE: null }

export function CampaignCarouselPreview() {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()
    const [both, setBoth] = useState(true)

    /*
     * Re-seeded on every change, and on `activeId` resolving: the anonymous bootstrap finishes
     * *after* the first render, and the key it lands on is not the one an unseeded render read.
     */
    useEffect(() => {
        queryClient.setQueryData(campaignKeys.list(activeId), both ? BOTH : ONE)
    }, [activeId, both, queryClient])

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-8">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-semibold text-(--text-title)">Campaign carousel</h1>
                <p className="type-body-default text-(--text-body)">
                    The creator&rsquo;s promo strip, at the channel column&rsquo;s 612 width.
                </p>
            </header>

            <div className="flex gap-3">
                <Button variant={both ? 'accent' : 'secondary'} onClick={() => setBoth(true)}>
                    Two campaigns
                </Button>
                <Button variant={both ? 'secondary' : 'accent'} onClick={() => setBoth(false)}>
                    One campaign
                </Button>
            </div>

            {(['ltr', 'rtl'] as const).map(dir => (
                <section key={dir} className="flex flex-col gap-3">
                    <h2 className="type-dense-strong text-(--text-subtitle)">
                        {dir.toUpperCase()}
                    </h2>
                    {/* `dir` on a wrapper is what `<html dir>` does for a real `ar` document, and
                        the carousel reads the direction from layout rather than from a prop. */}
                    <div dir={dir} className="w-full max-w-[612px]">
                        <CardCarousel
                            label="Campaigns"
                            slideLabel={(index, count) => `Campaign ${index} of ${count}`}
                        >
                            <GrowYourFansBanner />
                            {/* Dropped, not merely inactive: the strip counts its live campaigns
                                and passes only those, so a card that renders `null` never becomes
                                an empty slide. See `channel-campaign-banners.tsx`. */}
                            {both ? <AffiliateBanner onPress={() => {}} /> : null}
                        </CardCarousel>
                    </div>
                </section>
            ))}
        </main>
    )
}
