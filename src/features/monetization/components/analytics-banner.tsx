'use client'

import { DASHBOARD_ANALYTICS_PATH } from '@features/analytics/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { BRAND_NOTICE } from '../lib/container'

/**
 * The cross-sell to `/dashboard-analytics` — legacy's `analyticsBanner`.
 *
 * ## It has a real destination, which is the only reason it is here
 *
 * Legacy renders it on `/monetization/pay-per-post`, a screen this app has not ported. The banner
 * came over anyway because **the thing it advertises exists**: `/dashboard-analytics` is built
 * (`features/analytics`), so this is a link to a screen rather than the "visibly not ready" row
 * `shared/components/action-rows.tsx` argues for. It is exported from the feature barrel so
 * pay-per-post takes it unchanged when that screen lands.
 *
 * ## The date range travels with the reader
 *
 * Legacy hands the analytics screen the range the pay-per-post table is currently filtered to
 * (`?start_date_ts=&end_date_ts=`), so pressing it continues the question rather than restarting it.
 * `/dashboard-analytics` reads exactly those two params — its `routes.ts` records that the mobile
 * apps deep-link with them — so the prop is kept for the caller that has a range. A caller with none
 * (the membership dashboard) passes nothing and the analytics screen opens on its own default
 * period, which is the honest behaviour: inventing a range here would be answering a question the
 * reader did not ask.
 *
 * ## Tinted, outlined, brand-inked — measured, not copied
 *
 * Legacy paints `#F9F7FD` inside `#DCD1F2` with `#7349CD` ink, all hard-coded, i.e. a light-only
 * block in an app with a dark theme. The Primary ramp **inverts between modes**, so `--primary-50`
 * and `--primary-300` give a pale lilac card on a light page and a deep aubergine one on a dark page
 * from one pair of tokens — the same call `MembershipTierCard` makes, so the two blocks on that
 * screen are visibly the same kind of object.
 *
 * ## The sentence is `--text-title` and only the **mark** is brand-inked — measured
 *
 * Legacy inks the whole banner `#7349CD`, and the brand ink on the brand tint was the first cut here
 * too. It measures **8.43** in Light and **3.88** in Dark — under 4.5, i.e. exactly the failure
 * `docs/DESIGN_SYSTEM.md` §6b records for coloured ink on a tinted ground, and invisible in any
 * light-mode screenshot.
 *
 * So the split that section prescribes: **a tinted block takes `--text-title`** (17–18:1 at both
 * ends, the pair `TwoStepVerificationDialog`'s reset note and `PayoutConfirmDialog`'s ETA strip
 * already use), and the accent ink is **for the mark** — the glyph is a graphic, which needs 3:1, and
 * 3.88 clears that comfortably while keeping the promo's brand identity.
 *
 * The ground itself is still the brand pair, and that part *does* survive the mode: the Primary ramp
 * inverts, so `--primary-50` / `--primary-300` give lilac-on-light and aubergine-on-dark from one
 * pair of tokens.
 *
 * Being tinted **and** outlined is also what lets it sit on a surface-painted screen without a card
 * of its own — §6's rule for which blocks carry their own edges.
 */
export function AnalyticsBanner({
    /** Epoch **milliseconds**, both or neither — legacy's own params. */
    range,
    className,
}: {
    range?: { startMs: number; endMs: number }
    className?: string
}) {
    const { t } = useTranslation()

    const href = range
        ? `${DASHBOARD_ANALYTICS_PATH}?start_date_ts=${range.startMs}&end_date_ts=${range.endMs}`
        : DASHBOARD_ANALYTICS_PATH

    return (
        <div
            data-testid="monetization-analytics-banner"
            className={cn(
                'flex flex-none items-center gap-2 px-3 py-2',
                // The tint pair, shared with the setup form's fee notice — see `BRAND_NOTICE`.
                BRAND_NOTICE,
                className,
            )}
        >
            {/*
             * Decorative — the sentence beside it says what this is.
             *
             * ⚠ **The DS ships no pie chart.** Legacy draws MUI's `PieChartOutlineRounded`, and the
             * sprite's whole chart family is `chart`, `chart-column-alt` and the two line variants —
             * no pie, no donut. `chart` is the nearest reading of "analytics" and a banner is not the
             * case `CLAUDE.md` allows the Zappicon overlay for: that is for a screen that *genuinely
             * cannot work* without the glyph (a two-state toggle), and this one works fine.
             *
             * There is also no outline to pick: `chart` is one of the 65 bare ids that `<use>`-alias
             * onto `--filled`, so the weight is decided for us. Flagged for Brand rather than
             * hand-drawn.
             */}
            <Icon name="chart" size={24} className="flex-none text-(--text-brand)" aria-hidden />
            <p className="type-dense-emphasis m-0 min-w-0 flex-1 text-(--text-title)">
                {t('monetization_analytics_banner')}
            </p>
            <Button
                data-testid="monetization-analytics-banner-cta"
                variant="accent"
                size="small"
                className="flex-none"
                render={<Link href={href} />}
            >
                {t('monetization_analytics_banner_cta')}
            </Button>
        </div>
    )
}
