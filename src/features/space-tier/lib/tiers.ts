import type { SpaceTierState } from '../api/types'

/**
 * The badge for a tier, falling back to tier 0's — legacy's `getSpaceTierBadge`, which does the same
 * so a tier the image map does not know still draws *something* in the carousel.
 *
 * Deliberately **not** `@shared/lib/space-tier`'s `spaceTierBadge`: that one answers "may this
 * channel's name wear a badge", where tier 0 means *no*. Here every tier is a slide, tier 0 included,
 * and drawing its art is the point.
 */
export function tierBadgeSrc(images: SpaceTierState['images'], tier: number): string | null {
    return images[tier] ?? images[0] ?? null
}

/**
 * The FAQ, in legacy's order (`constant/index.js`'s `SPACE_TIER_FAQ`). Keys rather than strings so
 * all nine locales carry them; legacy's English answers were fallbacks in code and never reached a
 * locale file.
 */
export const SPACE_TIER_FAQ = [
    { id: 'who-sets', question: 'space_tier_faq_who_sets_q', answer: 'space_tier_faq_who_sets_a' },
    { id: 'premium', question: 'space_tier_faq_premium_q', answer: 'space_tier_faq_premium_a' },
    { id: 'reach', question: 'space_tier_faq_reach_q', answer: 'space_tier_faq_reach_a' },
    { id: 'estimate', question: 'space_tier_faq_estimate_q', answer: 'space_tier_faq_estimate_a' },
    {
        id: 'why-raise',
        question: 'space_tier_faq_why_raise_q',
        answer: 'space_tier_faq_why_raise_a',
    },
    { id: 'paid', question: 'space_tier_faq_paid_q', answer: 'space_tier_faq_paid_a' },
] as const
