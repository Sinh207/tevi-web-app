import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * The wallet's four routes — `/my-wallet`, its transaction history, payout tracking and a withdraw
 * detail — and the three claims about them that **only** a browser can check.
 *
 * All four are private screens built from a bearer that does not exist server-side, and all four
 * fail silently when one of these breaks:
 *
 * 1. **`noindex` in the first response.** None of them is in `robots.ts`'s disallow list, and that is
 *    deliberate for the reason `/redeem-gift-code` spells out: a *disallowed* URL is never fetched, so
 *    its `noindex` is never read. The meta tag is therefore the only thing keeping somebody's ledger
 *    out of an index, and a tag that stopped being emitted looks identical in the app.
 * 2. **A redirect must not shadow a page.** `/my-wallet/transaction-history` moves to `/my-star` only
 *    with `?currency=tvs`; bare, it is a real route. This has already gone wrong once — the entry
 *    matched the bare path, the page compiled, the URL answered 200, and a *different screen* came
 *    back. `proxy.test.ts` pins the table; only a request pins what the server does with it.
 * 3. **The action is gated, never the route.** A guest opening any of these must get the screen and a
 *    **Sign in** control, not a bounce to `/login` — one of these URLs arrives in a push notification.
 *
 * ## What is deliberately not here
 *
 * Anything needing real rows. The ledger, the payout list and a withdraw detail all need a signed-in
 * bearer, and there is still no session fixture (see `e2e/README.md`) — so a spec asserting on rows
 * would be asserting on an empty state. The row-level logic is pinned in Vitest instead
 * (`payout-detail.test.ts`, `wallet-transaction-types.ts`'s tests, `money.test.ts`), and `/dev/*`
 * 404s in a production build so its harnesses cannot be reached from here.
 *
 * Locators are `data-testid` or `main`-scoped roles, never visible text: nine locales make a text
 * locator nine locators, and the account drawer is mounted `inert` on every route, so an unscoped
 * role query finds its controls too.
 */

const WALLET = '/my-wallet'
const HISTORY = '/my-wallet/transaction-history'
const TRACKING = '/my-wallet/payout-tracking'
/** Any id — the route renders its shell before it knows whether the request exists. */
const DETAIL = '/my-wallet/payout-tracking/pr_e2e'

/**
 * WCAG relative luminance and contrast ratio, so a spec can state a colour claim as a number.
 *
 * Written here rather than imported: `e2e/` has no shared helpers module yet, and one function is not
 * worth inventing the convention for.
 */
function contrast(a: string, b: string): number {
    const luminance = (colour: string) => {
        const [r, g, b] = (colour.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(value => {
            const channel = Number(value) / 255
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (lighter + 0.05) / (darker + 0.05)
}

test.describe('wallet — what a crawler receives', () => {
    for (const path of [WALLET, HISTORY, TRACKING, DETAIL]) {
        test(`${path} answers 200 and asks not to be indexed`, async ({ page }) => {
            const response = await page.goto(path)
            expect(response?.status()).toBe(200)

            const robots = page.locator('meta[name="robots"]')
            await expect(robots).toHaveAttribute('content', /noindex/)
            await expect(robots).toHaveAttribute('content', /nofollow/)
        })
    }

    /**
     * Each is canonical to **itself**, including the detail route — its canonical carries the request
     * id rather than pointing at the list, because the two are different documents.
     */
    for (const path of [WALLET, HISTORY, TRACKING, DETAIL]) {
        test(`${path} is canonical to itself`, async ({ page }) => {
            await page.goto(path)
            await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
                'href',
                new RegExp(`${path}$`),
            )
        })
    }
})

test.describe('wallet — a redirect must not shadow a page', () => {
    /**
     * The bug this exists for. `?currency=tvs` is legacy's Star ledger and still moves; the bare path
     * is this app's own currency ledger and must be served.
     *
     * Asserted on the **response chain**, not on the rendered screen: a redirect and a render can
     * look alike once React has run, and what went wrong last time was precisely that the URL
     * answered 200 while the wrong screen came back.
     */
    test('the bare transaction-history path is served, not redirected', async ({ request }) => {
        const response = await request.get(HISTORY, { maxRedirects: 0 })
        expect(response.status()).toBe(200)
    })

    test('?currency=tvs still moves to /my-star, and drops the parameter', async ({ request }) => {
        const response = await request.get(`${HISTORY}?currency=tvs`, { maxRedirects: 0 })
        expect([307, 308]).toContain(response.status())

        const location = response.headers().location
        expect(location).toBeDefined()
        // The parameter *is* the redirect — carrying it forward would leave a `?currency=tvs` on a
        // URL where it means nothing. See `PATH_REDIRECTS`'s `keepSearch` note.
        expect(new URL(location as string, 'http://localhost').pathname).toBe('/my-star')
        expect(location).not.toContain('currency')
    })

    /** Case-insensitively, since the parameter comes off a legacy link somebody may have retyped. */
    test('the match is case-insensitive', async ({ request }) => {
        const response = await request.get(`${HISTORY}?currency=TVS`, { maxRedirects: 0 })
        expect([307, 308]).toContain(response.status())
    })
})

test.describe('wallet — gate the action, never the route', () => {
    /*
     * A guest's bootstrap reaches Firebase and the API for an **anonymous** session, which changes
     * nothing these tests assert — see `asGuest`. Without it they were waiting on somebody else's
     * network and flaking under parallel load.
     */
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

    /**
     * A guest gets `/my-wallet` itself, and the way in is a **button** that raises the sign-in dialog
     * without moving the URL.
     */
    test('/my-wallet asks a guest to sign in and stays put', async ({ page }) => {
        await page.goto(WALLET)

        const signIn = page.getByTestId('my-wallet-sign-in')
        await expect(signIn).toBeVisible()
        await signIn.click()

        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(WALLET)
    })

    test('payout tracking asks a guest to sign in and stays put', async ({ page }) => {
        await page.goto(TRACKING)

        const signIn = page.getByTestId('payout-sign-in')
        await expect(signIn).toBeVisible()
        await signIn.click()

        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(TRACKING)
    })

    /**
     * The history page's signed-out state, which sits **inside the panel** rather than floating on the
     * page — see `MY_WALLET_PANEL`. Only the control is asserted here; the surface is the next block's
     * subject.
     */
    test('transaction history asks a guest to sign in and stays put', async ({ page }) => {
        await page.goto(HISTORY)

        const signIn = page.getByTestId('my-wallet-history-sign-in')
        await expect(signIn).toBeVisible()
        await signIn.click()

        await expect(page.getByRole('dialog')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(HISTORY)
    })

    /**
     * A guest never sees a *broken* detail screen: the route renders its own signed-out state rather
     * than a 404 or an error, because "this payout does not exist" and "you are not signed in" are
     * different sentences and only the bearer can tell them apart.
     */
    test('a withdraw detail renders a signed-out state, not an error', async ({ page }) => {
        const response = await page.goto(DETAIL)
        expect(response?.status()).toBe(200)
        await expect(page.getByTestId('payout-detail-sign-in')).toBeVisible()
    })
})

test.describe('wallet — the single-panel surface', () => {
    /**
     * `docs/DESIGN_SYSTEM.md` §6, and the reason it is asserted in a browser: the rule is *two* values
     * of one token across a breakpoint, so a light-mode screenshot at one width proves nothing. It has
     * regressed twice by someone painting only one end.
     *
     * `/my-wallet/transaction-history` is a single panel — one list — so `<main>` is the surface below
     * `md` and the page colour from `md` up.
     */
    test('history main is the surface below md and the page colour above', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(HISTORY)
        const phone = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        await page.setViewportSize({ width: 1200, height: 900 })
        const desktop = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        // Not compared against literals: the two tokens invert between light and dark, so what is
        // pinned is that the ends *differ* and that neither is transparent — which is the failure
        // mode (one end painted, or `<main>` left with no background at all).
        expect(phone).not.toBe(desktop)
        for (const colour of [phone, desktop]) {
            expect(colour).not.toBe('rgba(0, 0, 0, 0)')
            expect(colour).not.toBe('transparent')
        }
    })

    /**
     * `/my-wallet` is **not** a single panel — it stacks a balance card, an alert and three action
     * rows above the ledger, and the page colour between them is what separates the blocks. So its
     * `<main>` must *not* carry the surface treatment. Pinned because the tempting "fix" is to make
     * the two wallet routes match.
     */
    test('/my-wallet main does not adopt the single-panel treatment', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(WALLET)
        const phone = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        await page.setViewportSize({ width: 1200, height: 900 })
        const desktop = await page
            .locator('main')
            .evaluate(node => getComputedStyle(node).backgroundColor)

        expect(phone).toBe(desktop)
    })
})

/**
 * The **Tevi Coin bonus** — B83, and the one part of the wallet that had nothing in CI holding it.
 *
 * Every claim here needs a bearer, which is why it waited for `e2e/fixtures/session.ts`. Three of them
 * are things no unit test reaches: that the bonus line renders on the row that has one and **not** on
 * the rows that do not, that the sheet's link points into the mini-app space, and that the join is on
 * `billy_tx_id` rather than on position — the fixture deliberately answers with the ids **out of
 * order** and for the *second* row only, so a positional join lights up the wrong row.
 */
const WALLET_LEDGER = [
    {
        id: 'tx-first',
        type: 'platform_earning',
        description: 'Revenue for February',
        created_at: 1_739_000_000_000,
        currency: 'TEVI',
        amount: '8.5',
        net_amount: '8.5',
    },
    {
        id: 'tx-second',
        type: 'platform_earning',
        description: 'Revenue for January',
        created_at: 1_736_400_000_000,
        currency: 'TEVI',
        amount: '4.25',
        net_amount: '4.25',
    },
]

/**
 * One bonus, on the **second** ledger row, `created_at` in epoch **seconds** as the dApp service sends
 * it (billy sends ms — see `api/tevi-coin-api.ts`).
 */
const BONUSES = {
    results: [
        {
            id: 'dapp-1',
            type: 'deposit',
            created_at: 1_736_400_000.123456,
            amount: '10',
            currency: 'TEVI',
            status: 'success',
            billy_tx_id: 'tx-second',
        },
    ],
}

test.describe('wallet — the Tevi Coin bonus', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, {
            'billy/v5/billing/transactions/': { results: WALLET_LEDGER },
            'dapp-wallet/v1/t/transactions/': BONUSES,
        })
    })

    /**
     * The bonus lands on the row it belongs to and nowhere else.
     *
     * `data-ledger-id` is the row's identity — never interpolated into the testid itself, per
     * `docs/TEST_IDS.md`, because our ids contain `-` and some are user-chosen.
     */
    test('renders on the row the payload names, and not on the others', async ({ page }) => {
        await page.goto(HISTORY)
        await expect(page.getByTestId('my-wallet-history')).toBeVisible()

        const withBonus = page.locator('[data-ledger-id="tx-second"]')
        const without = page.locator('[data-ledger-id="tx-first"]')

        await expect(withBonus).toContainText('+10')
        await expect(withBonus.locator('img[src*="tevi-coin"]')).toHaveCount(1)
        await expect(without.locator('img[src*="tevi-coin"]')).toHaveCount(0)
    })

    /**
     * A row **without** a bonus keeps the DS's single-line trailing, and one with a bonus stacks.
     *
     * Measured, not asserted on a class: the stacking is conditional, and the failure mode is a row
     * that has no bonus quietly becoming a column — which changes the height of every ordinary row in
     * the ledger and shows up in no screenshot of the one row being worked on.
     */
    test('stacks the trailing column only where there is a bonus', async ({ page }) => {
        await page.goto(HISTORY)
        await expect(page.getByTestId('my-wallet-history')).toBeVisible()

        const direction = (id: string) =>
            page
                .locator(`[data-ledger-id="${id}"] [data-slot="list-row-trailing"]`)
                .evaluate(node => getComputedStyle(node).flexDirection)

        expect(await direction('tx-second')).toBe('column')
        expect(await direction('tx-first')).toBe('row')
    })

    /**
     * The sheet carries the figure, legacy's sentence, and the way into the mini app.
     *
     * The `href` is the assertion that matters: `features/my-wallet` cannot build a vetted
     * `MiniAppConfig` (`channelApi` is deliberately unexported), so the link navigates to the space —
     * which *is* the app, because `useAutoOpenMiniApp` opens it on arrival. If that link ever stops
     * being `/@TeviCoin` the bonus becomes a dead end, and nothing else would say so.
     */
    test('the sheet shows the bonus and links into the mini-app space', async ({ page }) => {
        await page.goto(HISTORY)
        await page.locator('[data-ledger-id="tx-second"]').click()

        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        await expect(sheet).toContainText('+10')

        const link = page.getByTestId('my-wallet-bonus-app-link')
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', '/@TeviCoin')
    })

    /**
     * The product's display rule, end to end — B83, 2026-08-28: **`success` and amount > 0**.
     *
     * Both of these shipped wrong and neither threw. `isDisplayableBonus` is unit-tested, but only a
     * browser says the withheld row reaches the DOM without a bonus line rather than, say, rendering an
     * empty stacked column that changes every ordinary row's height.
     *
     * The route is overridden **after** `beforeEach`, so these replace the fixture's bonus payload.
     */
    for (const [label, row] of [
        ['a pending bonus', { status: 'pending', amount: '10' }],
        ['a zero bonus', { status: 'success', amount: '0' }],
    ] as const) {
        test(`withholds ${label}`, async ({ page }) => {
            await page.route('**/dapp-wallet/**', route =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            results: [
                                {
                                    id: 'dapp-1',
                                    type: 'deposit',
                                    created_at: 1_736_400_000.5,
                                    currency: 'TEVI',
                                    billy_tx_id: 'tx-second',
                                    ...row,
                                },
                            ],
                        },
                    }),
                }),
            )
            await page.goto(HISTORY)

            const panel = page.getByTestId('my-wallet-history')
            await expect(panel).toBeVisible()
            // The ledger is intact — the withholding must cost the figure and nothing else.
            await expect(panel.getByTestId('my-wallet-history-row')).toHaveCount(2)
            await expect(panel.locator('img[src*="tevi-coin"]')).toHaveCount(0)
            /*
             * And the row it would have been on keeps the DS's single-line trailing. A withheld bonus
             * that still stacked the column would change the height of the row for no visible reason.
             */
            const direction = await page
                .locator('[data-ledger-id="tx-second"] [data-slot="list-row-trailing"]')
                .evaluate(node => getComputedStyle(node).flexDirection)
            expect(direction).toBe('row')
        })
    }

    /**
     * **One request per page, never the accumulated set** — the bug that stopped bonuses appearing.
     *
     * `web-app` hands `getTransactionTxIds` only the rows that just arrived, so each request carries
     * one page of ids. This client first sent the *accumulated* set — page two asked about forty ids,
     * page three sixty — and on a real ledger the lookup then answered with nothing. Side by side on
     * the same account, legacy drew the bonuses and this drew none.
     *
     * Asserted on the outgoing requests, because that is where the difference lives: the screen looks
     * identical either way, right up to the point where every bonus silently disappears.
     */
    test('asks one request per page, never the accumulated set', async ({ page }) => {
        const asked: string[][] = []
        await page.route('**/dapp-wallet/**', async route => {
            const param = new URL(route.request().url()).searchParams.get('billy_tx_id')
            if (param) asked.push(param.split(','))
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { results: [] } }),
            })
        })
        /*
         * Two full pages, so a second page exists to scroll to. `PAGE_SIZE` rows each — the ledger
         * infers "there is more" from a page arriving full, so a short page would end the list.
         */
        const PAGE_SIZE = 20
        const pageOf = (prefix: string) =>
            Array.from({ length: PAGE_SIZE }, (_, index) => ({
                id: `${prefix}-${index}`,
                type: 'platform_earning',
                description: `${prefix} row ${index}`,
                created_at: 1_739_000_000_000 - index * 86_400_000,
                amount_currency: 'TEVI',
                amount: '1.00',
                net_amount: '1.00',
                net_amount_currency: 'TEVI',
            }))
        await page.route('**/billy/v5/billing/transactions/**', route => {
            const requested = Number(new URL(route.request().url()).searchParams.get('page') ?? '1')
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: { results: pageOf(requested === 1 ? 'p1' : 'p2') },
                }),
            })
        })

        await page.goto(HISTORY)
        await expect(page.getByTestId('my-wallet-history')).toBeVisible()
        await expect(async () => expect(asked.length).toBeGreaterThan(0)).toPass({ timeout: 4000 })

        // Reach the sentinel so page two loads.
        await page.mouse.wheel(0, 6000)
        await expect(async () => {
            expect(page.locator('[data-ledger-id^="p2-"]').first()).toBeTruthy()
            expect(asked.length).toBeGreaterThan(1)
        }).toPass({ timeout: 6000 })

        /*
         * The assertion: **no request carries more than one page of ids.** An accumulating client sends
         * 20 then 40; a per-page one sends 20 then 20.
         */
        for (const ids of asked) {
            expect(ids.length).toBeLessThanOrEqual(PAGE_SIZE)
        }
        // And the pages are asked about separately, not merged into one call.
        const mixed = asked.filter(
            ids => ids.some(id => id.startsWith('p1-')) && ids.some(id => id.startsWith('p2-')),
        )
        expect(mixed).toEqual([])
    })

    /**
     * **The ids sent to the lookup are billy's own, never the composed list key.**
     *
     * Asserted on the outgoing **request**, which is the only place it shows: a row billy gave no `id`
     * for still renders (React gets a composed key) and its bonus simply never matches, so the screen
     * looks correct while the query asks about `platform_earning-1739000000000`.
     */
    test('asks only about real billy ids', async ({ page }) => {
        const asked: string[] = []
        await page.route('**/dapp-wallet/**', async route => {
            const param = new URL(route.request().url()).searchParams.get('billy_tx_id')
            if (param) asked.push(param)
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { results: [] } }),
            })
        })
        // The second row arrives with no `id` at all — the case that produced a composed key.
        await page.route(`**/billy/v5/billing/transactions/**`, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        results: [WALLET_LEDGER[0], { ...WALLET_LEDGER[1], id: undefined }],
                    },
                }),
            }),
        )

        await page.goto(HISTORY)
        await expect(page.getByTestId('my-wallet-history')).toBeVisible()
        // Both rows render; only one of them is askable about.
        await expect(page.getByTestId('my-wallet-history-row')).toHaveCount(2)

        await expect(() => expect(asked.length).toBeGreaterThan(0)).toPass({ timeout: 4000 })
        for (const param of asked) {
            expect(param).toBe('tx-first')
            // The composed key is `type-timestamp`; it must never appear in the parameter.
            expect(param).not.toContain('platform_earning-')
        }
    })

    /**
     * **A dApp failure costs the figure and never the history.** The bonus is an annotation on a second
     * service, so this asserts the ledger still lists when that lookup 500s — the reason the bonus is a
     * separate query rather than part of the ledger's `queryFn`.
     */
    test('a failed bonus lookup leaves the ledger readable', async ({ page }) => {
        await page.route(`**/dapp-wallet/**`, route => route.fulfill({ status: 500, body: '{}' }))
        await page.goto(HISTORY)

        const panel = page.getByTestId('my-wallet-history')
        await expect(panel).toBeVisible()
        await expect(panel.getByTestId('my-wallet-history-row')).toHaveCount(2)
        await expect(panel.locator('img[src*="tevi-coin"]')).toHaveCount(0)
    })
})

test.describe('wallet — the ledger row disc, in both themes', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, {
            'billy/v5/billing/transactions/': { results: WALLET_LEDGER },
            'dapp-wallet/v1/t/transactions/': { results: [] },
        })
    })

    /**
     * The 40px brand-tinted disc, and the reason this is a spec rather than a review note: the claim is
     * **two numbers in two themes**, so no single screenshot can make it, and it has already regressed
     * once. Letting `--primary-200` invert on its own gave Dark a disc at 1.16:1 against the panel — a
     * circle that dissolved into `#18181b` — while Light sat at 1.55 and looked fine.
     *
     * Thresholds are the floor, not the target: 1.35 on disc-against-panel (Light measures 1.55, Dark
     * 1.57, and anything under ~1.2 is the failure that was reported) and 3:1 on the glyph, which is
     * what WCAG asks of a non-text mark. Both modes currently clear 4.9 on the glyph.
     */
    for (const theme of ['light', 'dark'] as const) {
        test(`keeps the disc and its glyph legible in ${theme}`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: theme })
            await page.addInitScript(mode => {
                try {
                    window.localStorage.setItem('theme', mode)
                } catch {
                    // A spec with storage disabled has bigger problems.
                }
            }, theme)
            await page.goto(HISTORY)

            const panel = page.getByTestId('my-wallet-history')
            await expect(panel).toBeVisible()
            /*
             * Wait for a **row**, not just the panel: the panel renders with the skeleton inside it, so
             * a panel-only wait can evaluate before any disc exists — which is exactly how the dark
             * case failed with `disc: null` while light, running first and warm, passed.
             */
            await expect(panel.getByTestId('my-wallet-history-row').first()).toBeVisible()

            const colours = await panel.evaluate(node => {
                const disc = node.querySelector('[data-ledger-id] .rounded-full')
                const glyph = disc?.querySelector('svg')
                return {
                    disc: disc ? getComputedStyle(disc).backgroundColor : null,
                    glyph: glyph ? getComputedStyle(glyph).color : null,
                    panel: getComputedStyle(node).backgroundColor,
                }
            })
            expect(colours.disc).toBeTruthy()
            expect(colours.glyph).toBeTruthy()

            // The disc has to read as a disc against the ground it sits on.
            expect(contrast(colours.disc as string, colours.panel)).toBeGreaterThan(1.35)
            // And the glyph has to read against the disc — 3:1 is the non-text floor.
            expect(contrast(colours.glyph as string, colours.disc as string)).toBeGreaterThan(3)
        })
    }

    /**
     * The detail sheet's success strip, and it is a **different** claim from the disc's.
     *
     * `DialogContent` is `bg-background-subtle`, and the DS success surface sits at 1.00 against it in
     * Light — separated by hue alone, which works at high luminance. Dark inherited the same ratio
     * (1.09) and read as a dark band, because hue discrimination collapses in shadow. So Dark takes
     * `--accents-success-bg-focus` instead, and the label moves to `--text-subtitle` because the
     * brighter ground drops `--text-body` under 4.5.
     *
     * Asserted per theme with different floors on purpose: a single threshold would either fail Light
     * (which is legitimately hue-separated) or pass the Dark band this exists to prevent.
     */
    for (const [theme, minStrip] of [
        ['light', 1.0],
        ['dark', 1.5],
    ] as const) {
        test(`keeps the sheet's status strip legible in ${theme}`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: theme })
            await page.addInitScript(mode => {
                try {
                    window.localStorage.setItem('theme', mode)
                } catch {
                    // A spec with storage disabled has bigger problems.
                }
            }, theme)
            await page.goto(HISTORY)

            const panel = page.getByTestId('my-wallet-history')
            await expect(panel.getByTestId('my-wallet-history-row').first()).toBeVisible()
            await panel.getByTestId('my-wallet-history-row').first().click()

            const sheet = page.getByRole('dialog')
            await expect(sheet).toBeVisible()

            const colours = await sheet.evaluate(node => {
                /*
                 * The strip is the one child holding exactly two spans — the sentence and the time.
                 * Located structurally rather than by its words, because those are nine locales.
                 */
                const strip = [...node.querySelectorAll('div')].find(
                    element =>
                        element.children.length === 2 &&
                        [...element.children].every(child => child.tagName === 'SPAN'),
                )
                const spans = strip ? [...strip.querySelectorAll('span')] : []
                return {
                    strip: strip ? getComputedStyle(strip).backgroundColor : null,
                    label: spans[0] ? getComputedStyle(spans[0]).color : null,
                    time: spans[1] ? getComputedStyle(spans[1]).color : null,
                    sheet: getComputedStyle(node).backgroundColor,
                }
            })
            expect(colours.strip).toBeTruthy()
            expect(colours.label).toBeTruthy()

            expect(contrast(colours.strip as string, colours.sheet)).toBeGreaterThanOrEqual(minStrip)
            // The sentence is a 14px paragraph, so 4.5 — this is what the label token moved for.
            expect(contrast(colours.label as string, colours.strip as string)).toBeGreaterThan(4.5)
            expect(contrast(colours.time as string, colours.strip as string)).toBeGreaterThan(4.5)
        })
    }
})
