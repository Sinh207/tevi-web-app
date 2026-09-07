import { expect, test } from '@playwright/test'
import { asGuest, signedIn, W_API } from './fixtures/session'

/**
 * `/mcn-user-invitation/verify` — the MCN **manager** invitation, opened out of an email.
 *
 * ## Why this screen needs a browser
 *
 * Everything about it is **which of seven states it is in**, and the state function itself is already
 * pinned in Vitest (`lib/user-invitation-state.test.ts`). What is left for a spec is what a pure test
 * cannot reach:
 *
 * - the token comes off the URL as **`token`**, in `page.tsx`, before any of this renders — and the
 *   creator screen next door reads `invite_token` from a *different* path. Cross the two and a live
 *   invitation renders the expired wall: a screen that looks perfect while being completely wrong,
 *   with nothing in the console.
 * - the request goes to **`user-invitations/`**, not `invitations/`. Same failure, one path segment.
 * - the two answers send **`action` in the body**, not as a query parameter. A query-shaped
 *   guess is refused by the backend with a validation error naming a field nobody sent, and no test
 *   below the network can see the difference.
 * - a signed-out visitor gets a **prompt**, where legacy sits on a skeleton forever. This route is
 *   reached from mail, so that is the likeliest first visit rather than an edge case.
 *
 * ## What the payloads are
 *
 * Stated here rather than fetched, per `e2e/fixtures/session.ts`. The shape is legacy's own field
 * access and the contract is open (**B101**), so the fixture states only the two fields the screen
 * reads.
 */

const PATH = '/mcn-user-invitation/verify'
const TOKEN = 'e2e-manager-token'
const URL_WITH_TOKEN = `${PATH}?token=${TOKEN}`

/** 30 minutes old, which is well inside the 72-hour window the footer states. */
const SENT_AT = Date.now() - 30 * 60 * 1000

const INVITATION = {
    organization: { id: 'org-77', name: 'Sao Bắc Đẩu Media' },
    // Epoch ms, which is how this API actually spells a timestamp.
    created_at: SENT_AT,
}

const USER_INVITATION_PATH = 'core/v1/organization/user-invitations/'

test.describe('mcn manager invitation — what a crawler receives', () => {
    /**
     * The URL carries a one-time credential and its content is an offer of a staff role to one
     * person, so it is `noindex, nofollow` — and deliberately **not** in `robots.ts`'s disallow list,
     * for the reason every personal screen in this app states: a disallowed URL is never fetched, so
     * its `noindex` is never read.
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
        await expect(canonical).toHaveAttribute('href', /\/mcn-user-invitation\/verify$/)
        await expect(canonical).not.toHaveAttribute('href', new RegExp(TOKEN))
    })
})

test.describe('mcn manager invitation — signed out', () => {
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

        await expect(page.getByTestId('channel-manager-invitation-signed-out')).toBeVisible()
        await expect(page.getByTestId('channel-manager-invitation-sign-in')).toBeVisible()
        // Not the expired wall — a guest has been told nothing about their invitation.
        await expect(page.getByTestId('channel-manager-invitation-expired')).toHaveCount(0)

        const url = new URL(page.url())
        expect(url.pathname).toBe(PATH)
        expect(url.searchParams.get('token')).toBe(TOKEN)
    })
})

test.describe('mcn manager invitation — a live invitation', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, { [USER_INVITATION_PATH]: INVITATION })
    })

    test('reads the token off the URL and shows the sender and the letter', async ({ page }) => {
        const requests: string[] = []
        page.on('request', r => {
            if (r.url().includes('/organization/user-invitations/')) requests.push(r.url())
        })

        await page.goto(URL_WITH_TOKEN)

        const main = page.locator('main')

        /*
         * **The token is in the request path, and the path is the manager one.** This is the wiring
         * with no unit-test surface: the value travels URL → server prop → hook →
         * `encodeURIComponent`, and a break anywhere along it — or one segment borrowed from the
         * creator endpoint — renders the expired wall on a live link.
         */
        await expect.poll(() => requests.length).toBeGreaterThan(0)
        expect(requests[0]).toContain(`/organization/user-invitations/${TOKEN}/`)
        expect(requests[0]).not.toContain('/organization/invitations/')

        // The network's name is on screen three times (the strip, the headline, the letter), so it is
        // asserted against `main` rather than by an unscoped text locator that would resolve to
        // several elements and fail strict mode.
        await expect(main).toContainText(INVITATION.organization.name)

        // The two bullets are the terms somebody is agreeing to, so their presence is the assertion.
        await expect(main.getByRole('listitem')).toHaveCount(2)

        // The support link is a real anchor opening in a new tab, not legacy's inline-styled one
        // whose `&:hover` and `gap` never applied. It is the **manager** article, not the creator's.
        const learn = page.getByTestId('channel-manager-invitation-learn-more')
        await expect(learn).toHaveAttribute('href', /support\.tevi\.com\/portal/)
        await expect(learn).toHaveAttribute('target', '_blank')

        // Both answers are offered, and neither carries a countdown — this screen states its window
        // as a sentence, so no digits belong on the buttons (that is the creator screen's shape).
        await expect(page.getByTestId('channel-manager-invitation-accept')).toBeVisible()
        await expect(page.getByTestId('channel-manager-invitation-reject')).toBeVisible()
        await expect(page.getByTestId('channel-manager-invitation-accept')).not.toContainText(
            /\d\d:\d\d/,
        )
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
        ['channel-manager-invitation-accept', 'accept'],
        ['channel-manager-invitation-reject', 'reject'],
    ] as const) {
        test(`sends action=${action} in the request body`, async ({ page }) => {
            const posted: { url: string; body: string | null }[] = []
            // Installed *over* the fixture's route, so it wins for this one path.
            await page.route(`${W_API}/**/organization/user-invitations/**`, async route => {
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
            expect(url.pathname).toContain(`/organization/user-invitations/${TOKEN}/`)
            // The payload, which is where the backend looks…
            expect(JSON.parse(posted[0].body ?? '{}')).toEqual({ action })
            // …and *not* the query string, which is what the inverted version sent.
            expect(url.searchParams.get('action')).toBeNull()

            // Legacy's destination, unchanged — and `replace`, so Back does not return to a spent
            // link that can only render the expired wall.
            await expect.poll(() => new URL(page.url()).pathname).toBe('/')
        })
    }
})

test.describe('mcn manager invitation — a link that does not work', () => {
    /**
     * A spent, expired or mistyped token answers 404 (or 410), which this client reads as **data**:
     * the wall, with a way home. A missing `token` lands on the same wall, because to the person
     * holding the link the two are the same event.
     *
     * ⚠ The token is **not** trusted to be a single value: `?token=a&token=b` arrives as an array and
     * is treated as no token at all rather than guessing which one was meant, since guessing would
     * spend the wrong invitation.
     */
    for (const [label, url] of [
        ['a dead token', URL_WITH_TOKEN],
        ['no token at all', PATH],
        ['two tokens', `${PATH}?token=a&token=b`],
    ] as const) {
        test(`shows the expired wall for ${label}`, async ({ page }) => {
            await signedIn(page, { [USER_INVITATION_PATH]: () => null })
            // The fixture answers 200 for everything, so a dead token needs its own 404.
            await page.route(`${W_API}/**/organization/user-invitations/**`, route =>
                route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
            )

            await page.goto(url)

            await expect(page.getByTestId('channel-manager-invitation-expired')).toBeVisible()
            const home = page.getByTestId('channel-manager-invitation-home')
            await expect(home).toHaveAttribute('href', '/')
            // A real anchor announced as a link, not legacy's `router.push` button.
            await expect(home).toHaveAttribute('role', 'link')

            // Neither answer is offered on a link that cannot be answered.
            await expect(page.getByTestId('channel-manager-invitation-accept')).toHaveCount(0)
            await expect(page.getByTestId('channel-manager-invitation-reject')).toHaveCount(0)
        })
    }

    /**
     * **A failure is not a denial.** Legacy's `catch` writes `null`, which is the same value a dead
     * token produces — so a 500 tells somebody holding a live invitation that it has expired, with
     * nothing to press. Here it is its own state with a Retry.
     */
    test('tells a 500 apart from a dead token', async ({ page }) => {
        await signedIn(page, { [USER_INVITATION_PATH]: () => null })
        await page.route(`${W_API}/**/organization/user-invitations/**`, route =>
            route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
        )

        await page.goto(URL_WITH_TOKEN)

        await expect(page.getByTestId('channel-manager-invitation-error')).toBeVisible()
        await expect(page.getByTestId('channel-manager-invitation-retry')).toBeVisible()
        await expect(page.getByTestId('channel-manager-invitation-expired')).toHaveCount(0)
    })
})
