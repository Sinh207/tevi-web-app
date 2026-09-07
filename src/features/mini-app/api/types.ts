import { z } from 'zod'

/**
 * The three payloads this feature puts on the wire, and the **one** it accepts from a stranger.
 *
 * That asymmetry is the reason this file exists. Everywhere else in the app a schema guards
 * against the *backend* sending something unexpected; here the untrusted side is the other one.
 * A mini app is third-party code running in a frame, and `buyItem` / `topup` are it asking this
 * client to spend the reader's Star. Whatever it sends is going into a request that carries the
 * reader's bearer token, so the request body is assembled **from a parsed shape, field by field**,
 * and never by forwarding what arrived.
 *
 * The backend is the authority on price and balance — it must be, since nothing in a browser can
 * be trusted with either. These schemas are not a second authorisation layer and must not be read
 * as one. What they stop is narrower and still worth stopping: a `metadata` carrying a function or
 * a cycle (which would throw inside axios and leave the app waiting forever), an `amount` of
 * `NaN`, `Infinity` or `-500`, an `item_id` that is an object, and a payload with forty extra
 * top-level keys of somebody else's choosing.
 */

/**
 * A JSON-serialisable bag the app wants echoed back on its transaction. Passed through, so it is
 * validated for *shape* rather than content — the backend and the app agree on what is in it.
 *
 * ## The depth cap is not decoration
 *
 * A `postMessage` payload arrives by **structured clone**, which — unlike JSON — happily carries a
 * cyclic object. Axios then `JSON.stringify`s it and throws, and a recursive schema (`z.lazy`) would
 * have blown the stack trying to validate it first. So the nesting is bounded explicitly: four
 * levels, against a documented usage of one (`{ level: 5 }`, `{ game_id: 'g1' }`).
 */
const MAX_METADATA_DEPTH = 4

const jsonLeaf = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])

function jsonValue(depth: number): z.ZodType<unknown> {
    if (depth <= 0) return jsonLeaf
    const inner = jsonValue(depth - 1)
    return z.union([jsonLeaf, z.array(inner), z.record(z.string(), inner)])
}

/**
 * **Strict, and the whole action fails with it.**
 *
 * `.catch({})` would be the friendlier-looking choice and it is the wrong one: the metadata is the
 * app's own record of the transaction, so quietly dropping it settles money with the app's
 * bookkeeping missing and no way for it to find out. A refusal is answered — `invalid options` — and
 * the app can fix its payload. Absent and `null` still mean "no metadata", which is not the same as
 * a malformed one.
 */
const metadata = z
    .record(z.string(), jsonValue(MAX_METADATA_DEPTH))
    .nullish()
    .transform(value => value ?? {})

/**
 * A count of Star. Integer, positive, and bounded.
 *
 * The ceiling is not superstition: `amount` reaches here as JSON, so `1e21` parses fine and
 * stringifies as `"1e+21"`, which the backend would read as something other than a number. A
 * transaction larger than the largest balance the platform has ever held is a bug on one side or
 * the other, and refusing it locally turns a confusing 400 into a clear refusal.
 */
const starAmount = z.number().int().positive().max(1_000_000_000)

/** A non-empty identifier the app supplies. Coerced from a number, because ids arrive both ways. */
const identifier = z
    .union([z.string(), z.number()])
    .transform(String)
    .refine(value => value.trim() !== '' && value.length <= 256, 'empty or oversized id')

/** `action.user.billy.buyItem` options. */
export const buyItemOptionsSchema = z.object({
    item_id: identifier,
    /**
     * What the app *says* it costs. Accepted, recorded, and **not sent** — the purchase body
     * carries `product_id` and `metadata` only, exactly as legacy's does, because the price of a
     * product is the backend's to look up. It is parsed so the out-of-Star copy can name a figure
     * without inventing one, and so a negative or absurd value is refused rather than displayed.
     */
    price: z.number().int().nonnegative().max(1_000_000_000).nullish().catch(null),
    metadata,
})

export type BuyItemOptions = z.infer<typeof buyItemOptionsSchema>

/** `action.user.billy.topup` options. */
export const topupOptionsSchema = z.object({
    channel_id: identifier,
    amount: starAmount,
    /**
     * The app's proof that this deposit was authorised on its side. Opaque to this client and
     * required — a deposit without it is one the app did not ask for.
     */
    deposit_token: z.string().min(1).max(4096),
    metadata,
})

export type TopupOptions = z.infer<typeof topupOptionsSchema>

/**
 * `GET developer/api/v1/user/auth-token/` — a token scoped to **one mini app**, which the app
 * then presents to its own backend to identify the reader. Distinct from the session bearer, and
 * it must be: handing a mini app the token that can read `/me` and move money would defeat the
 * point of the frame.
 *
 * `looseObject`, and only `access_token` is read: whatever else the developer service returns is
 * its business. A body without one parses to `null` rather than throwing — the caller answers the
 * app with the account and no token, which is a state the contract already has (an app with no
 * `app_id` gets exactly that).
 */
const appTokenSchema = z.looseObject({ access_token: z.string().min(1) })

export function normalizeAppToken(body: unknown): string | null {
    const parsed = appTokenSchema.safeParse(body)
    return parsed.success ? parsed.data.access_token : null
}
