import { expect, test } from '@playwright/test'

/**
 * The 404 — status and body, one surface each.
 *
 * Both halves need a browser against a **production build**: `next dev` does not answer real 404
 * statuses, and the webview branch is decided from a request header `proxy.ts` sets, so it does not
 * exist in a unit test. And both fail silently. A soft 404 (200 plus a not-found body) looks
 * identical in the app and only shows up in Search Console weeks later; the webview branch failing
 * open shows a mobile-app user a "Back to home" button that navigates their WebView onto the public
 * site, which nobody would notice from a web browser at all.
 *
 * `/a/b/c` rather than `/nonexistent`: a single unknown segment is a **channel** URL
 * (`(main)/[slug]`), which answers 200 by design — see the soft-404 limitation documented on that
 * page. This suite is about URLs that match no route at all.
 */

test.describe('404 — the website', () => {
    test('answers a real 404 and offers a way home', async ({ page }) => {
        const response = await page.goto('/a/b/c')

        expect(response?.status()).toBe(404)
        /*
         * By testid, not by the headline's words. The h1 used to be the literal string `404` and
         * could be asserted directly; it is now `notfound_title`, which is a different sentence in
         * each of the nine locales — exactly the nine-selector problem `shared/lib/test-id.ts`
         * exists to stop. The screen's own id says "the 404 frame rendered" in every language.
         */
        await expect(page.getByTestId('app-not-found')).toBeVisible()
        // By role, which is the assertion worth making: it is announced as a link and it goes
        // home. That it *is* a link took a fix — Base UI stamps `role="button"` on every non-native
        // button, so this read `button` until `shared/ui/button.tsx` started handing the attribute
        // back for anchors. `button.test.tsx` pins the unit; this pins the page.
        await expect(page.getByTestId('app-not-found-home')).toHaveAttribute('href', '/')
        // Legacy's second way out — `web-app` sends a reader who followed a dead link to Tevi's own
        // space rather than to the home feed. Pinned because it is a bare literal in `not-found.tsx`
        // (there is no `features/channel/routes.ts` to import), so nothing else would catch a typo.
        await expect(page.getByTestId('app-not-found-safe-space')).toHaveAttribute('href', '/@tevi')
    })
})

test.describe('404 — a webview screen', () => {
    /**
     * A stale link from an old app build. The status has to survive the webview branch, which is
     * the trap: the tidy-looking fix — a catch-all page under `/app` calling `notFound()` — renders
     * the same body and answers **200**, because a dynamically rendered route cannot set its own
     * status. So this asserts the status *and* the body, or it would pass against that mistake.
     */
    test('answers a real 404 with no way out of the app', async ({ page }) => {
        const response = await page.goto('/app/screen-that-never-shipped?lang=vi&theme=dark')

        expect(response?.status()).toBe(404)
        await expect(page.getByTestId('app-not-found')).toBeVisible()
        // No way out at all: asserted as `a[href]` rather than by role, so that a link wearing
        // some other role would still fail it. The native header already has the back button, and a
        // link here takes the WebView onto the public site.
        await expect(page.locator('main a[href]')).toHaveCount(0)
    })

    /** The app's own context still applies to a screen that does not exist. */
    test('keeps the language and theme the app asked for', async ({ page }) => {
        await page.goto('/app/screen-that-never-shipped?lang=vi&theme=dark')

        const html = page.locator('html')
        await expect(html).toHaveAttribute('lang', 'vi')
        await expect(html).toHaveClass(/dark/)
        await expect(html).toHaveAttribute('data-webview', '')
    })
})
