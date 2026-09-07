import { expect, test } from '@playwright/test'

/**
 * `/redeem-gift-code` — the two claims its page comment makes that only a browser can check, and
 * they are the two `e2e/README.md` lists first: what a crawler receives, and that the **action** is
 * gated rather than the route.
 *
 * Both fail silently. A `noindex` that stopped being emitted looks identical in the app; a route
 * that started redirecting a guest to `/login` looks like it works until someone opens the URL
 * printed on a gift card and loses what they were reading.
 *
 * ## What is deliberately not here
 *
 * A successful redemption. It needs a **real, unused code** that the billing or Premium service
 * will accept — a developer cannot mint one and faking it means spending somebody's gift. The three
 * result panels are driven by hand at `/dev/redeem-gift-code`, which 404s in a production build and
 * so cannot be reached from here; the flow behind them is pinned in `use-redeem-code.test.tsx` and
 * `redeem-sequence.test.ts`.
 */

const PATH = '/redeem-gift-code'

test.describe('redeem gift code — the crawler’s view', () => {
    /**
     * `noindex` has to be in the *first response*, not applied after hydration — and it is also why
     * the route is deliberately absent from `robots.ts`'s disallow list: a disallowed URL is never
     * fetched, so its `noindex` is never read, and this URL is linked from the account drawer on
     * every screen.
     */
    test('answers 200 and asks not to be indexed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    /**
     * The bar, the heading and the field's label are server-rendered, so the screen is readable
     * before any account state resolves — nothing here is fetched on arrival. Asserted against the
     * raw HTML rather than the DOM, which would pass either way once React had run.
     */
    test('server-renders the whole form', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('Redeem gift code')
        expect(html).toContain('Redeem a gift code or gift card')
        expect(html).toContain('Gift code')
        expect(html).toContain('Enter code here')
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })
})

test.describe('redeem gift code — gate the action, never the route', () => {
    /**
     * A guest reads the page and the button reads **Sign in**: pressing raises the sign-in dialog
     * and the URL does not move. Legacy's own button is pressable and silently does nothing.
     *
     * Scoped to `main` for the reason `e2e/README.md` gives — the account drawer is mounted on every
     * route, parked `inert`, and an unscoped role query finds its controls too.
     */
    test('a guest is asked to sign in, and stays on the page', async ({ page }) => {
        await page.goto(PATH)
        const form = page.locator('main form')

        const submit = page.getByTestId('gift-code-submit')
        await expect(submit).toBeEnabled()

        await submit.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    /**
     * The field takes a code without an account — the gate is the press, so nothing about typing is
     * withheld — and the clear button appears only once there is something to clear.
     */
    test('the field is usable signed out, and clears', async ({ page }) => {
        await page.goto(PATH)
        const field = page.locator('main input')
        const clear = page.locator('main form button[type="button"]')

        await expect(clear).toHaveCount(0)
        await field.fill('GIFT-500')
        await expect(clear).toHaveCount(1)

        await clear.click()
        await expect(field).toHaveValue('')
    })
})
