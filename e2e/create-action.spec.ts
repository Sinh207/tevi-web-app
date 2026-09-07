import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * The shell's **Create** affordance — the rail's accent `+` above `md`, the tab bar's FAB below it.
 * Both offer the same two options, and only one of them is app-only.
 *
 * Three reasons these are browser claims rather than only hook ones
 * (`use-create-action.test.tsx` pins which option means what):
 *
 * - **Two shells are in the DOM at once**, each rendering its own list and its own prompt, so
 *   "the press reaches *this* shell's surface" is a wiring claim about two mounted copies — which
 *   is why the ids differ (`docs/TEST_IDS.md` §5) and why a hook test cannot see it.
 * - **The unavailable row must be a real `disabled` control.** A dimmed row that still takes a
 *   press is indistinguishable from a working one until it does nothing, and `opacity` alone is
 *   what that regression looks like.
 * - **It is an auth-gated action**, which `e2e/README.md` names as a first-class subject: a guest is
 *   offered a sign-in *on the page they are on*, never redirected to `/login`. The URL assertion is
 *   the whole point — a redirect would still show "a sign-in", just not here.
 *
 * Nothing here asserts on **text**: there are nine locales and the ids are the stable handle. What
 * the copy says is pinned in the hook's Vitest, which is also where a key silently falling back to
 * `GetAppDialog`'s generic get-app sentence would be caught.
 */

const DESKTOP = { width: 1280, height: 900 }
const PHONE = { width: 390, height: 844 }

test.describe('create action', () => {
    test('the rail + opens a menu, and only the event row raises the app prompt', async ({
        page,
    }) => {
        await signedIn(page)
        await page.setViewportSize(DESKTOP)
        await page.goto('/')

        await page.getByTestId('navigation-navbar-create').click()

        const menu = page.getByTestId('navigation-navbar-create-menu')
        await expect(menu).toBeVisible()
        const rows = page.getByTestId('navigation-navbar-create-menu-item')
        await expect(rows).toHaveCount(2)

        // The row whose flow is not built is a real disabled control, not just a faded one.
        await expect(rows.and(page.locator('[data-option-value="post"]'))).toBeDisabled()

        await rows.and(page.locator('[data-option-value="event"]')).click()

        await expect(menu).toBeHidden()
        const prompt = page.getByTestId('navigation-navbar-create-prompt')
        await expect(prompt).toBeVisible()
        /*
         * The code itself, not just the popup: `GetAppDialog`'s title and body are optional and
         * fall back, so it can render looking right while carrying nothing. One level of
         * derivation, deliberately — `subTestId` composes twice for the store badges (`-stores`
         * then `-ios`) and `testid-catalog.test.ts` resolves single-level parts only, so a spec
         * reaching for `…-stores-ios` fails that check rather than the e2e job.
         */
        await expect(page.getByTestId('navigation-navbar-create-prompt-qr')).toBeVisible()
    })

    /** The FAB is a different DS component in a different shell, with its own list and prompt. */
    test('the tab bar FAB opens its own list', async ({ page }) => {
        await signedIn(page)
        await page.setViewportSize(PHONE)
        await page.goto('/')

        await page.getByTestId('navigation-tab-bar-create').click()

        await expect(page.getByTestId('navigation-tab-bar-create-dialog')).toBeVisible()
        await expect(page.getByTestId('navigation-tab-bar-create-list-row')).toHaveCount(2)
        await expect(page.getByTestId('navigation-navbar-create-menu')).toBeHidden()

        await page
            .getByTestId('navigation-tab-bar-create-list-row')
            .and(page.locator('[data-row-key="event"]'))
            .click()

        await expect(page.getByTestId('navigation-tab-bar-create-dialog')).toBeHidden()
        await expect(page.getByTestId('navigation-tab-bar-create-prompt')).toBeVisible()
    })

    /**
     * Gate the surface, never the rows. Legacy opens its menu for anybody and raises the login
     * prompt from a row inside it, so a guest picks something before being told to sign in.
     */
    test('a guest gets the login dialog and no menu', async ({ page }) => {
        await asGuest(page)
        await page.setViewportSize(DESKTOP)
        await page.goto('/')

        await page.getByTestId('navigation-navbar-create').click()

        await expect(page.getByTestId('auth-login-close')).toBeVisible()
        await expect(page.getByTestId('navigation-navbar-create-menu')).toBeHidden()
        await expect(page.getByTestId('navigation-navbar-create-prompt')).toBeHidden()
        expect(new URL(page.url()).pathname).toBe('/')
    })
})
