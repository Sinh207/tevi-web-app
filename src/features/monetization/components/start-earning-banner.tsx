'use client'

import { PromoCard } from '@shared/components/promo-card'
import { useTranslation } from '@shared/i18n/use-translation'
import { MONETIZATION_ART } from '../lib/illustrations'

/**
 * "Start earning with Tevi" — the card the hub shows a creator who has not earned anything yet.
 *
 * ## It appears and disappears, and that is legacy's rule rather than a guess
 *
 * `Content/index.js` renders it behind `{!hasData && <Banner />}`, where `hasData` is
 * `!isLoading && incomeUsd > 0`. So it is a **prompt, not a masthead**: it is there for a creator who
 * has earned nothing and gone the moment a first payment lands, which is why it says what the screen
 * is *for* rather than repeating the title above it. `MonetizationView` owns that condition — and
 * tightens it, because legacy cannot tell a zero from a failed request.
 *
 * ## `PromoCard`, not a fourth hand-rolled copy of the same card
 *
 * Legacy writes this shape four times inline with the same `sx` block: the login banner, the Premium
 * banner, the Lucky Wheel banner and this one. Three of those are already `PromoCard` callers, and
 * that component's own doc makes the argument — *"they differ only in their text, their art and where
 * the button goes. So it is one component, and the three callers are data."* This is the fourth.
 *
 * Three things come free with it, and each one had to be got right by hand otherwise:
 *
 * - **Type.** Legacy sets 18/700 and 12/400 by hand. The DS has no 18/700 — its 25 styles are the
 *   whole vocabulary and `CLAUDE.md` forbids setting `font-weight` — so `PromoCard` resolves it to
 *   `type-subheading-strong` + `type-caption-meta` once, for every caller.
 * - **Theme.** Legacy paints `#ffffff` / `#1A1A1A` / `#666666`, which is a light-mode-only card in an
 *   app with a dark mode.
 * - **RTL.** The mark is pinned with the logical `end-0`, and it is `aria-hidden` with an empty
 *   `alt` — a flourish that carries nothing the copy does not.
 *
 * ## The 70% cap is passed in, and it is not optional here
 *
 * `PromoCard` layers the text *above* the art rather than capping it, so a long title runs over the
 * mark instead of wrapping into a narrow column — the right default for the end rail, where the card
 * is ~300px wide and every body is a short line. This body is a full sentence in nine locales, and
 * without the cap it runs straight through the coin mark and is unreadable at the end of the line.
 *
 * So the cap comes back as legacy has it, applied to the `body` node rather than by widening
 * `PromoCard` with a prop for one caller: `body` is a `ReactNode`, and a `block max-w-[70%]` span
 * inside its paragraph resolves against the card's own width. The title is short enough in every
 * locale to be left alone.
 */
export function StartEarningBanner({ className }: { className?: string }) {
    const { t } = useTranslation()

    return (
        <PromoCard
            data-testid="monetization-banner"
            className={className}
            title={t('monetization_banner_title')}
            body={<span className="block max-w-[70%]">{t('monetization_banner_body')}</span>}
            art={MONETIZATION_ART.banner}
        />
    )
}
