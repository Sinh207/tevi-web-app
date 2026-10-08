import { expect, test } from '@playwright/test'

/**
 * **Installing a space** — the per-space PWA manifest, and the instruction screen behind
 * `/@{slug}?startapp&addToHomeScreen`.
 *
 * Every claim in this feature lives in a place a unit test cannot reach. The manifest is a route
 * handler whose body is JSON and whose failure mode is a redirect; the instruction screen is
 * reached by a **proxy rewrite**, so what proves it works is that one URL answers with another
 * route's markup while keeping its own address; and the `<link rel="manifest">` has to *replace*
 * the site's rather than sit beside it — two links is the shape of this bug, and the browser
 * silently uses the first.
 *
 * `tevi` is the slug used here, as it is in `not-found.spec.ts`: the server render has no bearer
 * and talks to the public gateway, so `page.route` cannot mock it and the space has to be real.
 */

const SLUG = 'tevi'
const SPACE = `/@${SLUG}`
const GUIDE = `${SPACE}?startapp&addToHomeScreen`
const MANIFEST = `${SPACE}/manifest.webmanifest`

test.describe('the space’s own manifest', () => {
    /**
     * The point of the whole feature: a phone that offers to install `/@tevi` must be reading the
     * *space's* manifest. Two links would render identically and install the wrong thing, which is
     * why the count is asserted and not just the href.
     *
     * **And it has to be in `<head>`.** Chromium reads the manifest by walking the head's children
     * only, while Next streams this route's metadata into the **body** — so the version of this
     * feature that declared `manifest` in `generateMetadata` put a perfectly correct link in a
     * place no browser looks, and Chrome's own parser reported no manifest at all for the page
     * (`Page.getAppManifest` over CDP). Nothing about that is visible in the DOM or the HTML,
     * which is why the parent element is the assertion. See `ChannelManifestLink`.
     */
    test('puts exactly one manifest link in the head, and it is the space’s', async ({ page }) => {
        await page.goto(SPACE)
        const inHead = page.locator('head link[rel="manifest"]')
        await expect(inHead).toHaveCount(1)
        await expect(inHead).toHaveAttribute('href', MANIFEST)
    })

    /**
     * The body copy is Next's streamed metadata and no browser reads it — but it must not
     * *contradict* the head, or the day a browser starts being lenient it would offer the site's
     * app on a creator's page. Both name the space.
     */
    test('does not contradict itself where a lenient parser would look', async ({ page }) => {
        await page.goto(SPACE)
        const hrefs = await page.evaluate(() =>
            [...document.querySelectorAll('link[rel="manifest"]')].map(l => l.getAttribute('href')),
        )
        expect(hrefs.length).toBeGreaterThan(0)
        expect(new Set(hrefs)).toEqual(new Set([MANIFEST]))
    })

    /**
     * Leaving a space stops advertising it — asserted across a **client-side** navigation, which is
     * the only one that exercises the unmount. A fresh load would rebuild the head from scratch and
     * prove nothing about the cleanup.
     */
    test('hands the head link back on the way out', async ({ page }) => {
        await page.goto(SPACE)
        await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', MANIFEST)

        await page.evaluate(() => {
            const a = document.createElement('a')
            a.href = '/premium'
            document.body.appendChild(a)
            a.click()
        })
        await page.waitForURL('**/premium', { timeout: 30_000 })
        await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute(
            'href',
            '/manifest.webmanifest',
        )
    })

    test('answers the spec’s media type, and revalidates', async ({ request }) => {
        const response = await request.get(MANIFEST)
        expect(response.status()).toBe(200)
        expect(response.headers()['content-type']).toContain('application/manifest+json')
        // A renamed space must not leave a stale label on somebody's home screen.
        expect(response.headers()['cache-control']).toContain('must-revalidate')
    })

    /**
     * **The divergence from legacy, pinned where it is observable.** Legacy's `start_url` is the
     * instruction screen, so an installed space opens "here is how to install this" — and legacy's
     * own code tries to navigate away from that, to a host no env file sets. See `channelStartUrl`.
     */
    test('launches an installed space at the space itself', async ({ request }) => {
        const manifest = await (await request.get(MANIFEST)).json()
        expect(manifest.start_url).toBe(`${SPACE}?startapp`)
        expect(manifest.start_url).not.toContain('addToHomeScreen')
        // Declared, because the default would be `/@tevi/` — a directory that does not contain the
        // start URL, which a browser resolves through an error path in its parser.
        expect(manifest.scope).toBe('/')
        // And the identity is the space, not the start URL, so editing that query later cannot
        // split an existing install off from the manifest that describes it.
        expect(manifest.id).toBe(SPACE)
    })

    /**
     * Android prefers a maskable icon, so the avatar has to be offered as both — declaring Tevi's
     * maskable mark instead would put the Tevi logo on every installed space.
     */
    test('carries the creator’s identity and a square icon for both purposes', async ({
        request,
    }) => {
        const manifest = await (await request.get(MANIFEST)).json()
        expect(manifest.name).toBeTruthy()
        expect(manifest.short_name).toBe(manifest.name)
        expect(manifest.display).toBe('standalone')

        const purposes = new Set(manifest.icons.map((icon: { purpose: string }) => icon.purpose))
        expect([...purposes].sort()).toEqual(['any', 'maskable'])
        for (const icon of manifest.icons) {
            const [width, height] = icon.sizes.split('x')
            expect(width).toBe(height)
            // No `type`: the proxy answers WebP whatever the source was, and a browser may filter
            // an icon by its declared type before fetching it.
            expect(icon.type).toBeUndefined()
        }
    })

    /**
     * A space we cannot describe falls back to the site manifest rather than 404ing: a
     * `<link rel="manifest">` that 404s leaves the page with no manifest at all, so a reader who
     * taps *Add to Home Screen* during an outage gets an unnamed icon.
     */
    test('falls back to the site manifest for a space that is not there', async ({ request }) => {
        const response = await request.get('/@no-such-space-here/manifest.webmanifest', {
            maxRedirects: 0,
        })
        expect(response.status()).toBe(307)
        expect(response.headers().location).toContain('/manifest.webmanifest')

        // And the thing it points at is a manifest, not a 404 page.
        const site = await (await request.get('/manifest.webmanifest')).json()
        expect(site.name).toBe('Tevi')
    })
})

test.describe('the instruction screen', () => {
    /**
     * A **rewrite**, so the address stays the space's — legacy's URL, which its manifest pointed
     * installs at and which shared links carry. A redirect here would be a visible behaviour change
     * and would drop the reader off the space's own URL.
     */
    test('renders on the space’s URL without changing it', async ({ page }) => {
        const response = await page.goto(GUIDE)
        expect(response?.status()).toBe(200)
        expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GUIDE)
        await expect(page.getByTestId('channel-add-home-screen')).toBeVisible()
        await expect(page.getByTestId('channel-add-home-screen-item')).toHaveCount(2)
    })

    /**
     * Server-rendered, asserted on the raw HTML: the screen exists for a reader who is about to
     * leave the page through Safari's share sheet, so nothing on it may wait on hydration. The DOM
     * would pass either way once React had run.
     */
    test('arrives complete in the first response', async ({ request }) => {
        const html = await (await request.get(GUIDE)).text()
        expect(html).toContain('data-testid="channel-add-home-screen"')
        expect(html).toContain('data-step="share"')
        expect(html).toContain('data-step="add"')
    })

    /**
     * Both platforms read the manifest and the touch icon of the page you are **standing on**, and
     * this is the page a reader uses Share → *Add to Home Screen* from. The touch icon must also
     * be the *only* one: the site's `apple-icon.png` file convention declares 180×180, so a second
     * link would compete with ours on a rule nobody controls.
     */
    test('points the install at the space, with a squared avatar', async ({ page }) => {
        await page.goto(GUIDE)
        // Both assertions are scoped to the head, because that is the only place either platform
        // reads them from — the same trap the space page's first test documents.
        await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', MANIFEST)

        const icon = page.locator('head link[rel="apple-touch-icon"]')
        await expect(icon).toHaveCount(1)
        await expect(icon).toHaveAttribute('href', /\/180x180\//)
    })

    /** Thin by design and its content belongs to the space, so it must not compete in an index. */
    test('asks not to be indexed, on both of its addresses', async ({ page }) => {
        for (const path of [GUIDE, `/add-home-screen/@${SLUG}`]) {
            await page.goto(path)
            await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
                'content',
                /noindex/,
            )
        }
    })

    /**
     * **The claim that keeps a home-screen icon working.** `?startapp` alone is what an installed
     * space launches with, so it has to render the space — only both markers together are the
     * instruction screen.
     */
    test('does not swallow the URL an installed space launches with', async ({ request }) => {
        const html = await (await request.get(`${SPACE}?startapp`)).text()
        expect(html).not.toContain('data-testid="channel-add-home-screen"')
    })

    /**
     * Crawlable, and `noindex` in a header. It used to be disallowed in `robots.txt` in all three of
     * its shapes, which is the setup that indexes a linked URL bare: a disallowed page is never
     * fetched, so its `noindex` is never read — and this URL is shared.
     */
    test('is noindex in a header and not disallowed in robots.txt', async ({ request }) => {
        const robots = await (await request.get('/robots.txt')).text()
        expect(robots).not.toContain('add-home-screen')
        expect(robots).not.toContain('startapp')
        expect(robots).not.toContain('addToHomeScreen')

        const response = await request.get(`${SPACE}?startapp&addToHomeScreen`)
        expect(response.headers()['x-robots-tag']).toBe('noindex')
    })
})
