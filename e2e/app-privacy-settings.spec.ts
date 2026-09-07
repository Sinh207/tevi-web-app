import { expect, test } from '@playwright/test'

/**
 * `/app/privacy-settings` — the mobile app's account privacy screen.
 *
 * The unit suite covers what it can: `nsfw-rows.test.ts` pins the table's translation keys,
 * `use-update-me.test.tsx` pins the optimistic write. What neither can reach is the promise this
 * screen makes to the *app* rather than to the user — that a stale link from a shipped build still
 * resolves, that the two copies of the privacy policy never compete in an index, and that nothing
 * on it takes the WebView out onto the public website.
 *
 * That last one is the reason this file exists. The screen renders `LoginScreen` — a **website**
 * component — when there is no account, and website components link to website URLs. It is passed
 * `webview`, which repoints the consent line at `/app/terms` / `/app/privacy` and drops the
 * sign-up line; drop that prop and the screen still looks perfect in review while quietly handing
 * the app's user the public site, navbar and all. Same failure `not-found.spec.ts` guards on the
 * 404 body, and asserted the same way.
 *
 * ## Not covered here
 *
 * The signed-in half — the card, the three switches, the sign-out confirmation. It needs the token
 * store seeded *and* `/me` stubbed, which is the `e2e/fixtures/` the README asks for rather than a
 * copy of that setup in one spec. Until then the switches are pinned by `useUpdateMe`'s own tests.
 */

const SCREEN = '/app/privacy-settings?lang=vi&theme=dark&platform=ios&v=3.14.0'

test.describe('/app/privacy-settings', () => {
    /**
     * A link that exists in shipped app builds. Asserted as a status rather than by content,
     * because the failure mode is a route that renders fine locally and 404s in the build — and
     * `noindex` is asserted on the **raw response**, since the public `/privacy` twin is a
     * different document and neither should be competing with the other in an index.
     */
    test('resolves, and is never indexed', async ({ request }) => {
        const response = await request.get(SCREEN)

        expect(response.status()).toBe(200)
        expect(await response.text()).toMatch(/<meta name="robots" content="noindex/)
    })

    /**
     * The session resolves on the client, so the first response is the skeleton — and it has to be
     * *there*. The webview opens straight onto this screen with the native header already drawn
     * above it, so an empty frame for the length of a `/me` reads as the app having hung.
     */
    test('ships the skeleton in the first response', async ({ request }) => {
        const html = await (await request.get(SCREEN)).text()

        expect(html).toContain('<main')
        expect(html).toContain('aria-busy="true"')
    })

    /**
     * Nothing on this screen leaves `/app/*`.
     *
     * The sign-in state is reached by refusing the network: with no account in the store and the
     * bootstrap unable to mint one, the screen falls to `<LoginScreen webview />` — which is also
     * exactly what a webview opened without a session looks like. Deterministic, and it keeps the
     * spec off the backend.
     *
     * Asserted over `a[href]` rather than by role, so a link wearing some other role still fails
     * it — the point is the destination, not the semantics.
     */
    test('never links out to the website', async ({ page }) => {
        await page.route(
            url => !['localhost', '127.0.0.1'].includes(url.hostname),
            route => route.abort(),
        )

        await page.goto(SCREEN)

        // The consent line is the last thing on the card, so its presence is also the wait.
        const links = page.locator('main a[href]')
        await expect(links).not.toHaveCount(0)
        for (const href of await links.evaluateAll(all => all.map(a => a.getAttribute('href')))) {
            expect(href, 'a webview link must stay in the /app namespace').toMatch(/^\/app\//)
        }
    })
})
