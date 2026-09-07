import type { PremiumBenefit, PremiumPackage } from './api/types'

export type { PremiumBenefit, PremiumPackage } from './api/types'
/**
 * Internals and fixtures for the `/dev/premium` harness, and for nothing else.
 *
 * Same convention, and the same reason, as `features/gift-code/dev.ts`: the states worth previewing
 * are the ones no URL can reach. Three of them here —
 *
 * - **the member state.** The hero's thank-you, its gold heading, its sparkle backdrop and the
 *   absent plan grid are all behind `isPremium`, which comes from the reader's *real* channel. A
 *   developer without a subscription cannot see any of it, and buying one to look at a gradient is
 *   not a workflow.
 * - **the benefit carousel.** Its slides are backoffice content, so which perks exist and which of
 *   them is the comparison table is not something a developer controls. The fixtures below include
 *   one of each shape, and the two failure shapes the payload can take (no art, no readable
 *   comparison rows) that would otherwise only be seen the day the backoffice ships them.
 * - **the price grid's own three states.** Loading, empty and priced. Two of the three need the
 *   catalogue to be in a state it will not be in on demand.
 *
 * Kept out of `index.ts` so nothing in production imports a fixture. Nothing here is reachable from
 * the app.
 */
export { PremiumBenefitDialog } from './components/premium-benefit-dialog'
export { PremiumBenefitsSkeleton } from './components/premium-benefits'
export { PremiumAnnualCard, PremiumPlanCard } from './components/premium-plan-card'
export { PremiumPlansSkeleton } from './components/premium-plans'
export { groupPlans, PLAN_ORDER, savingsPercent } from './lib/plans'
/** The hero's ramp: the gold frame is unreadable on a white page, so the harness draws it on this. */
export { PREMIUM_HERO_RAMP } from './lib/premium-surface'

/**
 * A catalogue — **the real one**, from a captured `v1/packages/?platform=web`.
 *
 * `$2.49 / $9.99 / $77.92` are the prices in production, and they are what the annual card's
 * discount is drawn against: twelve months at 9.99 is 119.88, so the annual plan saves 35% — the
 * figure the card prints. Real numbers rather than round ones, so the formatter's decimals are
 * visible in the harness, and `product_id` is a real Stripe **Price** id so the shape of the field
 * is honest even though nothing here can be pressed.
 */
export const DEV_PACKAGES: PremiumPackage[] = [
    {
        id: '13',
        product_id: 'price_1ShSGWBfiRzT30LKShHPLXpx',
        price: 2.49,
        currency: 'USD',
        duration_days: 7,
        is_active: true,
        sort_order: 0,
    },
    {
        id: '5',
        product_id: 'price_1ShshtBfiRzT30LKKd7mmS8l',
        price: 9.99,
        currency: 'USD',
        duration_days: 30,
        is_active: true,
        sort_order: 0,
    },
    {
        id: '6',
        product_id: 'price_1ShshtBfiRzT30LKGwUH7unh',
        price: 77.92,
        currency: 'USD',
        duration_days: 365,
        is_active: true,
        sort_order: 0,
    },
]

/**
 * Five benefits, four of them shaped like the real payload's and one that only a harness can show.
 *
 * The English strings are the **API's own**, copied from a captured `v1/benefits/` — which is what
 * makes this fixture double as a check on the reverse-lookup localiser (`lib/benefit-copy.ts`):
 * switch the language in the harness and the rows should follow. Two of the real payload's thirteen
 * do **not** follow, and they are here on purpose:
 *
 * - `Free for React/Reply & Follow` — the bundle has "Free for React & Reply", the sentence the
 *   backoffice edited it *from*. It reads in English, which is the mechanism's designed floor.
 *
 * `icon` and `banner` are `null` throughout: the real ones are on `tevi-cdn.tevi.dev`, and a harness
 * that reaches a CDN fails on a train. The one thing that costs is the *list's* icon column, whose
 * absent state is itself worth previewing (see `reserveIcon`).
 */
export const DEV_BENEFITS: PremiumBenefit[] = [
    {
        slug: 'lucky-wheel-spins',
        name: 'Get more Lucky wheel spins',
        description: 'Get 5 more spins in Lucky wheel everyday',
        is_active: true,
        sort_order: 1,
        icon: null,
        banner: null,
        tag: '+5',
        details: [],
    },
    /**
     * **Two** comparison tables exist in the real payload, and this is the one legacy never shows:
     * it branches its detail slide on `slug === 'star-purchase-bonus'`, so these three rows have
     * always been invisible. Here — and on the screen — the table is drawn for whatever carries
     * readable rows.
     */
    {
        slug: 'enhanced-storage-upload',
        name: 'Enhanced Storage & Upload',
        description: 'Upgrade to Tevi Premium for longer uploads',
        is_active: true,
        sort_order: 4,
        icon: null,
        banner: null,
        tag: null,
        details: [
            {
                slug: 'video-length',
                title: 'Video Length',
                free_value: '1 minutes',
                prem_value: '30 minutes',
                metadata: { free: 1.5, prem: 30 },
                sort_order: 1,
            },
            {
                slug: 'file-upload-size',
                title: 'File Upload Size',
                free_value: '500 MB',
                prem_value: '5 GB',
                metadata: { free: 500, prem: 5000 },
                sort_order: 2,
            },
            {
                slug: 'video-quality',
                title: 'Video Quality',
                free_value: '1080p 30fps',
                prem_value: '2K 60fps',
                metadata: { free: 1080, prem: 2000 },
                sort_order: 3,
            },
        ],
    },
    /** The other one — and its `banner` is `""` on the wire, so it is a table with no picture. */
    {
        slug: 'star-purchase-bonus',
        name: 'Star Purchase Bonus',
        description: 'Extra Stars when you purchase Star packs',
        is_active: true,
        sort_order: 9,
        icon: null,
        banner: null,
        tag: null,
        details: [
            {
                slug: 'purchase-bonus',
                title: 'Purchase Bonus',
                free_value: '0% bonus',
                prem_value: '10% bonus',
                metadata: { free: 0, prem: 0.1 },
                sort_order: 1,
            },
        ],
    },
    {
        slug: 'no-ads',
        name: 'No Ads',
        description: 'Ad-free so you can immerse in your favorite content without interruption',
        is_active: true,
        sort_order: 12,
        icon: null,
        banner: null,
        tag: null,
        details: [],
    },
    /** A perk the bundle has no copy for — it must read in English rather than disappear. */
    {
        slug: 'brand-new-perk',
        name: 'A perk that shipped this morning',
        description: 'Written in the backoffice after this build went out',
        is_active: true,
        sort_order: 99,
        icon: null,
        banner: null,
        tag: null,
        details: [],
    },
]
