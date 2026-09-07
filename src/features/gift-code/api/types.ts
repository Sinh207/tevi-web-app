import { z } from 'zod'

/**
 * What a redeemed code turned out to contain — and the two undocumented bodies it is read from.
 *
 * ## One code, two services, two shapes
 *
 * A Tevi code is either a **gift** (`billy/v1/gifting/redeem/`, Star today) or a **Premium**
 * grant (`premium/v1/redeem/`). Nothing on the code says which, and neither response is
 * documented — legacy reads `res.data.data.object` from the first and, from the second, only
 * whether the body was truthy at all. So both are parsed defensively here, per field, and the
 * screen is built to say *something true* for a body it cannot read: `other` is a redemption that
 * happened and cannot be itemised, which is a different thing from a code that was refused.
 *
 * ## Only the **gift** shape is here now
 *
 * `premium/v1/user/info/` and its parser moved to `features/premium/api/types.ts` the day that
 * feature landed — which is what this file's own header used to promise. Two parsers for one
 * endpoint is one renamed field away from two screens disagreeing about somebody's expiry date, and
 * the `epochMs` helper went with it (it was itself a copy of `features/balance`'s).
 *
 * Same rule as `features/channel/api/types.ts` and `features/donation/api/types.ts`: a `.catch()`
 * per field and `looseObject` throughout, so one renamed key degrades one line of the result panel
 * instead of turning a successful redemption into an error.
 */

/**
 * A count that may arrive as a number **or** as a decimal string.
 *
 * `star_quantity` is `100` in the one payload anybody has seen, and every other amount on the
 * billing service (`prices[].amount`, the ledger) is a string — so the field is read as either.
 * Not finite ⇒ `0`, which the caller already has to handle: a Star gift of zero is not one to
 * announce.
 */
const numeric = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value !== 'string') return 0
        const parsed = Number.parseFloat(value.trim())
        return Number.isFinite(parsed) ? parsed : 0
    })
    .catch(0)

/* ============================== outcomes ============================== */

/**
 * What the reader is told they got.
 *
 * `other` is load-bearing: the gifting service is a rail, and the mobile apps already redeem
 * codes this client has no panel for (a gift package, an exclusive product). Answering "your code
 * has been redeemed" is true, useful and does not require this repo to ship a screen for every
 * product the backoffice invents. Legacy shows the same fallback for the same reason — it is the
 * branch its result dialog lands on when `type` is not `star_gift`.
 */
export type RedeemOutcome =
    | { kind: 'star'; stars: number }
    | { kind: 'premium' }
    | { kind: 'other' }

/**
 * The answer to a whole redemption attempt. `invalid` is **not** an error — see
 * `lib/redeem-sequence.ts`, which is the only thing that produces it.
 */
export type RedeemResult = RedeemOutcome | { kind: 'invalid' }

/** The wire code for a Star gift. Compared after upper-casing — legacy lower-cases instead. */
const STAR_GIFT_TYPE = 'STAR_GIFT'

const redeemedObjectSchema = z.looseObject({
    type: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : ''))
        .catch(''),
    data: z.unknown().catch(null),
})

const starGiftSchema = z.looseObject({ star_quantity: numeric })

/**
 * `billy/v1/gifting/redeem/`'s body → an outcome, or `null` for a body that does not describe a
 * redemption at all.
 *
 * The envelope is stripped by the response interceptor (`{ data: payload }` → `payload`), so what
 * arrives here is the `{ object: … }` legacy reaches through `res.data.data.object`.
 *
 * **`null` is treated as a refusal by the caller, and that is deliberate.** Legacy requires
 * `object` to be present before it will call a 200 a success, and it is right to: a 200 with
 * nothing in it is the one case where claiming "redeemed" could be a lie about somebody's money.
 * A body that *is* there but names a product this client cannot itemise is the opposite case, and
 * becomes `other`.
 */
export function toGiftOutcome(body: unknown): RedeemOutcome | null {
    if (!body || typeof body !== 'object') return null
    const envelope = z.looseObject({ object: z.unknown().catch(null) }).safeParse(body)
    if (!envelope.success) return null

    const object = redeemedObjectSchema.safeParse(envelope.data.object)
    if (!object.success) return null

    if (object.data.type === STAR_GIFT_TYPE) {
        const gift = starGiftSchema.safeParse(object.data.data)
        const stars = gift.success ? Math.round(gift.data.star_quantity) : 0
        // A Star gift whose quantity did not survive parsing is still a redemption — it just
        // cannot be itemised, so it falls back rather than announcing "0 Star".
        return stars > 0 ? { kind: 'star', stars } : { kind: 'other' }
    }
    return { kind: 'other' }
}
