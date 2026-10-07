import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * **What a search engine and a link unfurler are told** — the claims that only exist in the server's
 * HTML and headers, so no unit test can reach them.
 *
 * Every one of these failed silently before it was pinned: a title printing the brand twice, a home
 * page describing itself as "App Router · TypeScript · Tailwind", share cards with no image, and
 * `robots.txt` disallowing the very routes whose `noindex` it therefore stopped anyone reading.
 *
 * `tevi` is the slug, as in `channel-deep-link.spec.ts`: the server render talks to the public
 * gateway with no bearer, so `page.route` cannot mock it and the space has to be real.
 */

const SPACE = '/@tevi'

async function meta(page: Page, selector: string) {
    return page.locator(selector).first().getAttribute('content')
}

async function link(page: Page, selector: string) {
    return page.locator(selector).first().getAttribute('href')
}

test.describe('robots.txt and the sitemap', () => {
    /**
     * Only `/api/` is disallowed. The `noindex` routes are crawlable on purpose — a disallowed URL is
     * never fetched, so its `noindex` is never read and a linked copy is indexed bare.
     */
    test('disallows nothing that has a page', async ({ request }) => {
        const robots = await (await request.get('/robots.txt')).text()
        const disallowed = robots
            .split('\n')
            .filter(line => line.startsWith('Disallow:'))
            .map(line => line.replace('Disallow:', '').trim())
        expect(disallowed).toEqual(['/api/'])
        expect(robots).toMatch(/Sitemap: .+\/sitemap\.xml/)
    })

    test('lists the indexable static pages', async ({ request }) => {
        const sitemap = await (await request.get('/sitemap.xml')).text()
        expect(sitemap).toContain('/premium</loc>')
        expect(sitemap).toContain('/privacy</loc>')
    })
})

test.describe('noindex in a header', () => {
    test('is sent on the routes that must stay out of the index', async ({ request }) => {
        for (const path of ['/app/privacy', '/login', '/my-space']) {
            const response = await request.get(path, { maxRedirects: 0 })
            expect(response.headers()['x-robots-tag'], path).toBe('noindex')
        }
    })

    test('is not sent on an indexable page', async ({ request }) => {
        for (const path of ['/', '/premium', SPACE]) {
            const response = await request.get(path)
            expect(response.headers()['x-robots-tag'], path).toBeUndefined()
        }
    })
})

test.describe('the home page', () => {
    test('is described by legacy’s copy, with the brand once', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/^Monetization platform for content creators .* \| Tevi$/)
        const description = await meta(page, 'meta[name="description"]')
        expect(description).toMatch(/^Tevi is a platform/)
        expect(description).not.toContain('App Router')
    })

    test('unfurls with the default card', async ({ page }) => {
        await page.goto('/')
        expect(await meta(page, 'meta[property="og:image"]')).toContain('/og-default.jpg')
        expect(await meta(page, 'meta[property="og:image:width"]')).toBe('1200')
        expect(await meta(page, 'meta[property="og:site_name"]')).toBe('Tevi')
        expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image')
    })

    test('advertises every language version, and the bare URL as x-default', async ({ page }) => {
        await page.goto('/')
        expect(await link(page, 'link[rel="alternate"][hreflang="vi"]')).toMatch(/\/\?lang=vi$/)
        // Next writes the root path as the bare origin — `https://tevi.com`, no trailing slash.
        const bare = /^https?:\/\/[^/?]+\/?$/
        expect(await link(page, 'link[rel="alternate"][hreflang="x-default"]')).toMatch(bare)
        expect(await link(page, 'link[rel="canonical"]')).toMatch(bare)
    })
})

test.describe('?lang= — a language version is its own page', () => {
    /**
     * The contract `hreflang` rests on: the URL decides the language whatever the cookie says, and
     * the page is canonical to itself. Get either wrong and Google drops the whole set.
     */
    test('renders the language it names and is canonical to itself', async ({ page, context }) => {
        await context.addCookies([
            { name: 'tevi.locale', value: 'ko', url: test.info().project.use.baseURL ?? '' },
        ])
        await page.goto('/premium?lang=vi')
        await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
        expect(await link(page, 'link[rel="canonical"]')).toMatch(/\/premium\?lang=vi$/)
        expect(await meta(page, 'meta[property="og:url"]')).toMatch(/\/premium\?lang=vi$/)
    })

    /**
     * The other direction: the reader's own pick outranks the link they arrived by. Without it the
     * switcher re-rendered in the URL's language and the proxy wrote that back into the cookie, so
     * picking a language on a `?lang=` page did nothing at all.
     */
    test('gives way to the language switcher', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto('/premium?lang=vi')
        await page.getByTestId('navigation-navbar-language').click()
        await page
            .getByTestId('navigation-menu-language-option')
            .and(page.locator('[data-option-value="ko"]'))
            .click()
        await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
        await expect(page).not.toHaveURL(/lang=/)
        await page.reload()
        await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    })

    test('keeps the reader in that language on the next page', async ({ request }) => {
        const response = await request.get('/premium?lang=vi')
        expect(response.headers()['set-cookie']).toContain('tevi.locale=vi')
    })
})

test.describe('the space page', () => {
    test('prints legacy’s title, without the template adding the brand again', async ({ page }) => {
        await page.goto(SPACE)
        await expect(page).toHaveTitle(/\| Content Creator - Tevi$/)
    })

    test('gives structured data an absolute URL', async ({ page }) => {
        await page.goto(SPACE)
        const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent()
        expect(JSON.parse(jsonLd ?? '{}').url).toMatch(/^https?:\/\/.+\/@tevi$/)
    })

    test('always unfurls with an image', async ({ page }) => {
        await page.goto(SPACE)
        expect(await meta(page, 'meta[property="og:image"]')).toBeTruthy()
        expect(await meta(page, 'meta[property="og:site_name"]')).toBe('Tevi')
    })
})

test.describe('a policy page', () => {
    test('keeps the site card though it writes its own share card', async ({ page }) => {
        // `openGraph` is replaced whole by a page that sets it — `siteOpenGraph` is what puts these
        // back, and this is the page shape that shipped without them.
        await page.goto('/privacy')
        expect(await meta(page, 'meta[property="og:image"]')).toContain('/og-default.jpg')
        expect(await meta(page, 'meta[property="og:site_name"]')).toBe('Tevi')
    })
})

test('/home moves to / permanently', async ({ request }) => {
    const response = await request.get('/home', { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(new URL(response.headers().location ?? '', 'http://x').pathname).toBe('/')
})
