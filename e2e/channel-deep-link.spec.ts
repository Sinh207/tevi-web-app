import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * **The space's deep links** — `/@{slug}/direct-donation` and `/@{slug}/membership[/{id}]`.
 *
 * These were `proxy.ts` redirects into `/@{slug}?action=…` until they became routes of their own.
 * Every claim worth pinning here is one a unit test cannot reach:
 *
 * - a **redirect back in front of them** is invisible from the code that renders them — the page
 *   compiles, the URL answers, and the reader lands somewhere else. `proxy.test.ts` pins the proxy
 *   side; this pins that the routes actually serve.
 * - the **share card** is server-rendered metadata, which is the entire reason these are routes:
 *   a scraper follows a redirect and describes wherever it lands, so the old shape could only ever
 *   produce the space's generic card.
 * - a **stale tier id** must not 404, and a real HTTP status only behaves correctly in a production
 *   build — which is what this suite runs against.
 *
 * `tevi` is the slug, as in `not-found.spec.ts` and `add-home-screen.spec.ts`: the server render has
 * no bearer and talks to the public gateway, so `page.route` cannot mock it and the space has to be
 * real. Nothing here signs in — every assertion is about what the server sends.
 */

const SLUG = 'tevi'
const SPACE = `/@${SLUG}`
const DONATION = `${SPACE}/direct-donation`
const MEMBERSHIP = `${SPACE}/membership`

/** The `content` of a `<meta>`, by property or name. */
async function meta(page: Page, selector: string) {
    return page.locator(selector).first().getAttribute('content')
}

test.describe('the donation and membership deep links', () => {
    /**
     * The regression that would be silent: a redirect in front of either route. `redirect_url` is
     * empty and the status is 200 on the URL that was asked for, not on a different one.
     */
    test('serve the space at their own address', async ({ page }) => {
        for (const path of [DONATION, MEMBERSHIP, `${MEMBERSHIP}/12`]) {
            const response = await page.goto(path)
            expect(response?.status(), path).toBe(200)
            /*
             * The **response's** URL, not the page's. Once the dialog opens, the control that owns
             * it takes the deep link back out of the address bar with `replaceState` — so
             * `page.url()` is a race against hydration, while the URL the response came from is
             * exactly the claim: nothing redirected on the way in.
             */
            expect(new URL(response?.url() ?? '').pathname, path).toBe(path)
        }
    })

    /**
     * A tier id legacy minted for a tier that has since been deleted. There is one offer per space,
     * so the id selects nothing — refusing it would turn an old shared link into a 404 for nothing.
     */
    test('do not 404 on a tier id that no longer exists', async ({ page }) => {
        const response = await page.goto(`${MEMBERSHIP}/999999`)
        expect(response?.status()).toBe(200)
    })

    /**
     * The card describes **what the link opens**, not the space. This is the whole point of the
     * routes, and it is only observable in the server's HTML: the client never rewrites a title.
     */
    test('carry the offer’s own share card', async ({ page }) => {
        await page.goto(DONATION)
        await expect(page).toHaveTitle(/^Support /)
        expect(await meta(page, 'meta[property="og:title"]')).toMatch(/^Support /)
        expect(await meta(page, 'meta[property="og:url"]')).toContain('/direct-donation')

        await page.goto(MEMBERSHIP)
        await expect(page).toHaveTitle(/^Become a member of /)
        expect(await meta(page, 'meta[property="og:title"]')).toMatch(/^Become a member of /)
    })

    /**
     * `noindex, follow` — the body is the space page's, so an indexed copy is duplicate content
     * against `/@{slug}`. It costs nothing that matters: `noindex` is a search-engine instruction
     * and does not stop the social scrapers that read the card asserted above.
     *
     * The **contrast** with the space page is deliberately not asserted. Whether `/@{slug}` is
     * indexable depends on that creator's own content (`isIndexableChannel` — a description, a
     * name, public privacy), so a spec that asserted it would be asserting facts about somebody's
     * profile. `follow` is what is checked instead: these pages are noindex, not walled off.
     */
    test('are noindex, follow', async ({ page }) => {
        for (const path of [DONATION, MEMBERSHIP]) {
            await page.goto(path)
            const robots = await meta(page, 'meta[name="robots"]')
            expect(robots, path).toContain('noindex')
            expect(robots, path).toContain('follow')
        }
    })

    /**
     * A wrong-cased slug must land on the same **sub-page**, not on the space.
     *
     * This is the `suffix` argument `canonicalChannelRedirect` grew for these routes, and it is only
     * observable in a browser: in development the correction arrives as an RSC-level redirect, so
     * the HTTP response is a 200 and `curl` sees no `Location` at all. A spec that asserted the
     * status would pass while the reader was being sent to the wrong page.
     *
     * The tier id is deliberately **not** carried over — it selects nothing, so a corrected URL
     * should not put a stale one back into circulation.
     */
    test('correct a wrong-cased slug without losing the sub-page', async ({ page }) => {
        const canonical = new URL((await page.goto(SPACE))?.url() ?? '').pathname
        const shouted = `/@${SLUG.toUpperCase()}`
        // Only meaningful if the canonical spelling differs from the shouted one.
        test.skip(canonical === shouted, 'this slug has no distinct canonical casing')

        await page.goto(`${shouted}/direct-donation`)
        await expect(page).toHaveURL(new RegExp(`${canonical}/direct-donation$`))

        await page.goto(`${shouted}/membership/12`)
        await expect(page).toHaveURL(new RegExp(`${canonical}/membership$`))
    })

    /**
     * **Exactly one** robots tag on a not-found render, and the assertion is a **count**.
     *
     * Next emits its own `noindex` when `notFound()` is raised, so a branch that also returns
     * `robots` from `generateMetadata` ships two tags. Both shipped one: the `!slug` branch this
     * page has always had, and the `membership/{a}/{b}` guard. They rendered `noindex, nofollow`
     * followed by `noindex` — agreeing, which is why nothing looked wrong, and one edit away from
     * disagreeing. Nothing about it is visible without counting.
     */
    test('emit one robots tag on a not-found render, not two', async ({ page }) => {
        for (const path of [`${MEMBERSHIP}/1/2`, '/not-a-channel-xyz']) {
            await page.goto(path)
            await expect(page.locator('meta[name="robots"]'), path).toHaveCount(1)
        }
    })

    /**
     * Legacy's spelling of the same links. Those URLs were minted by the old app's own middleware
     * and its account drawer, so they sit in histories and bookmarks — they resolve to the space,
     * with no redirect in front of them.
     */
    test('leave legacy’s ?action= URLs resolving to the space', async ({ page }) => {
        const response = await page.goto(`${SPACE}?action=direct_donation`)
        expect(response?.status()).toBe(200)
        expect(new URL(response?.url() ?? '').pathname).toBe(SPACE)
    })
})
