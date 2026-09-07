import { expect, test } from '@playwright/test'
import { asGuest, envelope, signedIn } from './fixtures/session'

/**
 * `/my-wallet/payout-request` — the withdraw form.
 *
 * The one screen in the wallet that **spends money**, so the assertions are about the two things that
 * decide whether it can: what goes out on the wire, and what happens when the server says no.
 *
 * The 4xx classification itself is unit-tested (`payout-request-errors.test.ts`, 14 cases). What only a
 * browser can say is that each outcome reaches the *right place on screen* — a dialog, the field, or a
 * message — because that mapping lives in JSX and a wrong branch there is a reader stuck at a
 * verification wall reading a toast.
 *
 * ⚠ **Every route pattern ends in a double-star wildcard.** `interceptors/sign.ts` appends
 * `?verify=<hmac>` to each request, so a pattern stopping at the trailing slash matches nothing — the
 * override is silently never installed and the fixture's catch-all answers instead. It cost three red
 * tests to find, and the failure reads as the app not making the request at all.
 */

const PATH = '/my-wallet/payout-request'

/** One active method with a 5,000 daily allowance, so the ceiling is the balance (4,400.03). */
const CONFIG = {
    id: 'cfg-1',
    status: 'active',
    created_at: 1_739_000_000_000,
    daily_limit_remainder: '5000.00',
    payout_method: {
        id: 'm-1',
        name: 'Bank Transfer 24/7',
        slug: 'bank_transfer',
        currency: 'VND',
        is_active: true,
    },
    payout_detail: { account_number: '••4417' },
}

/**
 * Both speeds **active** — the shape the picker tests need. The live payload has `fast` switched off,
 * which is its own test below.
 */
const OPTIONS = [
    {
        id: 'saving',
        percent_fee_rate: '0.00',
        flat_fee_amount: '0.00',
        metadata: { payout_duration: 15 },
        is_active: true,
    },
    {
        id: 'fast',
        percent_fee_rate: '5.00',
        flat_fee_amount: '0.00',
        metadata: { payout_duration: 1 },
        is_active: true,
    },
]

const QUOTE = {
    id: 'quote-1',
    /*
     * `amount` is on the live payload and the client now **requires** it: a `quote_id` is only submitted
     * when the quote's own amount matches the figure being sent, so a fixture without it is treated as a
     * quote that cannot be trusted — which is what made three tests fail once that guard landed. The
     * seeded amount is the balance, 4,400.03.
     */
    amount: '4400.03',
    amount_currency: 'TEVI',
    net_amount: '23059304.00',
    net_amount_currency: 'VND',
    fee: '101.00',
    fee_currency: 'TEVI',
    exchange_rate: '25457.6849',
    fee_details: [
        {
            type: 'payout_fee',
            subtotal: { amount: '50.00', currency: 'TEVI' },
            flat_fee_amount: '0',
            percent_fee_rate: '5.0',
        },
    ],
}

/**
 * A second method, so the **Select other method** affordance exists: the row and its link are withheld
 * when there is only one (`canChange`), which is why the picker tests need their own fixture — with
 * `base` they were clicking a control that was never rendered.
 */
const SECOND_CONFIG = {
    id: 'c2',
    status: 'active',
    created_at: 1_738_000_000_000,
    daily_limit_remainder: '2000.00',
    contact_name: 'A. Nguyen',
    payout_method: {
        id: 'm-2',
        name: 'USDT',
        slug: 'usdt',
        currency: 'USDT',
        is_active: true,
    },
    payout_detail: { wallet_address: '0x40fe…37e6', network: 'BEP20' },
}

const twoMethods = {
    'billy/v5/billing/payout-configs/': { count: 2, results: [CONFIG, SECOND_CONFIG] },
}

/**
 * A **Premium** channel, which is what keeps the offer sheet shut.
 *
 * ⚠ The path is `core/v3/channel/my-channel/` — `channelApi` is built on `${W_API}/core`, not
 * `/channel`. With the wrong prefix the handler never matched, `isPremium` stayed false, and the offer
 * sheet opened over the submit button in **every** signed-in test. Eleven of them went red at once,
 * which is how the typo announced itself.
 *
 * The sheet opens on arrival for an account without Premium, so without this every signed-in test below
 * would have to dismiss it first. The three tests that are *about* the offer override this with
 * `noPremium` instead — which is the right way round: the sheet is the exception, not the default state
 * of the screen.
 */
const PREMIUM_CHANNEL = {
    'core/v3/channel/my-channel/': { id: 'ch-1', slug: 'e2e', is_premium: true },
}

/** No Premium — the state the offer sheet exists for. */
const noPremium = {
    'core/v3/channel/my-channel/': { id: 'ch-1', slug: 'e2e', is_premium: false },
}

const base = {
    ...PREMIUM_CHANNEL,
    'billy/v5/billing/payout-configs/': { count: 1, results: [CONFIG] },
    'billy/v5/billing/payout-options/': { count: 2, results: OPTIONS },
    'billy/v5/billing/payout/quote/': QUOTE,
}

/**
 * ⚠ **The Premium sheet opens on arrival** for an account without Premium, so most signed-in tests need
 * it out of the way first. `dismissPremiumOffer` does that and is a no-op when the sheet is not there —
 * so a test that has Premium, or one where Fast is open to everyone, can call it unconditionally.
 */
async function dismissPremiumOffer(page: import('@playwright/test').Page): Promise<void> {
    const sheet = page.getByTestId('payout-request-premium-dialog')
    if (await sheet.isVisible().catch(() => false)) {
        await page.getByTestId('payout-request-premium-standard').click()
        await expect(sheet).toHaveCount(0)
    }
}

test.describe('payout request — what a crawler receives', () => {
    test.beforeEach(async ({ page }) => {
        await asGuest(page)
    })

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

    /**
     * **A guest stays here.** The screen redirects to `setup-payouts` when the account has no active
     * withdraw method — and a guest has none, so the naive condition sent every visitor there. Measured
     * in a browser during the build, which is the only place it showed.
     */
    test('a guest gets the sign-in state, not the setup redirect', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-sign-in')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(PATH)
    })
})

test.describe('payout request — the form', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * The field arrives filled with the largest allowed figure — legacy's behaviour, and the reason it
     * has one: a creator opening this screen almost always wants to withdraw what they have.
     */
    test('seeds the amount with the ceiling', async ({ page }) => {
        await page.goto(PATH)
        const field = page.getByTestId('payout-request-amount')
        await expect(field).toBeVisible()
        await expect(field).toHaveValue('4400.03')
    })

    /**
     * The **amount goes out as a string with two decimals**, because the schema types it `decimal`.
     * Asserted on the request body: sending a float is the kind of thing that only shows up as a
     * rounding complaint weeks later.
     */
    test('quotes with a decimal string', async ({ page }) => {
        const bodies: unknown[] = []
        await page.route('**/billy/v5/billing/payout/quote/**', async route => {
            bodies.push(route.request().postDataJSON())
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope(QUOTE)),
            })
        })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-amount')).toHaveValue('4400.03')

        await expect(async () => expect(bodies.length).toBeGreaterThan(0)).toPass({ timeout: 6000 })
        expect(bodies[0]).toMatchObject({
            payout_config_id: 'cfg-1',
            payout_option_id: 'saving',
            amount: '4400.03',
        })
    })

    /**
     * The breakdown, in legacy's shape: **Sub-receive amount** above a dashed rule, then the fee lines,
     * and the net **only on the bar** — legacy puts "Receive amount" there and nowhere else, which is
     * why the summary has no bottom line of its own.
     *
     * Each fee title carries its **rate** (`Withdraw fee: 5%`), which is the half that answers "is this
     * right?" — the charge alone only says what was taken.
     */
    test('shows the sub-receive line, the rated fees, and the net on the bar', async ({ page }) => {
        await page.goto(PATH)

        await expect(page.getByTestId('payout-request-sub-receive')).toContainText('VND', {
            timeout: 8000,
        })
        const fees = page.getByTestId('payout-request-fee')
        await expect(fees).toHaveCount(1)
        await expect(fees.first()).toContainText('5%')
        await expect(fees.first()).toContainText('-')

        await expect(page.getByTestId('payout-request-receive')).toContainText('VND')
    })

    /**
     * Below the minimum, the local rule stops it before any request goes out — the button is disabled
     * and the message is **on the field**, where the thing that has to change is.
     */
    test('rejects an amount under the minimum on the field', async ({ page }) => {
        await page.goto(PATH)
        const field = page.getByTestId('payout-request-amount')
        await expect(field).toHaveValue('4400.03')

        await field.fill('5')
        await expect(page.getByTestId('payout-request-amount-error')).toBeVisible()
        await expect(page.getByTestId('payout-request-submit')).toBeDisabled()
    })

    test('rejects an amount over the ceiling', async ({ page }) => {
        await page.goto(PATH)
        const field = page.getByTestId('payout-request-amount')
        await expect(field).toHaveValue('4400.03')

        await field.fill('999999')
        await expect(page.getByTestId('payout-request-amount-error')).toBeVisible()
        await expect(page.getByTestId('payout-request-submit')).toBeDisabled()
    })
})

test.describe('payout request — the 4xx outcomes', () => {
    /**
     * **The verification wall is a dialog, not a message.** 422 with
     * `identification_level_2_required`, which is legacy's one structured 4xx — and the reason it must
     * not be a toast: it is a step the reader has not taken, so they need somewhere to press.
     */
    test('raises the verification dialog on the identity wall', async ({ page }) => {
        await signedIn(page, {
            ...base,
            'billy/v5/billing/payout-request/': () => ({}),
        })
        await page.route('**/billy/v5/billing/payout-request/**', route =>
            route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    code: 'identification_level_2_required',
                    message: 'Identification level 2 required',
                }),
            }),
        )
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-amount')).toHaveValue('4400.03')

        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        /*
         * The send button opens the **confirm dialog**; it does not post. Legacy's `handleOpen('confirm')`,
         * ported because one press on a money screen must not be the whole action.
         */
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()
        await page.getByTestId('payout-request-confirm').click()

        const dialog = page.getByTestId('payout-request-verify-dialog')
        await expect(dialog).toBeVisible()
        // The link is the dialog's whole job.
        await expect(page.getByTestId('payout-request-verify-go')).toHaveAttribute(
            'href',
            '/identification',
        )
        // And it must not also have raised a message.
        await expect(page.getByTestId('payout-request-error')).toHaveCount(0)
    })

    /**
     * A limit verdict goes **on the field**, with the backend's own sentence — the fix is to edit the
     * number, and a message anywhere else is one the reader has to remember while they look back at the
     * input.
     */
    test('puts a server amount verdict on the field', async ({ page }) => {
        await signedIn(page, base)
        await page.route('**/billy/v5/billing/payout-request/**', route =>
            route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    code: 'daily_limit_exceeded',
                    message: 'Daily limit exceeded',
                }),
            }),
        )
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        /*
         * The send button opens the **confirm dialog**; it does not post. Legacy's `handleOpen('confirm')`,
         * ported because one press on a money screen must not be the whole action.
         */
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()
        await page.getByTestId('payout-request-confirm').click()

        await expect(page.getByTestId('payout-request-amount-error')).toContainText(
            'Daily limit exceeded',
        )
        await expect(page.getByTestId('payout-request-verify-dialog')).toHaveCount(0)
    })

    /**
     * **Axios's own wording must never reach the reader.** A 500 with no usable body shows this app's
     * sentence, not "Request failed with status code 500".
     */
    test('shows our own sentence on a 5xx, never the transport message', async ({ page }) => {
        await signedIn(page, base)
        await page.route('**/billy/v5/billing/payout-request/**', route =>
            route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: '<html>500</html>' }),
            }),
        )
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        /*
         * The send button opens the **confirm dialog**; it does not post. Legacy's `handleOpen('confirm')`,
         * ported because one press on a money screen must not be the whole action.
         */
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()
        await page.getByTestId('payout-request-confirm').click()

        const error = page.getByTestId('payout-request-error')
        await expect(error).toBeVisible()
        await expect(error).not.toContainText('status code')
        await expect(error).not.toContainText('html')
    })
})

test.describe('payout request — the confirmation step', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * **Send opens a dialog; it does not post.** The omission this covers was mine: the first version
     * submitted on one press, so nothing stood between a misclick and a withdrawal. Legacy's send button
     * opens `confirmWithdraw` and *that* submits.
     */
    test('sends nothing until the confirmation is accepted', async ({ page }) => {
        let posts = 0
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            posts += 1
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-new' })),
            })
        })
        await page.goto(PATH)

        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        const dialog = page.getByTestId('payout-request-confirm-dialog')
        await expect(dialog).toBeVisible()
        // Nothing has been posted yet — the whole point of the step.
        expect(posts).toBe(0)

        /*
         * **The dialog restates the net — what actually arrives, after fees.** It used to print
         * `amount × rate`, legacy's `subReceiveAmount`, i.e. the *gross*: a bigger number than the bar
         * it was opened from, presented as the thing being confirmed. On a VND method with a 5% fast
         * fee that is a difference of millions. `QUOTE.net_amount` is `23059304.00 VND`.
         */
        await expect(page.getByTestId('payout-request-confirm-amount')).toContainText('23,059,304')
        // And the ETA strip, which is what replaced the old title.
        await expect(page.getByTestId('payout-request-confirm-eta')).toBeVisible()

        await page.getByTestId('payout-request-confirm').click()
        await expect(async () => expect(posts).toBe(1)).toPass({ timeout: 6000 })
        // And a created request lands on its detail screen.
        await expect(page).toHaveURL(/\/my-wallet\/payout-tracking\/pr-new$/, { timeout: 8000 })
    })

    /** Dismissing it posts nothing. */
    test('posts nothing when the confirmation is dismissed', async ({ page }) => {
        let posts = 0
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            posts += 1
            await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
        })
        await page.goto(PATH)

        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(page.getByTestId('payout-request-confirm-dialog')).toHaveCount(0)
        expect(posts).toBe(0)
    })
})

test.describe('payout request — two-step verification', () => {
    /**
     * **The gate that made this screen unusable for a whole group of accounts.**
     *
     * An account with `two_fa_passcode: true` used to submit with no passcode, be refused, and land in
     * the `unknown` branch: one generic sentence and nothing to press. So the assertions here are the
     * two halves of the fix — the step appears, and the code it collects reaches the **request body**,
     * not just the verify call.
     *
     * ⚠ `signedIn` is called **before** `page.route`: Playwright runs the most recently registered
     * handler first, so overriding the fixture's catch-all means registering after it.
     */
    const TWO_FA_USER = {
        id: 900_001,
        username: 'e2e_creator',
        display_name: 'E2E Creator',
        anonymous: false,
        two_fa_passcode: true,
    }

    /** Fill the six boxes, which is what submits — there is no button in that dialog. */
    async function enterPasscode(page: import('@playwright/test').Page, code: string) {
        const boxes = page.getByTestId('auth-two-fa-digit')
        for (const [index, digit] of [...code].entries()) {
            await boxes.nth(index).fill(digit)
        }
    }

    test('asks for the passcode after the confirmation, and sends it on the request', async ({
        page,
    }) => {
        await signedIn(page, base, TWO_FA_USER)

        const verified: unknown[] = []
        await page.route('**/auth/v1/two-fa/passcode/verify/**', async route => {
            // ⚠ POST only — a CORS preflight matches the same pattern and its `postDataJSON()` is
            // `null`, which is a null pushed into the array these assertions count.
            if (route.request().method() === 'POST') verified.push(route.request().postDataJSON())
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        })
        const posted: Record<string, unknown>[] = []
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            if (route.request().method() === 'POST') {
                posted.push(route.request().postDataJSON() as Record<string, unknown>)
            }
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-2fa' })),
            })
        })

        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await page.getByTestId('payout-request-confirm').click()

        // Confirm does **not** post for this account — it hands over to the passcode step.
        const dialog = page.getByTestId('auth-two-fa-dialog')
        await expect(dialog).toBeVisible()
        expect(posted).toHaveLength(0)

        await enterPasscode(page, '135790')

        await expect(async () => expect(posted).toHaveLength(1)).toPass({ timeout: 8000 })
        // Verified *and* attached: legacy sends both, and the write is what the backend enforces.
        expect(verified).toEqual([{ passcode: '135790' }])
        expect(posted[0].passcode).toBe('135790')
        await expect(page).toHaveURL(/\/my-wallet\/payout-tracking\/pr-2fa$/, { timeout: 8000 })
    })

    /**
     * **A wrong passcode posts nothing**, and says so in the dialog rather than in the backend's own
     * words — the API's sentence is English in nine locales.
     */
    test('posts nothing when the passcode is refused', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)

        await page.route('**/auth/v1/two-fa/passcode/verify/**', route =>
            route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    message: 'Passcode is not correct, 2 attempts left',
                }),
            }),
        )
        let posts = 0
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            posts += 1
            await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
        })

        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await page.getByTestId('payout-request-confirm').click()
        await enterPasscode(page, '000000')

        const error = page.getByTestId('auth-two-fa-error')
        await expect(error).toBeVisible()
        await expect(error).not.toContainText('attempts left')
        await expect(error).not.toContainText('status code')
        expect(posts).toBe(0)
        // And the boxes are empty again, ready for another try.
        await expect(page.getByTestId('auth-two-fa-digit').first()).toHaveValue('')
    })

    /**
     * **An account without two-step verification is untouched.** The gate is a flag on `/me`, and the
     * regression to fear is the prompt appearing for everybody — which nothing they could type would
     * get them past.
     */
    test('never asks an account that has no passcode', async ({ page }) => {
        await signedIn(page, base)
        await page.route('**/billy/v5/billing/payout-request/**', route =>
            route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-plain' })),
            }),
        )
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await page.getByTestId('payout-request-confirm').click()

        await expect(page).toHaveURL(/\/my-wallet\/payout-tracking\/pr-plain$/, { timeout: 8000 })
        await expect(page.getByTestId('auth-two-fa-dialog')).toHaveCount(0)
    })

    /**
     * **The server can ask for a passcode this screen did not know about** — two-step verification
     * switched on elsewhere after `/me` was cached. `passcode-required` is what turns that refusal into
     * the step, so `two_fa_passcode: false` here is the point of the test, not an oversight.
     */
    test('raises the step when the server asks for a passcode the profile did not mention', async ({
        page,
    }) => {
        await signedIn(page, base)

        const posted: Record<string, unknown>[] = []
        await page.route('**/auth/v1/two-fa/passcode/verify/**', route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
        )
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            /*
             * ⚠ **`postDataJSON()` is `null` on the CORS preflight**, and the preflight matches this
             * pattern too — so an unfiltered handler pushed a third, null entry and then threw reading
             * `.passcode` off it. Filter on the method; the assertion below counts *withdrawal
             * attempts*, and an `OPTIONS` is not one.
             */
            const body = route.request().postDataJSON() as Record<string, unknown> | null
            if (route.request().method() !== 'POST' || !body) {
                await route.fulfill({ status: 204, body: '' })
                return
            }
            posted.push(body)
            if (!body.passcode) {
                await route.fulfill({
                    status: 422,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: false,
                        code: 'passcode_required',
                        message: 'Two-step verification is required',
                    }),
                })
                return
            }
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-late' })),
            })
        })

        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await page.getByTestId('payout-request-confirm').click()

        // First attempt went without a passcode and was refused — the dialog opens on the refusal.
        const dialog = page.getByTestId('auth-two-fa-dialog')
        await expect(dialog).toBeVisible({ timeout: 8000 })
        // …and it says why it is there, rather than looking like a dropped press.
        await expect(page.getByTestId('auth-two-fa-error')).toBeVisible()

        await enterPasscode(page, '424242')
        await expect(page).toHaveURL(/\/my-wallet\/payout-tracking\/pr-late$/, { timeout: 8000 })
        expect(posted).toHaveLength(2)
        expect(posted[1].passcode).toBe('424242')
    })
})

test.describe('payout request — forgetting the passcode', () => {
    /**
     * **The dead end this closes.** Before the recovery chain, an account whose creator had forgotten
     * their passcode could not withdraw from the web at all: the dialog collected six digits, the
     * server refused them, and there was nowhere to press. Now the whole chain runs in the dialog —
     * `recover/` → `reset/verify-otp/` → `reset/` — and lands back on *Enter passcode* with the new
     * one.
     *
     * The step transitions and the payload shapes are unit-tested (`use-two-fa-flow.test.tsx`, 17
     * cases). What only a browser can say is that the band's one slot really carries **both** jobs —
     * `xmark` at the root, `angle-left` once there is a step behind — because a wrong branch there is
     * a reader with no way out of the middle of a passcode reset.
     */
    const TWO_FA_USER = {
        id: 900_002,
        username: 'e2e_creator',
        display_name: 'E2E Creator',
        anonymous: false,
        two_fa_passcode: true,
    }

    async function enter(page: import('@playwright/test').Page, code: string) {
        const boxes = page.getByTestId('auth-two-fa-digit')
        for (const [index, digit] of [...code].entries()) {
            await boxes.nth(index).fill(digit)
        }
    }

    /** Get to the passcode dialog: Send → Confirm. */
    async function openPasscodeStep(page: import('@playwright/test').Page) {
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()
        await page.getByTestId('payout-request-confirm').click()
        await expect(page.getByTestId('auth-two-fa-dialog')).toBeVisible()
    }

    test('runs the whole reset and comes back able to withdraw', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)

        const calls: string[] = []
        const resets: Record<string, unknown>[] = []
        await page.route('**/auth/v1/two-fa/passcode/**', async route => {
            const request = route.request()
            if (request.method() !== 'POST') {
                await route.fulfill({ status: 204, body: '' })
                return
            }
            const path = new URL(request.url()).pathname
            calls.push(path.replace('/auth/v1/two-fa/passcode/', '') || 'verify-root')
            if (path.endsWith('/reset/')) {
                resets.push(request.postDataJSON() as Record<string, unknown>)
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        })
        const posted: Record<string, unknown>[] = []
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            if (route.request().method() === 'POST') {
                posted.push(route.request().postDataJSON() as Record<string, unknown>)
            }
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-reset' })),
            })
        })

        await openPasscodeStep(page)

        // Root step: a close cross, no back arrow, and the way out of the dead end.
        await expect(page.getByTestId('auth-two-fa-header-close')).toBeVisible()
        await expect(page.getByTestId('auth-two-fa-header-prev')).toHaveCount(0)
        await page.getByTestId('auth-two-fa-forgot').click()

        // The email went, and the slot has swapped to a back arrow.
        await expect(page.getByTestId('auth-two-fa-resend')).toHaveCount(0)
        await expect(page.getByTestId('auth-two-fa-header-prev')).toBeVisible({ timeout: 6000 })
        await expect(page.getByTestId('auth-two-fa-header-close')).toHaveCount(0)

        await enter(page, '111111') // the emailed code
        await enter(page, '246810') // the new passcode
        await enter(page, '246810') // …confirmed

        // The hint step: Skip is a real answer, Continue wants something typed.
        await expect(page.getByTestId('auth-two-fa-save')).toBeDisabled()
        await page.getByTestId('auth-two-fa-hint').fill('my first pet')
        await expect(page.getByTestId('auth-two-fa-save')).toBeEnabled()
        await page.getByTestId('auth-two-fa-save').click()

        // Back at the root step, told why — and the cross is back, so the chain really ended.
        await expect(page.getByTestId('auth-two-fa-note')).toBeVisible({ timeout: 6000 })
        await expect(page.getByTestId('auth-two-fa-header-close')).toBeVisible()
        expect(calls).toEqual(['recover/', 'reset/verify-otp/', 'reset/'])
        // The OTP from three screens earlier is what authorised the write.
        expect(resets[0]).toEqual({
            passcode: '246810',
            passcode_hint: 'my first pet',
            otp: '111111',
        })

        // And the new passcode gets the withdrawal through.
        await enter(page, '246810')
        await expect(async () => expect(posted).toHaveLength(1)).toPass({ timeout: 8000 })
        expect(posted[0].passcode).toBe('246810')
    })

    /**
     * **Back really goes back**, one step at a time, and the passcode being confirmed survives it —
     * otherwise the button is a way to lose what was just typed.
     */
    test('walks back out of the chain without losing the new passcode', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)
        await page.route('**/auth/v1/two-fa/passcode/**', route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
        )

        await openPasscodeStep(page)
        await page.getByTestId('auth-two-fa-forgot').click()
        await expect(page.getByTestId('auth-two-fa-header-prev')).toBeVisible({ timeout: 6000 })
        await enter(page, '111111')
        await enter(page, '246810')

        // On the confirm step. One press back, and the new passcode is still filled in.
        await page.getByTestId('auth-two-fa-header-prev').click()
        const boxes = page.getByTestId('auth-two-fa-digit')
        await expect(boxes.nth(0)).toHaveValue('2')
        await expect(boxes.nth(5)).toHaveValue('0')

        // Two more, and the cross is back — the root step, chain abandoned.
        await page.getByTestId('auth-two-fa-header-prev').click()
        await page.getByTestId('auth-two-fa-header-prev').click()
        await expect(page.getByTestId('auth-two-fa-header-close')).toBeVisible()
        await expect(page.getByTestId('auth-two-fa-forgot')).toBeVisible()
    })

    /**
     * A **mismatch** costs no request, so the emailed code is not spent and the reader simply types
     * again rather than asking for another email.
     */
    test('reports a mismatch without spending the emailed code', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)
        let resets = 0
        await page.route('**/auth/v1/two-fa/passcode/**', async route => {
            if (new URL(route.request().url()).pathname.endsWith('/reset/')) resets += 1
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        })

        await openPasscodeStep(page)
        await page.getByTestId('auth-two-fa-forgot').click()
        await expect(page.getByTestId('auth-two-fa-header-prev')).toBeVisible({ timeout: 6000 })
        await enter(page, '111111')
        await enter(page, '246810')
        await enter(page, '999999')

        const error = page.getByTestId('auth-two-fa-error')
        await expect(error).toBeVisible()
        expect(resets).toBe(0)
        // The boxes are cleared for another attempt, still on the confirm step.
        await expect(page.getByTestId('auth-two-fa-digit').first()).toHaveValue('')

        await enter(page, '246810')
        await expect(page.getByTestId('auth-two-fa-hint')).toBeVisible()
    })

    /**
     * **A failed recovery email is not a wrong code.** Reusing the passcode mapper here reported it as
     * one, on a step where no code had been typed — caught by the unit tests, asserted here because
     * the wording is what the reader acts on.
     */
    test('says the email failed rather than blaming the code', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)
        await page.route('**/auth/v1/two-fa/passcode/recover/**', route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'No recovery email on file' }),
            }),
        )

        await openPasscodeStep(page)
        await page.getByTestId('auth-two-fa-forgot').click()

        const error = page.getByTestId('auth-two-fa-error')
        await expect(error).toBeVisible({ timeout: 6000 })
        // Never the backend's sentence, and never the wrong-code line.
        await expect(error).not.toContainText('recovery email on file')
        await expect(error).not.toContainText('Wrong code')
        // Still on the root step, with the six boxes and the link both there to try again.
        await expect(page.getByTestId('auth-two-fa-header-close')).toBeVisible()
        await expect(page.getByTestId('auth-two-fa-forgot')).toBeVisible()
    })

    /**
     * **The countdown is the code's lifetime**, not just the resend gate (B88, answered). Past zero the
     * boxes are dead and the step says so — asserted in a browser because the failure it replaces is
     * silence: six live-looking boxes that swallow every digit.
     *
     * The clock is driven forward rather than waited out: 30 real seconds in a spec is 30 seconds every
     * run, and this only needs the countdown's own `setTimeout` to fire.
     */
    test('marks the emailed code dead when the countdown runs out', async ({ page }) => {
        await signedIn(page, base, TWO_FA_USER)
        let verifies = 0
        await page.route('**/auth/v1/two-fa/passcode/**', async route => {
            if (new URL(route.request().url()).pathname.endsWith('/reset/verify-otp/')) verifies += 1
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        })

        await openPasscodeStep(page)
        await page.getByTestId('auth-two-fa-forgot').click()
        await expect(page.getByTestId('auth-two-fa-header-prev')).toBeVisible({ timeout: 6000 })
        // While it is alive: a countdown, and no resend control.
        await expect(page.getByTestId('auth-two-fa-resend')).toHaveCount(0)

        /*
         * Speed the page's clock up 60×. `setTimeout` is what the countdown re-arms every second, so
         * shortening every delay walks it to zero in half a second of real time.
         */
        await page.evaluate(() => {
            const real = window.setTimeout
            // @ts-expect-error — deliberately replacing the global for this spec's page only.
            window.setTimeout = (fn: TimerHandler, ms?: number, ...rest: unknown[]) =>
                real(fn, Math.max(1, Math.floor((ms ?? 0) / 60)), ...rest)
        })

        // Resend appears, which is the countdown having reached zero.
        await expect(page.getByTestId('auth-two-fa-resend')).toBeVisible({ timeout: 10000 })
        const expired = page.getByTestId('auth-two-fa-error')
        await expect(expired).toBeVisible()

        // And the boxes lead nowhere until it is pressed.
        const boxes = page.getByTestId('auth-two-fa-digit')
        await expect(boxes.first()).toBeDisabled()
        expect(verifies).toBe(0)

        // Resend brings it back: the boxes take digits again and the code is checked.
        await page.getByTestId('auth-two-fa-resend').click()
        await expect(boxes.first()).toBeEnabled({ timeout: 6000 })
        await enter(page, '111111')
        await expect(async () => expect(verifies).toBe(1)).toPass({ timeout: 8000 })
    })
})

test.describe('payout request — the confirmed figure', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * **The dialog and the bar must state the same number.**
     *
     * They did not. The dialog printed `amount × rate` — the *gross*, legacy's `subReceiveAmount`, the
     * figure legacy shows in its own *Sub-receive amount* row on the screen — while the bar behind it
     * printed `net_amount`. So the confirmation named a bigger number than the thing being confirmed,
     * and on a VND method with a 5% fast fee that gap is millions of dong.
     *
     * A confirmation states what the reader gets. Asserted as an *equality* rather than against a
     * literal, because the bug was the two disagreeing.
     */
    test('confirms the same net the footer states', async ({ page }) => {
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })

        const footer = (await page.getByTestId('payout-request-receive').textContent()) ?? ''
        await submit.click()
        const dialog = page.getByTestId('payout-request-confirm-amount')
        await expect(dialog).toBeVisible()
        const confirmed = (await dialog.textContent()) ?? ''

        const digits = (text: string) => text.replace(/[^\d]/g, '')
        expect(digits(confirmed)).not.toBe('')
        expect(digits(confirmed)).toBe(digits(footer))
    })

    /**
     * **No quote, no figure** — a dash, not an invented one. `amount × rate` would be the gross again
     * and legacy's `0` is worse than either: a specific wrong number on the screen that spends money.
     */
    test('withholds the figure when the quote failed', async ({ page }) => {
        await page.route('**/billy/v5/billing/payout/quote/**', route =>
            route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
        )
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        const dialog = page.getByTestId('payout-request-confirm-amount')
        await expect(dialog).toBeVisible()
        await expect(dialog).toHaveText('—')
    })
})

test.describe('payout request — a waived fee', () => {
    /**
     * **A free fee has to read as free, or the block stops adding up.**
     *
     * The backend expresses a waiver by nesting: the top level holds the charged figures (zero) and
     * `original` holds what it would have been. Two ways to get that wrong, and both were reachable:
     *
     * - **Ignoring `original`** — what shipped. The row read `Transaction fee: ---` with a `-0 VND`
     *   charge: arithmetically consistent and completely uninformative, hiding both the fee and the
     *   fact that it had been forgiven.
     * - **Reading `original` without the waiver treatment** — legacy's own request screen. The row
     *   reads `1 USD + 5%` and `-1,272,884 VND` as a live deduction, and the block stops adding up:
     *   measured at 110,741,672 against a stated net of 112,014,556, because `net_amount` already
     *   reflects the waiver.
     *
     * So the two tests below are a pair: one pins the label, one pins the arithmetic, and each catches
     * a different one of those.
     *
     * Legacy has the treatment (struck-through + *Free*) on its withdraw **detail** screen and not on
     * this one — `PayoutFeeCharge` is now shared, so the two cannot drift again.
     */
    const waivedQuote = {
        ...QUOTE,
        // 4,400.03 × 25,457.6849 = 112,014,556 gross; the fee is waived, so net is the gross.
        net_amount: '112014556.00',
        net_amount_currency: 'VND',
        fee_details: [
            {
                type: 'payout_transaction_fee',
                subtotal: { amount: '0', currency: 'TEVI' },
                flat_fee_amount: '0',
                percent_fee_rate: '0',
                original: {
                    subtotal: { amount: '50.00', currency: 'TEVI' },
                    flat_fee_amount: '1',
                    percent_fee_rate: '5.0',
                },
            },
        ],
    }

    test('strikes the charge through and says Free', async ({ page }) => {
        await signedIn(page, { ...base, 'billy/v5/billing/payout/quote/': waivedQuote })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-submit')).toBeEnabled({ timeout: 8000 })

        const row = page.getByTestId('payout-request-fee').filter({
            has: page.locator('[data-option-value="payout_transaction_fee"]'),
        })
        const fee = (await page.getByTestId('payout-request-fee').first().textContent()) ?? ''

        // The rate survives — it is what tells a creator what was waived. `original` carries it.
        expect(fee).toContain('5%')
        expect(fee).toMatch(/Free|Miễn phí/)

        const shape = await page
            .getByTestId('payout-request-fee')
            .first()
            .evaluate(node => {
                const struck = [...node.querySelectorAll('span')].find(
                    el => getComputedStyle(el).textDecorationLine === 'line-through',
                )
                return {
                    // The pre-waiver figure, struck through and converted like any other charge:
                    // 50 TEVI × 25,457.6849 ≈ 1,272,884 VND.
                    struckText: struck?.textContent ?? null,
                    hasStrike: Boolean(struck),
                }
            })
        expect(shape.hasStrike).toBe(true)
        expect(shape.struckText).toContain('1,272,884')
        expect(row).toBeTruthy()
    })

    /**
     * **The block adds up when you read it the way a reader does.**
     *
     * The first version compared *sub-receive* to *Receive amount* and passed with the bug still in —
     * both come straight off the payload, so it only proved the fixture was self-consistent.
     * Mutation-checking caught that: deleting the fix left it green.
     *
     * So it now does the subtraction from the **rendered** rows, counting only charges that are *not*
     * struck through — which is what a creator sees deducted. It fires on the mutation that matters
     * here: `original`-first with `isWaived` forced false, i.e. legacy's request screen, where the sum
     * lands 1,272,884 low.
     */
    test('adds up: the deductions a reader can see take it from gross to net', async ({ page }) => {
        await signedIn(page, { ...base, 'billy/v5/billing/payout/quote/': waivedQuote })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-submit')).toBeEnabled({ timeout: 8000 })
        /*
         * Wait for the **quote** to land, not just for the button: the sub-receive row is withheld
         * until there is a rate, so reading it off an enabled-but-unquoted screen measured 0 and the
         * test failed for a reason that had nothing to do with the fee.
         */
        await expect(page.getByTestId('payout-request-sub-receive')).toBeVisible({ timeout: 8000 })
        await expect(page.getByTestId('payout-request-fee')).toHaveCount(1, { timeout: 8000 })

        const sums = await page.evaluate(() => {
            const digits = (text: string | null | undefined) =>
                Number((text ?? '').replace(/[^\d]/g, '') || '0')
            const struckThrough = (el: Element) =>
                getComputedStyle(el).textDecorationLine === 'line-through'
            // Every fee row's charge, ignoring any figure the row struck out as waived.
            const charged = [...document.querySelectorAll('[data-testid="payout-request-fee"]')].map(
                row => {
                    const amount = [...row.querySelectorAll('span')]
                        .filter(el => el.children.length === 0 && /\d/.test(el.textContent ?? ''))
                        .filter(el => !struckThrough(el))
                    return amount.reduce((total, el) => total + digits(el.textContent), 0)
                },
            )
            return {
                sub: digits(
                    document.querySelector('[data-testid="payout-request-sub-receive"]')
                        ?.textContent,
                ),
                net: digits(
                    document.querySelector('[data-testid="payout-request-receive"]')?.textContent,
                ),
                charged,
            }
        })

        expect(sums.sub).toBeGreaterThan(0)
        expect(sums.charged).toHaveLength(1)
        const deducted = sums.charged.reduce((total, value) => total + value, 0)
        expect(sums.sub - deducted).toBe(sums.net)
    })
})

test.describe('payout request — the footer', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * The footer is built to `/get-star`'s pattern, and **two of its properties are bug fixes**.
     *
     * `sticky`, not `fixed`: it stays in the column, so it inherits the 612 width and reserves its own
     * height — which removes the 80px spacer legacy hand-computes and that I had copied.
     *
     * And **no offset for the mobile tab bar**. I had `bottom-[84px]`; `TabBarShell` renders that bar
     * only on the four tab destinations plus the reader's own channel, and this route is none of them, so
     * the offset lifted the footer 84px into empty space over content that could not be scrolled out
     * from under it. Asserted at a phone width, after scrolling, because that is the only state where it
     * is visible.
     */
    test('sticks to the bottom edge with no tab-bar offset', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-submit')).toBeVisible({ timeout: 8000 })

        await page.mouse.wheel(0, 3000)
        await expect(async () => {
            const box = await page
                .getByTestId('payout-request-submit')
                .evaluate(node => {
                    const bar = node.closest('div[class*="sticky"]') as HTMLElement | null
                    if (!bar) return null
                    const rect = bar.getBoundingClientRect()
                    return {
                        position: getComputedStyle(bar).position,
                        bottom: getComputedStyle(bar).bottom,
                        gapUnderneath: Math.round(window.innerHeight - rect.bottom),
                    }
                })
            expect(box).not.toBeNull()
            expect(box?.position).toBe('sticky')
            expect(box?.bottom).toBe('0px')
            // Flush to the viewport's bottom edge — an 84px gap here is the bug this pins.
            expect(box?.gapUnderneath).toBe(0)
        }).toPass({ timeout: 5000 })
    })

    /**
     * The figure is a live region and the **button is outside it**: the net changes as the amount is
     * typed and no control announces it, but including the button would announce the same figure twice
     * on every keystroke. `/get-star` makes the same split.
     */
    test('announces the figure without announcing it twice', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-receive')).toBeVisible({ timeout: 8000 })

        const shape = await page.getByTestId('payout-request-submit').evaluate(node => {
            const bar = node.closest('div[class*="sticky"]') as HTMLElement | null
            return {
                hasLive: Boolean(bar?.querySelector('[aria-live="polite"][aria-atomic="true"]')),
                buttonInsideLive: Boolean(node.closest('[aria-live]')),
            }
        })
        expect(shape.hasLive).toBe(true)
        expect(shape.buttonInsideLive).toBe(false)
    })
})

test.describe('payout request — the terms line', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * *"By clicking “Send request”, you are agreeing to Tevi Terms and conditions"* — legacy's sentence,
     * naming the button on purpose.
     *
     * The **link** is what this pins. Legacy builds it by `String.replace`-ing the link phrase out of the
     * translated sentence and handing the result to `dangerouslySetInnerHTML`: an HTML sink fed from a
     * translation file, which also degrades to a plain sentence in every locale that translated the
     * phrase as part of the sentence. Prefix plus a real `Link` cannot do either.
     */
    test('names the button and links to the terms in a new tab', async ({ page }) => {
        await page.goto(PATH)

        const link = page.getByTestId('payout-request-terms')
        await expect(link).toBeVisible({ timeout: 8000 })
        await expect(link).toHaveAttribute('href', '/terms')
        // A new tab: reading the terms must not throw away the amount that was typed.
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', /noopener/)

        // The sentence names the control it is about, and sits with it in the footer.
        const sentence = await link.evaluate(node => node.closest('p')?.textContent ?? '')
        expect(sentence).toContain('Send request')

        const inFooter = await link.evaluate(node =>
            Boolean(node.closest('div[class*="sticky"]')),
        )
        expect(inFooter).toBe(true)
    })
})

test.describe('payout request — the option cards and the method dialog', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * **Both cards draw their glyph**, and the Fast one is why this test exists.
     *
     * It shipped blank. `icon-names.ts` has `'bolt'` — the union is generated from the **upstream**
     * sprite — but the committed *subset* only carries `bolt-lightning`, so `name="bolt"` type-checks and
     * renders an empty 20px box: no error, no fallback, nothing in a screenshot to notice.
     *
     * Asserted on the `<use href>` rather than on the `<svg>` existing, because the `<svg>` is there
     * either way. The href is the only thing that says a glyph was found.
     */
    test('draws a glyph on both option cards', async ({ page }) => {
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-option').first()).toBeVisible({
            timeout: 8000,
        })

        const hrefs = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid="payout-request-option"]')].map(card => ({
                option: (card as HTMLElement).dataset.optionValue,
                uses: [...card.querySelectorAll('use')].map(use => use.getAttribute('href') ?? ''),
            })),
        )
        const saving = hrefs.find(card => card.option === 'saving')
        const fast = hrefs.find(card => card.option === 'fast')
        expect(saving?.uses.some(href => href.includes('#sack-dollar'))).toBe(true)
        // The one that was empty. `#bolt` would be a sprite id that does not exist.
        expect(fast?.uses.some(href => href.includes('#bolt-lightning'))).toBe(true)
    })

    /**
     * The picker's header is the DS **App Bar**, which is what every other picker dialog in the repo
     * uses (`CurrencyPicker`, `NotificationFilterDialog`).
     *
     * I had hand-built a row with the dismiss on the right and my own padding, and it did not line up
     * with the rest of the app — the bar has its own height, its own inset, a bottom rule, and a close
     * button on the **leading** side.
     */
    test('gives the method picker an App Bar header', async ({ page }) => {
        await signedIn(page, { ...base, ...twoMethods })
        await page.goto(PATH)
        await page.getByTestId('payout-request-change-method').click()

        const dialog = page.getByTestId('payout-request-method-dialog')
        await expect(dialog).toBeVisible()

        const shape = await dialog.evaluate(node => {
            const close = node.querySelector('[data-testid="payout-request-method-close"]')
            const title = node.querySelector('h2')
            /*
             * `[data-slot="app-bar"]`, not a class match: `AppBar` renders a `<header>`, so
             * `closest('div[…]')` finds nothing — which is what made this assertion fail against a
             * header that was in fact correct. The slot attribute is the DS's own handle.
             */
            const bar = close?.closest('[data-slot="app-bar"]') as HTMLElement | null
            const list = node.querySelector('[role="radiogroup"]') as HTMLElement | null
            return {
                hasBar: Boolean(bar),
                barRule: bar ? getComputedStyle(bar).borderBottomWidth : null,
                // Leading side: in LTR the dismiss sits before the title.
                closeLeadsTitle:
                    close && title
                        ? close.getBoundingClientRect().x < title.getBoundingClientRect().x
                        : null,
                // The list scrolls, not the page — `min-h-0` is what allows it.
                listOverflow: list ? getComputedStyle(list).overflowY : null,
            }
        })
        expect(shape.hasBar).toBe(true)
        expect(shape.barRule).toBe('1px')
        expect(shape.closeLeadsTitle).toBe(true)
        expect(shape.listOverflow).toBe('auto')

        await expect(page.getByTestId('payout-request-method-option')).toHaveCount(2)
    })

    /** Picking a row swaps the method on the form and closes the dialog. */
    test('picking a method closes the dialog and swaps the card', async ({ page }) => {
        await signedIn(page, { ...base, ...twoMethods })
        await page.goto(PATH)
        await page.getByTestId('payout-request-change-method').click()
        await expect(page.getByTestId('payout-request-method-dialog')).toBeVisible()

        await page.locator('[data-option-value="c2"]').click()
        await expect(page.getByTestId('payout-request-method-dialog')).toHaveCount(0)
        await expect(page.getByTestId('payout-request-method')).toContainText('USDT')
    })
})

test.describe('payout request — the Premium gate on Fast', () => {
    /**
     * **`is_active: false` still shows the card.** I filtered it out first, and that was the wrong
     * reading of the flag: it does not mean the platform switched the speed off, it means the speed is
     * not open to *this account*. Hiding the card removes the only place on this screen where Premium is
     * sold, and the offer is the point.
     *
     * So the card is drawn, says *Only for Premium users*, and the press sells instead of selecting.
     */
    test('shows a locked Fast card and sells Premium on press', async ({ page }) => {
        await signedIn(page, {
            ...base,
            ...noPremium,
            'billy/v5/billing/payout-options/': {
                count: 2,
                results: [
                    { ...OPTIONS[0], is_active: true },
                    { ...OPTIONS[1], is_active: false },
                ],
            },
        })
        await page.goto(PATH)

        /*
         * The sheet opens on arrival for this account, which is itself the behaviour — asserted here
         * before it is dismissed, so the arrival case has a test of its own.
         */
        await expect(page.getByTestId('payout-request-premium-dialog')).toBeVisible({
            timeout: 8000,
        })
        await dismissPremiumOffer(page)

        const cards = page.getByTestId('payout-request-option')
        await expect(cards).toHaveCount(2, { timeout: 8000 })
        const fast = page.locator('[data-option-value="fast"]')
        await expect(fast).toBeVisible()
        await expect(fast).toContainText('Premium')

        await fast.click()
        const dialog = page.getByTestId('payout-request-premium-dialog')
        await expect(dialog).toBeVisible()
        // The press must not have selected it: a locked option is never the submitted one.
        await expect(fast.locator('input[type="radio"]')).not.toBeChecked()
    })

    /**
     * The dialog's **second button is a choice, not a dismissal** — *Continue with Standard Withdrawal*
     * picks Saving and closes. A cancel labelled *Close* would leave somebody who cannot afford Premium
     * with nothing stated to do next, which is what the screenshot fixes.
     */
    test('continuing with standard picks the saving option', async ({ page }) => {
        await signedIn(page, {
            ...base,
            ...noPremium,
            'billy/v5/billing/payout-options/': {
                count: 2,
                results: [
                    { ...OPTIONS[0], is_active: true },
                    { ...OPTIONS[1], is_active: false },
                ],
            },
        })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-option')).toHaveCount(2, { timeout: 8000 })
        // Opened on arrival — no press needed.
        await expect(page.getByTestId('payout-request-premium-dialog')).toBeVisible()

        // The promise carries the payload's own duration, not a hard-coded "24 hours".
        await expect(page.getByTestId('payout-request-premium-dialog')).toContainText('24 hours')

        await page.getByTestId('payout-request-premium-standard').click()
        await expect(page.getByTestId('payout-request-premium-dialog')).toHaveCount(0)
        await expect(
            page.locator('[data-option-value="saving"] input[type="radio"]'),
        ).toBeChecked()
    })

    /** The subscribe button goes to `/premium`. */
    test('subscribing leaves for the premium screen', async ({ page }) => {
        await signedIn(page, { ...base, ...noPremium })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-option')).toHaveCount(2, { timeout: 8000 })
        // The sheet opens on arrival here; dismiss it so the press under test is the card's.
        await dismissPremiumOffer(page)

        await page.locator('[data-option-value="fast"]').click()
        await page.getByTestId('payout-request-premium-subscribe').click()
        await expect(page).toHaveURL(/\/premium$/, { timeout: 8000 })
    })

    /**
     * **The minimum is the method's, not a constant.** The live payload puts `minimum_amount: "15.00"` on
     * VAI Wallet and `null` on bank transfer; legacy validates everything against its own hard-coded 10,
     * so a 12 USDT VAI withdrawal passes its form and comes back a 4xx.
     */
    test('refuses an amount under the method own floor', async ({ page }) => {
        await signedIn(page, {
            ...base,
            'billy/v5/billing/payout-configs/': {
                count: 1,
                results: [
                    {
                        ...CONFIG,
                        payout_method: {
                            ...CONFIG.payout_method,
                            name: 'VAI Wallet',
                            slug: 'vai_wallet',
                            currency: 'USDT',
                            minimum_amount: '15.00',
                        },
                    },
                ],
            },
        })
        await page.goto(PATH)

        const field = page.getByTestId('payout-request-amount')
        await expect(field).toBeVisible({ timeout: 8000 })

        // The hint states the method own floor, not $10.00.
        await expect(page.locator('#payout-amount-helper')).toContainText('15.00')

        // 12 is above legacy floor and below this method one.
        await field.fill('12')
        await expect(page.getByTestId('payout-request-amount-error')).toBeVisible()
        await expect(page.getByTestId('payout-request-submit')).toBeDisabled()
    })
})

test.describe('payout request — the confirm dialog', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * The dialog is the **same three-part figure sheet as `LedgerDetailDialog`**: a tinted strip, one
     * large centred amount, then label/value rows. That is the pattern Tevi uses whenever a single
     * transaction is the subject, and the first version I built — a titled dialog with the rows first
     * and the figure last — read as a form summary instead.
     *
     * The strip carries the **ETA**, not a status: on this screen the reassuring fact is when the money
     * arrives, and it is the one thing a reader cannot get from the figure.
     */
    test('is a figure sheet: eta strip, centred amount, then the rows', async ({ page }) => {
        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        const dialog = page.getByTestId('payout-request-confirm-dialog')
        await expect(dialog).toBeVisible()

        const shape = await dialog.evaluate(node => {
            const amount = node.querySelector(
                '[data-testid="payout-request-confirm-amount"]',
            ) as HTMLElement | null
            const eta = node.querySelector(
                '[data-testid="payout-request-confirm-eta"]',
            ) as HTMLElement | null
            const strip = eta?.parentElement as HTMLElement | null
            const close = node.querySelector(
                '[data-testid="payout-request-confirm-header-close"]',
            ) as HTMLElement | null
            const title = node.querySelector('h2') as HTMLElement | null
            const box = (el: HTMLElement | null) => (el ? el.getBoundingClientRect() : null)
            const dialogBox = node.getBoundingClientRect()
            const closeBox = box(close)
            const titleBox = box(title)
            return {
                // Reading order: the dialog's name, then the ETA, then the figure and its label.
                order: [...node.querySelectorAll('p, h2, button')]
                    .map(element => (element.textContent ?? '').trim())
                    .filter(Boolean)
                    .slice(0, 4),
                /*
                 * The band, which this dialog was missing: the ETA strip doubled as the header, so
                 * nothing on screen said *what* was being confirmed, and the close disc sat at the
                 * trailing edge of a `p-0` popup — the wrong edge for a screen-shaped dialog.
                 */
                hasClose: Boolean(close),
                // Leading edge, i.e. in the first quarter of the dialog.
                closeIsLeading: closeBox
                    ? closeBox.left - dialogBox.left < dialogBox.width / 4
                    : false,
                titleCentredBy: titleBox
                    ? Math.abs(
                          (titleBox.left + titleBox.right) / 2 -
                              (dialogBox.left + dialogBox.right) / 2,
                      )
                    : 999,
                stripTinted: strip
                    ? getComputedStyle(strip).backgroundColor !== 'rgba(0, 0, 0, 0)'
                    : false,
                amountSize: amount ? Number.parseInt(getComputedStyle(amount).fontSize, 10) : 0,
                amountCentred: amount ? getComputedStyle(amount).textAlign === 'center' : false,
                // The method row and the method-declared fields, from `config.form`.
                rows: node.textContent?.includes('1903') || node.textContent?.includes('4417'),
            }
        })

        // The dialog names itself first, and the ETA strip follows it.
        expect(shape.order[0]).toContain('Confirm your withdrawal')
        expect(shape.order[1]).toContain('Estimated receive time')
        expect(shape.hasClose).toBe(true)
        expect(shape.closeIsLeading).toBe(true)
        expect(shape.titleCentredBy).toBeLessThan(1)
        expect(shape.stripTinted).toBe(true)
        // One large figure, not a summary line — 32px in the DS's h1.
        expect(shape.amountSize).toBeGreaterThanOrEqual(28)
        expect(shape.amountCentred).toBe(true)
        expect(shape.rows).toBe(true)
    })
})

test.describe('payout request — the fee arithmetic and the option cards', () => {
    /**
     * A VND method, so the conversion is visible. `exchange_rate: "25429.8526"` on the method, and the
     * quote states its fee subtotals in **TEVI** while everything else on the block is in VND.
     */
    const vndMethod = {
        'billy/v5/billing/payout-configs/': {
            count: 1,
            results: [
                {
                    ...CONFIG,
                    daily_limit_remainder: '5000.00',
                    payout_method: {
                        ...CONFIG.payout_method,
                        currency: 'VND',
                        exchange_rate: '25429.8526',
                        minimum_amount: null,
                    },
                },
            ],
        },
        'billy/v5/billing/payout/quote/': {
            id: 'q-vnd',
            // See `QUOTE`: without `amount` the client treats the quote as unverifiable.
            amount: '4400.03',
            amount_currency: 'TEVI',
            net_amount: '114405000.00',
            net_amount_currency: 'VND',
            fee: '501.00',
            fee_currency: 'TEVI',
            exchange_rate: '25429.8526',
            fee_details: [
                {
                    type: 'payout_fee',
                    subtotal: { amount: '250.00', currency: 'TEVI' },
                    flat_fee_amount: '0.0',
                    percent_fee_rate: '5.0',
                },
                {
                    type: 'payout_transaction_fee',
                    subtotal: { amount: '251.00', currency: 'TEVI' },
                    flat_fee_amount: '1.00',
                    percent_fee_rate: '5.00',
                },
            ],
        },
    }

    /**
     * **The fee charge is converted, and it was not.**
     *
     * `subtotal.amount` is quoted in the amount's currency (`TEVI`); every other figure on the block is
     * in the settlement currency. Legacy multiplies it out; I was printing the raw value with its own
     * code. On a rate-1 method the two are identical — which is why it looked right — and on VND at
     * 25,429.85 the line read `-250.00 TEVI` where it should read `-6,357,463 VND` — and **no decimals**,
     * because VND has no minor unit (`currencyFractionDigits`).
     *
     * Four orders of magnitude, and the block stops subtracting into the sub-receive figure above it.
     */
    test('converts the fee charge into the settlement currency', async ({ page }) => {
        await signedIn(page, { ...base, ...vndMethod })
        await page.goto(PATH)

        const fees = page.getByTestId('payout-request-fee')
        await expect(fees).toHaveCount(2, { timeout: 8000 })

        // The rate is in the title, the converted charge on the right.
        await expect(fees.nth(0)).toContainText('5%')
        await expect(fees.nth(0)).toContainText('VND')
        await expect(fees.nth(0)).not.toContainText('TEVI')
        // `1 USD + 5%` — legacy's `formatTitle` composes both components.
        await expect(fees.nth(1)).toContainText('1 USD + 5%')

        const charge = await fees.nth(0).innerText()
        // 250 × 25,429.85 — not 250, and rounded to whole dong rather than `.50`.
        expect(charge).toContain('6,357,463')
        // The `.00` that legacy prints on every VND figure must not be here.
        expect(charge).not.toContain('.50')

        /*
         * `base`'s balance is 4,400.03 and the method allows 5,000, so the seeded amount is the balance
         * — 4,400.03 × 25,429.85. Asserted from the fixture rather than from a figure I expected: my
         * first version wrote 127,149,250, which is 5,000 × the rate, i.e. the ceiling I had in mind
         * rather than the one the data gives.
         */
        await expect(page.getByTestId('payout-request-sub-receive')).toContainText('111,892,103')
    })

    /**
     * A **locked** card is drawn recessed: it stays pressable, because the press is the upsell, but it
     * must not look like an equal choice. `--background-segment` against the open card's
     * `--background-surface`.
     *
     * And the **Premium badge is brand purple**. `Badge status="primary"` resolves to
     * `--accents-indigo-active` (#007aff) — blue — and Premium is Tevi's purple wherever it appears.
     */
    test('draws a locked card recessed, with a purple Premium badge', async ({ page }) => {
        await signedIn(page, {
            ...base,
            ...noPremium,
            'billy/v5/billing/payout-options/': {
                count: 2,
                results: [
                    { ...OPTIONS[0], is_active: true },
                    { ...OPTIONS[1], is_active: false },
                ],
            },
        })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-option')).toHaveCount(2, { timeout: 8000 })

        const shape = await page.evaluate(() => {
            const fast = document.querySelector('[data-option-value="fast"]') as HTMLElement
            const saving = document.querySelector('[data-option-value="saving"]') as HTMLElement
            const badge = [...fast.querySelectorAll('span')].find(
                node => node.textContent?.trim() === 'Premium',
            )
            return {
                fastBg: getComputedStyle(fast).backgroundColor,
                savingBg: getComputedStyle(saving).backgroundColor,
                badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
                // Every bolt in the feature is the filled cut — outline beside a filled sack-dollar
                // made Fast read as the lighter option.
                bolts: [...document.querySelectorAll('main use')]
                    .map(use => use.getAttribute('href') ?? '')
                    .filter(href => href.includes('bolt')),
            }
        })

        // Recessed, not merely a different border.
        expect(shape.fastBg).not.toBe(shape.savingBg)
        // #501BC0 — the brand purple, not the DS's indigo.
        expect(shape.badgeBg).toBe('rgb(80, 27, 192)')
        expect(shape.bolts.length).toBeGreaterThan(0)
        for (const href of shape.bolts) {
            expect(href).toContain('bolt-lightning--filled')
        }
    })
})

test.describe('payout request — the quote and the figure must agree', () => {
    /**
     * **The `quote_id` must belong to the amount being submitted**, and it did not.
     *
     * The quote query is keyed on a *debounced* amount, so for up to a second after a keystroke the
     * cached quote is the answer for the **previous** figure. Type one sum, let it price, change it, press
     * Send inside that second — and the request left with the new `amount` and the old `quote_id`, asking
     * the server to honour a price it quoted for different money.
     *
     * Only a browser can stage that: it is a timing window between two pieces of state, not a branch.
     */
    test('never submits a quote id priced for a different amount', async ({ page }) => {
        const posts: Array<Record<string, unknown>> = []
    /*
     * ⚠ **`signedIn` first, then the overrides.** Playwright runs the *most recently registered* handler
     * first, so a `page.route` installed before the fixture's catch-all never fires — the fixture answers
     * instead. Both tests below failed exactly that way before the order was swapped.
     */
        await signedIn(page, base)

        /*
         * Quote slowly, so the window is wide and deterministic. The id encodes the amount it priced, so
         * a mismatch is visible in the assertion rather than inferred.
         */
        await page.route('**/billy/v5/billing/payout/quote/**', async route => {
            const body = route.request().postDataJSON() as { amount: string }
            await new Promise(resolve => setTimeout(resolve, 400))
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(
                    envelope({
                        id: `q-for-${body.amount}`,
                        amount: body.amount,
                        amount_currency: 'TEVI',
                        net_amount: '1000.00',
                        net_amount_currency: 'VND',
                        fee: '0',
                        fee_currency: 'TEVI',
                        exchange_rate: '1',
                        fee_details: [],
                    }),
                ),
            })
        })
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            posts.push(route.request().postDataJSON() as Record<string, unknown>)
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-1' })),
            })
        })

        await page.goto(PATH)

        const field = page.getByTestId('payout-request-amount')
        await expect(field).toHaveValue('4400.03', { timeout: 8000 })
        // Let the first figure price, so there is a real id in hand to send by mistake.
        await expect(page.getByTestId('payout-request-receive')).toBeVisible({ timeout: 8000 })

        // Change the figure and press immediately — inside the debounce, before the new quote exists.
        await field.fill('100')
        await page.getByTestId('payout-request-submit').click()
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()
        await page.getByTestId('payout-request-confirm').click()

        await expect(async () => expect(posts.length).toBe(1)).toPass({ timeout: 8000 })
        const sent = posts[0]
        expect(sent.amount).toBe('100.00')
        /*
         * Either the id for exactly this amount, or **no id at all** — a fresh price is correct by
         * construction. What must never appear is the id for 4,400.03.
         */
        if (sent.quote_id !== undefined) {
            expect(sent.quote_id).toBe('q-for-100.00')
        }
        expect(sent.quote_id).not.toBe('q-for-4400.03')
    })

    /**
     * **An expired quote's id is not submitted.** The live payload gives 300 seconds; a tab left open
     * past that would send an id the server has already dropped, turning a workable request into a 4xx.
     *
     * The figures stay on screen — an expired price is still the right thing to *look at* while a fresh
     * one loads — but the id is withheld and the server prices it again.
     */
    test('omits an expired quote id but keeps showing its figures', async ({ page }) => {
        const posts: Array<Record<string, unknown>> = []
        // Same ordering rule as above: the fixture goes on first.
        await signedIn(page, base)
        await page.route('**/billy/v5/billing/payout/quote/**', route =>
            route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(
                    envelope({
                        id: 'q-expired',
                        amount: '4400.03',
                        amount_currency: 'TEVI',
                        net_amount: '4000.00',
                        net_amount_currency: 'VND',
                        fee: '0',
                        fee_currency: 'TEVI',
                        exchange_rate: '1',
                        // Already past — the whole point of the case.
                        expires_at: Date.now() - 1_000,
                        fee_details: [],
                    }),
                ),
            }),
        )
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            posts.push(route.request().postDataJSON() as Record<string, unknown>)
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-2' })),
            })
        })

        await page.goto(PATH)

        // The figures are still shown: the price is stale, not wrong to read.
        await expect(page.getByTestId('payout-request-receive')).toContainText('VND', {
            timeout: 8000,
        })

        await page.getByTestId('payout-request-submit').click()
        await expect(page.getByTestId('payout-request-confirm-dialog')).toBeVisible()
        await page.getByTestId('payout-request-confirm').click()

        await expect(async () => expect(posts.length).toBe(1)).toPass({ timeout: 8000 })
        expect(posts[0].quote_id).toBeUndefined()
    })
})

test.describe('payout request — one press, one withdrawal', () => {
    /**
     * **A double press must not send two requests.**
     *
     * `createMutation.isPending` is last render's flag, so two calls in the same tick both read `false`
     * and both fire — the bug `useWalletLedger` already carries a latch for, where three calls in one act
     * produced three page fetches. Here it is a **duplicate withdrawal**, and the request is deliberately
     * never retried by the transport precisely because it may not be idempotent.
     *
     * The dialog closes before `submit` runs, which narrows the window; it does not close it, because both
     * handlers are queued before React unmounts anything. `dblclick` is the cheapest way to stage it.
     */
    test('sends one request for a double press', async ({ page }) => {
        const posts: string[] = []
        await signedIn(page, base)
        await page.route('**/billy/v5/billing/payout-request/**', async route => {
            /*
             * `postDataJSON()` is `null` for a request with no body — a CORS preflight matches this
             * pattern too. Reading `.amount` off it threw and ended the test before the assertion.
             */
            const body = route.request().postDataJSON() as { amount?: string } | null
            if (body?.amount) posts.push(body.amount)
            // Slow, so a second press would land while the first is still in flight.
            await new Promise(resolve => setTimeout(resolve, 600))
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(envelope({ id: 'pr-once' })),
            })
        })

        await page.goto(PATH)
        const submit = page.getByTestId('payout-request-submit')
        await expect(submit).toBeEnabled({ timeout: 8000 })
        await submit.click()

        const confirm = page.getByTestId('payout-request-confirm')
        await expect(confirm).toBeVisible()
        // Two presses in one act.
        await confirm.dblclick()

        await expect(async () => expect(posts.length).toBeGreaterThan(0)).toPass({ timeout: 8000 })
        // Give a second request time to appear if the latch is not holding.
        await page.waitForTimeout(1200)
        expect(posts).toHaveLength(1)
    })
})

test.describe('payout request — the offer on arrival', () => {
    /**
     * **The sheet opens on arrival for an account without Premium**, which is not legacy's behaviour —
     * there it only appears on a press. Asked for deliberately: this is the screen where the speed of a
     * withdrawal is decided, so it is the moment the upsell is relevant, and a reader who never presses
     * Fast would otherwise never see it.
     */
    test('opens without a press when the account has no Premium', async ({ page }) => {
        await signedIn(page, { ...base, ...noPremium })
        await page.goto(PATH)

        await expect(page.getByTestId('payout-request-premium-dialog')).toBeVisible({
            timeout: 8000,
        })
    })

    /** A Premium member gets nothing — an upsell for something you have is worse than silence. */
    test('stays shut for a Premium account', async ({ page }) => {
        await signedIn(page, base)
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-amount')).toBeVisible({ timeout: 8000 })

        await expect(page.getByTestId('payout-request-premium-dialog')).toHaveCount(0)
    })

    /**
     * **Once per arrival.** Without the latch, every re-render that changes the options — a refetch, the
     * balance landing — reopens a sheet the reader has already dismissed, which on this screen means it
     * reappears while they are typing an amount.
     */
    test('does not reopen after it is dismissed', async ({ page }) => {
        await signedIn(page, { ...base, ...noPremium })
        await page.goto(PATH)

        const sheet = page.getByTestId('payout-request-premium-dialog')
        await expect(sheet).toBeVisible({ timeout: 8000 })
        await dismissPremiumOffer(page)

        // Type, which re-renders the tree and re-quotes.
        await page.getByTestId('payout-request-amount').fill('250')
        await page.waitForTimeout(2000)
        await expect(sheet).toHaveCount(0)
    })

    /**
     * **No withdraw method ⇒ no offer.** The screen is on its way to `setup-payouts`, and the *options*
     * list resolves before the *configs* do — so the sheet opened over a redirect, `z-50`, covering the
     * screen the reader was being sent to for the frame it was up.
     *
     * `noPremium` is deliberate: without the gate this is exactly the state that would raise it.
     */
    test('never offers Premium when there is no withdraw method', async ({ page }) => {
        await signedIn(page, {
            ...noPremium,
            'billy/v5/billing/payout-options/': { count: 2, results: OPTIONS },
            // No active method at all — which is what sends this screen to `setup-payouts`.
            'billy/v5/billing/payout-configs/': { count: 0, results: [] },
        })
        await page.goto(PATH)

        await expect(page).toHaveURL(/\/my-wallet\/setup-payouts$/, { timeout: 8000 })
        await expect(page.getByTestId('payout-request-premium-dialog')).toHaveCount(0)
    })
})

test.describe('payout request — the decimal count follows the currency', () => {
    /**
     * **No `.00` on VND.** Legacy prints it — its eleven payout call sites hard-code two decimals with
     * no currency in the decision — and this client reproduced that until it was changed on a product
     * call. VND, JPY and KRW take zero decimals, and `Intl` ships the ISO 4217 table that says so.
     *
     * Asserted in a browser as well as in `money.test.ts` because the screen shows the figure in four
     * places (the rate line, the sub-receive, each fee, the footer) and they must agree.
     */
    test('shows VND figures with no decimals, USDT with two', async ({ page }) => {
        await signedIn(page, {
            ...base,
            'billy/v5/billing/payout-configs/': {
                count: 1,
                results: [
                    {
                        ...CONFIG,
                        payout_method: {
                            ...CONFIG.payout_method,
                            currency: 'VND',
                            exchange_rate: '25429.8526',
                        },
                    },
                ],
            },
            'billy/v5/billing/payout/quote/': {
                id: 'q-dec',
                amount: '4400.03',
                amount_currency: 'TEVI',
                net_amount: '111892103.00',
                net_amount_currency: 'VND',
                fee: '250.00',
                fee_currency: 'TEVI',
                exchange_rate: '25429.8526',
                fee_details: [
                    {
                        type: 'payout_fee',
                        subtotal: { amount: '250.00', currency: 'TEVI' },
                        flat_fee_amount: '0.0',
                        percent_fee_rate: '5.0',
                    },
                ],
            },
        })
        await page.goto(PATH)

        const receive = page.getByTestId('payout-request-receive')
        await expect(receive).toContainText('VND', { timeout: 8000 })
        const text = await receive.innerText()
        expect(text).toContain('111,892,103')
        // The whole point: a VND figure carries no fractional part at all.
        expect(text).not.toMatch(/[.,]\d\d\s*VND/)
    })
})

test.describe('payout request — the surface below md', () => {
    test.beforeEach(async ({ page }) => {
        await signedIn(page, base)
    })

    /**
     * **`<main>` and the sticky bar must be the same colour.** The bar carried `PAYOUT_SCREEN` while
     * `<main>` did not, so below `md` a surface-coloured bar sat on a page-coloured column with the seam
     * visible all the way across.
     *
     * Both ends asserted, because the fix is two values of one token across a breakpoint and a single
     * width proves neither.
     */
    test('paints main and the bar alike at both widths', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        await expect(page.getByTestId('payout-request-amount')).toBeVisible({ timeout: 8000 })

        const read = () =>
            page.evaluate(() => {
                const main = document.querySelector('main') as HTMLElement
                const bar = document.querySelector(
                    'main [class*="sticky"][class*="top-0"]',
                ) as HTMLElement | null
                return {
                    main: getComputedStyle(main).backgroundColor,
                    bar: bar ? getComputedStyle(bar).backgroundColor : null,
                }
            })

        const phone = await read()
        expect(phone.bar).toBe(phone.main)
        expect(phone.main).not.toBe('rgba(0, 0, 0, 0)')

        await page.setViewportSize({ width: 1200, height: 900 })
        const desktop = await read()
        expect(desktop.bar).toBe(desktop.main)
        // And the two ends differ — that is the point of the token.
        expect(desktop.main).not.toBe(phone.main)
    })

    /**
     * With the screen surface-coloured below `md`, the blocks are the same colour as their ground — so
     * each carries **its own hairline** there and drops it from `md`, where the page colour separates
     * them again. Without that the form is one pale sheet with five sections and no boundary.
     */
    test('gives each block an edge below md and drops it above', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(PATH)
        const method = page.getByTestId('payout-request-method')
        await expect(method).toBeVisible({ timeout: 8000 })

        const edge = () =>
            method.evaluate(node => {
                const style = getComputedStyle(node)
                return { width: style.borderTopWidth, colour: style.borderTopColor }
            })

        const phone = await edge()
        expect(phone.width).toBe('1px')
        expect(phone.colour).not.toBe('rgba(0, 0, 0, 0)')

        await page.setViewportSize({ width: 1200, height: 900 })
        await expect(async () => {
            const desktop = await edge()
            // Still 1px so nothing shifts, but transparent — the page colour does the separating.
            expect(desktop.width).toBe('1px')
            expect(desktop.colour).toBe('rgba(0, 0, 0, 0)')
        }).toPass({ timeout: 4000 })
    })
})
