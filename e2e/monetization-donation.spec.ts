import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * `/monetization/donation` — the creator's donation offer and the people who have paid it.
 *
 * One URL with two views and five states, like `/monetization/membership` beside it. What is pinned
 * here is the set of claims that are **silent** when they break:
 *
 * - the `date_range` sent on the wire, which legacy has been spelling wrong in a way that produces
 *   no error and no visible difference;
 * - the amount field refusing a third decimal, which otherwise lets `1.999` be typed and `2.00` be
 *   posted;
 * - a failed donations read rendering nothing at all;
 * - a supporter row whose figure or status quietly disappears.
 *
 * Formatting and the payload rules (`donation-setting.test.ts`), the art
 * (`illustrations.test.ts`) and the copy (`resources.test.ts`) are pinned in Vitest, where they
 * belong.
 *
 * Locators are `data-testid` or `main`-scoped, never visible text: nine locales make a text locator
 * nine locators, and the account drawer is mounted `inert` on every route (`e2e/README.md`).
 */

const SCREEN = '/monetization/donation'

/** `channelApi` is built on `${W_API}/core`; the offer and its donations are billy's. */
const CHANNEL = 'core/v3/channel/my-channel/'
const SETTING = 'billy/v4/billing/donation/setting/'
const SUMMARY = 'billy/v4/billing/donation/summary/'
const DONATIONS = 'billy/v4/billing/donation/donations/'

const MY_CHANNEL = { id: 'ch-1', slug: 'e2e', is_premium: false }

const OFFER = {
    id: 'don-1',
    name: 'coffee',
    icon: 'coffee',
    button_text: 'Donate',
    thank_you_msg: 'Thank you!',
    display_supporter_count: true,
    is_active: true,
    sharable_url: 'https://tevi.com/@e2e/direct-donation',
    prices: [
        { id: 'p1', amount: '10.00', amount_currency: 'USD' },
        { id: 'p2', amount: '1000.00', amount_currency: 'TVS' },
    ],
}

/**
 * A page of donations, priced in the currency the wire actually sends.
 *
 * `usd_amount` is carried alongside `amount`, which is what makes the row's figure a read rather
 * than a conversion — the `TVS` case below is the one that would print a Star count with a currency
 * symbol in front of it if that preference were ever inverted.
 */
function donations(count: number, over: Record<string, unknown> = {}) {
    return {
        count,
        next: null,
        results: Array.from({ length: count }, (_, i) => ({
            id: `don-${i}`,
            description: null,
            amount: '1000.00',
            amount_currency: 'TVS',
            usd_amount: '10.00',
            payout_status: 'success',
            created_at: 1_757_000_000_000,
            user: {
                id: `u${i}`,
                display_name: `Supporter ${i}`,
                channel_slug: `supporter${i}`,
                avatar: null,
                channel_verified_tick_badge: null,
            },
            ...over,
        })),
    }
}

/**
 * `setting/` answering **404**, which is what a creator who has never used the feature gets.
 *
 * Registered *after* `signedIn`, deliberately: `fulfillApi` routes the whole origin and always
 * answers 200, and Playwright checks routes in reverse registration order — so this is the only way
 * a spec can state a status rather than a body. The distinction is the point of the test.
 */
async function withoutOffer(page: import('@playwright/test').Page) {
    await page.route(`**/donation/setting/**`, route =>
        route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    )
}

const SUPPORTED = {
    [CHANNEL]: MY_CHANNEL,
    [SETTING]: OFFER,
    [SUMMARY]: { unique_supporter_count: 7 },
    [DONATIONS]: donations(2),
}

test.describe('donation — what a crawler receives', () => {
    test('answers 200 and asks not to be indexed', async ({ page }) => {
        const response = await page.goto(SCREEN)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(SCREEN)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            /\/monetization\/donation$/,
        )
    })
})

test.describe('donation — the action is gated, never the route', () => {
    test('a guest sees the wall and stays on the route', async ({ page }) => {
        await asGuest(page)
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-donation-signed-out')).toBeVisible()
        await expect(page.getByTestId('monetization-donation-sign-in')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(SCREEN)
    })
})

test.describe('donation — no offer yet', () => {
    /**
     * A **404 on `setting/` is the answer**, not a failure: roughly every creator who has never used
     * the feature gets one. The distinction is the whole screen — legacy reads any non-200 as "no
     * offer", so a 502 shows a creator whose offer is live the wall inviting them to switch it on.
     */
    test('a 404 shows the intro wall rather than an error', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [SETTING]: OFFER })
        await withoutOffer(page)
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-donation-intro')).toBeVisible()
        await expect(page.getByTestId('monetization-donation-error')).toHaveCount(0)
    })

    test('the CTA opens the setting form', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [SETTING]: OFFER })
        await withoutOffer(page)
        await page.goto(SCREEN)

        await page.getByTestId('monetization-donation-start').click()
        await expect(page.getByTestId('monetization-donation-amount')).toBeVisible()
    })

    /**
     * The bar is *state* on this screen — one URL, two views — so Back has to mean "up one view"
     * before it means "leave". Legacy's own back button makes the same switch.
     */
    test('back walks out of the form before it leaves the route', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [SETTING]: OFFER })
        await withoutOffer(page)
        await page.goto(SCREEN)

        await page.getByTestId('monetization-donation-start').click()
        await expect(page.getByTestId('monetization-donation-amount')).toBeVisible()

        await page.getByTestId('navigation-page-back').click()
        await expect(page.getByTestId('monetization-donation-intro')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(SCREEN)
    })
})

test.describe('donation — the setting form', () => {
    async function openForm(page: import('@playwright/test').Page) {
        await signedIn(page, { ...SUPPORTED })
        await page.goto(SCREEN)
        await page.getByTestId('monetization-donation-menu').click()
        await page.getByTestId('monetization-donation-edit').click()
        await expect(page.getByTestId('monetization-donation-amount')).toBeVisible()
    }

    /** The saved offer seeds the form — the unit, the price and both switches. */
    test('opens on what is saved', async ({ page }) => {
        await openForm(page)

        await expect(page.getByTestId('monetization-donation-amount')).toHaveValue('10')
        await expect(
            page.getByTestId('monetization-donation-unit').and(page.locator('[value="coffee"]')),
        ).toBeChecked()
        await expect(page.getByTestId('monetization-donation-activation')).toHaveAttribute(
            'aria-checked',
            'true',
        )
    })

    /**
     * The refusal `parseDonationAmountInput` exists for. Rounding instead would let `1.999` be typed
     * and `2.00` posted, with nothing on screen saying the price had changed.
     */
    test('the amount field refuses a third decimal place', async ({ page }) => {
        await openForm(page)

        const amount = page.getByTestId('monetization-donation-amount')
        await amount.fill('1.99')
        await amount.pressSequentially('9')
        await expect(amount).toHaveValue('1.99')
    })

    /**
     * ⚠ Typed **one key at a time**, which is the only way this bug appears — `fill()` sets the value
     * in one go and passes either way.
     *
     * The first cut returned `String(Number(typed))`, deleting a `0` right after the decimal point,
     * so `1.05` ended at `15` and Save posted `15.00`: a 14× price change with nothing on screen
     * saying anything happened. `donation-setting.test.ts` pins the function; this pins the control
     * actually wired to it.
     */
    test('a price with a zero in the first decimal place survives being typed', async ({ page }) => {
        await openForm(page)

        const amount = page.getByTestId('monetization-donation-amount')
        await amount.fill('')
        await amount.pressSequentially('1.05')
        await expect(amount).toHaveValue('1.05')
    })

    /** The Star figure is derived, so it has to follow the field rather than the saved offer. */
    test('the Star equivalent follows the amount', async ({ page }) => {
        await openForm(page)

        await page.getByTestId('monetization-donation-amount').fill('5')
        await expect(page.locator('main')).toContainText('500')
    })

    /**
     * Save is held for three reasons and two of them are legacy's. The third is not: legacy will
     * post `prices: [{ amount: "0.00" }]` — an offer nobody can buy, and one that reads as free.
     */
    test('Save is held for an unchanged form, and for a zero price', async ({ page }) => {
        await openForm(page)

        await expect(page.getByTestId('monetization-donation-save')).toBeDisabled()

        await page.getByTestId('monetization-donation-amount').fill('0')
        await expect(page.getByTestId('monetization-donation-save')).toBeDisabled()

        await page.getByTestId('monetization-donation-amount').fill('12')
        await expect(page.getByTestId('monetization-donation-save')).toBeEnabled()
    })

    /**
     * **A successful save says so.** Legacy raises a toast here and the port dropped it, which left a
     * creator who changed their thank-you message with no confirmation at all — the form closes and
     * the overview it returns to shows supporters rather than the offer, so nothing on the screen
     * they land on reflects the edit.
     *
     * Located by Sonner's own `[data-sonner-toast]` rather than by its words: nine locales make a
     * text locator nine locators (`e2e/README.md`). What is asserted is that *something was
     * announced*, plus the return to the overview — the wording itself is `resources.test.ts`'s job.
     */
    test('a successful save announces itself and returns to the overview', async ({ page }) => {
        await openForm(page)

        await page.getByTestId('monetization-donation-amount').fill('12')
        await page.getByTestId('monetization-donation-save').click()

        await expect(page.locator('[data-sonner-toast]')).toBeVisible()
        await expect(page.getByTestId('monetization-donation-supporter-count')).toBeVisible()
        await expect(page.getByTestId('monetization-donation-amount')).toHaveCount(0)
    })

    /**
     * Save is a **bar pinned to the bottom of the viewport**, at every scroll position.
     *
     * The form is taller than a phone, so an in-flow Save is two screens below the field somebody
     * just filled in. Pinned in a browser because it cannot be pinned anywhere else: `position:
     * sticky` fails **silently** the moment any ancestor gains `overflow: hidden` — nothing throws,
     * nothing logs, the bar simply scrolls away. This app has already been bitten by that once (see
     * `MembershipDashboard`'s `overflow-clip` note).
     *
     * Measured as a distance from the viewport's bottom edge rather than by a class, so it survives
     * the treatment being expressed differently.
     */
    test('Save stays pinned to the bottom at every scroll position', async ({ page }) => {
        await openForm(page)

        const gapFromBottom = () =>
            page.evaluate(() => {
                const button = document.querySelector('[data-testid="monetization-donation-save"]')
                if (!button) return null
                return Math.round(window.innerHeight - button.getBoundingClientRect().bottom)
            })

        // The form has to actually overflow, or the assertion proves nothing.
        const scrollable = await page.evaluate(
            () => document.documentElement.scrollHeight - window.innerHeight,
        )
        expect(scrollable).toBeGreaterThan(0)

        const atTop = await gapFromBottom()
        expect(atTop).toBeLessThanOrEqual(24)

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await expect.poll(gapFromBottom).toBe(atTop)
    })

    /**
     * The chips are **native radios** sharing a `name`, which is what gives them arrow keys and the
     * "1 of 4" announcement for free. The ARIA version would need both written by hand, and neither
     * legacy nor an untested `role="radio"` has them.
     */
    test('the unit chips are one radio group, and arrow keys move between them', async ({
        page,
    }) => {
        await openForm(page)

        const chips = page.getByTestId('monetization-donation-unit')
        await expect(chips).toHaveCount(4)

        const coffee = chips.and(page.locator('[value="coffee"]'))
        await coffee.focus()
        await coffee.press('ArrowRight')
        await expect(chips.and(page.locator('[value="pizza"]'))).toBeChecked()
    })
})

test.describe('donation — the overview', () => {
    /**
     * The figure is the **summary's**, not the donations `count`: three donations from one person is
     * `1` and `3`, and the card asks the first question. The fixture states them differently on
     * purpose so a swap cannot pass.
     */
    test('the card prints the unique supporter count, not the donation count', async ({ page }) => {
        await signedIn(page, SUPPORTED)
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-donation-supporter-count')).toContainText('7')
    })

    test('a row prints its figure and its status, and links to the supporter', async ({ page }) => {
        await signedIn(page, SUPPORTED)
        await page.goto(SCREEN)

        const row = page.getByTestId('monetization-donation-supporter').first()
        await expect(row).toContainText('$10.00')
        await expect(page.locator('main a[href="/@supporter0"]')).toBeVisible()
    })

    /**
     * Legacy paints an unknown `payout_status` as the **raw wire value in grey** — `on_hold` on a
     * creator's dashboard, in a colour that means nothing. Saying nothing is the honest version, and
     * the amount beside it is still true.
     */
    test('an unknown payout status renders no badge, and the row survives', async ({ page }) => {
        await signedIn(page, {
            ...SUPPORTED,
            [DONATIONS]: donations(1, { payout_status: 'on_hold' }),
        })
        await page.goto(SCREEN)

        const row = page.getByTestId('monetization-donation-supporter').first()
        await expect(row).toBeVisible()
        await expect(row).toContainText('$10.00')
        await expect(row).not.toContainText('on_hold')
    })

    /**
     * Omitting the handler makes the fixture answer 599, which the client surfaces as an error. The
     * state `MembershipDashboard` shipped without: `isEmpty` is false while `isError` is true, so a
     * failed read falls through to the rows branch and renders an **empty div**.
     */
    test('a failed donations read shows an alert and a retry, not a blank panel', async ({
        page,
    }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [SETTING]: OFFER,
            [SUMMARY]: { unique_supporter_count: 7 },
        })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-donation-supporters-error')).toBeVisible()
        await expect(page.getByTestId('monetization-donation-supporters-retry')).toBeVisible()
        // The rest of the screen is still true, so it stays readable.
        await expect(page.getByTestId('monetization-donation-supporter-count')).toBeVisible()
    })

    test('an empty range shows the empty state rather than nothing', async ({ page }) => {
        await signedIn(page, {
            ...SUPPORTED,
            [DONATIONS]: { count: 0, next: null, results: [] },
        })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-donation-supporters-empty')).toBeVisible()
    })
})

test.describe('donation — the date range is sent in the spelling the API accepts', () => {
    /**
     * ⚠ **The assertion this file exists for.** billy's `date_range` enum is
     * `1m | 30d | 60d | 7d | thisMonth`, and legacy sends **`this_month`** — a value in no enum —
     * every time a creator picks *This month*. DRF answers the default or a 400, so the choice
     * silently does nothing and the screen looks completely fine either way.
     *
     * Asserted on the **request**, because that is the only place the difference exists.
     */
    test('7d on arrival, thisMonth after the switch', async ({ page }) => {
        await signedIn(page, SUPPORTED)

        const first = page.waitForRequest(
            request =>
                request.url().includes('donation/donations/') && request.url().includes('7d'),
        )
        await page.goto(SCREEN)
        await first

        const second = page.waitForRequest(request => {
            if (!request.url().includes('donation/donations/')) return false
            const range = new URL(request.url()).searchParams.get('date_range')
            return range === 'thisMonth'
        })

        await page.getByTestId('monetization-donation-range-trigger').click()
        await page.getByTestId('monetization-donation-range-option').last().click()
        await second
    })
})

test.describe('donation — the analytics cross-sell', () => {
    /**
     * The banner links to a screen that **exists**, and unlike the membership dashboard this one has
     * a date filter — so the range travels with the reader (`?start_date_ts=&end_date_ts=`), which
     * is legacy's own behaviour and what `/dashboard-analytics` reads.
     */
    test('carries the selected range into the analytics dashboard', async ({ page }) => {
        await signedIn(page, SUPPORTED)
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-analytics-banner')).toBeVisible()
        await expect(page.getByTestId('monetization-analytics-banner-cta')).toHaveAttribute(
            'href',
            /\/dashboard-analytics\?start_date_ts=\d+&end_date_ts=\d+$/,
        )
    })
})
