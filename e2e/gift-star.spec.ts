import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { asGuest, signedIn, TEST_ACCOUNT_ID } from './fixtures/session'

/**
 * `/gift-star` — choosing a creator to gift Star to.
 *
 * A port of `web-app`'s `sheetGiftStar`, which is a **chooser and nothing else**: picking a creator
 * navigates to their space, and the gift is made there. So what this spec pins is that the picker
 * *offers* somebody and that the offer is a real link — not that anything is spent, because nothing is.
 *
 * Three things need a browser and nothing else can see any of them:
 *
 * - The Following list is fetched **before anything is typed**. That is the one behavioural difference
 *   from `/search` (`followingWhenIdle`) and the whole reason the screen answers its own question. It
 *   is a query's `enabled`, so a unit test would only be asserting on a mock.
 * - Every creator is an `<a href>` to their space. The row is a link rather than a handler precisely so
 *   it can be middle-clicked, copied and announced as a destination, and `href` is rendered output.
 * - A **guest gets a working field**, not a wall. The action here is public, and the sign-in is asked
 *   for where the money moves — the same call `/search` and `/get-star` both make.
 */

const PATH = '/gift-star'

const FOLLOWED = [
    { id: '1', slug: 'ada', name: 'Ada Lovelace', images: { thumb: '' } },
    { id: '2', slug: 'grace', name: 'Grace Hopper', images: { thumb: '' } },
]

const GLOBAL = [{ id: '3', slug: 'adam', name: 'Adam Smith', images: { thumb: '' } }]

const HANDLERS = {
    'core/v3/channel/followed-channels/': { count: FOLLOWED.length, results: FOLLOWED },
    'search/v3/channel/': { count: GLOBAL.length, next: null, results: GLOBAL },
}

/**
 * Put terms in this account's search history before the page loads.
 *
 * `addInitScript` rather than a write after `goto`, for `seedSession`'s reason: the store is read
 * during the first render, so a write afterwards is a different test (it would be exercising the
 * `storage` event instead of the initial snapshot). The shape is `search-recents.ts`'s own —
 * `{ [accountId]: [{ term, at }] }`, newest first.
 */
async function seedRecents(page: Page, terms: string[]) {
    await page.addInitScript(
        ({ id, list }) => {
            try {
                window.localStorage.setItem('tevi.search.recents', JSON.stringify({ [id]: list }))
            } catch {
                // A browser with storage disabled has bigger problems; never throw here.
            }
        },
        { id: TEST_ACCOUNT_ID, list: terms.map(term => ({ term, at: Date.now() })) },
    )
}

test.describe('gift-star — what a crawler receives', () => {
    /**
     * `noindex, nofollow` — and `nofollow` where `/search` sets `follow: true`, because this page's
     * first screen is a *particular account's* Following list rather than a public result set.
     *
     * Not disallowed in `robots.ts`, for the reason `/my-star` and `/get-star` both write down: a
     * disallowed URL is never fetched, so its `noindex` is never read.
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

test.describe('gift-star — public by design', () => {
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

    /**
     * No signed-out wall. Gating this route would be gating a public action because of what the reader
     * might do three screens later — `docs/DEFINITION_OF_DONE.md` §3. The Following grid is simply
     * absent (its query is signed-in-only), so a guest lands on the idle prompt with a usable field.
     */
    test('gives a guest a working field rather than a prompt', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByTestId('my-star-gift-field')).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        expect(new URL(page.url()).pathname).toBe(PATH)
    })
})

test.describe('gift-star — the picker, signed in', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, HANDLERS)
    })

    /**
     * Nothing typed, and the followed spaces are already on screen. Asserted through the rendered tiles
     * rather than by counting requests: what matters is that the reader has something to press.
     */
    test('opens on the Following list, before anything is typed', async ({ page }) => {
        await page.goto(PATH)

        const main = page.locator('main')
        await expect(main.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
            'href',
            '/@ada',
        )
        await expect(main.getByRole('link', { name: /Grace Hopper/ })).toBeVisible()
        // Nothing has been searched, so nothing from the global list is on screen yet.
        await expect(main.getByTestId('my-star-gift-item')).toHaveCount(0)
    })

    test('a term brings the global list, and every result is a link to a space', async ({
        page,
    }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('my-star-gift-field')).toBeVisible()

        await page.getByTestId('my-star-gift-field').fill('ad')

        const result = page.getByTestId('my-star-gift-item')
        await expect(result).toHaveCount(GLOBAL.length)
        await expect(result.getByRole('link').first()).toHaveAttribute('href', '/@adam')
    })

    /**
     * The Following list is a **horizontal strip**, and the two things worth pinning about it are the
     * two that only exist at runtime: the scrollport is real, and the arrows are conditional.
     *
     * `overscroll-x-contain` is the one with teeth. Without it a swipe that runs off the end of a
     * horizontal scroller inside a page triggers the browser's **back navigation** — the reader is
     * taken off the screen by a gesture aimed at a row of avatars. It is a resolved style, so nothing
     * short of a browser can see it.
     */
    test('scrolls the Following list sideways without handing the gesture to the browser', async ({
        page,
    }) => {
        await page.goto(PATH)

        const track = page.locator('section[aria-labelledby="search-following-heading"] ul')
        await expect(track).toBeVisible()

        const style = await track.evaluate(node => ({
            overscroll: getComputedStyle(node).overscrollBehaviorX,
            snap: getComputedStyle(node).scrollSnapType,
            overflow: getComputedStyle(node).overflowX,
        }))
        expect(style.overscroll).toBe('contain')
        expect(style.snap).toContain('x')
        expect(style.overflow).toBe('auto')
    })

    /**
     * **No arrows on a strip that fits**, which is most searches — a term matching two of the spaces
     * you follow gets two tiles and no chrome at all. The fixture has two, so this is that case.
     *
     * A disabled arrow parked over the first tile is chrome that covers content to say nothing, which
     * is why the component removes them rather than dimming them; the state where they *do* appear
     * needs more tiles than fit and is exercised in `/dev/search`.
     */
    test('draws no arrows when every followed space already fits', async ({ page }) => {
        await page.goto(PATH)

        const strip = page.locator('section[aria-labelledby="search-following-heading"]')
        await expect(strip.getByTestId('search-following-tile')).toHaveCount(FOLLOWED.length)
        await expect(strip.locator('button')).toHaveCount(0)
    })

    /**
     * **Recents sit under the strip, not instead of it.** Two blocks in one idle state, and the order
     * is the claim: the strip answers "who?" with faces, the terms answer "what did I look for last
     * time". `/search` shows only Recents because it has no question of its own to answer.
     *
     * The store is one history per **account**, not per screen — this term was never typed on this
     * page — which is the asymmetry `CreatorPickerView` documents.
     */
    test('offers Recents beneath the Following strip, and pressing one searches it', async ({
        page,
    }) => {
        await seedRecents(page, ['adam smith'])
        await page.goto(PATH)

        const main = page.locator('main')
        const recents = main.locator('section[aria-labelledby="search-recents-heading"]')
        await expect(recents).toBeVisible()

        /*
         * Order asserted through the DOM rather than by eye: `compareDocumentPosition` is the only
         * thing that says "the strip comes first" in a way a CSS change cannot quietly invert.
         */
        const gridIsFirst = await page.evaluate(() => {
            const grid = document.querySelector('[data-testid="search-following-tile"]')
            const list = document.querySelector('section[aria-labelledby="search-recents-heading"]')
            if (!grid || !list) return null
            return Boolean(
                grid.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
            )
        })
        expect(gridIsFirst).toBe(true)

        /*
         * By testid, not by name. `getByRole('button', { name: 'adam smith' })` matches **two**
         * controls in this row — the term and the ✕, whose `aria-label` is "Remove adam smith" — and
         * locating by visible text is nine locators anyway (`docs/TEST_IDS.md`).
         */
        await expect(recents.getByTestId('search-recent')).toHaveCount(1)
        await recents.getByTestId('search-recent').click()
        await expect(page.getByTestId('my-star-gift-field')).toHaveValue('adam smith')
        await expect(main.getByTestId('my-star-gift-item')).toHaveCount(GLOBAL.length)
    })

    /** With no follows and no history there is nothing to offer, so the screen is the instruction. */
    test('falls back to the prompt only when there is neither', async ({ page }) => {
        await page.goto(PATH)

        const main = page.locator('main')
        await expect(main.locator('section[aria-labelledby="search-recents-heading"]')).toHaveCount(
            0,
        )
        await expect(main.getByTestId('search-following-tile').first()).toBeVisible()
    })

    /**
     * The panel is full-bleed below `md` and a card above — the same treatment `/search` gets, which is
     * the point: they are the same panel and the class string is now shared (`SEARCH_PANEL`). Measured
     * rather than asserted on classes, because a resolved radius is the only thing that says the shared
     * constant actually reached this screen.
     */
    test('the panel is full-bleed below md and a card above', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        const field = page.getByTestId('my-star-gift-field')
        await expect(field).toBeVisible()

        const panel = page.locator('main > div').last().locator('> div').first()
        await expect(async () => {
            const phone = await panel.evaluate(node => ({
                radius: getComputedStyle(node).borderTopLeftRadius,
                width: Math.round(node.getBoundingClientRect().width),
            }))
            expect(phone.radius).toBe('0px')
            expect(phone.width).toBe(390)
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
