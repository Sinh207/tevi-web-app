import { z } from 'zod'

/**
 * **The gift catalogue** — `GET billy/v1/gifting/product-packages/`.
 *
 * One row is a *package*: a product (the rose, the crown, the rocket) plus how many of it one press
 * buys and what that costs in Star. The tray draws the product, the send call posts the package's
 * id, and the socket frame that follows carries the product's pictures so everybody else's screen
 * can draw the same thing.
 *
 * ## This one has a schema, and it disagrees with legacy in two places
 *
 * Unlike `live-types.ts` — derived from greps because `live/` has no spec — billy publishes
 * OpenAPI (`billy/docs/schema/v1/?format=json`). Reading it before porting settled two things a
 * grep could not, and both are recorded as **B110**:
 *
 * - **`price` is a decimal *string*** (`"10.00"`), not a number. Legacy compares it against the
 *   balance with `parseFloat` at the call site and formats it with `formatNumber(gift?.price)` —
 *   which prints `10.00` rather than `10`. Parsed to a number here, once, so no call site has to
 *   remember;
 * - **`product_package_id` is an integer.** Every other id in this app is a string, and
 *   `nullableId` would stringify it — so a row whose id is not a finite number is **dropped**
 *   rather than carried. A gift that cannot be sent is not a gift to offer.
 *
 * The schema also documents only `page` and `page_size` on that endpoint, while legacy sends
 * `channel_id` and `include_exclusive` — see `gift-api.ts`.
 */

/** A string that is present and non-blank, else `null`. The per-service copy; see `live-types.ts`. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A flag the service spells as a **string**.
 *
 * `LegacyProduct.exclusive` is `type: "string"` in billy's own schema, and legacy reads it as
 * `item?.product?.exclusive` — a plain truthiness test. That test says **yes** to `"false"` and to
 * `"0"`, which is not a hypothetical: a serializer that renders a Python `False` as `"False"` would
 * move the entire catalogue into the *Exclusive* tab and empty the ordinary one, with nothing
 * failing.
 *
 * So the false-ish spellings are named. The divergence is deliberate and is **B110** — if the field
 * really is only ever `"true"`/`""`, this behaves identically to legacy and costs nothing.
 */
const stringishFlag = z
    .unknown()
    .transform(value => {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        if (typeof value !== 'string') return false
        const normalized = value.trim().toLowerCase()
        return normalized !== '' && normalized !== 'false' && normalized !== '0'
    })
    .catch(false)

/**
 * The gift's own pictures, and **four spellings matter**.
 *
 * `images` is `additionalProperties: {}` in the schema — an open bag — so the keys come from
 * reading what legacy dereferences, the same way `live-types.ts` was built:
 *
 * | key | who draws it |
 * |---|---|
 * | `thumb` | the tray tile, the panel tile, and the chat sentence |
 * | `anim_background` | the ground of the float banner over the stage |
 * | `animation` | the full-stage SVGA — **carried and unread**, see `EventGiftFloat` |
 * | `logo` | nothing here; kept because the payload sends it |
 *
 * ⚠ **`thumb`, not `image`.** The same trap `liveGiftSchema` carries a note about: the frame and
 * the catalogue agree on `thumb` and a reader looking for `image` gets a hole where the gift is.
 */
export const giftImagesSchema = z.looseObject({
    thumb: nullableText,
    logo: nullableText,
    anim_background: nullableText,
    animation: nullableText,
})

export const giftProductSchema = z.looseObject({
    slug: nullableText,
    name: nullableText,
    logo: nullableText,
    images: z
        .unknown()
        .transform(value => {
            const parsed = giftImagesSchema.safeParse(value)
            return parsed.success ? parsed.data : null
        })
        .catch(null),
    /** Only offered to members — the *Exclusive* tab. See `stringishFlag`. */
    exclusive: stringishFlag,
    /**
     * The gifted level this product needs, as the service spells it.
     *
     * **Nothing reads it**, and that is not an oversight: no frame this client receives carries a
     * reader's level, so there is no number to compare it against — the same reason
     * `docs/EVENT.md` records `Chat/Unlock level` and the level badges as not built (**B108**).
     * Carried so the day the level lands, the gate is a predicate rather than a schema change.
     */
    required_level: nullableText,
})
export type GiftProduct = z.infer<typeof giftProductSchema>

export const giftPackageSchema = z.looseObject({
    /** The integer `POST v1/gifting/send/` wants. A row without one is dropped — see the header. */
    id: z
        .unknown()
        .transform(value => {
            const n = typeof value === 'string' ? Number(value.trim()) : value
            return typeof n === 'number' && Number.isFinite(n) ? n : null
        })
        .catch(null),
    product: z
        .unknown()
        .transform(value => {
            const parsed = giftProductSchema.safeParse(value)
            return parsed.success ? parsed.data : null
        })
        .catch(null),
    /**
     * **How many units one press buys**, not how many times it was pressed.
     *
     * The distinction is the whole of the `x10` in the chat: a "10 roses" package sends *one*
     * request and the frame that follows carries `gift_amount: 10`. Legacy reads it as
     * `String(gift.quantity)` for exactly that, which is easy to misread as a press counter.
     */
    quantity: z.coerce.number().catch(1),
    /** Star per press. A decimal string on the wire — see the header. */
    price: z.coerce.number().catch(0),
    /** `TVS` on every row this client has seen. Carried rather than assumed. */
    price_currency: nullableText,
})
export type GiftPackage = z.infer<typeof giftPackageSchema>

/** Whichever picture of the gift the row carried. Mirrors `giftThumb` on the frame side. */
export function giftPackageThumb(pkg: GiftPackage): string | null {
    return pkg.product?.images?.thumb ?? pkg.product?.logo ?? null
}

/**
 * Read a page of the catalogue.
 *
 * ⚠ **A row with no id, or no product, is dropped.** Both are things the tile cannot survive: the
 * first is a gift that cannot be posted (the press would send `product_package_id: undefined`, the
 * shape of bug `unlockApi` documents at length), the second is a tile with no picture and no name.
 * Legacy renders both and lets the press fail.
 *
 * The envelope is already off — `apiClient` unwraps `{ data }` — so what arrives is
 * `{ count, next, previous, results }`. `results` is read defensively anyway: a body that is an
 * array on its own is also accepted, because a paginated endpoint that stops paginating is a change
 * that must not blank the tray.
 */
export function normalizeGiftPackages(body: unknown): GiftPackage[] {
    const rows = Array.isArray(body)
        ? body
        : ((body as { results?: unknown } | null)?.results ?? [])
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
        const parsed = giftPackageSchema.safeParse(row)
        if (!parsed.success) return []
        const pkg = parsed.data
        if (pkg.id === null || !pkg.product) return []
        return [pkg]
    })
}

/**
 * Split the catalogue the way the panel's two tabs do.
 *
 * `all` is every row — legacy's *Gifts* tab shows the unfiltered list, exclusives included — and
 * `exclusive` is the subset. That is worth stating because the obvious reading of two tabs is that
 * they partition, and they do not: an exclusive gift appears in both.
 */
export function splitGiftPackages(packages: GiftPackage[]): {
    all: GiftPackage[]
    exclusive: GiftPackage[]
} {
    return { all: packages, exclusive: packages.filter(pkg => pkg.product?.exclusive) }
}
