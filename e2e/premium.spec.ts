import { expect, test } from '@playwright/test'
import { signedIn } from './fixtures/session'

/**
 * `/premium` — the claims only a browser can check, and this screen's set is the **inverse** of
 * every other account screen's.
 *
 * `space-visibility.spec.ts` and `redeem-gift-code.spec.ts` both assert `noindex`. This page is the
 * one account-adjacent screen in the app that is deliberately `index, follow`: it is marketing, it
 * is in the sitemap at priority 0.9, and legacy sets the same. So the assertion here is that it
 * *stays* indexable — and that a crawler receives the page's subject in the first response, since
 * three of its four sections need a bearer this app has none of server-side.
 *
 * Both directions fail silently. A `noindex` that appeared would drop the page out of search with
 * nothing on screen to show it; a title that stopped being server-rendered would look identical in
 * the app and reach Google as an empty document.
 *
 * ## What is deliberately not here
 *
 * **The Subscribe gate.** "Gate the action, never the route" is real here (`useSubscribePremium`
 * composes `useRequireAuth`), but it cannot be reached from a spec: the price list is gated on a
 * session, so a visitor without one has no card to press, and a visitor *with* one is not gated. The
 * gate is pinned in `use-subscribe-premium.test.tsx`, which can hold the two states apart.
 *
 * **The checkout.** It is a hosted redirect to Stripe. `features/payment` owns it and no spec should
 * be one press away from a real payment page.
 */

const PATH = '/premium'

/** Two packages and two benefits are enough to prove the sections render from the payload. */
const PACKAGES = {
    packages: [
        { id: 2, product_id: 'price_month', price: '9.99', duration_days: 30 },
        { id: 3, product_id: 'price_year', price: '89.99', duration_days: 365 },
    ],
}

const BENEFITS = {
    benefits: [
        {
            slug: 'fast-payout',
            name: 'Fast Payout',
            description: 'Access your money 4 times faster than regular accounts',
            icon: null,
            banner: null,
            details: [],
        },
        {
            slug: 'no-ads',
            name: 'No Ads',
            description: 'Ad-free so you can immerse in your favorite content without interruption',
            icon: null,
            banner: null,
            details: [],
        },
    ],
}

test.describe('premium — the crawler’s view', () => {
    /**
     * `index, follow` in the **first response**. The absence of a `robots` meta would also be
     * indexable, so this asserts the tag is there *and* says so: Next emits it from
     * `generateMetadata`, and a future `robots.ts` rule or a copied `noindex` is exactly the sort of
     * change that would pass every other check in the repo.
     */
    test('answers 200 and asks to be indexed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /index/)
        await expect(robots).toHaveAttribute('content', /follow/)
        await expect(robots).not.toHaveAttribute('content', /noindex/)
    })

    /**
     * The title, the description and the page's own subject, in the raw HTML.
     *
     * Every section below the bar is a client component — three of them are reads as this bearer,
     * and there is no SSR bearer in this app by construction — so what a crawler gets is exactly
     * what a client component renders on the server: the bar's `<h1>`, the hero heading and the
     * pitch. Asserted against the response body rather than the DOM, which would pass either way
     * once React had run.
     */
    test('server-renders its title and its pitch', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('<title>Tevi Premium')
        expect(html).toContain('Get faster payouts, extra spins and ad-free perks')
        // The bar's h1 and the hero's h2 both say it — a crawler needs at least one.
        expect(html).toContain('Tevi Premium')
        expect(html).toContain('and unlock')
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })
})

test.describe('premium — the offer', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, {
            'premium/v1/packages/': PACKAGES,
            'premium/v1/benefits/': BENEFITS,
            'premium/v1/user/info/': { is_premium: false, expires_at: null },
            'core/v3/channel/my-channel/': {
                id: 'ch1',
                slug: 'e2e_creator',
                name: 'E2E Creator',
                is_premium: false,
                privacy: 'published',
            },
        })
    })

    /**
     * A cadence the catalogue did not offer renders **nothing** — not a disabled card. Two packages
     * in, two cards out, and the weekly slot simply closes up.
     */
    test('draws a card per package the catalogue offers, and no more', async ({ page }) => {
        await page.goto(PATH)

        const cards = page.locator('main [data-testid="premium-plan"]')
        await expect(cards).toHaveCount(2)
        await expect(page.locator('[data-option-key="annual"]').first()).toBeVisible()
        await expect(page.locator('[data-option-key="monthly"]').first()).toBeVisible()
        await expect(page.locator('[data-option-key="weekly"]')).toHaveCount(0)
    })

    /**
     * The discount is a **claim about money** this client computes: 12 × 9.99 = 119.88 against
     * 89.99. `savingsPercent` is unit-tested, but only a browser proves the figure the arithmetic
     * produces is the figure on the card — and that the struck-through comparison is beside it.
     */
    test('prints the annual saving it computed, against the year it computed', async ({ page }) => {
        await page.goto(PATH)

        const annual = page.locator('[data-option-key="annual"]').first()
        await expect(annual).toContainText('25%')
        await expect(annual.locator('s')).toHaveText('$119.88')
        // The headline is the year divided by twelve, not the year.
        await expect(annual).toContainText('$7.50')
    })

    /**
     * The detail carousel opens **on the row pressed**, which is the whole reason `initialIndex`
     * exists — landing on the first perk is a different screen from the one the reader asked for.
     */
    test('opens the benefit carousel on the benefit pressed', async ({ page }) => {
        await page.goto(PATH)

        await page.locator('[data-testid="premium-benefit-row"]').nth(1).click()

        const dialog = page.locator('[data-testid="premium-benefit-dialog"]')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('No Ads')
        // The second of two dots is the current one.
        await expect(page.locator('[data-testid="premium-benefit-dot"]').nth(1)).toHaveAttribute(
            'aria-current',
            'true',
        )
    })
})
