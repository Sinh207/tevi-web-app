import { expect, test } from '@playwright/test'
import { asGuest, signedIn } from './fixtures/session'

/**
 * `/mcn-partnership` — a creator's contract with the network that manages them.
 *
 * ## Why this screen needs a browser
 *
 * Its whole behaviour is **which of six states it is in**, and three of the six are decided by data
 * that only exists client-side (there is no SSR bearer). The state function itself is pinned in
 * Vitest — `lib/mcn-partnership-state.test.ts` — so what is left for a spec is the part a pure test
 * cannot reach: that the states are wired to the right payloads, that the leave action is offered
 * exactly when it may be, and that a departure already scheduled takes the offer away.
 *
 * That last pair is the reason this file exists. Scheduling a departure is irreversible from the
 * reader's side once the window closes, and the two failures — offering it twice, or hiding the way
 * out — are both silent: the screen renders perfectly either way.
 *
 * ## What the payloads are
 *
 * Stated here rather than fetched, per `e2e/fixtures/session.ts`: these specs check what only a
 * browser can check, over data the spec itself supplies. The *shapes* are the open question **B98**,
 * and pinning them here would be pinning a guess — so the fixtures state only the fields the screen
 * reads.
 */

const PATH = '/mcn-partnership'

const MCN = {
    identifier: 'org-77',
    name: 'Sao Bắc Đẩu Media',
    is_owner: false,
    creator_rate: 70,
    mcn_revenue_rate: 30,
    // 2025-03-01, epoch ms — the spelling `nullableTimestamp` was written for.
    joined_at: 1_740_787_200_000,
}

function myChannel(mcn: unknown) {
    return {
        id: '5001',
        owner_id: '900001',
        slug: 'e2e_creator',
        name: 'E2E Creator',
        privacy: 'public',
        images: { thumb: null, cover: null },
        mcn,
        lives: [],
    }
}

const SPACE = {
    id: 'org-77',
    slug: 'saobacdau',
    images: { thumb: null, cover: null },
    message_url: 'https://support.tevi.com/mcn',
}

/** Handlers for a creator a network manages, with no departure scheduled. */
function managed(leave: unknown = null) {
    return {
        'core/v3/channel/my-channel/': myChannel(MCN),
        'business/v1/organization/media-space/': SPACE,
        'core/v3/organization/leave/': leave,
    }
}

test.describe('mcn partnership — what a crawler receives', () => {
    /**
     * The screen's subject is a commercial agreement and its content differs for every visitor. The
     * route is deliberately **not** in `robots.ts`'s disallow list, for the reason every personal
     * screen in this app states: a disallowed URL is never fetched, so its `noindex` is never read.
     */
    test('answers 200, asks not to be indexed, and is canonical to itself', async ({ page }) => {
        const response = await page.goto(PATH)
        expect(response?.status()).toBe(200)

        const robots = page.locator('meta[name="robots"]')
        await expect(robots).toHaveAttribute('content', /noindex/)
        await expect(robots).toHaveAttribute('content', /nofollow/)

        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            /\/mcn-partnership$/,
        )
    })
})

test.describe('mcn partnership — signed out', () => {
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

    /**
     * A guest gets the prompt, not legacy's "No MCN Partnership" — which is a statement about their
     * contract rather than about the app's ignorance, and is what legacy shows here.
     *
     * The URL stays put: this app gates the **action**, never the route.
     */
    test('asks the reader to sign in, and stays on the route', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByTestId('channel-mcn-partnership-signed-out')).toBeVisible()
        await expect(page.getByTestId('channel-mcn-partnership-sign-in')).toBeVisible()
        await expect(page.getByTestId('channel-mcn-partnership-empty')).toHaveCount(0)
        expect(new URL(page.url()).pathname).toBe(PATH)
    })
})

test.describe('mcn partnership — a managed creator', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, managed())
    })

    test('shows the network, the split and the way out', async ({ page }) => {
        await page.goto(PATH)

        const main = page.locator('main')

        /*
         * The card row, addressed by its testid rather than by the network's name: the name is on
         * screen **twice** (here and in the contact link), and `getByText` resolving to two elements
         * is a strict-mode failure rather than a passing assertion.
         *
         * The row is a link only because the organization record carried a slug — the second half of
         * the claim, and the reason `ManagedByCard` renders a plain block without one.
         */
        const card = page.getByTestId('channel-mcn-partnership-space')
        await expect(card).toContainText(MCN.name)
        await expect(card).toHaveAttribute('href', '/@saobacdau')

        // The split, as percentages. Each appears once on the screen.
        await expect(main.getByText('70%')).toBeVisible()
        await expect(main.getByText('30%')).toBeVisible()

        /*
         * The contact line, likewise present only because the record carried an address — and the
         * **name is inside the link**, which is the whole point of that line being two translation
         * keys rather than one (see `ContactLine`: deleting a placeholder from the middle of a
         * sentence is ungrammatical in Korean).
         */
        const contact = page.getByTestId('channel-mcn-partnership-contact')
        await expect(contact).toHaveAttribute('href', SPACE.message_url)
        await expect(contact).toContainText(MCN.name)
    })

    /**
     * The kebab is offered, and pressing its one item asks before doing anything. Nothing is written
     * here — the confirmation is the assertion.
     */
    test('confirms before scheduling a departure', async ({ page }) => {
        await page.goto(PATH)

        await page.getByTestId('channel-mcn-partnership-menu').click()
        await page.getByTestId('channel-mcn-partnership-leave').click()

        const dialog = page.getByTestId('channel-mcn-partnership-leave-confirm')
        await expect(dialog).toBeVisible()
        // The window is stated in the copy — a creator confirming must be told they have one.
        await expect(dialog.getByText(/48/)).toBeVisible()
    })
})

test.describe('mcn partnership — a departure already scheduled', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(
            page,
            managed({ expected_departure_at: Date.now() + 48 * 60 * 60 * 1000 }),
        )
    })

    /**
     * **The claim this file exists for.** With a departure pending there is nothing to schedule — the
     * state machine has one slot — so the offer has to be gone, and the only control left is the one
     * that calls it off. Legacy hides its kebab on the same condition but also hides it while the
     * answer is *unknown*, which is the window in which its screen offers a second `POST`.
     */
    test('withdraws the leave action and offers the cancellation instead', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByTestId('channel-mcn-partnership-cancel')).toBeVisible()
        await expect(page.getByTestId('channel-mcn-partnership-menu')).toHaveCount(0)
    })
})

test.describe('mcn partnership — nobody manages this creator', () => {
    /**
     * Two accounts land here and the screen must not distinguish them: one in no network, and the
     * **operator** of one. An owner negotiates no split with themselves and cannot leave their own
     * organization, which is why the drawer does not list the row for either.
     */
    for (const [label, mcn] of [
        ['no network', null],
        ['the network’s owner', { ...MCN, is_owner: true }],
    ] as const) {
        test(`shows the empty state for ${label}`, async ({ page }) => {
            await signedIn(page, {
                'core/v3/channel/my-channel/': myChannel(mcn),
                'core/v3/organization/leave/': null,
            })
            await page.goto(PATH)

            await expect(page.getByTestId('channel-mcn-partnership-empty')).toBeVisible()
            await expect(page.getByTestId('channel-mcn-partnership-menu')).toHaveCount(0)
        })
    }
})
