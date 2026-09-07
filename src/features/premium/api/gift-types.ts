import { z } from 'zod'

/**
 * The two DTOs the **gift** screen needs and `api/types.ts` does not model — a recipient, and the
 * one field a checkout needs about them.
 *
 * A gift package is an ordinary `PremiumPackage` (`premium/v1/gift-packages/` answers the same
 * shape as `v1/packages/`, at 90/180/365 days instead of 7/30/365), so there is nothing here for
 * it. What *is* here is the person it is being bought for, which is a shape neither the premium
 * service nor `features/channel`'s profile payload produces.
 *
 * ## Why this is not `features/search`'s `SearchChannel`
 *
 * It is very nearly that row, and it is deliberately a second declaration rather than an import:
 *
 * - A feature may not reach into another feature's internals, and `searchChannelSchema` is not on
 *   that barrel (only the inferred *type* is, and a type cannot parse). That is the same wall
 *   `features/search` itself hit when it needed `followed-channels/` and declared its own row.
 * - **It needs one field that row does not have.** `checkout/v3/checkout/gift-premium/` is priced
 *   against a `receiver_user_id`, which is the space's `owner_id` — a *user* id, not the channel's.
 *   The search payload does not reliably carry it (see `resolveReceiverId`), so the field is
 *   declared here as optional and read when it happens to be present.
 *
 * If a third screen ever needs "a channel as a list row, pickable", that is the moment to move one
 * of these two into `shared/` — not before. The same call `features/search` makes about
 * `listUserSchema`.
 *
 * ## Parsed per field, never thrown
 *
 * The rule everywhere at this boundary: `.catch()` per field so one renamed key costs one line of a
 * row rather than the whole list, and `looseObject` so the half of the payload this client does not
 * model stays visible to whoever needs it next.
 */

/** A string that is present and non-blank, else `null`. `''` is not a name or a URL. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Ids arrive as a string or a number depending on the service. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

const boolish = z.coerce.boolean().catch(false)

/**
 * An id that may arrive as a **string or a number**, normalised to string — `null` when absent.
 *
 * ⚠ This is not {@link nullableText}, and using that here is what stopped *Send gift* working
 * against the real backend. `owner_id` comes off `core/v3/channel/channels/{slug}/` as a **number**
 * — `features/channel`'s own DTO declares it `z.union([z.string(), z.number()])` for exactly that
 * reason, and **B11** records that `/me` sends `id` as a number too. `nullableText` answers `null`
 * for anything that is not a string, so a perfectly good receiver id was thrown away, `confirm()`
 * refused to charge on a missing one, and the reader got "we couldn't reach that creator" on every
 * attempt. No request failed; the parser dropped the field.
 *
 * It survived review because every fixture in this repo seeded `owner_id: '77'` — a string — so the
 * tests, the e2e specs and the screenshots all agreed with the bug.
 */
const nullableId = z
    .union([z.string(), z.number()])
    .transform(value => {
        const text = String(value).trim()
        return text === '' ? null : text
    })
    .nullish()
    .catch(null)
    .transform(value => value ?? null)

/** Optional and absent both mean `null`, so no consumer has to test for both. */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .catch(null)
        .transform(value => value ?? null)
}

/**
 * The Premium clip behind an avatar — the wire shape `resolveAvatarSource` reads structurally.
 *
 * Carried rather than dropped, so a recipient row animates exactly as the same person's row on
 * `/search` does. Two channel lists in one app that disagree about whether avatars move is the kind
 * of inconsistency nobody files and everybody notices.
 */
const avatarVideoSchema = nullable(
    z.object({
        playback: nullable(z.object({ url: nullableText })),
        thumbnail: nullableText,
        duration_seconds: nullable(z.number()),
    }),
)

const recipientImagesSchema = z
    .object({ thumb: nullableText, avatar_video: avatarVideoSchema })
    .catch({ thumb: null, avatar_video: null })

export const giftRecipientSchema = z.looseObject({
    /** The **channel's** id. Not what the checkout is priced against — see `owner_id`. */
    id,
    /**
     * Never carries the leading `@`, and **the row is unusable without it**: it is the key the
     * picker holds, what `resolveReceiverId` asks about, and what the success screen prints.
     *
     * Trimmed, and the trim is half the filter: `z.string().catch('')` alone lets a whitespace-only
     * slug through — it is a string, so it parses, and it is not `''`, so a naive filter keeps it.
     * The row then renders, is pressable, and resolves to nothing. The same trap
     * `normalizeSearchChannels` was bitten by.
     */
    slug: z
        .string()
        .catch('')
        .transform(value => value.trim()),
    name: nullableText,
    /** Present on `followed-channels/`, absent from search's. Preferred where it is there. */
    display_name: nullableText,
    images: recipientImagesSchema,
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    /** Decides whether the avatar may animate — and, on the row, the name's ink. */
    is_premium: boolish,
    /**
     * A sensitive space. The row **marks** it and still offers it: this flag decorates, it does not
     * protect (the wall is the channel page's), and a gift is not content.
     */
    is_nsfw: boolish,
    /**
     * The **user** who owns the space — what the checkout is priced against.
     *
     * Declared optional because neither list is contracted to send it: legacy reads
     * `channelSelected?.owner_id` and falls back to a channel fetch when it is absent, which is
     * evidence that it is absent often enough to have been noticed. `resolveReceiverId` is that
     * fallback, and this field is what lets it be skipped when the payload was generous.
     *
     * `nullableId`, **not** `nullableText`: it arrives as a number. See that helper.
     */
    owner_id: nullableId,
})

export type GiftRecipient = z.infer<typeof giftRecipientSchema>

/**
 * Parse a list of recipients, dropping the rows that cannot be gifted to.
 *
 * One filter, and it is about the **destination** rather than the display: every other field
 * degrades (no avatar becomes initials, no name falls back to the handle), but a row with no slug
 * is a face that cannot be resolved to a user id — so pressing it could only fail, one screen
 * later, after the reader has chosen a package.
 */
export function normalizeGiftRecipients(results: unknown): GiftRecipient[] {
    if (!Array.isArray(results)) return []
    const rows: GiftRecipient[] = []
    for (const row of results) {
        const parsed = giftRecipientSchema.safeParse(row)
        if (parsed.success && parsed.data.slug !== '') rows.push(parsed.data)
    }
    return rows
}

/**
 * The name to print, or `''` when the payload carried none.
 *
 * `display_name` first, because where both are present that is the one the creator chose. Callers
 * fall back to `@slug`, which `normalizeGiftRecipients` guarantees exists.
 */
export function giftRecipientName(recipient: GiftRecipient): string {
    return recipient.display_name ?? recipient.name ?? ''
}
