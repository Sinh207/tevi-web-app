import { expect, test } from '@playwright/test'

/**
 * `/search` — the claims its page comment makes that only a browser against a **production
 * build** can check, plus the one claim this screen makes that no other screen does.
 *
 * ## The claim that is unique to this page
 *
 * **It works without an account.** Every other personal surface in this app answers a signed-out
 * visitor with a prompt (`/settings/space-visibility`, `/settings/blocked-accounts`,
 * `/follow-requests`); search answers with a working field, because it is how somebody finds a
 * creator to sign up for. That is a decision, not an accident, and it is exactly the sort of thing
 * that gets "fixed" into a `useRequireAuth` by the next person to touch the rail — so it is pinned
 * here rather than only in a comment.
 *
 * ## What is deliberately not here
 *
 * **Any assertion about results.** They come from the live search service; a spec that typed "ada"
 * and expected rows would be a test of somebody else's data, green or red for reasons that have
 * nothing to do with this repo. What the client does with a page of results is pinned in
 * `use-channel-search.test.tsx` (the debounce, the states, the account scoping) and the row's
 * geometry at `/dev/search` — which **404s in a production build** and so cannot be reached from
 * here.
 *
 * The `autoFocus` is likewise not asserted: `page.goto` in a headless browser gives focus to the
 * document, and a focus assertion here would be testing Playwright's activation model rather than
 * the attribute. The rendered attribute is checked below instead, which is the part this repo owns.
 */

const PATH = '/search'

test.describe('search — the crawler’s view', () => {
    /**
     * `noindex` has to be in the *first response*, not applied after hydration — and `follow`
     * stays on, unlike the personal screens, because a crawler that arrives here should still
     * treat the shell's links as links. It is also why the route is deliberately absent from
     * `robots.ts`'s disallow list: a disallowed URL is never fetched, so its `noindex` is never
     * read.
     */
    test('answers 200 and asks not to be indexed, but still to be followed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).not.toHaveAttribute('content', /nofollow/)
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })

    /**
     * The bar's title and the field are server-rendered, so they are on screen before any query
     * resolves. Asserted against the raw HTML rather than the DOM — the DOM would pass either way
     * once React had run, which is the whole failure mode this catches.
     */
    test('server-renders its title and its field', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('<title>Search')
        // The field's accessible name and its placeholder, both present before hydration.
        expect(html).toContain('aria-label="Search creators"')
        expect(html).toContain('placeholder="Search creators"')
    })

    /**
     * Three input attributes that are each one line of markup and each a real defect when absent,
     * and none of which any unit test can see: a handle is not a word, so iOS capitalising and
     * autocorrecting it changes the term the reader typed.
     */
    test('server-renders the field’s typing behaviour', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        for (const attribute of ['autoCapitalize="none"', 'autoCorrect="off"', 'autofocus']) {
            expect(html).toContain(attribute)
        }
    })
})

test.describe('search — public by design', () => {
    /**
     * Cut the session bootstrap off at the network, for the reason `space-visibility.spec.ts`
     * spells out: the real bootstrap mints a Firebase anonymous user and exchanges it at
     * `/auth/v1/*`, so without this the assertions wait on two third-party round trips and fail
     * whenever CI is unlucky.
     *
     * Here it is doing double duty. "No session, and no way to get one" is precisely the state
     * under test — a visitor who has never signed in — so aborting is the fixture rather than a
     * workaround.
     */
    test.beforeEach(async ({ page }) => {
        await page.route(/identitytoolkit\.googleapis\.com/, route => route.abort())
        await page.route(/\/auth\/v1\//, route => route.abort())
    })

    /**
     * The claim: a signed-out visitor gets the screen, not a prompt and not `/login`.
     *
     * The field has to be **usable**, which is more than present — a disabled or read-only field
     * behind a "sign in to search" overlay would satisfy a visibility assertion.
     */
    test('gives a signed-out visitor a working field rather than a prompt', async ({ page }) => {
        await page.goto(PATH)

        const field = page.getByTestId('search-field')
        await expect(field).toBeVisible()
        await expect(field).toBeEditable()

        await field.fill('ada')
        await expect(field).toHaveValue('ada')
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    /**
     * And no login dialog is raised by arriving, which is the failure a `useRequireAuth` on the
     * rail's Search entry would produce.
     *
     * Scoped to nothing, deliberately: the dialog is not inside `main`. `LoginDialog` is mounted
     * as a sibling of the page by `SessionProviders`, so an unscoped role query is the only one
     * that would see it.
     */
    test('raises no login dialog on arrival', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('search-field')).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    /**
     * The rail's entry is a real anchor to this route, not a button that pushes.
     *
     * A button carrying `role="link"` looks identical in the app and loses ⌘-click, middle-click
     * and the status-bar preview — the trap `NavbarItem`'s own `href` note describes. Checked at a
     * desktop width, since the rail is `md` (900) and up; the mobile bar's own link is the same
     * change and the same reasoning.
     */
    test('the desktop rail points at it with an anchor', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto('/')

        const entry = page.getByTestId('navigation-navbar-search')
        await expect(entry).toHaveAttribute('href', PATH)
    })
})
