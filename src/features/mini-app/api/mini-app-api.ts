import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type BuyItemOptions, normalizeAppToken, type TopupOptions } from './types'

/**
 * Two services, because the mini-app contract spans two.
 *
 * - **`developer/api`** mints the per-app token (`getInfo`). It is the developer platform, not the
 *   website's API, and it is the only caller of it in the whole app.
 * - **`billy`** takes the money: `ecom/purchase/` for an item, `billing/game/deposit/` for a
 *   top-up. The same service `features/balance` reads the balance from, which is why a write here
 *   invalidates that feature's keys rather than trying to guess the new figure.
 *
 * `createApiModel` means both go through the shared axios client, so both carry the bearer, the
 * device id, the HMAC signature and the 401 refresh — the same rules as every other request. A
 * mini app never sees any of that: it is on the far side of a frame and gets a scoped token.
 */
const developerApi = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/developer/api` })
const billyApi = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/**
 * Keyed by account **and** app.
 *
 * Both halves are required. The account, because a token identifies the reader and this app holds
 * up to ten of them — a cache keyed on the app alone would hand app A the token of whichever
 * account happened to ask first. The app, because that is what the token is scoped to.
 *
 * `all` is the invalidation root, used when an account is dropped.
 */
export const miniAppKeys = {
    all: ['mini-app'] as const,
    appToken: (accountId: string | null, appId: string) =>
        [...miniAppKeys.all, 'app-token', accountId ?? 'anon', appId] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

/**
 * Pins the request to a bearer rather than "whoever is active when it goes out".
 *
 * It matters more here than in most features: a mini app's message is handled asynchronously, and
 * a reader can switch accounts between the app asking to buy something and the request leaving.
 */
const scope = ({ accountId, signal }: Scoped) => ({
    signal,
    ...(accountId ? { accountId } : {}),
})

export const miniAppApi = {
    /**
     * The token for one mini app, or `null` if the service answered without one.
     *
     * `null` rather than a throw for a *parseable* body with no token: the app is told it has no
     * token and can decide what to do, which is better than the bridge treating it as a transport
     * failure. A real failure (401, 5xx, network) still rejects — see `use-app-token.ts` for what
     * the bridge says then.
     */
    getAppToken(appId: string, { accountId, signal }: Scoped = {}): Promise<string | null> {
        return developerApi
            .get<unknown>('v1/user/auth-token/', { app_id: appId }, scope({ accountId, signal }))
            .then(normalizeAppToken)
    },

    /**
     * Buy an in-app item with Star.
     *
     * **The body is two fields, and the price is not one of them.** That is legacy's body verbatim
     * (`{ product_id, metadata }`) and it is the right shape: a client-supplied price on a purchase
     * is either ignored or trusted, and only one of those is safe. The backend looks the product
     * up.
     *
     * Not retried on a 5xx: `createApiModel` posts without `{ retry: true }`, and this is exactly
     * the case that flag exists to withhold — a 502 can arrive after the charge landed, so
     * replaying it could bill twice. B62's answer decides whether that can ever change.
     */
    purchaseItem(options: BuyItemOptions, { accountId, signal }: Scoped = {}): Promise<void> {
        return billyApi
            .post<unknown>(
                'v1/ecom/purchase/',
                { product_id: options.item_id, metadata: options.metadata },
                scope({ accountId, signal }),
            )
            .then(() => undefined)
    },

    /**
     * Move Star from the account into a mini app's own wallet.
     *
     * Field names are the wire's, not this codebase's, and are sent as the app supplied them —
     * `deposit_token` is the app's authorisation for the deposit and is opaque here.
     *
     * Same no-retry reasoning as `purchaseItem`, and one more: this one is confirmed by the reader
     * in a dialog first, so a silent replay would spend Star they agreed to spend **once**.
     */
    depositStars(options: TopupOptions, { accountId, signal }: Scoped = {}): Promise<void> {
        return billyApi
            .post<unknown>(
                'v1/billing/game/deposit/',
                {
                    channel_id: options.channel_id,
                    amount: options.amount,
                    deposit_token: options.deposit_token,
                    metadata: options.metadata,
                },
                scope({ accountId, signal }),
            )
            .then(() => undefined)
    },
}

/**
 * The backend's code for "not enough Star", on a 422 from `ecom/purchase/`.
 *
 * Named because the bridge branches on it: it is the difference between offering the reader a
 * top-up and telling them the purchase failed. Legacy hardcodes the pair at its one call site.
 * B82 asks whether `billing/game/deposit/` answers the same way — the deposit path currently
 * checks the balance locally first, which is a guess this client should not have to make.
 */
export const INSUFFICIENT_STARS_CODE = 'EC0001'
