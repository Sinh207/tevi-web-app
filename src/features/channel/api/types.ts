import { z } from 'zod'

/**
 * The channel (a creator's "space") as this client understands it.
 *
 * ## Why zod and not a bare `interface`
 *
 * Every viewer-relative flag below is a **non-optional `boolean`**, which is only honest
 * because the payload is parsed at the boundary. Declaring them optional instead would push
 * `?? false` to every call site, and the one that forgets renders "Follow" for a channel the
 * visitor already follows.
 *
 * The parse is **per-field `.catch()`**, never a top-level throw. A hard throw would take a
 * live profile page down because the backend nulled one field it had never nulled before —
 * trading a cosmetic defect for an outage. A field-level default degrades that field and
 * renders everything else. This is the "validate at the boundary" item in
 * `docs/DEFINITION_OF_DONE.md` §8, in one testable function.
 *
 * Unknown fields are **kept**, not stripped: the backend ships more than this file models,
 * and a `space_tier` or `promote` block that appears tomorrow should reach a call site that
 * asks for it rather than being silently deleted here.
 *
 * Field names are legacy's, since that is the contract until the API team confirms one —
 * see `docs/BACKEND_QUESTIONS.md` B11–B21.
 */

/** `public` is the only value that renders a channel to strangers. */
export const CHANNEL_PRIVACY = ['public', 'protected', 'unpublished'] as const
export type ChannelPrivacy = (typeof CHANNEL_PRIVACY)[number]

/**
 * Lowercased first, because legacy `.toLowerCase()`s this at six call sites — which is
 * evidence the backend does not guarantee the case (B16).
 *
 * An **unrecognised** value becomes `'protected'`, not `'public'`: fail closed. If we could
 * not parse a channel's visibility, the one thing we must not do is expose it. Getting this
 * backwards turns a backend typo into a privacy incident.
 */
const privacySchema = z.preprocess(
    value => (typeof value === 'string' ? value.toLowerCase().trim() : value),
    z.enum(CHANNEL_PRIVACY).catch('protected'),
)

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

/**
 * A moment in time, normalised to an ISO 8601 string — or `null`.
 *
 * ## The backend sends a number, and `nullableText` was throwing it away
 *
 * `GET /core/v3/channel/channels/{slug}/` answers `created_at: 1660516880264` — **epoch
 * milliseconds, as a JSON number.** Every `created_at` in this file was declared `nullableText`,
 * which returns `null` for anything that is not a string, so the field arrived, was discarded, and
 * the header's joined-date row dropped itself because its value was empty. It had **never rendered
 * for any channel**, and nothing surfaced it: `.catch(null)` is exactly the fail-soft the schema
 * wants everywhere else, so the wrong type produced a missing row rather than an error.
 *
 * Found by querying the real endpoint rather than by reading the code, which is the only way this
 * class of bug shows up — the client's own types agree with themselves.
 *
 * ## Why ISO out
 *
 * Callers put the value straight into `<time dateTime={…}>`, which requires a valid datetime string,
 * and into `new Date(value)`. A raw `'1660516880264'` string parses as `Invalid Date` in both. One
 * normalisation here means neither the formatters nor the markup has to know what the wire looked
 * like.
 *
 * Seconds are accepted alongside milliseconds. The threshold is unambiguous for any real date: a
 * millisecond epoch below `1e11` is 1973, and a second epoch above it is the year 5138. This is
 * defensive rather than observed — only `channels/{slug}/` has been checked, and the four endpoints
 * that use this need not agree with each other.
 */
const nullableTimestamp = z
    .unknown()
    .transform(value => {
        const raw =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && /^\d+$/.test(value.trim())
                  ? Number(value.trim())
                  : null

        if (raw !== null) {
            if (!Number.isFinite(raw) || raw <= 0) return null
            const date = new Date(raw < 1e11 ? raw * 1000 : raw)
            return Number.isNaN(date.getTime()) ? null : date.toISOString()
        }

        // An ISO string (or anything else `Date` understands) passes through as itself.
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
    })
    .catch(null)

const boolish = z.coerce.boolean().catch(false)

/**
 * Optional and absent both mean `null` — never `undefined`.
 *
 * `.nullish()` alone leaves a *missing* key as `undefined` while an explicit `null` stays
 * `null`, so every consumer would have to test for both. Collapsing them here means
 * `channel.mcn === null` is the only check anyone writes, and a field that starts arriving
 * as `null` instead of being omitted changes nothing downstream.
 */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .catch(null)
        .transform(value => value ?? null)
}

export const avatarVideoSchema = nullable(
    z.object({
        playback: nullable(z.object({ url: nullableText })),
        thumbnail: nullableText,
        duration_seconds: nullable(z.number()),
    }),
)

export const channelImagesSchema = z
    .object({
        thumb: nullableText,
        cover: nullableText,
        avatar_video: avatarVideoSchema,
    })
    .catch({ thumb: null, cover: null, avatar_video: null })

/**
 * A category is a **plain string** on the wire — `["Music", "Game", "Just Chatting", …]`.
 *
 * ## This was modelled as `{ id, name }` and the whole array was being discarded
 *
 * Not one category, all fourteen. Every element failed `z.object`, and `categories` carried a
 * **array-level** `.catch([])`, so a per-element shape mismatch became total data loss and the About
 * tab simply had no categories row. Legacy is the evidence it was always strings: it renders
 * `<Chip label={category}/>` with the item itself as the label, no `.name` anywhere.
 *
 * So the parse is per-element and cannot throw: an element that is not usable becomes `null` and is
 * filtered out, leaving the other thirteen. **That is the lesson worth carrying** — `.catch([])` on
 * an array is a trapdoor, because it converts "one row is odd" into "there is no data", which
 * renders as a missing section rather than an error.
 *
 * An object with a `name` is accepted too. That is not observed on this endpoint; it is the shape
 * this file already assumed, so accepting both costs one branch and means a backend that ever sends
 * it degrades to working rather than to empty.
 */
export const channelCategorySchema = z
    .unknown()
    .transform(value => {
        if (typeof value === 'string') return value.trim() || null
        if (value && typeof value === 'object' && 'name' in value) {
            const name = (value as { name?: unknown }).name
            return typeof name === 'string' ? name.trim() || null : null
        }
        return null
    })
    .catch(null)

export const channelSocialLinkSchema = z.object({
    id,
    /** Open set — the platform list is server-driven, so this is not an enum. */
    platform: nullableText,
    url: nullableText,
    title: nullableText,
})

export const channelBadgeSchema = z.object({ image: nullableText, title: nullableText })

export type ChannelImages = z.infer<typeof channelImagesSchema>
/** A category name. Was `{ id, name }` — see `channelCategorySchema`. */
export type ChannelCategory = string
export type ChannelSocialLink = z.infer<typeof channelSocialLinkSchema>
export type ChannelBadge = z.infer<typeof channelBadgeSchema>
export type AvatarVideo = z.infer<typeof avatarVideoSchema>

export const channelSchema = z.looseObject({
    id,
    /**
     * The **user** id of the channel's owner — not the channel id.
     *
     * Ownership is decided from `owner_id === currentUser.id`, which costs no request. The
     * evidence that this is a user id: legacy posts it as `{ user_id }` to
     * `my-channel/blocks/`, and sends it as `receiver_user_id` when gifting premium. See B11.
     */
    owner_id: id,
    /** Never carries the leading `@` — that lives on the URL, not in the field. */
    slug: z.string().catch(''),
    name: nullableText,
    description: nullableText,
    created_at: nullableTimestamp,
    shareable_url: nullableText,
    privacy: privacySchema,
    images: channelImagesSchema,
    /**
     * Unusable elements are dropped, the rest survive — the filter is the point, not tidiness.
     * See `channelCategorySchema` for the array-level `.catch([])` this replaced.
     */
    categories: z
        .array(channelCategorySchema)
        .catch([])
        .transform(list => list.filter((name): name is string => name !== null)),
    social_links: z.array(channelSocialLinkSchema).catch([]),
    show_income: boolish,
    is_premium: boolish,
    is_nsfw: boolish,
    is_suspended: boolish,
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    claimed_badges: z.array(channelBadgeSchema).catch([]),
    /**
     * ⚠ **Only ever populated on `my-channel/`.** `GET channels/{slug}/` does not send this field —
     * verified against the live endpoint, which answers 44 keys and no `mcn`. That is correct: a
     * revenue split is not public information about a space. It stays declared here because
     * `normalizeChannel` parses *both* endpoints' bodies, so this is the shape when the body is the
     * account's own. Read it through `useMyChannel()`, never off the channel a page is displaying —
     * `channel-about-mcn.tsx` did the latter and rendered nothing for a while.
     */
    mcn: nullable(
        z.looseObject({
            /**
             * The network's name — the card's own heading, so it is declared rather than left to
             * the loose index signature (which types it `unknown` and cannot be rendered).
             */
            name: nullableText,
            /**
             * True when *this* creator runs the network. Legacy hides the whole MCN card then —
             * the operator reads their terms in the organization tooling, not off their space.
             */
            is_owner: boolish,
            creator_rate: nullable(z.number()),
            mcn_revenue_rate: nullable(z.number()),
        }),
    ),
    /** Non-empty while the creator is live. Only the count matters to this feature. */
    lives: z.array(z.looseObject({ status: nullableText })).catch([]),
    has_mini_app: boolish,
    mini_app_url: nullableText,
    promote: nullable(z.looseObject({ referral_url: nullableText })),

    // ── viewer-relative: meaningless without a bearer, so `false` is the right default ──
    is_followed: boolish,
    follow_requested: boolish,
    blocking_channel: boolish,
    blocked_user: boolish,
    notification_settings: nullable(z.looseObject({ notification: boolish })),
})

export type Channel = z.infer<typeof channelSchema>

/**
 * `GET /analytics/v2/channel/{slug}/stats/`.
 *
 * `income_usd` is rendered whenever **`show_income`** is set — that flag is the creator's own opt-in
 * to publish the number, so it is not owner-only. (This comment used to say `show_income && isOwner`;
 * the ownership half broke the toggle, since only the creator ever saw what they had chosen to
 * publish.) Which leaves the access rule entirely with the backend — B18 asks whether `income_usd`
 * reaches an anonymous caller while `show_income` is false, and the client has no second gate there.
 */
export const channelStatsSchema = z.looseObject({
    follower_count: z.coerce.number().catch(0),
    member_count: z.coerce.number().catch(0),
    post_count: z.coerce.number().catch(0),
    income_usd: z.coerce.number().catch(0),
})

export type ChannelStats = z.infer<typeof channelStatsSchema>

/**
 * The DRF list envelope, **after** the response interceptor has stripped one `{ data }`
 * level (`shared/lib/api/unwrap.ts`).
 *
 * `next` is a full absolute URL rather than an opaque token, which is why it cannot simply
 * be fetched — see `lib/next-page-param.ts`.
 */
export interface Paginated<T> {
    results: T[]
    count: number
    next: string | null
    previous: string | null
}

/**
 * A post as the channel's own lists return it — **deliberately minimal**.
 *
 * This feature renders a placeholder card, not a real post. Modelling the full post DTO here
 * would put it in the wrong feature and guarantee it drifts from the real one; `features/post`
 * owns that type when it lands, and this shrinks to a re-export.
 */
/**
 * One row of the owner's activity feed — `GET channels/{slug}/activity-feed/`.
 *
 * **`type` is an open string on purpose.** Legacy maps exactly two values to copy
 * (`NEW_MEMBERSHIP`, `DONATION`) and renders **nothing** for anything else — `ACTIVITY_FEED_TYPE[type]`
 * is `undefined`, so the row shows a name followed by empty space. Modelling it as an enum would make a
 * third value a parse failure; keeping it a string lets the component skip rows it cannot phrase, which
 * is the honest behaviour for a feed the backend can extend without us.
 */
export const channelActivitySchema = z.looseObject({
    type: nullableText,
    created_at: nullableTimestamp,
    actor: nullable(
        z.looseObject({
            id,
            display_name: nullableText,
            avatar: nullable(z.looseObject({ thumb: nullableText })),
        }),
    ),
})

export type ChannelActivity = z.infer<typeof channelActivitySchema>

/** Rows that cannot be rendered at all are dropped rather than degraded — see `normalizeChannel`. */
export function normalizeChannelActivity(body: unknown): ChannelActivity[] {
    if (!Array.isArray(body)) return []
    return (
        body
            .map(row => channelActivitySchema.safeParse(row))
            .filter(result => result.success)
            .map(result => result.data)
            // An actor is the whole row: "«name» has donated" with no name is a sentence fragment.
            .filter(row => row.actor?.display_name)
    )
}

export const channelThreadSchema = z.looseObject({
    id,
    code: nullableText,
    created_at: nullableTimestamp,
})

export type ChannelThread = z.infer<typeof channelThreadSchema>

/**
 * The person on the other side of a block, as `my-channel/blocks/` returns them.
 *
 * **Not a `Channel`, and not `/me`'s user either** — a third shape, which is why it gets its
 * own schema rather than a cast. The differences are the ones that bite: the avatar lives
 * under `avatar` (not `images`), the display name is `display_name` with `name` as the
 * fallback (the channel DTO has only `name`), and there is no `owner_id` because the row
 * *is* the user.
 */
export const blockedUserSchema = z.looseObject({
    /** The **user** id — what `blockUser` posts as `user_id`. Not the block's id. */
    id,
    name: nullableText,
    display_name: nullableText,
    /** Never carries the leading `@`, same as `Channel.slug`. */
    slug: z.string().catch(''),
    avatar: z
        .object({ thumb: nullableText, avatar_video: avatarVideoSchema })
        .catch({ thumb: null, avatar_video: null }),
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    is_premium: boolish,
})

export type BlockedUser = z.infer<typeof blockedUserSchema>

/**
 * One row of the blocked list: **the block itself**, with the user nested inside it.
 *
 * ⚠ `id` is the *block record's* id, not the user's — the two are both present and both
 * plausible-looking strings, and picking the wrong one produces a 404 on unblock that reads
 * like a backend fault. `unblockUser` takes this one; `blockUser` takes `user.id`. See B23,
 * which is open precisely because the two shipped clients disagree about which the DELETE
 * path wants.
 */
export const blockedAccountSchema = z.looseObject({
    id,
    /** When the block was created. Absent in some payloads — the row then shows no meta line. */
    created_at: nullableTimestamp,
    user: blockedUserSchema,
})

export type BlockedAccount = z.infer<typeof blockedAccountSchema>

/**
 * Parse a page of blocked accounts, dropping rows that cannot be acted on.
 *
 * Two filters, and both are about the *action* rather than the display:
 *
 * - A row with no `id` cannot be unblocked, so rendering it offers a button that is
 *   guaranteed to fail. Legacy renders it anyway and the request 404s.
 * - A row whose `user` did not parse to an object at all is a hole with a working Unblock
 *   button and no name — worse than one row fewer.
 *
 * Everything else degrades field by field, as `normalizeChannel` does: a missing avatar
 * becomes initials, a missing slug drops the handle line, and the row still works.
 */
export function normalizeBlockedAccounts(results: unknown): BlockedAccount[] {
    if (!Array.isArray(results)) return []
    const rows: BlockedAccount[] = []
    for (const row of results) {
        const parsed = blockedAccountSchema.safeParse(row)
        if (parsed.success && parsed.data.id !== '') rows.push(parsed.data)
    }
    return rows
}

/** The display name for a blocked row, or `''` when the payload carried none. */
export function blockedUserName(user: BlockedUser): string {
    return user.display_name ?? user.name ?? ''
}

/**
 * Parse a channel payload, degrading field by field.
 *
 * Returns `null` only when the body is not an object at all — at that point there is nothing
 * to degrade *to*, and pretending otherwise would render a page-shaped hole with a blank
 * name. Callers treat `null` as "the upstream answer was unusable", which is distinct from
 * "there is no such channel".
 */
export function normalizeChannel(body: unknown): Channel | null {
    const parsed = channelSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

export function normalizeChannelStats(body: unknown): ChannelStats | null {
    const parsed = channelStatsSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * A platform the social-links editor may offer — `my-channel/social-links/supported-platforms/`.
 *
 * **Server-driven, deliberately not an enum.** Legacy fetches this list rather than shipping one,
 * which is what lets the backend add Kick or Patreon without a front-end release — and is also
 * why `ChannelSocialLink.platform` is a bare string. `value` is the slug that goes on the wire
 * and keys `SOCIAL_ICON`; `name` is what a person reads.
 */
export const socialPlatformSchema = z.looseObject({
    value: z.string().catch(''),
    name: nullableText,
})

export type SocialPlatform = z.infer<typeof socialPlatformSchema>

/**
 * Parse the supported-platform list, dropping rows that cannot be *chosen*.
 *
 * A row with no `value` has nothing to send when it is picked, so offering it is offering a
 * write that will fail. A row with no `name` falls back to its own slug rather than being
 * dropped — "tiktok" in the picker is worse than "TikTok" and much better than a blank option
 * that silently exists.
 */
export function normalizeSocialPlatforms(results: unknown): SocialPlatform[] {
    if (!Array.isArray(results)) return []
    const rows: SocialPlatform[] = []
    for (const row of results) {
        const parsed = socialPlatformSchema.safeParse(row)
        if (parsed.success && parsed.data.value) {
            rows.push({ ...parsed.data, name: parsed.data.name ?? parsed.data.value })
        }
    }
    return rows
}

/**
 * Parse `v3/channel/categories/` — the same bare strings `Channel.categories` carries.
 *
 * Reuses `channelCategorySchema`, so the picker and the profile agree about what a category *is*
 * even if the two endpoints ever stop agreeing about what it looks like. Duplicates are dropped:
 * the list becomes checkbox state keyed by name, and two "Music" rows would toggle as one while
 * looking like two.
 */
export function normalizeCategoryNames(results: unknown): string[] {
    if (!Array.isArray(results)) return []
    const seen = new Set<string>()
    for (const row of results) {
        const parsed = channelCategorySchema.safeParse(row)
        if (parsed.success && parsed.data && !seen.has(parsed.data)) seen.add(parsed.data)
    }
    return [...seen]
}

/**
 * The per-field rejections a failed `PATCH my-channel/` carries: `{ errors: [{ input, error }] }`.
 *
 * ## This is the one place the backend's own words are allowed on screen
 *
 * Everywhere else in this app a failure becomes one of our sentences — `lib/auth-error.ts` maps
 * every sign-in failure to a key, `settings_update_failed` stands in for every write. That rule
 * exists because a raw message is usually neither actionable nor safe to repeat (it enumerates
 * accounts, it leaks internals, it is untranslated).
 *
 * A field rejection is the exception, and for the same reason `providerSignInErrorText` is: no
 * key of ours can say *"a space with this username already exists"* or *"this name contains a
 * blocked word"*. The alternative is a form that goes red with a generic line under all seven
 * fields, which tells the person nothing about what to change. Legacy shows these too.
 *
 * The guards are what keep it narrow: known input names only (so a new `errors` entry cannot
 * paint an unrelated field), strings only, trimmed, first-wins, and length-capped so a stack
 * fragment cannot become the message. It is untranslated by nature — the same trade
 * `signInErrorText` documents.
 */
const PATCHABLE_INPUTS = [
    'images',
    'name',
    'slug',
    'description',
    'categories',
    'social_links',
    'show_income',
] as const

export type ChannelFieldError = (typeof PATCHABLE_INPUTS)[number]

/**
 * The **top-level** sentence a failed write carries — `{ message, code, success: false }`.
 *
 * ## Two error shapes, and only one of them was being read
 *
 * `PATCH my-channel/` rejects in two ways. Per-field, as `errors: [{ input, error }]`, which
 * `parseChannelFieldErrors` handles — and *whole-request*, as a bare message with a code:
 *
 * ```json
 * { "message": "You can't change username of verified space. Please contact support.",
 *   "code": "CHN0006", "success": false }
 * ```
 *
 * The second shape has no `errors` array, so it parsed to `{}` and the screen fell through to the
 * generic `settings_update_failed` — "Could not save that change. Please try again." For **this**
 * failure that sentence is not merely vague, it is wrong: trying again cannot work, and the thing
 * the person needs to know (contact support) is in the body we threw away. It is now the toast's
 * text (`useSaveProfile`).
 *
 * ## So this is the third place the backend's own words reach the screen
 *
 * The rule (`lib/auth-error.ts`) is that they do not — a raw message is usually unactionable,
 * untranslated, or leaks internals. The exceptions are all the same shape: *no key of ours can say
 * it*. `providerSignInErrorText` for "use a different Google account", `useSlugCheck` for "that
 * username is taken", and now this, for a rule about verified spaces that we do not model and
 * could not phrase.
 *
 * The guards are what keep it narrow, and they are `providerSignInErrorText`'s: **4xx only** (a 5xx
 * body is where stack fragments live), a string, trimmed, one short sentence or nothing.
 * Untranslated by nature.
 *
 * `code` is deliberately **not** used to pick a field. `CHN0006` plainly concerns the username in
 * the message above, but one observed code is not a mapping, and guessing wrong would paint the
 * rejection under a field it is not about. See B28.
 */
export function parseApiMessage(body: unknown, status: number | undefined): string | null {
    if (!status || status < 400 || status >= 500) return null
    if (!body || typeof body !== 'object') return null
    const message = (body as { message?: unknown }).message
    if (typeof message !== 'string') return null
    const trimmed = message.trim()
    return trimmed && trimmed.length <= 200 ? trimmed : null
}

/** A rejection sentence per field. Fields the backend did not name are simply absent. */
export function parseChannelFieldErrors(body: unknown): Partial<Record<ChannelFieldError, string>> {
    const out: Partial<Record<ChannelFieldError, string>> = {}
    if (!body || typeof body !== 'object') return out
    const errors = (body as { errors?: unknown }).errors
    if (!Array.isArray(errors)) return out

    for (const row of errors) {
        if (!row || typeof row !== 'object') continue
        const { input, error } = row as { input?: unknown; error?: unknown }
        if (typeof input !== 'string' || typeof error !== 'string') continue
        if (!(PATCHABLE_INPUTS as readonly string[]).includes(input)) continue
        const key = input as ChannelFieldError
        // First wins: two rejections for one field are two sentences for one line.
        if (out[key]) continue
        const message = error.trim()
        if (message && message.length <= 200) out[key] = message
    }
    return out
}

/**
 * Read the `privacy` a **write** acknowledgement carries — `POST my-channel/privacy/`.
 *
 * Deliberately **not** `privacySchema`: that one catches an unrecognised value as
 * `'protected'`, which is the right default when *reading* a channel (fail closed — never
 * expose a space whose visibility we could not parse) and the wrong one here. On the write
 * path the value is being reflected back at the person who just chose it, so an unparseable
 * ack must mean "we do not know what happened" and send the caller to refetch — silently
 * writing `'protected'` into the cache would tell someone who picked *public* that their
 * space is now protected, and it would be a lie in the safe-looking direction.
 *
 * `null` therefore covers all three ways this can go wrong: no body, no `privacy` key, or a
 * value outside the enum. Case and padding are still tolerated, since B16 says the backend
 * does not guarantee either.
 */
export function parseAckPrivacy(body: unknown): ChannelPrivacy | null {
    if (typeof body !== 'object' || body === null) return null
    const value = (body as { privacy?: unknown }).privacy
    if (typeof value !== 'string') return null
    const parsed = z.enum(CHANNEL_PRIVACY).safeParse(value.toLowerCase().trim())
    return parsed.success ? parsed.data : null
}
