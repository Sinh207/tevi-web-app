import { expect, test } from '@playwright/test'
import { asGuest, signedIn, W_API } from './fixtures/session'

/**
 * `/invitation/verify` — the MCN invitation a creator opens out of an email.
 *
 * ## Why this screen needs a browser
 *
 * Everything about it is **which of seven states it is in**, and the state function itself is already
 * pinned in Vitest (`lib/invitation-state.test.ts`). What is left for a spec is what a pure test
 * cannot reach:
 *
 * - the **token comes off the URL**, in `page.tsx`, before any of this renders. That wiring is the
 *   one thing here with no unit-test surface at all, and getting it wrong shows the expired-link wall
 *   on a live invitation — a screen that renders perfectly while being completely wrong.
 * - the two answers send **`action` in the body**, not as a query parameter. A query-shaped
 *   guess is refused by the backend with a validation error naming a field nobody sent, and no test
 *   below the network can see the difference.
 * - a signed-out visitor gets a **prompt**, where legacy sits on a skeleton forever. This route is
 *   reached from mail, so that is the likeliest first visit rather than an edge case.
 *
 * ## What the payloads are
 *
 * Stated here rather than fetched, per `e2e/fixtures/session.ts`. The shape is legacy's own field
 * access and the contract is open (**B100**), so the fixture states only the three fields the screen
 * reads.
 */

/** The creator invitation. The **manager** one is `/mcn-user-invitation/verify?token=` — its own spec. */
const PATH = '/invitation/verify'
const TOKEN = 'e2e-invite-token'
const URL_WITH_TOKEN = `${PATH}?invite_token=${TOKEN}`

/** 30 minutes old, so the countdown is well inside the 72-hour window. */
const SENT_AT = Date.now() - 30 * 60 * 1000

const INVITATION = {
    organization: { id: 'org-77', name: 'Sao Bắc Đẩu Media' },
    // Epoch ms, and the rate as a **string** — both are how this API actually spells them.
    created_at: SENT_AT,
    mcn_revenue_rate: '30',
}

const INVITATION_PATH = 'core/v1/organization/invitations/'

test.describe('mcn invitation — what a crawler receives', () => {
    /**
     * The URL carries a one-time credential and its content is a commercial offer to one person, so
     * it is `noindex, nofollow` — and deliberately **not** in `robots.ts`'s disallow list, for the
     * reason every personal screen in this app states: a disallowed URL is never fetched, so its
     * `noindex` is never read.
     *
     * The canonical drops the query string. That is the assertion worth having: a canonical carrying
     * the token would publish a credential in the page's own `<head>`.
     */
    test('answers 200, asks not to be indexed, and keeps the token out of the canonical', async ({
        page,
    }) => {
        const response = await page.goto(URL_WITH_TOKEN)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)

        const canonical = page.locator('link[rel="canonical"]')
        await expect(canonical).toHaveAttribute('href', /\/invitation\/verify$/)
        await expect(canonical).not.toHaveAttribute('href', new RegExp(TOKEN))
    })
})

test.describe('mcn invitation — signed out', () => {
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

    /**
     * A guest gets the prompt. Legacy shows the **skeleton, forever** — `getUserInvitation` returns
     * early on `!isAuthenticated` and never clears `isLoading` — on the one screen whose entry point
     * is an email link.
     *
     * The URL stays put, token included: this app gates the action, never the route, and losing the
     * token on a redirect would make the link unusable after signing in.
     */
    test('asks the reader to sign in, and keeps them on the URL they arrived at', async ({
        page,
    }) => {
        await page.goto(URL_WITH_TOKEN)

        await expect(page.getByTestId('channel-invitation-signed-out')).toBeVisible()
        await expect(page.getByTestId('channel-invitation-sign-in')).toBeVisible()
        // Not the expired wall — a guest has been told nothing about their invitation.
        await expect(page.getByTestId('channel-invitation-expired')).toHaveCount(0)

        const url = new URL(page.url())
        expect(url.pathname).toBe(PATH)
        expect(url.searchParams.get('invite_token')).toBe(TOKEN)
    })
})

test.describe('mcn invitation — a live invitation', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, { [INVITATION_PATH]: INVITATION })
    })

    test('reads the token off the URL and shows the network, the split and the letter', async ({
        page,
    }) => {
        const requests: string[] = []
        page.on('request', r => {
            if (r.url().includes('/organization/invitations/')) requests.push(r.url())
        })

        await page.goto(URL_WITH_TOKEN)

        const main = page.locator('main')

        /*
         * **The token is in the request path.** This is the wiring with no unit-test surface: the
         * value travels URL → server prop → hook → `encodeURIComponent`, and a break anywhere along
         * it renders the expired wall on a live link.
         */
        await expect.poll(() => requests.length).toBeGreaterThan(0)
        expect(requests[0]).toContain(`/organization/invitations/${TOKEN}/`)

        // The split. `mcn_revenue_rate` arrived as the string '30', so the creator's 70 is derived.
        const rates = page.getByTestId('channel-invitation-rates')
        await expect(rates.getByText('70%')).toBeVisible()
        await expect(rates.getByText('30%')).toBeVisible()

        /*
         * The network's name is on screen four times (the hero strip, the headline, the chip, the
         * letter's sign-off), so it is addressed through a testid rather than by text — an unscoped
         * `getByText` resolving to four elements is a strict-mode failure, not a passing assertion.
         */
        await expect(page.getByTestId('channel-invitation-rate')).toHaveCount(2)
        await expect(main).toContainText(INVITATION.organization.name)

        // The support link is a real anchor opening in a new tab, not legacy's `window.open` button.
        const learn = page.getByTestId('channel-invitation-learn-more')
        await expect(learn).toHaveAttribute('href', /support\.tevi\.com/)
        await expect(learn).toHaveAttribute('target', '_blank')
    })

    /**
     * **The countdown is painted only after mount**, because it reads the clock — a value in the
     * server-rendered HTML is one the browser recomputes a moment later, i.e. a hydration mismatch on
     * a string that changes every second.
     *
     * So the assertion is in two halves: the served HTML must *not* carry a clock, and the hydrated
     * button must. `HH:MM:SS` at 71-something hours is the shape a 30-minute-old invitation has.
     */
    test('keeps the clock out of the served HTML and shows it once hydrated', async ({ page }) => {
        const html = await (await page.request.get(URL_WITH_TOKEN)).text()
        expect(html).not.toMatch(/\d\d:\d\d:\d\d/)

        await page.goto(URL_WITH_TOKEN)
        await expect(page.getByTestId('channel-invitation-accept')).toContainText(/7[01]:\d\d:\d\d/)
    })

    /**
     * **`action` travels in the body.** Legacy sends `ApiModel.post(path, {}, { action })`, and its
     * signature is `post(uri, params, data)` — arg 3 is the query, arg 4 is the payload. Read as
     * axios's own `post(url, body, config)` it inverts, which is exactly how this shipped first:
     * `?action=accept` with no body, answered `{"errors":[{"input":"action","code":"required"}]}`.
     *
     * ⚠ **This test used to assert the inverted shape**, so it passed on the bug. Nothing below the
     * network can tell the two apart — the model, the hook and the view are identical either way —
     * which is the whole reason the assertion belongs in a spec that watches the real request.
     */
    for (const [control, action] of [
        ['channel-invitation-accept', 'accept'],
        ['channel-invitation-reject', 'reject'],
    ] as const) {
        test(`sends action=${action} in the request body`, async ({ page }) => {
            const posted: { url: string; body: string | null }[] = []
            // Installed *over* the fixture's route, so it wins for this one path.
            await page.route(`${W_API}/**/organization/invitations/**`, async route => {
                if (route.request().method() === 'POST') {
                    posted.push({
                        url: route.request().url(),
                        body: route.request().postData(),
                    })
                    await route.fulfill({ status: 204, body: '' })
                    return
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, data: INVITATION }),
                })
            })

            await page.goto(URL_WITH_TOKEN)
            await page.getByTestId(control).click()

            await expect.poll(() => posted.length).toBe(1)
            const url = new URL(posted[0].url)
            expect(url.pathname).toContain(`/organization/invitations/${TOKEN}/`)
            // The payload, which is where the backend looks…
            expect(JSON.parse(posted[0].body ?? '{}')).toEqual({ action })
            // …and *not* the query string, which is what the inverted version sent.
            expect(url.searchParams.get('action')).toBeNull()

            // Legacy's destination, unchanged — and `replace`, so Back does not return to a spent link.
            await expect.poll(() => new URL(page.url()).pathname).toBe('/')
        })
    }
})

test.describe('mcn invitation — a link that does not work', () => {
    /**
     * A spent, expired or mistyped token answers 404 (or 410), which this client reads as **data**:
     * the wall, with a way home. A missing `invite_token` lands on the same wall, because to the
     * person holding the link the two are the same event.
     *
     * ⚠ The token is **not** trusted to be a single value: `?invite_token=a&invite_token=b` arrives
     * as an array and is treated as no token at all rather than guessing which one was meant, since
     * guessing would spend the wrong invitation.
     */
    for (const [label, url] of [
        ['a dead token', URL_WITH_TOKEN],
        ['no token at all', PATH],
        ['two tokens', `${PATH}?invite_token=a&invite_token=b`],
    ] as const) {
        test(`shows the expired wall for ${label}`, async ({ page }) => {
            await signedIn(page, {
                [INVITATION_PATH]: () => null,
            })
            // The fixture answers 200 for everything, so a dead token needs its own 404.
            await page.route(`${W_API}/**/organization/invitations/**`, route =>
                route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
            )

            await page.goto(url)

            await expect(page.getByTestId('channel-invitation-expired')).toBeVisible()
            const home = page.getByTestId('channel-invitation-home')
            await expect(home).toHaveAttribute('href', '/')
            // A real anchor announced as a link, not legacy's `router.push` button.
            await expect(home).toHaveAttribute('role', 'link')

            // Neither answer is offered on a link that cannot be answered.
            await expect(page.getByTestId('channel-invitation-accept')).toHaveCount(0)
            await expect(page.getByTestId('channel-invitation-reject')).toHaveCount(0)
        })
    }

    /**
     * **A failure is not a denial.** Legacy's `catch` writes `null`, which is the same value a dead
     * token produces — so a 500 tells a creator holding a live invitation that it has expired, with
     * nothing to press. Here it is its own state with a Retry.
     */
    test('tells a 500 apart from a dead token', async ({ page }) => {
        await signedIn(page, { [INVITATION_PATH]: () => null })
        await page.route(`${W_API}/**/organization/invitations/**`, route =>
            route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
        )

        await page.goto(URL_WITH_TOKEN)

        await expect(page.getByTestId('channel-invitation-error')).toBeVisible()
        await expect(page.getByTestId('channel-invitation-retry')).toBeVisible()
        await expect(page.getByTestId('channel-invitation-expired')).toHaveCount(0)
    })
})
