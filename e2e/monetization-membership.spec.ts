import type { Route } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * `/monetization/membership` — the creator's tier and the people paying for it.
 *
 * The screen is one URL with two views and five states, and what is pinned here is the set of claims
 * that are **silent** when they break: a gate that opens on a billing change, a failed read that
 * renders nothing at all, a price line that disappears for one of the two currencies the wire uses.
 * None of them throws, and none shows up in a screenshot of the happy path.
 *
 * Formatting (`membership-tier.test.ts`), the art (`illustrations.test.ts`) and the copy
 * (`resources.test.ts`) are pinned in Vitest, where they belong.
 *
 * Locators are `data-testid` or `main`-scoped, never visible text: nine locales make a text locator
 * nine locators, and the account drawer is mounted `inert` on every route (`e2e/README.md`).
 */

const SCREEN = '/monetization/membership'

/** `channelApi` is built on `${W_API}/core`; the tier and its members are billy's. */
const CHANNEL = 'core/v3/channel/my-channel/'
const PACKAGES = 'billy/v3/subscription/my-packages/'
const SUBSCRIBERS = 'billy/v3/subscription/my-channel-subscriptions/'

const MY_CHANNEL = { id: 'ch-1', slug: 'e2e', is_premium: false }

const TIER = {
    count: 1,
    results: [
        {
            id: 'pkg-1',
            name: 'Inner circle',
            description: 'Behind the scenes',
            sharable_url: 'https://tevi.com/m/1',
            prices: [
                { id: 'p1', amount: 1000, amount_currency: 'TVS' },
                { id: 'p2', amount: '10', amount_currency: 'USD' },
            ],
        },
    ],
}

const NO_TIER = { count: 0, results: [] }

/**
 * A page of members, priced in the currency the wire actually sends.
 *
 * `USD` is the default deliberately: the row rendered **nothing** for a cash price for one release,
 * because it only drew the Star line when the currency was `TVS`. Making the default the shape that
 * broke is what keeps that regression from coming back quietly.
 */
function members(count: number, currency: 'USD' | 'TVS' = 'USD') {
    return {
        count,
        next: null,
        results: Array.from({ length: count }, (_, i) => ({
            id: `sub-${i}`,
            end_date: '2026-09-25T00:00:00Z',
            package_price: currency === 'USD' ? '10.00' : 1000,
            package_price_currency: currency,
            user: {
                id: `u${i}`,
                display_name: `Member ${i}`,
                channel_slug: `member${i}`,
                avatar: null,
                channel_verified_tick_badge: null,
            },
            package: { name: 'Inner circle' },
        })),
    }
}

test.describe('membership — what a crawler receives', () => {
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
            /\/monetization\/membership$/,
        )
    })
})

test.describe('membership — the action is gated, never the route', () => {
    test('a guest sees the wall and stays on the route', async ({ page }) => {
        await asGuest(page)
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-membership-signed-out')).toBeVisible()
        await expect(page.getByTestId('monetization-membership-sign-in')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(SCREEN)
    })
})

test.describe('membership — no tier yet', () => {
    test('shows the setup wall, and its CTA opens the form', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: NO_TIER })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-membership-setup-wall')).toBeVisible()
        await page.getByTestId('monetization-membership-start').click()
        await expect(page.getByTestId('monetization-membership-name')).toBeVisible()
    })

    /**
     * The bar is *state* on this screen — one URL, two views — so Back has to mean "up one view"
     * before it means "leave". Legacy's own back button makes the same switch.
     */
    test('back walks out of the form before it leaves the route', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: NO_TIER })
        await page.goto(SCREEN)

        await page.getByTestId('monetization-membership-start').click()
        await expect(page.getByTestId('monetization-membership-name')).toBeVisible()

        await page.getByTestId('navigation-page-back').click()
        await expect(page.getByTestId('monetization-membership-setup-wall')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(SCREEN)
    })

    /** Save is held until the tier has a name — an unnamed tier is not a tier. */
    test('Save is held until the form has a name', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: NO_TIER })
        await page.goto(SCREEN)
        await page.getByTestId('monetization-membership-start').click()

        await expect(page.getByTestId('monetization-membership-save')).toBeDisabled()
        await page.getByTestId('monetization-membership-name').fill('Inner circle')
        await expect(page.getByTestId('monetization-membership-save')).toBeEnabled()
    })

    /**
     * The ladder is a **native `input[type=range]`** — legacy's slider, and the reason the control is
     * reachable without any ARIA of its own. Two claims, and the second is the one that is silent
     * when it breaks:
     *
     * 1. It moves by keyboard, because the browser owns that.
     * 2. `aria-valuetext` announces the **price**, not the index. Without it a screen reader says
     *    "2 of 4" — the position on the track, which is not what the reader is choosing — and
     *    nothing about the rendered page shows the difference.
     */
    test('the price ladder is a slider that announces the price, not the index', async ({
        page,
    }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: NO_TIER })
        await page.goto(SCREEN)
        await page.getByTestId('monetization-membership-start').click()

        const slider = page.getByTestId('monetization-membership-price')
        await expect(slider).toHaveAttribute('min', '0')
        await expect(slider).toHaveAttribute('max', '4')
        await expect(slider).toHaveValue('0')
        await expect(slider).toHaveAttribute('aria-valuetext', /\$2/)

        await slider.press('ArrowRight')
        await expect(slider).toHaveValue('1')
        await expect(slider).toHaveAttribute('aria-valuetext', /\$5/)

        await slider.press('End')
        await expect(slider).toHaveValue('4')
        await expect(slider).toHaveAttribute('aria-valuetext', /\$20/)
    })
})

test.describe('membership — the dashboard', () => {
    /**
     * Both currencies render both figures. The `USD` case is the regression: the row drew the Star
     * line only for `TVS`, so a creator paid in cash saw a member row with **no price on it at all**
     * — and `USD` is what the wire actually sends.
     */
    for (const currency of ['USD', 'TVS'] as const) {
        test(`a ${currency} member shows Star and cash`, async ({ page }) => {
            await signedIn(page, {
                [CHANNEL]: MY_CHANNEL,
                [PACKAGES]: TIER,
                [SUBSCRIBERS]: members(1, currency),
            })
            await page.goto(SCREEN)

            const row = page.getByTestId('monetization-membership-member').first()
            await expect(row).toContainText('1,000')
            await expect(row).toContainText('$10.00')
        })
    }

    /** The tier's own figure, from the `TVS` line of `prices[]`. */
    test('the hero prints the tier price', async ({ page }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [PACKAGES]: TIER,
            [SUBSCRIBERS]: members(2),
        })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-membership-tier-name')).toHaveText('Inner circle')
        await expect(page.getByTestId('monetization-membership-tier-price')).toHaveText('1,000')
    })

    /**
     * A row goes to the member's space — the only address this screen can build. The message button
     * beside it is deliberately `disabled`: direct messages are not ported, and DoD §13 asks for a
     * disabled-pending-route control to be tagged rather than dropped.
     */
    test('a row links to the member, and the message button is visibly not ready', async ({
        page,
    }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [PACKAGES]: TIER,
            [SUBSCRIBERS]: members(1),
        })
        await page.goto(SCREEN)

        await expect(page.locator('main a[href="/@member0"]')).toBeVisible()
        await expect(page.getByTestId('monetization-membership-member-message')).toBeDisabled()
    })
})

test.describe('membership — a write says so', () => {
    /**
     * `docs/DEFINITION_OF_DONE.md` §2: a mutation must not resolve silently. Closing the form is not
     * feedback on its own — **editing** returns to a dashboard that looks identical unless the name
     * or the price changed, so a creator who fixed a typo in the description had no signal at all
     * that it landed. Legacy shows nothing here either.
     *
     * Asserted through the toast rather than the request, because the request succeeding is not the
     * claim: the claim is that the reader is told.
     */
    test('creating a tier confirms it', async ({ page }) => {
        let created = false
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [SUBSCRIBERS]: { count: 0, next: null, results: [] },
            [PACKAGES]: (route: Route) =>
                route.request().method() !== 'GET'
                    ? ((created = true), TIER.results[0])
                    : created
                      ? TIER
                      : NO_TIER,
        })
        await page.goto(SCREEN)

        await page.getByTestId('monetization-membership-start').click()
        await page.getByTestId('monetization-membership-name').fill('Inner circle')
        await page.getByTestId('monetization-membership-save').click()

        await expect(page.locator('[data-sonner-toast]')).toBeVisible()
        // Back on the dashboard, with the tier that was just written.
        await expect(page.getByTestId('monetization-membership-tier')).toBeVisible()
    })

    test('editing a tier confirms it', async ({ page }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [SUBSCRIBERS]: { count: 0, next: null, results: [] },
            [PACKAGES]: (route: Route) =>
                route.request().method() !== 'GET' ? TIER.results[0] : TIER,
        })
        await page.goto(SCREEN)

        await page.getByTestId('monetization-membership-menu').click()
        await page.getByTestId('monetization-membership-edit').click()
        await page.getByTestId('monetization-membership-description').fill('Behind the scenes')
        await page.getByTestId('monetization-membership-save').click()

        await expect(page.locator('[data-sonner-toast]')).toBeVisible()
        await expect(page.getByTestId('monetization-membership-tier')).toBeVisible()
    })
})

test.describe('membership — the analytics cross-sell', () => {
    /**
     * The banner links to a screen that **exists** — that is the whole reason it was ported from a
     * page (`/monetization/pay-per-post`) this app has not built. A row pointing at a 404 is what
     * `shared/components/action-rows.tsx` argues against, so the `href` is the assertion.
     *
     * No date range from this screen: it has no filter, so the analytics page opens on its own
     * default period rather than one invented here. The `?start_date_ts=` form is legacy's, kept for
     * the caller that has a range.
     */
    test('links to the analytics dashboard', async ({ page }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [PACKAGES]: TIER,
            [SUBSCRIBERS]: members(1),
        })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-analytics-banner')).toBeVisible()
        await expect(page.getByTestId('monetization-analytics-banner-cta')).toHaveAttribute(
            'href',
            '/dashboard-analytics',
        )
    })
})

test.describe('membership — a failed members read', () => {
    /**
     * The state this screen shipped without. `isEmpty` is false while `isError` is true, so a failed
     * read fell through to the rows branch and rendered an **empty div** — a blank panel under a
     * working header, with no message and no way to ask again.
     *
     * Omitting the handler makes the fixture answer 599, which the client surfaces as an error.
     */
    test('shows an alert and a retry, not a blank panel', async ({ page }) => {
        await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: TIER })
        await page.goto(SCREEN)

        await expect(page.getByTestId('monetization-membership-members-error')).toBeVisible()
        await expect(page.getByTestId('monetization-membership-members-retry')).toBeVisible()
        // The rest of the screen is still true, so it stays readable.
        await expect(page.getByTestId('monetization-membership-tier')).toBeVisible()
    })
})

test.describe('membership — editing is a billing change, so the gate fails closed', () => {
    /**
     * Three states, and the middle one is the bug: the gate read `activeCount === 0` over a count
     * that was `0` until the members list answered, so for the whole of that request — and forever if
     * it failed — the row was **open** on a change to what existing members are charged.
     */
    const CASES = [
        ['a real zero', { [SUBSCRIBERS]: { count: 0, next: null, results: [] } }, true],
        ['an unanswered list', {}, false],
        ['members paying', { [SUBSCRIBERS]: members(2) }, false],
    ] as const

    for (const [label, handlers, expectEnabled] of CASES) {
        test(`${label} → edit ${expectEnabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
            await signedIn(page, { [CHANNEL]: MY_CHANNEL, [PACKAGES]: TIER, ...handlers })
            await page.goto(SCREEN)

            await page.getByTestId('monetization-membership-menu').click()
            const edit = page.getByTestId('monetization-membership-edit')
            if (expectEnabled) await expect(edit).toBeEnabled()
            else await expect(edit).toBeDisabled()
        })
    }
    /**
     * ⚠ The regression the three cases above cannot reach, because it needs an **interaction**.
     *
     * `active.count` is the total for the *current search term* — the term is in its query key — so
     * typing a name that matches nobody drives it to `0` and the gate opens on a creator with paying
     * members. The search box and the `⋯` menu are on the same screen, two interactions apart.
     *
     * The fixture answers every `status`/`user` combination with the same two members, so the count
     * the client sees is the one it asked for rather than one the spec invented.
     */
    test('a search that narrows the list does not unlock the gate', async ({ page }) => {
        await signedIn(page, {
            [CHANNEL]: MY_CHANNEL,
            [PACKAGES]: TIER,
            [SUBSCRIBERS]: (route: Route) =>
                new URL(route.request().url()).searchParams.get('user')
                    ? { count: 0, next: null, results: [] }
                    : members(2),
        })
        await page.goto(SCREEN)

        // Members are paying, so the gate is shut before anything is typed.
        await page.getByTestId('monetization-membership-menu').click()
        await expect(page.getByTestId('monetization-membership-edit')).toBeDisabled()
        await page.keyboard.press('Escape')

        await page.getByTestId('monetization-membership-search').fill('nobody-by-this-name')
        await expect(page.getByTestId('monetization-membership-members-empty')).toBeVisible()

        await page.getByTestId('monetization-membership-menu').click()
        await expect(page.getByTestId('monetization-membership-edit')).toBeDisabled()
    })
})
