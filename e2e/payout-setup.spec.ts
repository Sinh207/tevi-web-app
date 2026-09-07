import { expect, test } from '@playwright/test'
import { signedIn } from './fixtures/session'

/**
 * `/my-wallet/setup-payouts` — the two claims about it that **only** a browser can check.
 *
 * 1. **The billing country is preselected from the edge's header.** It is read during the document
 *    render (`(web)/layout.tsx` → `shared/lib/geo.ts`), so nothing in jsdom can see it: a request has
 *    to arrive with `x-country-code` and the *server* has to put the answer in the HTML. The unit
 *    tests pin the rule and the parser; this pins that the wiring exists at all.
 * 2. **It opens at the option already chosen.** A creator whose bank is in Viet Nam opening a 250-row
 *    country picker at Afghanistan has to go looking for their own selection to see that it is
 *    checked; the check mark is otherwise a claim nobody can verify. The scroll happens in an effect
 *    against a box found by walking the DOM, so it needs a layout engine to state.
 * 3. **The country dialog scrolls.** It did not, and nothing about that was visible in a test or in a
 *    screenshot of the top of the list: `PickerList`'s flush list carries `overflow-hidden` (it is a
 *    card in its other use), which zeroes a flex item's automatic minimum size — so inside the
 *    dialog's scrolling column the list shrank to the space available and clipped the rest, with the
 *    scroll container reporting nothing to scroll. Measured at the time: 61 rows, 4209px of content,
 *    446px painted. Only a layout engine can catch that, which means only this file can.
 *
 * Locators are `data-testid` throughout: nine locales make a text locator nine locators, and the
 * account drawer is mounted `inert` on every route with picker radios of its own — an unscoped role
 * query finds those too (`e2e/README.md`).
 */

const SETUP = '/my-wallet/setup-payouts'

/** Enough countries to need a scroll in any viewport this suite runs at. */
const COUNTRIES = Array.from({ length: 60 }, (_, index) => ({
    alpha_2: `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`,
    alpha_3: 'XXX',
    name: `Country ${String(index + 1).padStart(2, '0')}`,
    allow_payout: true,
})).concat([{ alpha_2: 'VN', alpha_3: 'VNM', name: 'Viet Nam', allow_payout: true }])

const METHODS = {
    count: 1,
    next: null,
    results: [
        {
            id: 'pm_e2e_bank',
            name: 'Bank Transfer 24/7',
            slug: 'bank_transfer',
            logo: '',
            currency: 'VND',
            exchange_rate: '25457.68',
            is_active: true,
            order: 1,
            daily_limit: null,
            minimum_amount: null,
            processing_time_note: '1 business day',
            country: { alpha_2: 'VN', alpha_3: 'VNM', name: 'Viet Nam', allow_payout: true },
            config: {
                form: [
                    { field: 'bank', display_name: 'Bank', choices: [{ id: 1, name: 'Vietcombank' }] },
                    { field: 'account_number', display_name: 'Account number' },
                    { field: 'holder_name', display_name: 'Account name' },
                ],
            },
        },
    ],
}

const HANDLERS = {
    'billy/v5/billing/payout/countries/': COUNTRIES,
    'billy/v5/billing/payout-methods/': METHODS,
    'billy/v5/billing/payout-configs/': { count: 0, next: null, results: [] },
}

test.describe('setup payouts — the billing country', () => {
    test('is preselected from the country the edge reported', async ({ page }) => {
        await signedIn(page, HANDLERS)
        /*
         * What Cloudflare (or the cluster's ingress) sets on a real request. A page cannot set its own
         * request headers, which is exactly why this is read server-side and why this assertion needs
         * a browser driving the navigation.
         */
        await page.setExtraHTTPHeaders({ 'x-country-code': 'VN' })

        await page.goto(SETUP)

        const field = page.getByTestId('payout-setup-country')
        await expect(field).toContainText('Viet Nam')
        // And the screen is a step ahead: that country's methods are already listed.
        await expect(page.getByTestId('payout-setup-method')).toHaveCount(1)
    })

    test('asks when no proxy said, rather than guessing', async ({ page }) => {
        await signedIn(page, HANDLERS)
        // No header, and `/api/client-ip` has none to read either — the fallback answers `null`.
        await page.goto(SETUP)

        await expect(page.getByTestId('payout-setup-country')).not.toContainText('Viet Nam')
        // No country, no method request: the screen says which answer it is waiting for.
        await expect(page.getByTestId('payout-setup-awaiting-country')).toBeVisible()
    })
})

test.describe('setup payouts — the country dialog', () => {
    test('scrolls to its last option and keeps the search field pinned', async ({ page }) => {
        await signedIn(page, HANDLERS)
        await page.goto(SETUP)

        await page.getByTestId('payout-setup-country').click()

        /*
         * Role-scoped inside the dialog rather than by the rows' own id: `PickerList` derives that id
         * from the `testId` it is handed, which is itself derived here (`-list`), and the catalog guard
         * only follows one hop from a literal. A `radiogroup`'s radios inside a known container is the
         * pattern `e2e/README.md` prescribes anyway — and the drawer's own pickers, mounted `inert` on
         * every route, are what makes the scope mandatory.
         */
        const options = page.getByTestId('payout-setup-country-panel').getByRole('radio')
        await expect(options.first()).toBeVisible()
        await expect(options).toHaveCount(COUNTRIES.length)

        /*
         * The assertion, and it is deliberately about *reachability* rather than about a scrollTop:
         * the bug did not leave the last row off-screen, it left it **unreachable** — clipped by an
         * ancestor whose own `overflow: hidden` swallowed it. `scrollIntoViewIfNeeded` throws when
         * nothing can bring the element into view.
         */
        const last = options.last()
        await last.scrollIntoViewIfNeeded()
        await expect(last).toBeInViewport()

        // The field is why the list is searchable at all, so it has to survive the scroll.
        await expect(page.getByTestId('payout-setup-country-search')).toBeInViewport()
    })

    test('opens at the country already chosen', async ({ page }) => {
        await signedIn(page, HANDLERS)
        // `Viet Nam` sorts last of the 61, so "opened at the selection" and "opened at the top" are
        // ~4,000px apart — the assertion cannot pass by accident.
        await page.setExtraHTTPHeaders({ 'x-country-code': 'VN' })
        await page.goto(SETUP)

        await page.getByTestId('payout-setup-country').click()

        const panel = page.getByTestId('payout-setup-country-panel')
        await expect(panel.getByRole('radio', { checked: true })).toBeInViewport()
        /*
         * And it genuinely scrolled: the first row is out of view. Without this the test would also
         * pass on a short list that happens to fit, which is not the thing being checked.
         */
        await expect(panel.getByRole('radio').first()).not.toBeInViewport()
    })

    test('filters the list and picks a country', async ({ page }) => {
        await signedIn(page, HANDLERS)
        await page.goto(SETUP)

        await page.getByTestId('payout-setup-country').click()
        await page.getByTestId('payout-setup-country-search').fill('viet')

        const options = page.getByTestId('payout-setup-country-panel').getByRole('radio')
        await expect(options).toHaveCount(1)
        await options.first().click()

        // Closes on pick, and the choice is on the field behind it.
        await expect(page.getByTestId('payout-setup-country')).toContainText('Viet Nam')
        await expect(page.getByTestId('payout-setup-method')).toHaveCount(1)
    })
})

test.describe('setup payouts — the method form', () => {
    test('is drawn from the backend’s own field list', async ({ page }) => {
        await signedIn(page, HANDLERS)
        await page.setExtraHTTPHeaders({ 'x-country-code': 'VN' })
        await page.goto(SETUP)

        await page.getByTestId('payout-setup-method').click()

        /*
         * Three fields from `config.form` plus the two contact fields — the shape
         * `lib/payout-method-form.ts` derives, rendered. A bank picker, an account number and an
         * account name: what a Vietnamese bank transfer asks for.
         */
        await expect(page.getByTestId('payout-setup-field')).toHaveCount(3)
        await expect(page.getByTestId('payout-setup-contact-email')).toBeVisible()
        await expect(page.getByTestId('payout-setup-contact-name')).toBeVisible()
        // Nothing filled in yet, so the write is not offered.
        await expect(page.getByTestId('payout-setup-submit')).toBeDisabled()
    })
})
