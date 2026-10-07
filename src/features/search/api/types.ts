import { z } from 'zod'

/**
 * A space as the **search** screen's two lists return it.
 *
 * ## One schema for both lists, deliberately
 *
 * The screen makes two requests — `search/v3/channel/?q=` for everybody's spaces and
 * `core/v3/channel/followed-channels/?q=` for the ones this account follows — and it draws the
 * same six things from each: avatar, display name, verified mark, handle, the Premium flag that
 * decides whether the avatar may animate, and the sensitive flag. So it is one schema, named for
 * what the rows *are* rather than for either endpoint, the same call `listUserSchema` makes for
 * the blocked list and the follow-request list in `features/channel`.
 *
 * If the two payloads ever genuinely diverge — the followed row already carries `pin` and
 * `last_activity_at`, which this screen does not draw — that is the moment to split them. Not
 * before: a second copy of the same six fields is a second thing to keep in step when the backend
 * adds a seventh.
 *
 * ## Why not reuse `features/channel`'s `Channel` / `FollowedChannel`
 *
 * Two reasons, and either alone decides it. A feature may not import another feature's internals,
 * and `channelSchema` is not on that barrel (only the inferred *type* is, which cannot parse).
 * And it would be the wrong shape anyway: `channelSchema` declares forty-odd fields including
 * `mcn`, `lives` and every viewer-relative flag, none of which a search result carries — so a row
 * would be parsed against a contract it was never going to satisfy, and each missing field would
 * degrade silently to its own default. A list row is a **projection**, and this file says which one.
 *
 * ## The parse is per-field and cannot throw
 *
 * Same rule as everywhere else at this boundary: a hard throw would blank the whole results list
 * because the backend nulled one avatar. `.catch()` per field degrades that field; a row that
 * cannot be *linked to* is dropped whole by `normalizeSearchChannels`, which is the only
 * all-or-nothing decision here.
 *
 * Field names are legacy's (`containers/search/components/globalSearch`), since that is the
 * contract until the API team confirms one — see B78 in `docs/BACKEND_QUESTIONS.md`.
 */

/** A string that is present and non-blank, else `null`. `''` is not a URL or a name. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Ids arrive as either a string or a number depending on the service. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

const boolish = z.coerce.boolean().catch(false)

/**
 * Optional and absent both mean `null` — never `undefined`, so no consumer has to test for
 * both. Same helper, and the same reasoning, as `features/channel`'s.
 */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .catch(null)
        .transform(value => value ?? null)
}

/**
 * The Premium clip behind an avatar. Declared here — rather than the row taking
 * `AvatarVideoInput` structurally — because this is the *wire* shape and it has to be parsed;
 * `resolveAvatarSource` then reads it structurally, which is what keeps `shared/` free of any
 * feature's DTO.
 */
const avatarVideoSchema = nullable(
    z.object({
        playback: nullable(z.object({ url: nullableText })),
        thumbnail: nullableText,
        duration_seconds: nullable(z.number()),
    }),
)

/**
 * `images` on both endpoints. `cover` is **not** declared: neither list draws one, and the
 * schema is `looseObject` at the row level so a payload that carries it keeps it — it simply
 * does not become part of a contract this screen would then be expected to honour.
 */
const searchImagesSchema = z
    .object({ thumb: nullableText, avatar_video: avatarVideoSchema })
    .catch({ thumb: null, avatar_video: null })

export const searchChannelSchema = z.looseObject({
    id,
    /**
     * Never carries the leading `@` — that lives on the URL, not in the field.
     *
     * **The row is unusable without it**, which is why `normalizeSearchChannels` filters on this
     * and not on `id`: everything a result row offers is `/@{slug}`, so a row with no slug is a
     * name that cannot be pressed. Same call `normalizeFollowedChannels` makes.
     *
     * ⚠ **Trimmed, and the trim is the filter's other half.** `z.string().catch('')` alone lets a
     * whitespace-only slug through — it is a string, so it parses, and it is not `''`, so the
     * filter keeps the row. What ships then is a link to `/@%20%20%20`: a result that renders, is
     * pressable, and 404s. Nothing in the client notices, because every layer did what it was
     * asked. Found by a test, which is the only way this class of thing shows up.
     */
    slug: z
        .string()
        .catch('')
        .transform(value => value.trim()),
    name: nullableText,
    /**
     * Present on the followed-channels payload, absent from search's — legacy reads `name` on
     * both and never `display_name`. Declared anyway, and preferred by `searchChannelName`, so a
     * backend that starts sending it is read rather than ignored.
     */
    display_name: nullableText,
    images: searchImagesSchema,
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    /** Decides whether the avatar may animate — see `resolveAvatarSource`. */
    is_premium: boolish,
    /**
     * A sensitive space. The row marks it rather than hiding it: legacy draws a badge over the
     * avatar and still links through, and the gate itself lives on the channel page
     * (`features/nsfw`), which is the only place that can record a consent.
     *
     * `false` when the field is absent, and that is the fail-*open* direction — deliberately, and
     * only because this flag decorates rather than protects. The wall is `ChannelNsfwGate`'s and
     * it reads the channel's own payload; a missing badge here shows an unmarked row, not
     * sensitive content.
     */
    is_nsfw: boolish,
    /**
     * Drawn on the row's second line ("40.4k Followers"). Both endpoints send it, and they do not
     * agree: `search/` reads it off its index, which lags — a space with 16 followers on
     * `followed-channels/` came back as `0` from search (B78). `null` when absent, so the row can
     * leave the line out rather than print a made-up zero.
     */
    follower_count: nullable(z.coerce.number().nonnegative()),
    /**
     * The other half of the Figma row ("276 Members"). **Neither endpoint sends it today** — it is
     * declared so the row picks it up the day the backend adds it, and until then the line shows
     * followers alone. Spelling is `member_count`, as on the channel stats payload.
     */
    member_count: nullable(z.coerce.number().nonnegative()),
})

export type SearchChannel = z.infer<typeof searchChannelSchema>

/**
 * Parse a page of results, dropping rows that cannot be reached.
 *
 * One filter, and it is about the *destination* rather than the display: the whole row is a link
 * to `/@{slug}`, so a row with no slug renders a name that goes nowhere — worse than one row
 * fewer. Everything else degrades field by field: no avatar becomes initials, no name falls back
 * to the handle, no verified mark simply draws none.
 */
export function normalizeSearchChannels(results: unknown): SearchChannel[] {
    if (!Array.isArray(results)) return []
    const rows: SearchChannel[] = []
    for (const row of results) {
        const parsed = searchChannelSchema.safeParse(row)
        if (parsed.success && parsed.data.slug !== '') rows.push(parsed.data)
    }
    return rows
}

/**
 * The name to print, or `''` when the payload carried none.
 *
 * `display_name` first for the reason `listUserName` prefers it: where both are present the
 * display name is the one the creator chose. The caller falls back to `@slug`, which is
 * guaranteed to exist by `normalizeSearchChannels`.
 */
export function searchChannelName(channel: SearchChannel): string {
    return channel.display_name ?? channel.name ?? ''
}
