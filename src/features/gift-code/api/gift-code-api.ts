import { premiumApi } from '@features/premium'
import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type RedeemAttempt, redeemAcrossServices } from '../lib/redeem-sequence'
import { type RedeemResult, toGiftOutcome } from './types'

/**
 * Redeeming a code — **two services, because a code can come from either.**
 *
 * | call | service | owned by |
 * |---|---|---|
 * | gift code | `billy/v1/gifting/redeem/` | here (`models/gifting.js` → `redeem`) |
 * | Premium code | `premium/v1/redeem/` | **`features/premium`** (`premiumApi.redeemCode`) |
 * | the grant it produced | `premium/v1/user/info/` | **`features/premium`** (`usePremiumInfo`) |
 *
 * One model instance now: `billy`. `createApiModel` binds a service base URL, and the `premium` one
 * that used to sit beside it belongs to the feature whose subject that service is.
 *
 * ## The two Premium calls moved out, exactly as this file said they would
 *
 * They lived here while there was no `features/premium` — holding two calls in the screen that makes
 * them beat inventing a module with no subject. That feature exists now (packages, benefits, the
 * grant, the subscribe flow), so it owns them, and this file asks it. What stays here is the thing
 * this screen is actually about: **a code, offered to both services until one accepts it** — see
 * `lib/redeem-sequence.ts`.
 *
 * The import is the barrel (`@features/premium`), which is the boundary rule working: nothing here
 * reaches into that feature's `api/`.
 */
const billy = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/**
 * ⚠ Neither redemption is retried, and both are POSTs for that reason.
 *
 * `apiClient` replays a POST only with `{ retry: true }` and only where the backend deduplicates
 * (see `CLAUDE.md`). A redemption **consumes a code**: a 502 that arrives after the grant landed
 * would, on a replay, either burn the code a second time or report a valid code as spent. So a
 * failure here surfaces as a failure and the reader presses again — which is the one path where
 * they can see what happened.
 */
const redeemPremiumAttempt =
    (code: string, accountId?: string | null): RedeemAttempt =>
    async () => {
        await premiumApi.redeemCode(code, accountId)
        /*
         * **A 2xx is the redemption — the body is not consulted at all.** That is the backend's own
         * answer to **B68**: both services have to be tried, and whichever answers 200 has done the
         * deed. `premiumApi.redeemCode` resolves `void` for exactly that reason, so there is no body
         * here to be tempted by: reading one could only ever *un*-decide something already decided.
         *
         * Legacy instead requires `res?.status === 200 && res?.data`, and this client copied that. It
         * is the one shape that spends a code twice: an empty 2xx body meant "not ours" here, and the
         * sequence then posted the **same code** to the gifting service. Nothing in either response
         * would have shown it.
         *
         * What the grant *is* comes from `premium/v1/user/info/`, read by the result panel through
         * `usePremiumInfo`; when that answers nothing the panel shows its generic success rather than
         * an invented date. Saying "redeemed" on the server's 200 is not an invention — saying *what*
         * it granted would be.
         */
        return { kind: 'premium' }
    }

const redeemGiftAttempt =
    (code: string, accountId?: string | null): RedeemAttempt =>
    async () => {
        const body = await billy.post<unknown>(
            'v1/gifting/redeem/',
            /*
             * `gift_code`, in the **body**. Legacy's `post(uri, params, data)` puts `{}` in the
             * query string and the payload third; this repo's `post(path, body, config)` has the two
             * swapped round, which is easy to mirror wrongly (see `identificationApi`).
             */
            { gift_code: code },
            accountId ? { accountId } : undefined,
        )
        return toGiftOutcome(body)
    }

export const giftCodeApi = {
    /**
     * Redeem one code, whatever kind it turns out to be.
     *
     * `accountId` pins which account the requests act as, rather than letting them pick up whichever
     * bearer happens to be active when they go out — an account switch between the press and the
     * response must not credit the Star to the other account. Same rule as every other write in this
     * app.
     *
     * Resolves to `{ kind: 'invalid' }` when every service refused it; rejects only when the answer
     * is genuinely unknown. That split is `lib/redeem-sequence.ts`'s, and its doc is the place it is
     * argued.
     */
    redeem(code: string, accountId?: string | null): Promise<RedeemResult> {
        return redeemAcrossServices([
            redeemPremiumAttempt(code, accountId),
            redeemGiftAttempt(code, accountId),
        ])
    },
}
