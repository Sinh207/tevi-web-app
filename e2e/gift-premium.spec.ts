import { expect, test } from '@playwright/test'
import { signedIn } from './fixtures/session'

/**
 * `/gift-premium` — the three-step flow, and the two claims about it that only a browser can check.
 *
 * ## Why this screen earns a spec where `/premium` gets only a crawler's view
 *
 * `/premium` is one page whose sections resolve independently, so its interesting assertions are in
 * Vitest. This one is a **machine**: a step derived from two facts, a recipient chosen in one screen
 * and spent in another, and a success state rebuilt from a URL parameter after the browser has been
 * to Stripe and back. Three of those cannot be stated anywhere but in a real page:
 *
 * - the picker's two lists come from **two different services** and either may be empty;
 * - the step survives a **navigation** (`?gift_token=`) rather than a state update, which is the one
 *   path where a hydration mismatch or a missing sweep is invisible in a unit test;
 * - the parameter has to be **taken off the URL**, or a reload congratulates the reader again.
 *
 * ## What is deliberately not here
 *
 * **The charge.** Pressing "Yes" creates a real Stripe Checkout session and moves the browser to it.
 * `features/payment` owns that, and no spec should be one press away from a payment page — so the
 * confirmation is opened and read, and cancelled.
 *
 * **The `noindex` assertion's twin.** `/premium` is the app's one deliberately indexable account
 * screen and its spec pins that; this one is the ordinary case, and it is pinned here because the
 * two pages sit in the same feature and a copied `generateMetadata` is exactly how the wrong one
 * would ship.
 */

const PATH = '/gift-premium'

/** 90/180/365 — the gift catalogue's own durations, which are not the subscription's 7/30/365. */
const GIFT_PACKAGES = {
    packages: [
        { id: 11, product_id: 'price_q', price: '24.99', duration_days: 90 },
        { id: 12, product_id: 'price_h', price: '49.99', duration_days: 180 },
        { id: 13, product_id: 'price_y', price: '99.99', duration_days: 365 },
    ],
}

function channel(slug: string, name: string, extra: Record<string, unknown> = {}) {
    return { id: `${slug}-id`, slug, name, images: { thumb: null }, ...extra }
}

/**
 * The picker's two lists.
 *
 * The followed list is **nine** rather than one, and that is what makes the strip's claims testable:
 * a strip that fits its container is indistinguishable from a wrapping grid, so the only fixture
 * that can tell them apart is one that overflows. `ada` is in both payloads, which is the
 * both-sections case.
 */
const FOLLOWED = [
    ['ada', 'Ada Lovelace'],
    ['adam', 'Adam Smith'],
    ['adaline', 'Adaline Kim'],
    ['adan', 'Adan Nguyen'],
    ['adair', 'Adair Chen'],
    ['adalyn', 'Adalyn Tran'],
    ['adar', 'Adar Bui'],
    ['adele', 'Adele Vu'],
    ['adonis', 'Adonis Le'],
].map(([slug, name]) => channel(slug as string, name as string))

const HANDLERS = {
    'premium/v1/gift-packages/': GIFT_PACKAGES,
    'core/v3/channel/followed-channels/': { count: FOLLOWED.length, next: null, results: FOLLOWED },
    'search/v3/channel/': {
        count: 2,
        next: null,
        results: [channel('ada', 'Ada Lovelace'), channel('adam', 'Adam Smith')],
    },
    /*
     * ⚠ `owner_id` is a **number**, which is what the backend sends and what every fixture in this
     * repo used to get wrong. The client read it as text, dropped it, and refused to charge — see
     * `api/gift-types.test.ts`. A string here is a fixture that agrees with the bug.
     */
    'core/v3/channel/channels/': channel('ada', 'Ada Lovelace', { owner_id: 123456 }),
}

test.describe('gift premium — the crawler’s view', () => {
    test('answers 200, asks not to be indexed, and names itself in the first response', async ({
        page,
    }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        // `noindex` and still crawlable: a disallowed URL is one a crawler never fetches, so it
        // never reads the tag either — see the page's own note.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

        /*
         * The title and the invitation come out of the server render, in the reader's language,
         * even though every fetch on this page needs a bearer the server does not have. A screen
         * that stopped server-rendering its copy would look identical in the app.
         */
        const html = (await response?.text()) ?? ''
        expect(html).toContain('Gift Premium')
    })
})

test.describe('gift premium — picking somebody', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, HANDLERS)
    })

    test('opens on the invitation, with no list and nothing chosen', async ({ page }) => {
        await page.goto(PATH)
        // Legacy shows an empty white card here. The invitation is what says the gift goes to
        // *somebody else*, which is not deducible from a search field.
        await expect(page.getByTestId('premium-gift-invite')).toBeVisible()
        await expect(page.getByTestId('premium-gift-results')).toHaveCount(0)
    })

    test('searches, and shows the followed block above the global list', async ({ page }) => {
        await page.goto(PATH)
        await page.getByTestId('premium-gift-search').fill('ada')

        await expect(page.getByTestId('premium-gift-following')).toBeVisible()
        await expect(page.getByTestId('premium-gift-results')).toBeVisible()

        /*
         * `ada` is in **both** payloads and appears in both sections — which is not a duplicate: the
         * two answer different questions, and `/search` does the same. What must not happen is the
         * same row twice *within* one list, which is what `useGiftRecipients` de-duplicates.
         */
        await expect(
            page.locator('[data-testid="premium-gift-following"] [data-channel-slug="ada"]'),
        ).toHaveCount(1)
        await expect(
            page.locator('[data-testid="premium-gift-results"] [data-channel-slug="ada"]'),
        ).toHaveCount(1)
    })

    /**
     * **The Following block is a strip, and it scrolls.**
     *
     * The only claim in this file that a unit test genuinely cannot make: `scrollWidth` is layout,
     * and jsdom has none — every box there is zero-width, so a wrapping grid and an overflowing strip
     * measure identically. Asserted through the DOM rather than by screenshot because what matters is
     * the *behaviour* (there is more content than box, and it can be reached), not the pixels.
     *
     * `overscroll-x-contain` is asserted with it because its absence is the expensive failure: a swipe
     * running off the end of the strip triggers the browser's back navigation, out of a purchase flow,
     * and nothing on the page shows that until it happens on a trackpad.
     */
    test('the Following block is a horizontal strip that can be scrolled', async ({ page }) => {
        await page.goto(PATH)
        await page.getByTestId('premium-gift-search').fill('ada')

        const strip = page.getByTestId('premium-gift-following')
        await expect(strip).toBeVisible()
        // Every followed row is a tile — the strip renders the whole bounded list, it does not page.
        await expect(strip.locator('[data-channel-slug]')).toHaveCount(FOLLOWED.length)

        const metrics = await strip.evaluate(el => ({
            overflows: el.scrollWidth > el.clientWidth + 1,
            overscroll: getComputedStyle(el).overscrollBehaviorX,
        }))
        expect(metrics.overflows).toBe(true)
        expect(metrics.overscroll).toBe('contain')

        // It actually travels, and the last tile is reachable.
        await strip.evaluate(el => {
            el.scrollLeft = el.scrollWidth
        })
        await expect
            .poll(() => strip.evaluate(el => Math.abs(el.scrollLeft) > 1))
            .toBe(true)
        await expect(strip.locator('[data-channel-slug="adonis"]')).toBeInViewport()
    })

    test('choosing somebody moves to the offer, and Back returns without leaving the page', async ({
        page,
    }) => {
        await page.goto(PATH)
        await page.getByTestId('premium-gift-search').fill('ada')
        await page.locator('[data-channel-slug="ada"]').first().click()

        await expect(page.getByTestId('premium-gift-hero')).toBeVisible()
        await expect(page.getByTestId('premium-gift-plans')).toBeVisible()
        // Three durations, and the recommended one is the middle card — `GIFT_PLAN_ORDER`.
        await expect(page.getByTestId('premium-gift-plan')).toHaveCount(3)
        await expect(page.getByTestId('premium-gift-plan').nth(1)).toHaveAttribute(
            'data-option-key',
            'year',
        )

        /*
         * Back here means *un-choose this person*, not *leave*. Legacy gets this right with two
         * different bars; this screen has one bar and the caller decides, which is what this asserts
         * — the URL must not change.
         */
        await page.getByTestId('premium-gift-back').click()
        await expect(page.getByTestId('premium-gift-search')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    test('the confirmation names the recipient, the plan and the price', async ({ page }) => {
        await page.goto(PATH)
        await page.getByTestId('premium-gift-search').fill('ada')
        await page.locator('[data-channel-slug="ada"]').first().click()

        /*
         * Located by `data-option-key`, never by a testid carrying the plan: identity goes in a
         * companion attribute (`docs/TEST_IDS.md`), which is also why a fourth duration would need
         * no new selector here.
         */
        await page
            .locator('[data-testid="premium-gift-plan-submit"][data-option-key="year"]')
            .click()

        const dialog = page.getByTestId('premium-gift-confirm')
        await expect(dialog).toBeVisible()
        // The sentence is what makes the second press meaningful: the money is spent on somebody
        // else's account, so a mis-press cannot be undone by the person who made it.
        await expect(page.getByTestId('premium-gift-confirm-description')).toContainText(
            'Ada Lovelace',
        )

        // Cancelled rather than confirmed — see this file's note on why the charge is out of scope.
        await page.getByTestId('premium-gift-confirm-cancel').click()
        await expect(dialog).toHaveCount(0)
    })
})

test.describe('gift premium — the charge', () => {
    /**
     * **What actually reaches `checkout/`** — the one assertion that would have caught the bug that
     * made *Send gift* do nothing.
     *
     * Everything about this screen can be right and the gift still never happen, because the charge
     * is assembled from three sources: the package (`price_id`), the recipient
     * (`receiver_user_id`, resolved from a *second* endpoint) and this client's own return URL. The
     * defect was in the middle one — `owner_id` arrives as a number, the parser read it as text, and
     * `confirm()` refused rather than charging. Nothing failed: no request 4xx'd, no console error,
     * and the reader got a dialog about not reaching the creator.
     *
     * So the spec now reads the **request body**, and the checkout is answered with a 422 so the
     * browser never leaves for Stripe. `page.route` is registered after `signedIn`, and Playwright
     * matches the most recently registered route first.
     */
    test('posts the price, the resolved receiver and a gift token', async ({ page }) => {
        await signedIn(page, HANDLERS)

        const sent: Record<string, unknown>[] = []
        await page.route('**/checkout/v3/checkout/gift-premium/**', async route => {
            sent.push(route.request().postDataJSON())
            await route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'This user already has Tevi Premium.' }),
            })
        })

        await page.goto(PATH)
        await page.getByTestId('premium-gift-search').fill('ada')
        await page.locator('[data-channel-slug="ada"]').first().click()
        await page
            .locator('[data-testid="premium-gift-plan-submit"][data-option-key="year"]')
            .click()
        await page.getByTestId('premium-gift-confirm-confirm').click()

        await expect.poll(() => sent.length).toBe(1)
        const body = sent[0] as Record<string, string>
        expect(body).toMatchObject({
            payment_method: 'gw.stripe',
            price_id: 'price_y',
            // The number the channel payload carried, normalised to a string. This is the assertion.
            receiver_user_id: '123456',
            // A hosted Stripe Checkout stores the card itself; a second consent here would be one
            // taken on a page that never showed a card field.
            save_payment_info: false,
        })

        /*
         * The token is how the return trip knows who the gift was for — a `null` from the encoder
         * stops the press, so its presence here is the other half of "the charge is complete".
         */
        const success = new URL(body.success_url)
        expect(success.pathname).toBe(PATH)
        expect(success.searchParams.get('gift_token')).toBeTruthy()

        /*
         * ⚠ The return URL's **origin is not the browser's**, and asserting that it is fails here
         * for a correct reason: `checkoutReturnUrl` builds it from `NEXT_PUBLIC_BASE_URL`, on
         * purpose — the URL is handed to a third party and comes back as a navigation, so it has to
         * be the origin this app is configured at rather than whichever host the page happens to be
         * served from (`127.0.0.1:3100` under this runner, a webview host in the app). That helper's
         * own doc is where the open-redirect reasoning lives.
         *
         * What is worth asserting is that the reader **stayed put**: the 422 is handled in place, so
         * a refused gift never leaves the screen it was refused on.
         */
        expect(new URL(page.url()).pathname).toBe(PATH)
    })
})

test.describe('gift premium — coming back from the gateway', () => {
    /**
     * The token this client mints, encoded the way it mints it. Built in the spec rather than
     * imported so the spec is a statement about the **wire format**: a change to the encoding that
     * `gift-token.test.ts` happily round-trips would still break every URL already at Stripe.
     */
    function token(payload: Record<string, unknown>) {
        return Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString('base64')
    }

    test.beforeEach(async ({ page }) => {
        await signedIn(page, HANDLERS)
    })

    test('shows the success screen and sweeps the parameter off the URL', async ({ page }) => {
        const gift = token({ v: 1, s: 'ada', n: 'Ada Lovelace', d: 365, t: Date.now() })
        await page.goto(`${PATH}?gift_token=${encodeURIComponent(gift)}`)

        await expect(page.getByTestId('premium-gift-hero')).toContainText('@ada')
        await expect(page.getByTestId('premium-gift-again')).toBeVisible()

        /*
         * Swept, so a reload is an ordinary arrival rather than a second congratulation — and so the
         * recipient's handle is not left in the address bar for the next screenshot. Legacy sweeps
         * it too; what legacy does not do is expire it.
         */
        await expect
            .poll(() => new URL(page.url()).searchParams.get('gift_token'))
            .toBeNull()
    })

    test('an expired token opens the picker instead of congratulating anybody', async ({ page }) => {
        // A bookmarked success URL. Legacy writes a `timestamp` and never reads it, so its version
        // of this page says "Premium Delivered" forever.
        const stale = token({ v: 1, s: 'ada', d: 365, t: Date.now() - 48 * 60 * 60 * 1000 })
        await page.goto(`${PATH}?gift_token=${encodeURIComponent(stale)}`)

        await expect(page.getByTestId('premium-gift-invite')).toBeVisible()
        await expect(page.getByTestId('premium-gift-again')).toHaveCount(0)
    })

    test('“send another gift” returns to an empty picker', async ({ page }) => {
        const gift = token({ v: 1, s: 'ada', n: 'Ada Lovelace', d: 90, t: Date.now() })
        await page.goto(`${PATH}?gift_token=${encodeURIComponent(gift)}`)

        await page.getByTestId('premium-gift-again').click()
        // One line in the hook, because the step is derived. Legacy has two five-line resets that
        // have to agree with each other.
        await expect(page.getByTestId('premium-gift-invite')).toBeVisible()
    })
})
