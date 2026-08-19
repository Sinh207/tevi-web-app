import { expect, test } from '@playwright/test'

/**
 * The splash cover — the three claims it makes that only a browser can check, because all three
 * are about the *first response* or about a clock.
 *
 * `use-splash.test.tsx` pins the state machine. What it cannot pin is that the cover is actually
 * in the server's HTML (a client-only splash flashes, which is the whole thing it exists to
 * prevent), that it covers rather than replaces the app, and that a webview never receives it.
 *
 * ## What is deliberately not here
 *
 * `/dev/splash`, where the lock-up and the fade are looked at by hand — dev routes `notFound()`
 * in a production build, which is what this suite runs against.
 */

const SPLASH = '[data-splash]'

test.describe('splash cover', () => {
    /**
     * Server-rendered, not mounted after hydration. `isBootstrapping` starts `true` in the auth
     * store, so the server render and the first client render agree and the cover ships inside
     * the initial HTML — asserted against the raw response rather than the DOM, which would pass
     * either way once React had run.
     */
    test('is in the first response', async ({ request }) => {
        const html = await (await request.get('/')).text()
        expect(html).toContain('data-splash')
    })

    /**
     * The rule the legacy app breaks: its equivalent renders *instead of* `children`, so a
     * crawler receives a page whose only content is a logo. Here the tree is underneath the
     * cover from the first byte.
     */
    test('covers the app rather than replacing it', async ({ request }) => {
        // Scripts stripped for the reason given on `markup` in the SEO block below: the RSC
        // payload embedded in the document contains the page's markup as data, so an unfiltered
        // response matches even when nothing rendered.
        const html = (await (await request.get('/')).text()).replace(
            /<script[\s\S]*?<\/script>/g,
            '',
        )
        expect(html).toContain('data-splash')
        expect(html).toContain('<main')
    })

    /** The ceiling, which is what makes a full-viewport cover safe to ship at all. */
    test('leaves within its own ceiling', async ({ page }) => {
        await page.goto('/')
        // 3s ceiling plus the 240ms fade, with room for a slow CI machine to schedule the timer.
        await expect(page.locator(SPLASH)).toHaveCount(0, { timeout: 5000 })
    })

    /**
     * A webview must never receive it — the native app has already shown its own splash. It is
     * absent rather than hidden because `/app/*` mounts no session stack at all: `SplashGate`
     * lives in `app/session-providers.tsx`, which only `(web)/layout.tsx` mounts. So this also
     * stands guard over that split — a splash reappearing here means the session providers
     * climbed back into the root layout, taking the auth bootstrap with them.
     */
    test('is absent inside a webview', async ({ request }) => {
        const html = await (await request.get('/app/privacy?theme=dark&lang=vi')).text()
        expect(html).not.toContain('data-splash')
    })
})

/**
 * The constraint the splash was accepted under: **it may not cost anything at search.**
 *
 * These are not tests of the splash so much as tests of the promise made when it shipped, and
 * they are here because every way it could break that promise is invisible from the app. A cover
 * that started replacing content instead of overlaying it, a `noindex` that came along for the
 * ride, a lock-up that grew until it became the largest paint, a layer that stopped being
 * `fixed` — all four look identical in a browser and only show up as lost rankings weeks later.
 *
 * `/privacy` stands in for the indexable surface: it is in `sitemap.ts`, it renders without a
 * session, and it goes through the same root layout as every other page including `/@{slug}`.
 */
test.describe('splash cover — SEO', () => {
    const PAGE = '/privacy'

    /**
     * The response with its `<script>` blocks removed.
     *
     * Next serialises the RSC payload into `self.__next_f.push(...)` inside the document, so
     * every string the page renders appears **twice**: once as markup and once as data. A bare
     * `toContain` therefore matches even when the body rendered nothing — verified by mutation,
     * the first version of the test below passed against a tree whose children had been replaced
     * by the cover, which is the precise regression it exists to catch.
     */
    const markup = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '')

    /**
     * Everything a crawler needs in the *first response*, with the cover in the same document.
     * This is the assertion legacy fails: its gate renders the splash **instead of** `children`,
     * so the page a crawler receives has a logo and nothing else.
     */
    test('serves the whole page behind the cover, to a crawler that runs no JS', async ({
        request,
    }) => {
        const html = markup(await (await request.get(PAGE)).text())

        expect(html).toContain('data-splash')
        expect(html).toContain('<title>Privacy &amp; Policy · Tevi</title>')
        expect(html).toMatch(/<meta name="robots" content="[^"]*index/)
        expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/)

        // Body copy, not just the head. The two assertions above come from `generateMetadata`,
        // which Next renders independently of the component tree — they would survive a page
        // that rendered nothing at all.
        expect(html).toContain('<main')
        expect(html).toContain('Personal')
        expect(html).toContain('We value the privacy of users')
    })

    /**
     * The lock-up must never become the LCP element.
     *
     * It very nearly could: it is centred, it paints immediately, and it is the only thing
     * visible. What keeps it out is that an inline `<svg>` is not an LCP candidate and the
     * 40px wordmark is small — neither of which is a decision anyone recorded, so a background
     * image or a larger mark could quietly make the splash the reported paint. Chrome does no
     * occlusion analysis, so that would report a fast LCP for a screen the user cannot read
     * yet: the metric would improve while the experience got worse.
     */
    test('does not become the largest contentful paint', async ({ page }) => {
        await page.addInitScript(() => {
            ;(window as unknown as { __lcp: string[] }).__lcp = []
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    const el = (entry as PerformanceEntry & { element?: Element }).element
                    ;(window as unknown as { __lcp: string[] }).__lcp.push(
                        el?.closest('[data-splash]') ? 'splash' : (el?.tagName ?? 'unknown'),
                    )
                }
            }).observe({ type: 'largest-contentful-paint', buffered: true })
        })

        await page.goto(PAGE)
        await expect(page.locator(SPLASH)).toHaveCount(0, { timeout: 5000 })

        const candidates = await page.evaluate(
            () => (window as unknown as { __lcp: string[] }).__lcp,
        )
        expect(candidates.length).toBeGreaterThan(0)
        expect(candidates).not.toContain('splash')
    })

    /**
     * The cover contributes nothing to layout — it is out of flow, so its arrival and departure
     * move nothing and it adds no scrollable height.
     *
     * ## Why this is two assertions and not the obvious one
     *
     * The obvious one — compare a heading's box before and after — was written first and is
     * **worthless on its own**: the cover is the last child in the DOM, so dropping `fixed` for
     * `relative` appends a viewport-tall block *below* the content and every element above it
     * keeps its box exactly. Verified by mutation: the box check alone passed against a broken
     * cover. The document's own height is what actually notices.
     *
     * Measured rather than reading CLS, because CLS over a whole page also counts shifts this
     * feature has nothing to do with, and a flaky threshold is worse than no test.
     */
    test('leaves without moving the content or adding page height', async ({ page }) => {
        await page.goto(PAGE)

        // `:visible` is load-bearing. These pages carry **two** `<h1>`s — the mobile app-bar
        // title and the content heading — and the bar's is the first in the DOM while being
        // hidden at desktop width, so an unqualified `main h1` measures an element with no box
        // at all and the test passes on two nulls. Same family of trap as the parked account
        // drawer in `e2e/README.md`.
        const heading = page.locator('main h1:visible').first()
        const scrollHeight = () => page.evaluate(() => document.documentElement.scrollHeight)

        await expect(page.locator(SPLASH)).toHaveCount(1)
        const before = await heading.boundingBox()
        const heightWithCover = await scrollHeight()

        await expect(page.locator(SPLASH)).toHaveCount(0, { timeout: 5000 })

        expect(before).not.toBeNull()
        expect(await heading.boundingBox()).toEqual(before)
        expect(await scrollHeight()).toBe(heightWithCover)
    })
})
