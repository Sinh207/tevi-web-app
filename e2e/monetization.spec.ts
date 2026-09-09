import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * `/monetization` — the creator's hub, and the four claims about it that **only** a browser can check.
 *
 * The screen is a port of legacy's `containers/monetization/monetizationHub`. It owns no endpoint of
 * its own, which is what makes it worth a spec: the figures are assembled from three other features'
 * queries, and every way that assembly can go wrong is silent. A stats call keyed on the wrong slug
 * shows `—`; a conversion applied twice shows a plausible number; a method row that quietly gained an
 * `href` shows a link to a 404.
 *
 * ## What is deliberately not here
 *
 * The formatting itself (`money.test.ts`), the methods table (`lib/methods.test.ts`) and the art
 * (`lib/illustrations.test.ts`) are pinned in Vitest, where they belong. `/dev/*` 404s in a production
 * build, so nothing there is reachable from a spec.
 *
 * Locators are `data-testid` or `main`-scoped roles, never visible text: nine locales make a text
 * locator nine locators, and the account drawer is mounted `inert` on every route, so an unscoped role
 * query finds its eleven picker radios too (`e2e/README.md`).
 */

const HUB = '/monetization'

/** `channelApi` is built on `${W_API}/core`, and the stats call is a different microservice. */
const CHANNEL = 'core/v3/channel/my-channel/'
const STATS = 'analytics/v2/channel/e2e/stats/'

const MY_CHANNEL = { id: 'ch-1', slug: 'e2e', is_premium: false }

/** `income_usd` is what the whole screen turns on — the banner appears below it and vanishes above. */
function stats(incomeUsd: string) {
    return { follower_count: 12, member_count: 3, post_count: 40, income_usd: incomeUsd }
}

test.describe('monetization — what a crawler receives', () => {
    test('answers 200 and asks not to be indexed', async ({ page }) => {
        const response = await page.goto(HUB)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(HUB)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/monetization$/)
    })
})

test.describe('monetization — the action is gated, never the route', () => {
    /**
     * A guest gets the screen and a **Sign in** control, not a bounce to `/login`. This URL is in the
     * account drawer and can arrive in a link; a redirect would throw away whatever they were reading.
     */
    test('a guest sees the wall and stays on the route', async ({ page }) => {
        await asGuest(page)
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-signed-out')).toBeVisible()
        await expect(page.getByTestId('monetization-sign-in')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(HUB)
    })
})

test.describe('monetization — the figures', () => {
    /**
     * Both figures are held in USD and shown in the reader's currency. The fixture's rate is
     * 25,400 ₫/$ and the balance is `4400.03` TEVI, so the wallet figure is fixed by arithmetic
     * rather than by whatever the screen happens to render — which is the only version of this
     * assertion that would catch a conversion applied twice.
     */
    test('renders revenue and balance, converted once', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        // USD is the default currency, so both read in dollars until the reader switches.
        await expect(page.getByTestId('monetization-revenue-value')).toHaveText('$1,200.50')
        await expect(page.getByTestId('monetization-balance-value')).toHaveText('$4,400.03')
    })

    /** The one destination on this screen that exists today. */
    test('Withdraw goes to the payout request form', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-withdraw')).toHaveAttribute(
            'href',
            '/my-wallet/payout-request',
        )
    })

    /**
     * `hasData` is legacy's `!isLoading && incomeUsd > 0`, and it is the only state on the screen.
     * Both directions are asserted because the failure modes are opposite: a banner that never shows
     * loses the prompt for every new creator, and one that always shows tells an earning creator to
     * start earning.
     */
    test('the start-earning banner shows at zero revenue', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('0') })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-revenue-value')).toHaveText('$0.00')
        await expect(page.getByTestId('monetization-banner')).toBeVisible()
    })

    test('…and is gone once something has been earned', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-revenue-value')).toHaveText('$1,200.50')
        await expect(page.getByTestId('monetization-banner')).toHaveCount(0)
    })
})

test.describe('monetization — a failed revenue read', () => {
    /**
     * The divergence from legacy, and the reason for it. `getChannelStats` there swallows a failure
     * and leaves `incomeUsd` at its initial `0`, so a 502 is indistinguishable from "you have earned
     * nothing" — an earning creator is shown a `$0` figure under a card telling them to *start*
     * earning, and no part of the screen says a request failed.
     *
     * Omitting the stats handler makes the fixture answer 599, which the client surfaces as an error
     * without retrying it (see `fixtures/session.ts`). All three assertions matter: the figure is a
     * dash rather than a fabricated zero, the prompt is **not** shown, and there is a way to ask
     * again.
     */
    test('shows a retry strip and no start-earning prompt', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-revenue-retry')).toBeVisible()
        await expect(page.getByTestId('monetization-revenue-value')).toHaveText('—')
        await expect(page.getByTestId('monetization-banner')).toHaveCount(0)
    })

    /** The rest of the screen is still true, so it stays readable behind the strip. */
    test('leaves the balance and the method list alone', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-revenue-retry')).toBeVisible()
        await expect(page.getByTestId('monetization-balance-value')).toHaveText('$4,400.03')
        await expect(page.getByTestId('monetization-methods-row')).toHaveCount(4)
    })
})

test.describe('monetization — the methods', () => {
    /**
     * Four rows, and **none of them a link**. This is the assertion that matters most on this screen:
     * `/monetization/{membership,donation,pay-per-post,interaction}` do not exist, so a row that
     * gained an `href` before its screen landed would be a navigation to a 404 — and nothing about
     * the rendered page would say so. `ActionRows` renders an inert row as a disabled `button`; when
     * a screen lands, its row becomes an anchor and this test is the thing that notices.
     */
    test('lists four methods, and only the built ones are links', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        const rows = page.getByTestId('monetization-methods-row')
        await expect(rows).toHaveCount(4)

        /*
         * Scoped to `main`: the account drawer is mounted `inert` on every route and its own section
         * headings carry `data-row-key` too, so an unscoped query is ambiguous.
         */
        const row = (key: string) => page.locator('main').locator(`[data-row-key="${key}"]`)

        // The screens that have landed are real anchors, at legacy's addresses.
        await expect(row('membership')).toHaveAttribute('href', '/monetization/membership')
        await expect(row('donation')).toHaveAttribute('href', '/monetization/donation')

        /*
         * The remaining two are the assertion that matters. Their screens do not exist, so a row that
         * gained an `href` early would be a navigation to a 404 — and nothing about the rendered page
         * would say so. `ActionRows` renders an inert row as a disabled `button`; each one becomes an
         * anchor as its screen lands, and this test is what notices.
         *
         * It has now failed that way twice on purpose — once when `/monetization/membership` shipped
         * and again when `/monetization/donation` did — which is the whole point of it. Move a key
         * from the loop to the pair above when its screen lands; do not relax the loop.
         */
        for (const key of ['pay-per-post', 'interaction']) {
            await expect(row(key)).toBeDisabled()
            // A `button`, not an anchor — the same statement as "it has no destination", made
            // against the element rather than against a missing attribute.
            expect(await row(key).evaluate(node => node.tagName)).toBe('BUTTON')
        }
    })
})

test.describe('monetization — the revenue explainer', () => {
    /**
     * The four sentences behind the `?` are the only place the screen says its headline figure is an
     * **estimate** before deductions. A creator who does not read them reads a payout as short, which
     * is the same argument `/my-wallet`'s balance help makes.
     *
     * The caption is the control, not just the glyph — a 16px target beside a sentence is not a
     * control, and this asserts the whole line is pressable.
     */
    test('the caption opens the explainer', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        await expect(page.getByTestId('monetization-revenue-info')).toHaveCount(0)
        await page.getByTestId('monetization-revenue-explain').click()
        await expect(page.getByTestId('monetization-revenue-info')).toBeVisible()
        await expect(page.getByTestId('monetization-revenue-info').getByRole('listitem')).toHaveCount(
            4,
        )
    })

    /**
     * The one link in the dialog, and the only assertion that catches it silently disappearing —
     * `Trans` renders the sentence with the `<0>` tag stripped when the tag has no component, so a
     * broken wiring reads as ordinary prose rather than as an error.
     *
     * ⚠ `/feedback` is **not ported yet**, so this link 404s today. The `href` is asserted rather
     * than followed for exactly that reason: the contract is where it points, and the day the screen
     * lands this test already covers it.
     */
    test('the contact link points at /feedback', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [STATS]: stats('1200.5') })
        await page.goto(HUB)

        await page.getByTestId('monetization-revenue-explain').click()
        await expect(page.getByTestId('monetization-revenue-info-contact')).toHaveAttribute(
            'href',
            '/feedback',
        )
    })
})
