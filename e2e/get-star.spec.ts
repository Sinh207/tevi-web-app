import { expect, test } from '@playwright/test'

/**
 * `/get-star` — the three claims its page comment makes that only a browser can check.
 *
 * All three fail silently. A `noindex` that stopped being emitted looks identical in the app; a
 * route that started sending a guest to `/login` looks like it works until somebody follows the `+`
 * in the top bar and loses the screen they were on; and a purchase page that stopped reaching its
 * own address is only found by the person who bookmarked it.
 *
 * ## What is deliberately not here
 *
 * A purchase. It needs a real card, a real charge and a real gateway — and every step past the press
 * belongs to `PaymentProvider`, whose machine, settle loop and card panel are pinned in
 * `use-checkout.test.tsx`, `settle-poll.test.ts` and `use-star-purchase.test.tsx`. What is left for a
 * browser is the shape of the page and who is allowed to press.
 *
 * The **catalogue** is also not asserted on. It is fetched after hydration as this visitor, its rows
 * come from a backoffice that changes them, and one of its fields is not even stable between
 * requests (B86). Asserting a package price here would be a spec that fails on a Tuesday because
 * somebody ran a promotion.
 */

const PATH = '/get-star'

test.describe('get star — the crawler’s view', () => {
    /**
     * `noindex` has to be in the *first response*, and it is also why the route is deliberately
     * absent from `robots.ts`'s disallow list: a disallowed URL is never fetched, so its `noindex`
     * is never read — and this URL is linked from the top bar on every screen.
     */
    test('answers 200 and asks not to be indexed', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
    })

    /**
     * The bar and the title are server-rendered — everything below them needs a bearer this app has
     * no server-side copy of, so the shell arriving in the HTML is the whole of what a first
     * response can promise. Asserted against the raw HTML rather than the DOM, which would pass
     * either way once React had run.
     */
    test('server-renders the bar and the title', async ({ request }) => {
        const html = await (await request.get(PATH)).text()
        expect(html).toContain('Get Star')
    })

    test('is canonical to itself', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })
})

test.describe('get star — gate the action, never the route', () => {
    /**
     * A guest sees the prices and the Pay button is **enabled**: pressing raises the sign-in dialog
     * and the URL does not move. Disabling it instead would leave a dead control with nothing saying
     * why — the trade `useGetStar` records.
     *
     * Scoped to `main` for the reason `e2e/README.md` gives: the account drawer is mounted on every
     * route, parked `inert`, and an unscoped role query finds its controls too.
     */
    test('a guest can press Pay, and is asked to sign in without leaving', async ({ page }) => {
        await page.goto(PATH)

        const pay = page.getByTestId('payment-get-star-pay')
        await expect(pay).toBeEnabled({ timeout: 15_000 })

        await pay.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })

    /**
     * Both choices are radio **groups**, not rows of buttons: a grid of buttons announces eight
     * independent actions and gives no way to hear which one is current. One package and one gateway
     * are checked before anything is touched — the page is never in a "there is a list but nothing
     * is selected" state, which is what lets the total below it always mean something.
     */
    test('opens with a package and a method already chosen', async ({ page }) => {
        await page.goto(PATH)
        const main = page.locator('main')

        await expect(main.locator('[data-testid="payment-star-package"]:checked')).toHaveCount(1, {
            timeout: 15_000,
        })
        await expect(main.locator('[data-testid="payment-gateway"]:checked')).toHaveCount(1)
    })
})

test.describe('get star — the purchase history has its own address', () => {
    const HISTORY = '/get-star/transaction-history'

    /**
     * Somebody's purchases: different for every visitor, meaningless to a crawler, and money. Same
     * pair as the page it hangs off, and absent from `robots.ts` for the same reason — a disallowed
     * URL is never fetched, so its `noindex` is never read.
     */
    test('answers 200, asks not to be indexed, and is canonical to itself', async ({ page }) => {
        const response = await page.goto(HISTORY)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${HISTORY}$`),
        )
    })

    /**
     * A guest gets the **page**, not a redirect: the prompt is on it and the URL does not move. This
     * is the half of "gate the action, never the route" that a unit test cannot see, because what it
     * asserts is that nothing navigated.
     */
    test('a guest is asked to sign in, and stays on the page', async ({ page }) => {
        await page.goto(HISTORY)

        const signIn = page.getByTestId('payment-history-sign-in')
        await expect(signIn).toBeEnabled({ timeout: 15_000 })

        await signIn.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(HISTORY)
    })

    /**
     * **Not offered to a guest**, and that is not a gate — they have no purchases, so the link would
     * lead to a page whose only content is the prompt they can already see one row below. Legacy
     * hides it on the same condition.
     *
     * Asserted here rather than in a unit test because the whole claim is about what the *page*
     * renders for a session with no account, and this suite is the only one that has one. The signed
     * -in half — that the control is a real `<a>` to this address, so middle-click and "open in new
     * tab" work — needs a seeded token store, which `e2e/README.md` records as not built yet.
     */
    test('is not offered to a visitor with no account', async ({ page }) => {
        await page.goto(PATH)
        /*
         * By id, not by role-and-name: the page carries **two** headings that say *Get Star* — the
         * back bar's `<h1>` and the masthead's `<h2>` — so a role query matches both and strict mode
         * fails. Both are deliberate: the bar is sticky and the masthead scrolls away, so each is the
         * title at a different moment.
         */
        await expect(page.locator('#get-star-heading')).toBeVisible()
        // …and carries no way into a history that cannot exist.
        await expect(page.locator(`main a[href="${HISTORY}"]`)).toHaveCount(0)
    })
})

/**
 * `?need=` is read once and then swept off the URL: it has been consumed, and a reload after a
 * successful purchase must not re-apply a gap that no longer exists. The sweep is a `router.replace`,
 * so it is invisible except in the address bar — which is exactly why it needs a spec.
 */
test('sweeps ?need= off the URL once it has been read', async ({ page }) => {
    await page.goto(`${PATH}?need=1000&ref=push`)

    // The parameter that is not ours survives; ours does not.
    await expect(page).toHaveURL(`${PATH}?ref=push`, { timeout: 15_000 })
})
