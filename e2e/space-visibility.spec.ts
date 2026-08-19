import { expect, test } from '@playwright/test'

/**
 * `/settings/space-visibility` — the two claims its page comment makes that only a browser
 * against a **production build** can check.
 *
 * Both are listed in `e2e/README.md` as the specs to write first, and both are the kind of rule
 * that fails silently: a `noindex` that stopped being emitted looks identical in the app, and a
 * route-level auth redirect looks like it works right up until someone opens a shared link.
 *
 * ## What is deliberately not here
 *
 * The picker itself. Rendering it needs a signed-in account with a space, which means seeding
 * the token store in `localStorage` before load (auth is not cookie-based) — the fixture
 * `e2e/README.md` says to write as `e2e/fixtures/` when the first such spec lands. Rather than
 * copy that setup into this file, the picker's own behaviour is covered where it can be reached
 * without a session: the radio group's keyboard and ARIA wiring at `/dev/space-visibility`,
 * which **404s in a production build** and so cannot be asserted from here, and the write path
 * in `use-update-privacy.test.tsx`.
 */

const PATH = '/settings/space-visibility'

test.describe('space visibility — the crawler’s view', () => {
    /**
     * `noindex` has to be in the *first response*, not applied after hydration. It is also why
     * the route is deliberately absent from `robots.ts`'s disallow list: a disallowed URL is
     * never fetched, so its `noindex` is never read.
     */
    test('answers 200 and asks not to be indexed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    /**
     * The bar's title and the standing explanation are server-rendered, so they are on screen
     * before the channel query resolves. Asserted against the raw HTML rather than the DOM —
     * the DOM would pass either way once React had run.
     */
    test('server-renders its title and explanation', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('Space visibility')
        expect(html).toContain('Choose who can see your space')
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })
})

test.describe('space visibility — gate the action, never the route', () => {
    /**
     * Cut the session bootstrap off at the network.
     *
     * The screen renders skeletons until `isBootstrapping` is false, and the bootstrap talks to
     * **live** services: Firebase mints an anonymous user, then `/auth/v1/token/` and `/auth/v1/me/`
     * turn it into a Tevi session. So without this, the assertions below wait on two third-party
     * round trips and fail whenever CI is unlucky — which is exactly how this file failed once
     * before this block existed, and passed on rerun.
     *
     * Aborting is not a workaround, it is the state under test: "no session, and no way to get
     * one" is what a signed-out visitor is, and it makes the bootstrap settle in milliseconds
     * rather than making the test guess how long the internet takes. Anything that needs a *real*
     * session belongs behind the `e2e/fixtures/` token seeding described at the top of this file.
     */
    test.beforeEach(async ({ page }) => {
        await page.route(/identitytoolkit\.googleapis\.com/, route => route.abort())
        await page.route(/\/auth\/v1\//, route => route.abort())
    })

    /**
     * The rule this app applies everywhere: a visitor without a session keeps the screen they
     * asked for and is offered a sign-in, rather than being sent to `/login`. The URL assertion
     * is the whole point — a redirect would still show "a sign-in", just not here.
     */
    test('keeps a signed-out visitor on the page and offers a sign-in', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByText('Sign in to see your space')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    /**
     * And no picker is rendered to someone who has no space to configure.
     *
     * Scoped to `main`, which is not incidental: the account drawer is mounted on every route
     * — parked off-screen and `inert`, never unmounted (`drawer-screen.tsx`) — and its language
     * and theme pickers are radios too. An unscoped `getByRole('radio')` finds all eleven of
     * them and would pass or fail for reasons that have nothing to do with this page. `inert`
     * does not hide a node from a role query.
     */
    test('renders no picker without a session', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByText('Sign in to see your space')).toBeVisible()
        await expect(page.locator('main').getByRole('radio')).toHaveCount(0)
        await expect(page.locator('main').getByRole('radiogroup')).toHaveCount(0)
    })
})
