import { expect, test } from '@playwright/test'

/**
 * The end rail — legacy's "Trending" column — and the two claims about it that only a real
 * browser can settle.
 *
 * ## 1. Which routes get it
 *
 * It is mounted in `(main)/(rail)/layout.tsx`, so it belongs to every screen with a 612 content
 * column and to nothing else. That is a route-group decision with no runtime check behind it,
 * which means it has exactly one failure mode: someone adds a wide screen inside the group, or
 * moves a page between groups, and the rail quietly follows.
 *
 * The wide documents are the case that matters — `LEGAL_CONTAINER` is 1080 and `BRAND_CONTAINER`
 * is 900, so a rail there does not just look odd, it lands on top of the text. Legacy needs a
 * seven-entry pathname blocklist for the same reason.
 *
 * ## 2. The width gate
 *
 * `min-[1292px]` is `2 × --end-rail-anchor`, the width below which the rail's own arithmetic
 * has no solution. Legacy omits the guard and its rail slides off the viewport, taking a
 * horizontal scrollbar with it. Asserted here rather than in a unit test because it is a media
 * query resolved against a real viewport, and the failure it prevents — a page that scrolls
 * sideways — is only observable in a laid-out document.
 *
 * Both are checked against an anonymous visitor, which is the state that needs no fixture: the
 * pill and the sign-in card render without an account.
 */

/** The rail's own landmark. Scoped by role + name so it cannot match the account drawer. */
const rail = 'aside[aria-label]:has([data-slot="end-rail-pill"])'

test.describe('end rail', () => {
    /** One tab destination and two sub-pages — the sub-pages are the half legacy's blocklist keeps. */
    for (const path of ['/', '/my-star', '/settings/password']) {
        test(`is on ${path}, at a window wide enough to hold it`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 })
            await page.goto(path)

            await expect(page.locator(rail)).toBeVisible()
            await expect(page.locator('[data-slot="end-rail-pill"]')).toBeVisible()
        })
    }

    /**
     * One from each wide container: `/privacy` is `LEGAL_CONTAINER` (1080), `/brand-assets` is
     * `BRAND_CONTAINER` (900). Both are columns the rail would be drawn on top of.
     */
    for (const path of ['/privacy', '/brand-assets']) {
        test(`is not on ${path}, whose column it would sit on top of`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 })
            await page.goto(path)

            await expect(page.locator(rail)).toHaveCount(0)
        })
    }

    /**
     * One pixel either side of the threshold. The narrow case also asserts the thing the gate
     * exists for: no horizontal overflow.
     */
    test('appears at 1292 and not at 1291, and never scrolls the page sideways', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1291, height: 900 })
        await page.goto('/')
        await expect(page.locator(rail)).toBeHidden()
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
            ),
        ).toBe(false)

        await page.setViewportSize({ width: 1292, height: 900 })
        await expect(page.locator(rail)).toBeVisible()
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
            ),
        ).toBe(false)
    })

    /**
     * `dir` comes from the locale on `<html>`, and every offset in the rail is a logical
     * property, so the whole column has to move to the other edge. A single physical `right`
     * anywhere in it would leave the rail sitting on top of the nav rail in Arabic.
     *
     * The locale arrives as `Accept-Language`, which is the second of the three sources
     * `layout.tsx` consults (cookie → header → `en`) and the only one a browser sends on its
     * own — no cookie to seed, and no dependency on which host the harness happens to serve on.
     */
    test.describe('in Arabic', () => {
        test.use({ locale: 'ar' })

        test('mirrors to the other edge', async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 })
            await page.goto('/')

            await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
            const box = await page.locator(rail).boundingBox()
            expect(box).not.toBeNull()
            // Inline-end in RTL is the physical left, so the rail starts well left of centre.
            expect(box?.x).toBeLessThan(720)
        })
    })
})
