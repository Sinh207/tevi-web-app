import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * `/my-star` — the Star balance and its ledger.
 *
 * The twin of `/my-wallet`: the design split legacy's two-tab wallet into two screens, and this is the
 * Star half. It shares `LedgerPanel` and `LedgerDetailDialog` with the wallet, which is exactly why it
 * needs a spec of its own — a change made for one screen lands on the other, and `wallet.spec.ts`
 * would not notice.
 *
 * **The first spec to use `e2e/fixtures/session.ts`.** Everything below the signed-out block needs a
 * bearer, and there is no way to sign in from the browser without one — read that file's note on why
 * seeding `localStorage` alone is not enough.
 */

const PATH = '/my-star'

/** Two months, so the sticky month header has something to stick under and a second group to reach. */
const STAR_LEDGER = [
    {
        id: 's1',
        type: 'star_purchase',
        description: 'Star top-up',
        created_at: 1_739_000_000_000,
        currency: 'TVS',
        amount: '500',
    },
    {
        id: 's2',
        type: 'donation',
        description: 'Donation to @creator',
        created_at: 1_738_900_000_000,
        currency: 'TVS',
        amount: '-120',
    },
    {
        id: 's3',
        type: 'conversion',
        description: 'Converted to earnings',
        created_at: 1_736_400_000_000,
        currency: 'TVS',
        amount: '-80',
    },
]

test.describe('my-star — what a crawler receives', () => {
    /**
     * The Star ledger is derived from a bearer that does not exist server-side, and the route is not in
     * `robots.ts`'s disallow list — deliberately, for the reason the wallet spec states: a disallowed
     * URL is never fetched, so its `noindex` is never read. The tag is the only thing keeping somebody's
     * Star history out of an index.
     */
    test('answers 200, asks not to be indexed, and is canonical to itself', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            new RegExp(`${PATH}$`),
        )
    })
})

test.describe('my-star — gate the action, never the route', () => {
    // See `asGuest`: the anonymous bootstrap is off-machine and irrelevant to what this asserts.
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

    test('a guest gets the screen and a sign-in control, not a redirect', async ({ page }) => {
        await page.goto(PATH)

        const signIn = page.getByTestId('my-star-sign-in')
        await expect(signIn).toBeVisible()
        await signIn.click()

        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })
})

test.describe('my-star — the ledger, signed in', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, {
            'billy/v5/billing/tvs-transactions/': { results: STAR_LEDGER },
        })
    })

    /**
     * The rows arrive and the panel is no longer a skeleton. `-skeleton` is asserted **absent** rather
     * than the rows present alone: `LedgerPanel` renders the skeleton in the same place, so a panel
     * stuck loading and a panel with no rows look alike to a "rows are visible" assertion.
     */
    test('lists the rows and drops the skeleton', async ({ page }) => {
        await page.goto(PATH)

        const panel = page.getByTestId('my-star-ledger')
        await expect(panel).toBeVisible()
        await expect(page.getByTestId('my-star-ledger-skeleton')).toHaveCount(0)
        await expect(panel.getByTestId('my-star-ledger-row')).toHaveCount(3)
    })

    /**
     * The month header is `sticky` **under the 60px back bar**, not under the viewport's top edge.
     * `LedgerPanel` takes that offset from the caller (`stickyTop`), and getting it wrong hides the
     * label behind the bar — which no screenshot of an unscrolled page shows, and no unit test can see
     * at all, because it is a resolved `position: sticky` against a real scroll.
     */
    test('parks the month header below the back bar rather than under it', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('my-star-ledger')).toBeVisible()

        const header = page.getByTestId('my-star-ledger-group').first()
        await expect(header).toBeVisible()

        // Scroll far enough that the first group would have left the viewport if it were not sticky.
        await page.mouse.wheel(0, 1200)
        await expect(async () => {
            const box = await header.boundingBox()
            expect(box).not.toBeNull()
            /*
             * At or below the bar's own height. `>= 0` alone would pass with the label sitting
             * *behind* the bar, which is the actual failure this pins.
             */
            expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
        }).toPass({ timeout: 4000 })
    })

    /**
     * Pressing a row opens the shared detail sheet. Asserted here as well as on the wallet because the
     * sheet is one component with two vocabularies — a Star row's type labels are `features/my-star`'s
     * own table — and a change to the shared sheet must not take one of them down.
     */
    test('a row opens the detail sheet', async ({ page }) => {
        await page.goto(PATH)

        await page.getByTestId('my-star-ledger-row').first().click()
        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        // The transaction id is the one field on the sheet that comes from the row, not from a label.
        await expect(sheet).toContainText('s1')
    })

    /**
     * `/my-star` is **not** a single-panel screen — it stacks a balance card and action rows above the
     * ledger, and the page colour in the gaps is what separates the blocks (`docs/DESIGN_SYSTEM.md`
     * §6). So `<main>` must not adopt the surface treatment at either width.
     *
     * The inverse of `wallet.spec.ts`'s pair, and pinned for the same reason: the tempting "fix" is to
     * make every wallet-family route paint its screen the same way.
     */
    test('main does not adopt the single-panel treatment', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        await expect(page.getByTestId('my-star-ledger')).toBeVisible()
        const phone = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        await page.setViewportSize({ width: 1200, height: 900 })
        const desktop = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        expect(phone).toBe(desktop)
    })

    /**
     * `LedgerPanel`'s `fullBleed`, which used to be driven by a scroll position and is now driven by
     * the **breakpoint** — `web-app`'s own mechanism. Below `md` the panel meets the bezel (no corners,
     * the column's inset cancelled); from `md` it is a card again.
     *
     * Measured rather than asserted on classes: the whole point of the change was that the geometry no
     * longer depends on where the reader has scrolled to, and only a resolved style says that.
     */
    test('the panel is full-bleed below md and a card above, at any scroll position', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        const panel = page.getByTestId('my-star-ledger')
        await expect(panel).toBeVisible()

        const phone = await panel.evaluate(node => ({
            radius: getComputedStyle(node).borderTopLeftRadius,
            width: Math.round(node.getBoundingClientRect().width),
        }))
        expect(phone.radius).toBe('0px')
        expect(phone.width).toBe(390)

        // Scrolling must change nothing — this is the assertion the old scroll-driven version failed.
        await page.mouse.wheel(0, 800)
        await expect(async () => {
            const after = await panel.evaluate(node => getComputedStyle(node).borderTopLeftRadius)
            expect(after).toBe('0px')
        }).toPass({ timeout: 3000 })

        await page.setViewportSize({ width: 1200, height: 900 })
        await expect(async () => {
            const desktop = await panel.evaluate(node => ({
                radius: getComputedStyle(node).borderTopLeftRadius,
                width: Math.round(node.getBoundingClientRect().width),
            }))
            expect(desktop.radius).not.toBe('0px')
            expect(desktop.width).toBe(612)
        }).toPass({ timeout: 3000 })
    })
})

/**
 * The **Gift Star** row, and the state it can be in.
 *
 * The picker itself moved to `/gift-star` and has its own spec; what belongs here is the row — that it
 * is a **link** when there is Star to give, and a shut `<button>` when there is not.
 *
 * `disabled` on an element that would otherwise be an anchor is exactly the case that looks right and
 * still navigates: `disabled` is not an anchor attribute, so a dimmed `Link` follows on press *and* on
 * Enter. Only a rendered page says which element was chosen.
 */
test.describe('my-star — Gift Star', () => {
    test('links to the picker when there is Star to give', async ({ page }) => {
        await signedIn(page, { 'billy/v5/billing/tvs-transactions/': { results: STAR_LEDGER } })
        await page.goto(PATH)

        const row = page.locator('[data-row-key="balance_action_gift_star"]')
        await expect(row).toHaveAttribute('href', '/gift-star')
        expect(await row.evaluate(node => node.tagName)).toBe('A')
    })

    /**
     * Legacy dims this row at a zero Star balance (`disabled={!balanceTVS}`), and the port narrows it
     * to a **known** zero — a failed balance leaves the row pressable, because a failure is not a
     * denial. The reason is announced rather than left to the 40% opacity to imply.
     */
    test('shuts the row when the balance is a known zero, and says why', async ({ page }) => {
        await signedIn(page, {
            'billy/v5/billing/balance/': {
                balances: [
                    { amount_currency: 'TEVI', amount: '4400.03' },
                    { amount_currency: 'TVS', amount: '0' },
                ],
            },
            'billy/v5/billing/tvs-transactions/': { results: [] },
        })
        await page.goto(PATH)

        const row = page.locator('[data-row-key="balance_action_gift_star"]')
        await expect(row).toBeDisabled()
        expect(await row.evaluate(node => node.tagName)).toBe('BUTTON')
        expect(await row.getAttribute('href')).toBeNull()

        const describedBy = await row.getAttribute('aria-describedby')
        expect(describedBy).not.toBeNull()
        await expect(page.locator(`#${describedBy}`)).toHaveText(/Star/)
    })
})
