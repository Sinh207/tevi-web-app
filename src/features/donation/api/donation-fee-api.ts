import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * The transaction fee on a **card** donation — `paymee/payment/v3/direct-donation-fee/`.
 *
 * A second service, hence a second model: the offer and the Star spend are Billy's
 * (`api/donation-api.ts`), the card charge and its fee are the payments service's. Legacy splits
 * them the same way (`ApiBillyModel` vs `ApiPaymeeModel`, base `${W_API}/paymee`).
 *
 * ## Why a formula and not a number
 *
 * The endpoint answers three coefficients rather than a fee, because the fee is not linear in the
 * donation: it is `(x · amount + y) / z`, i.e. a percentage **and** a flat component, grossed up so
 * the creator receives the amount the donor chose rather than the amount minus the processor's cut.
 * That is the same shape a card processor bills at, so the three numbers are the contract and the
 * arithmetic belongs to the client. It lives in `lib/donation-amount.ts` where a test can reach it.
 *
 * **Star has no fee**, which is why nothing here is fetched on that path — the whole point of the
 * platform currency is that the ledger move costs nothing to make.
 *
 * ## ⚠ `v3`, and it was written as `v1` first
 *
 * Legacy's `models/payment.js` builds every path from one `const VERSION = 'v3'`, so the endpoint is
 * `/payment/v3/direct-donation-fee/`. The first pass here read the template literal and carried over
 * `v1` — which is `models/gifting.js`'s version, a **different service**: Billy's gifting endpoints
 * really are `v1` (`api/donation-api.ts` is correct), the payments service's really are `v3`.
 *
 * The failure would have been quiet in the worst way. `getCoefficients` does not special-case a 404,
 * so a wrong version rejects, `useDonationFee` resolves `null`, and the dialog does what it is
 * designed to do when the fee is unknown: prints an em dash and a total equal to the donation. A
 * card total that is **missing its fee** and says nothing about it — which is precisely the state
 * that code exists to make honest, arrived at by asking the wrong URL.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/paymee` })

export const donationFeeKeys = {
    all: ['donation', 'fee'] as const,
    coefficients: (accountId: string | null) =>
        [...donationFeeKeys.all, accountId ?? 'anon'] as const,
}

/**
 * `z` is a divisor, so a `0` or a missing value makes the formula meaningless rather than merely
 * wrong — `feeCoefficients` is `null` in that case and the screen says it does not know the fee
 * instead of printing one it invented. Same rule the rest of this feature follows for money.
 */
const feeSchema = z.looseObject({
    x: z.coerce.number().catch(0),
    y: z.coerce.number().catch(0),
    z: z.coerce.number().catch(0),
})

export type FeeCoefficients = { x: number; y: number; z: number }

export function normalizeFee(body: unknown): FeeCoefficients | null {
    if (!body || typeof body !== 'object') return null
    const parsed = feeSchema.safeParse(body)
    if (!parsed.success) return null
    const { x, y, z } = parsed.data
    if (!Number.isFinite(z) || z === 0) return null
    return { x, y, z }
}

export const donationFeeApi = {
    /** `null` when the service did not answer something this client can compute with. */
    async getCoefficients(accountId?: string | null): Promise<FeeCoefficients | null> {
        const body = await api.get<unknown>(
            'payment/v3/direct-donation-fee/',
            undefined,
            /*
             * Three coefficients in a formula the platform sets. An hour rather than a day because
             * it is a fee: the figure it feeds is printed next to somebody's card.
             *
             * **`persist` but deliberately not `shared`.** The endpoint takes no parameters, which
             * is decent evidence the formula is platform-wide — but it is not proof, because a
             * per-account fee could be derived from the bearer server-side, and `fiat_agency` is a
             * real grant in `features/permission`. Keyed per account this stays correct either way;
             * shared, it would quietly charge one account another's rate. Not a guess worth making
             * on a fee — **B93**.
             */
            {
                ...(accountId ? { accountId } : {}),
                cache: { persist: true, ttlMs: CACHE_TTL.hour },
            },
        )
        return normalizeFee(body)
    },
}
