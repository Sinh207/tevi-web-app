import { expect, test } from '@playwright/test'

/**
 * `/following` — the claims its page comment makes that only a browser against a **production
 * build** can check, plus the two this screen makes that no other list screen does.
 *
 * ## What is unique here
 *
 * **It is a tab destination**, so it wears the global mobile top bar instead of a `PageBackBar`, and
 * its section header is the document's `h1` — there is no other heading on the page. Both the tab
 * bar and the desktop rail point at it with a real anchor, which is the half of the wiring that
 * `tab-destinations.test.ts` cannot see: that file knows `/following` is in `TAB_PATHS`, not that
 * the chrome renders an `<a href>` for it.
 *
 * ## What is deliberately not here
 *
 * **Anything about the rows.** They need a signed-in account that follows somebody, and the
 * geometry, the pinned and muted marks and the exit are pinned at `/dev/following` — which **404s
 * in a production build** and so cannot be reached from here — and the behaviour in
 * `use-followed-channels.test.tsx` (the deferred unfollow, its account scoping, the re-sort).
 *
 * The Live now strip is likewise absent: whether anybody a test account follows is on air right now
 * is somebody else's data.
 */

const PATH = '/following'

test.describe('following — the crawler’s view', () => {
    /**
     * `noindex, nofollow` has to be in the *first response*, not applied after hydration. Both
     * halves, unlike `/search`: this is a personal list of other people's spaces, so there is
     * nothing here a crawler should index **or** follow.
     *
     * It is also why the route is deliberately absent from `robots.ts`'s disallow list — a
     * disallowed URL is never fetched, so its `noindex` is never read, and a page linked from the
     * chrome on every screen can still surface as a bare URL.
     */
    test('answers 200 and asks not to be indexed or followed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })

    /**
     * The title and the section header are server-rendered, so the screen has a name before any
     * query resolves. Asserted against the raw HTML rather than the DOM — the DOM would pass either
     * way once React had run, which is the whole failure mode this catches.
     *
     * The `h1` is **in the bar**, asserted against the raw HTML — which is where it is regardless of
     * viewport, because the bar is hidden below `md` with CSS rather than dropped from the markup.
     * What this pins is that the heading is *server-rendered*: the bar and the title are there on
     * first paint, before any query resolves, which is the claim the page comment makes.
     */
    test('server-renders its title and an h1 in the bar', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('<title>Following')
        expect(html).toMatch(/<h1[^>]*data-slot="app-bar-title-text"[^>]*>Following<\/h1>/)
    })

    /**
     * The back button, and it is pinned because it was **absent for a while** on the reasoning that
     * a tab destination is a root with nowhere to go back to. That lost to consistency: a bar that
     * is identical to `/follow-requests`' except for a missing control reads as the control having
     * failed to render, and legacy's own Following screen draws one. `PageBackBar` supplies it, so
     * a regression here means somebody swapped the bar rather than restyled it.
     *
     * Scoped to `main` past the account drawer, which is mounted `inert` on every route and brings
     * its own back button.
     */
    test('wears the same back button every other screen does', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('main header button').first()).toBeVisible()
        await expect(page.locator('main header')).toContainText('Following')
    })

    /**
     * And **exactly one** of them — which is not the same as the word appearing once. "Following" is
     * on screen twice from `md` up by design: the bar names the screen and the list's own
     * `List/Header` names the section, because "Live now" can sit directly above it. The second one
     * is an `h2`, and this test is what stops a copy-paste turning it into a top-level heading — a
     * change nothing on screen would report.
     *
     * Runs at `Desktop Chrome`, so the bar is on screen. Below `md` it is `display: none` and the
     * page's top heading is that `h2` — a deliberate trade the page comment argues; there is
     * nothing here asserting a phone has an `h1`, because it does not.
     *
     * `main` scopes it past the account drawer, which is mounted `inert` on every route and brings
     * six `h1`s of its own.
     */
    test('names itself once, not twice', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('main h1')).toHaveCount(1)
    })
})

test.describe('following — a signed-out visitor', () => {
    /**
     * Cut the session bootstrap off at the network, for the reason `space-visibility.spec.ts`
     * spells out: the real bootstrap mints a Firebase anonymous user and exchanges it at
     * `/auth/v1/*`, so without this the assertions wait on two third-party round trips and fail
     * whenever CI is unlucky.
     *
     * Here it is doing double duty — "no session, and no way to get one" is the state under test.
     */
    test.beforeEach(async ({ page }) => {
        await page.route(/identitytoolkit\.googleapis\.com/, route => route.abort())
        await page.route(/\/auth\/v1\//, route => route.abort())
    })

    /**
     * The claim: a prompt **in place**, not a redirect to `/login`. The app always keeps an
     * anonymous session, so a route guard here would bounce every first-time visitor off a URL they
     * asked for; the screen gates the *action* instead (DoD §3).
     *
     * Scoped to `main`, per `e2e/README.md`: the account drawer is mounted on every route and parked
     * `inert`, so an unscoped role query finds its controls too.
     */
    test('prompts in place rather than redirecting', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByTestId('channel-following-sign-in')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    /**
     * And the sort control is **not** offered over a prompt. It is a control with nothing to act on,
     * and the condition that hides it is assembled in the view from four values — exactly the kind
     * of expression that survives a refactor while quietly becoming true.
     */
    test('offers no ordering control over the prompt', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('channel-following-sign-in')).toBeVisible()
        await expect(page.getByTestId('channel-following-sort')).toHaveCount(0)
    })

    /** Arriving must not raise the login dialog — the prompt is the invitation, not a modal. */
    test('raises no login dialog on arrival', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('channel-following-sign-in')).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })
})

test.describe('following — the chrome points at it', () => {
    /**
     * The rail's entry is a real anchor, not a button that pushes.
     *
     * A button carrying `role="link"` looks identical in the app and loses ⌘-click, middle-click and
     * the status-bar preview — the trap `NavbarItem`'s own `href` note describes, and the exact
     * change this route made to `AppNavbar`. Checked at a desktop width, since the rail is `md`
     * (900) and up.
     */
    test('the desktop rail points at it with an anchor', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto('/')
        await expect(page.getByTestId('navigation-navbar-following')).toHaveAttribute(
            'href',
            PATH,
        )
    })

    /**
     * And the mobile tab bar does the same — a separate component with its own five entries, so the
     * two are wired independently and a change to one does not move the other.
     */
    test('the mobile tab bar points at it with an anchor', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto('/')
        await expect(page.getByTestId('navigation-navbar-following')).toHaveAttribute(
            'href',
            PATH,
        )
    })

    /**
     * The tab bar has to still be **on** the screen it navigated to: `/following` is in
     * `TAB_PATHS`, and a destination missing from that list renders with no bar at all, which reads
     * as having left the app's shell.
     */
    test('keeps the tab bar on the screen it lands on', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    })
})
