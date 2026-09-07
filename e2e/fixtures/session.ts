import type { Page, Route } from '@playwright/test'

/**
 * A signed-in session for a spec — the fixture `e2e/README.md` said to write when the first spec
 * needed one. Three specs need one now.
 *
 * ## Why a spec cannot just sign in
 *
 * Auth is **not cookie-based** (`shared/lib/api/token.ts`): the bearer lives in `localStorage` under
 * `tevi.auth.accounts`, keyed by account id, with `tevi.auth.active` naming the one in use. So a
 * session is seeded with `addInitScript`, which runs before any of the page's own script.
 *
 * Seeding alone is **not enough**, and this is the part that makes the fixture more than three lines.
 * `AuthProvider` bootstraps by calling `/me` with whatever bearer it found; a made-up token gets a 401,
 * `handleDeadAccount` drops the account, and the app lands back on anonymous — so the spec would be
 * testing the signed-out screen while believing it was signed in. The fixture therefore also **answers
 * the API**.
 *
 * ## Every W_API request is intercepted, and an unmatched one fails loudly
 *
 * `fulfillApi` routes the whole `W_API` origin. A path the spec did not describe answers **599 with a
 * body naming it**, rather than falling through to the network:
 *
 * - a spec must never depend on a backend being up, or on what somebody's dev database contains;
 * - and a silent fall-through is how a spec ends up asserting on real data and passing for the wrong
 *   reason. A 599 with the path in it says exactly which handler is missing.
 *
 * The trade is explicit: these specs check **what only a browser can check** — server-rendered HTML,
 * hydration, sticky offsets, a token that inverts across a breakpoint, an `href`, RTL mirroring — over
 * data the spec itself states. They are not integration tests of billy, and nothing here should be
 * read as one. What the payloads *say* is pinned in Vitest against real captures
 * (`api/tevi-coin-api.test.ts` and friends).
 *
 * ## The envelope is the fixture's job too
 *
 * `client.ts` unwraps `{ data: payload }` for W_API, so a handler's body has to carry that wrapper or
 * the model sees `undefined`. `envelope()` is the one place that knows it — a spec writing raw
 * payloads would be a spec quietly testing the unwrapper.
 */

/** Must match `NEXT_PUBLIC_W_API_DOMAIN` for the build under test. */
export const W_API = process.env.NEXT_PUBLIC_W_API_DOMAIN ?? 'https://wapi.tevi.dev'

/** The seeded account. A real-looking id, because it becomes part of every query key. */
export const TEST_ACCOUNT_ID = '900001'

export interface SessionUser {
    id: string | number
    username?: string
    display_name?: string
    [key: string]: unknown
}

const DEFAULT_USER: SessionUser = {
    id: TEST_ACCOUNT_ID,
    username: 'e2e_creator',
    display_name: 'E2E Creator',
    anonymous: false,
}

/**
 * Seed the token store so the app boots signed in.
 *
 * `expires_at` is an hour out, and that is load-bearing: the request interceptor refreshes
 * **proactively** with a 5s skew, so a token expiring inside that window sends every spec through a
 * refresh it has no handler for.
 */
export async function seedSession(page: Page, user: SessionUser = DEFAULT_USER): Promise<void> {
    await page.addInitScript(
        ({ id, account }) => {
            try {
                window.localStorage.setItem('tevi.auth.accounts', JSON.stringify({ [id]: account }))
                window.localStorage.setItem('tevi.auth.active', id)
                /*
                 * The legacy-migration flag, set as already-done. `migrateLegacyStorage()` runs at
                 * client import and is idempotent, but leaving it unset means it runs its scan on
                 * every spec's first paint for no reason.
                 */
                window.localStorage.setItem('tevi.migrated', '1')
            } catch {
                // A spec running with storage disabled has bigger problems; never throw here.
            }
        },
        {
            id: TEST_ACCOUNT_ID,
            account: {
                id: TEST_ACCOUNT_ID,
                access_token: 'e2e-access-token',
                refresh_token: 'e2e-refresh-token',
                expires_in: 3600,
                expires_at: Date.now() + 3600_000,
                user,
            },
        },
    )
}

/** Wrap a payload the way W_API does, so `client.ts`'s unwrapper sees what it expects. */
export function envelope(payload: unknown) {
    return { success: true, message: null, data: payload, errors: null }
}

/**
 * A path fragment → the payload to answer with.
 *
 * Matched by `includes()` on the pathname, longest key first, so `v5/billing/transactions` wins over
 * `v5/billing`. A function receives the `Route` when a handler needs the query string — the ledger's
 * `page`, for instance.
 */
export type ApiHandlers = Record<string, unknown | ((route: Route) => unknown)>

/**
 * The handlers every signed-in screen needs before it can render anything: the account, its balance,
 * its permissions, the currency list and the rate.
 *
 * A spec spreads these and adds its own. They are deliberately **minimal** — a screen that needs more
 * says so, rather than inheriting a payload it does not read and then depending on it by accident.
 */
export function baseHandlers(user: SessionUser = DEFAULT_USER): ApiHandlers {
    return {
        'auth/v1/me/': user,
        // `permission` fails **closed**, so an empty bag is an ordinary creator with no grants.
        'permission/v3/channel/permission/': {},
        /*
         * `balances` + `amount_currency`, which is billy's own spelling (`balanceSchema` in
         * `features/balance/api/types.ts`) — and `TEVI` is the *earnings* unit while `TVS` is Star.
         * Getting either wrong shows a `—` balance and no error, which is why the shape was read out
         * of the parser rather than guessed.
         */
        'billy/v5/billing/balance/': {
            balances: [
                { amount_currency: 'TEVI', amount: '4400.03' },
                { amount_currency: 'TVS', amount: '1250' },
            ],
        },
        'exchange/v1/currencies/': [
            { code: 'USD', name: 'US Dollar', symbol: '$', decimal_digits: 2 },
            { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimal_digits: 0 },
        ],
        'exchange/v1/exchange-rate/': { rate: 25_400 },
        'billy/v5/payout/free-first-transaction-fee/': { is_used: true },
    }
}

/**
 * Route the W_API origin and answer from `handlers`.
 *
 * An unmatched path answers **599** with the path in the body — see the note above on why this must
 * be loud rather than a pass-through. Read the spec's console output when one appears; the number is
 * outside every range the app treats as meaningful, so nothing retries it into a timeout.
 */
export async function fulfillApi(page: Page, handlers: ApiHandlers): Promise<void> {
    // Longest first, so a specific path is never shadowed by a prefix of itself.
    const keys = Object.keys(handlers).sort((a, b) => b.length - a.length)

    await page.route(`${W_API}/**`, async route => {
        const path = new URL(route.request().url()).pathname
        const key = keys.find(candidate => path.includes(candidate))

        if (!key) {
            await route.fulfill({
                status: 599,
                contentType: 'application/json',
                body: JSON.stringify({ e2e: 'no fixture handler', path }),
            })
            return
        }

        const value = handlers[key]
        const payload = typeof value === 'function' ? (value as (r: Route) => unknown)(route) : value
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(envelope(payload)),
        })
    })
}

/**
 * Seed the session and answer the API — the one call a spec makes in `beforeEach`.
 *
 * Order matters: routing is installed before the first navigation, and `addInitScript` before the
 * page's own script. Both are set up here so a spec cannot get that order wrong.
 */
export async function signedIn(
    page: Page,
    handlers: ApiHandlers = {},
    user: SessionUser = DEFAULT_USER,
): Promise<void> {
    await seedSession(page, user)
    await fulfillApi(page, { ...baseHandlers(user), ...handlers })
}

/**
 * A **guest** whose bootstrap touches no network — for a spec about the signed-out screen.
 *
 * ## Why a signed-out spec needs a fixture at all
 *
 * It looks like it should need nothing: no bearer, no payloads. But the app *always keeps a session*
 * (`features/auth`), so arriving with no token starts an **anonymous** bootstrap — and measured on
 * `/my-wallet/transaction-history` that is four calls off the machine: `identitytoolkit.googleapis.com`
 * twice (Firebase `accounts:signUp`, `accounts:lookup`) and `wapi.tevi.dev` twice (`auth/v1/token/`,
 * `auth/v1/me/`).
 *
 * So a signed-out spec was quietly depending on Firebase and on a dev backend being reachable, which
 * is exactly what `e2e/README.md` says a spec must not do. It showed up as a flake: the wallet's
 * signed-out tests dropped under parallel load and passed in isolation — the "gate the action" tests
 * wait for a control whose appearance was, through no fault of the screen, behind somebody else's TLS
 * handshake.
 *
 * ## Aborting is the right answer, not mocking
 *
 * An anonymous session changes nothing about what these specs assert. `isAuthenticated` is false either
 * way — an anonymous account is not a signed-in one — so the screen, its sign-in control and the dialog
 * that control raises are identical whether the bootstrap succeeded, failed or never happened.
 *
 * Mocking it would mean fabricating a Firebase token response, which is both fragile and a claim about
 * a contract this spec is not testing. Aborting states the truth instead: **this spec does not depend on
 * the network**, and a bootstrap failure is a path the app already has to survive.
 */
export async function asGuest(page: Page): Promise<void> {
    // Everything off-origin: the API, Firebase, and anything either of them reaches for.
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => route.abort())
}
