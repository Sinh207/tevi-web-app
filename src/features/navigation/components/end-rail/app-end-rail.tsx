'use client'

import { AffiliateEntry } from '@features/affiliate'
import { GrowYourFansBanner, LuckyWheelBanner } from '@features/campaign'
import { useRailVisible } from '@shared/hooks/use-rail-visible'
import { useTranslation } from '@shared/i18n/use-translation'
import { EndRailPill } from './end-rail-pill'
import { LoginBanner } from './login-banner'
import { PremiumBanner } from './premium-banner'

/**
 * The desktop **end rail** — legacy's `components/layouts/common/trending`.
 *
 * The name is the one thing not carried over. Nothing in it trends: it is the account pill
 * (Star balance · Get App · avatar) over a stack of promo cards, and legacy's own grep
 * confirms there is no trending endpoint anywhere in that app. `AppSide` is the start rail,
 * this is the end rail, and the pair reads correctly in both directions of text.
 *
 * ## Geometry, and why there is a width gate
 *
 * `--end-rail-anchor` (646) is `half the 612 content column + a 22 gutter + the 318 rail`, so
 * pinning the outer edge at `calc(50vw - anchor)` puts the column exactly beside a
 * window-centred page — see the token's own note in `globals.css`.
 *
 * That arithmetic only has a solution when the window is at least **twice** the anchor, and
 * legacy never checks: below 1292 its `right: calc(50vw - 646px)` goes negative and the rail
 * slides off the viewport, taking a horizontal scrollbar with it on every page. Hence
 * `min-[1292px]:flex`. The number is `2 × 646` and nothing else, which is why it is written
 * as a gate on the same geometry rather than rounded to a breakpoint — `xl` (1440) would
 * throw away 150px of windows that fit, and `lg` (1040) is the broken case itself.
 *
 * `fixed`, so it is out of flow and cannot shift the page's centring. `TabBarShell` already
 * reserves `--rail-width` on this edge for exactly that reason, and this rail leaves that
 * arrangement untouched.
 *
 * `z-30` puts it over a page's own sticky bars (`z-20`) and under both the start rail
 * (`z-40`) and the account drawer (`z-60`), which slides across from the other side.
 *
 * ## Where it is mounted
 *
 * `(main)/(rail)/layout.tsx` — a route group holding every screen whose content column is **612**:
 * home, a channel, my space, the wallet screens, settings, identification. The six wide documents
 * (the policies, community guidelines, moderation, brand assets) sit outside it, because the
 * anchor above assumes 612 and `LEGAL_CONTAINER` is 1080 / `BRAND_CONTAINER` is 900 — the rail
 * would land on top of the text at any window between the 1292 gate and roughly 1760.
 *
 * Legacy answers the same question with a seven-entry pathname blocklist evaluated on every render
 * (`HIDE_TRENDING_ROUTES`). This is that rule as a directory: nothing inspects a pathname, and a
 * new route's answer is settled by where its file goes — the way every other piece of chrome in
 * this app is settled. `(rail)/layout.tsx` states the rule for whoever adds the next route.
 *
 */
export function AppEndRail() {
    const { t } = useTranslation()
    /*
     * Not a second copy of the `min-[1292px]:` gate below — that one is layout, this one is work.
     * The rail stays mounted on a phone (CSS hides it, it is not unmounted), so without this the
     * three campaign cards would run `useCampaigns` and fetch `dapp-campaign` on every mobile
     * visit, for a column that viewport can never show. See `shared/hooks/use-rail-visible.ts`.
     */
    const showCampaigns = useRailVisible()

    /*
     * A complementary landmark, and its name has to cover everything inside it: the pill carries
     * the Star balance, Get App and the account avatar, so "Promotions" — which this said at first
     * — would send anyone navigating by landmark straight past the account controls.
     */
    return (
        <aside
            aria-label={t('rail_landmark')}
            className={[
                'fixed top-0 z-30 hidden flex-col gap-3 py-3',
                /*
                 * The underscores are Tailwind's escape for spaces in an arbitrary value, and
                 * they are load-bearing: `calc()` requires whitespace around `-`, so
                 * `calc(50vw-var(…))` is invalid CSS. The declaration is then dropped, the
                 * `fixed` box keeps its static position, and the rail renders flush against
                 * the left nav instead of beside the content column — which is exactly what
                 * it did before this comment existed.
                 */
                'w-(--end-rail-width) end-[calc(50vw_-_var(--end-rail-anchor))]',
                'min-[1292px]:flex print:hidden',
            ].join(' ')}
        >
            {/* The pill hugs its content and sits at the inline-start edge of the column,
                matching legacy's `width: fit-content` inside a 318 stack. */}
            <EndRailPill />

            {/*
             * Legacy's order, kept: sign-in prompt, Premium, then the three campaigns. Each card
             * decides for itself whether it renders — a guest sees only the first, a Premium
             * creator never sees the second, and a campaign that is not running returns null — so
             * the stack collapses to whatever is true rather than reserving space for what is not.
             */}
            <div className="flex flex-col gap-3 py-6">
                <LoginBanner />
                <PremiumBanner />
                {showCampaigns && (
                    <>
                        <LuckyWheelBanner />
                        <GrowYourFansBanner />
                        {/* The card plus its dialog — see `AffiliateEntry` for why the pair is
                            composed there and not here. */}
                        <AffiliateEntry />
                    </>
                )}
            </div>
        </aside>
    )
}
