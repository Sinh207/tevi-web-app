import {
    boolish,
    count,
    id,
    nullable,
    nullableId,
    nullableNumber,
    nullableText,
    nullableTimestamp,
} from '@shared/lib/api/wire'
import { z } from 'zod'

/**
 * A post as every surface that renders one receives it.
 *
 * ## Why this feature exists at all
 *
 * A post is its own entity and **four** surfaces draw one — the channel page, home, search and
 * notifications. `features/channel/index.ts` already writes down why it is not modelled there:
 * doing so would make home and search reach through the channel feature to draw a post card. The
 * dependency runs *channel → post*, which is also why everything this feature needs from the shared
 * layer was moved down to `shared/lib/` first (`wire.ts`, `blocks-api.ts`, `report-reasons.ts`,
 * `upload-key.ts`, `format-count.ts`) rather than imported across.
 *
 * ## The parse discipline is `wire.ts`'s, and it is not optional here
 *
 * Per-field `.catch()`, never a top-level throw. A post list is the highest-volume payload in the
 * app: one malformed row out of twenty must cost that row, not the feed. `normalizePosts` therefore
 * **drops** rows that cannot be parsed rather than degrading them, and every scalar below already
 * degrades on its own.
 *
 * Unknown fields are kept (`looseObject`). The post payload is the widest in the product — legacy
 * reads `_insights`, `promote`, `space_tier` and more off it — and a field that appears tomorrow
 * should reach a call site that asks for it rather than being deleted here.
 *
 * Field names are legacy's, since that is the contract until the API team confirms one. Open
 * questions are **B105** in `docs/BACKEND_QUESTIONS.md`.
 */

/**
 * The channel a post belongs to, as embedded in the post payload.
 *
 * **Not `features/channel`'s `Channel`** — a narrower object with its own spellings, and it could
 * not import that type even if the shapes agreed. What it carries beyond identity is the pair that
 * prices an interaction (`paid_interaction_*`), which the reply box needs before it can say what
 * commenting costs.
 */
export const postAuthorSchema = z.looseObject({
    id,
    slug: nullableText,
    name: nullableText,
    owner_id: nullableId,
    images: nullable(
        z.looseObject({
            thumb: nullableText,
            uri: nullableText,
            avatar_video: nullable(z.unknown()),
        }),
    ),
    /**
     * ⚠ **An object with an `image`, not a string** — `{ "image": "https://…" }`.
     *
     * Declared `nullableText` first, which is the shape of mistake this file's own header warns
     * about: the parse does not fail, it returns `null`, so the tick simply never rendered for
     * **any** channel and nothing surfaced it. `features/channel` has had the right shape all
     * along (`channelSchema`, `listUserSchema`); this was a transcription error, and the only
     * reason it was findable is that somebody looked at a verified space.
     */
    verified_tick_badge: nullable(z.object({ image: nullableText })),
    /**
     * ⚠ **A number, not a string** — and `0` is a real value meaning "no tier".
     *
     * Declared `nullableText` first, which parses a JSON number to `null` and so made the tier
     * unreadable — the same transcription mistake as `verified_tick_badge` above, and just as
     * silent. The badge's gate reads this, so a `null` tier means the gate can never be satisfied.
     */
    space_tier: nullableNumber,
    space_tier_image: nullableText,
    is_premium: boolish,
    is_nsfw: boolish,
    is_followed: boolish,
    /** Star charged to comment on this channel's posts. `null` when the channel does not charge. */
    paid_interaction_enabled: boolish,
    paid_interaction_cost: nullableNumber,

    /**
     * The space's own page, as the backend spells it. Needed by the mini-app banner, whose link
     * target is the **space**, not the post.
     */
    shareable_url: nullableText,
    /** One line under the name in the mini-app banner. Absent on most spaces. */
    description: nullableText,

    // ── Mini app ──
    /**
     * A space can *be* a mini app, and a post from such a space carries a banner offering to open
     * it. **All three fields are required together** — legacy's gate is
     * `has_mini_app && mini_app_url && mini_app_id`, and it is right to be: a flag with no URL
     * renders a button that opens nothing, and a URL with no id cannot be tracked or resumed.
     */
    has_mini_app: boolish,
    mini_app_url: nullableText,
    mini_app_id: nullableId,

    /**
     * The affiliate program this space is promoting, if any.
     *
     * Declared here rather than in `features/affiliate` because it arrives **on the post payload**
     * and this feature may not import that one. The shape is legacy's `channel.promote`, and
     * `referral_url` is the only field the card cannot render without — the other two decorate it.
     */
    promote: nullable(
        z.looseObject({
            referral_url: nullableText,
            app_name: nullableText,
            app_icon_url: nullableText,
        }),
    ),
})

export type PostAuthor = z.infer<typeof postAuthorSchema>

/**
 * One image on a post.
 *
 * **Both dimension spellings are modelled, and that is not redundancy.** The payload carries `w`/`h`
 * on some rows and `width`/`height` on others — legacy reads both and 15 of its call sites guess
 * wrong on one of them, which is why a post's images occasionally render at the wrong aspect ratio
 * until they load. `imageAspectRatio` in `lib/post-media.ts` is the one place that decides; nothing
 * else should read these four fields.
 */
export const postImageSchema = z.looseObject({
    uri: nullableText,
    thumb: nullableText,
    blur: nullableText,
    w: nullableNumber,
    h: nullableNumber,
    width: nullableNumber,
    height: nullableNumber,
})

export type PostImage = z.infer<typeof postImageSchema>

/**
 * Where a post's video can actually be fetched from.
 *
 * ⚠ **This is an object on the wire, and modelling it as a string loses every video silently.**
 * The feed sends `playback: { hls: '…m3u8' }` (transcoded posts) or `{ url: '…mp4' }`, and legacy
 * reads three members — `dash`, `hls`, `url` — in that order. Parsed as `nullableText` the whole
 * object became `null`, which is not a parse failure: the row survives, `postMediaKind` answers
 * `'none'`, and the card renders a video post with no video and no error anywhere. Found by running
 * a real `followed-channels/threads/` page through this parser.
 *
 * A bare string is still accepted, because that is what a locally-composed preview produces before
 * the upload has been transcoded (legacy's `useReviewPost` builds the same field by hand).
 */
const playbackSchema = z
    .unknown()
    .transform(value => {
        if (typeof value === 'string') {
            const trimmed = value.trim()
            return { dash: null, hls: null, url: trimmed === '' ? null : trimmed }
        }
        if (value === null || typeof value !== 'object') {
            return { dash: null, hls: null, url: null }
        }
        const source = value as Record<string, unknown>
        return {
            dash: nullableText.parse(source.dash),
            hls: nullableText.parse(source.hls),
            url: nullableText.parse(source.url),
        }
    })
    // A fresh object per row rather than a shared constant: these are handed to components, and a
    // shared identity is a memo that never invalidates.
    .catch(() => ({ dash: null, hls: null, url: null }))

/** The video on a post. A post carries at most one, unlike images. */
export const postVideoSchema = z.looseObject({
    id: nullableId,
    playback: playbackSchema,
    thumbnail: nullableText,
    duration_seconds: nullableNumber,
    resolution_max: nullableText,
    width: nullableNumber,
    height: nullableNumber,
})

export type PostVideo = z.infer<typeof postVideoSchema>

/**
 * What is behind a paywall, for a post the reader has **not** unlocked.
 *
 * The only thing the reader may be told about locked content: how many images, how long the video,
 * how much text. The media itself is not in the payload at all — the backend withholds it rather
 * than trusting the client to hide it, which is the right posture and worth not undoing by, say,
 * caching an unlocked copy under a shared ETag scope.
 */
export const unlockDetailSchema = z.looseObject({
    images_count: count,
    video_duration_seconds: nullableNumber,
    text_length: count,
})

export type UnlockDetail = z.infer<typeof unlockDetailSchema>

/** `LIKE` is the only reaction legacy ever sends; the field is open because the set may grow. */
export const postReactionSchema = z.looseObject({ type: nullableText })

/**
 * The fields shared by a post and by the post it quotes.
 *
 * Split out **only** to stop the recursion: a quoted post can itself have quoted something, and
 * zod's `z.lazy` for that would buy an unbounded parse for a nesting level no surface renders.
 * Legacy draws exactly one level and so does this.
 */
const postCoreShape = {
    id,
    code: nullableText,
    created_at: nullableTimestamp,
    text: nullableText,
    html_text: nullableText,
    shareable_url: nullableText,
    channel: nullable(postAuthorSchema),
    images: nullable(z.array(postImageSchema).catch([])),
    video: nullable(postVideoSchema),
    cover_image: nullable(postImageSchema),

    // ── Paywall ──
    /** The Star price to unlock. Present only alongside a `product_id`. */
    price: nullableNumber,
    /** Set when the post is individually purchasable. */
    product_id: nullableId,
    /** Membership tiers that grant access. Empty means membership is not a way in. */
    required_packages: z.array(z.unknown()).catch([]),
    /** `'STARGAZERS'` is the one value legacy tests for. */
    viewer: nullableText,
    need_unlock_package: boolish,
    unlock_detail: nullable(unlockDetailSchema),

    // ── Moderation ──
    detected_nsfw: boolish,
    marked_nsfw: boolish,
    deleted: boolish,

    // ── Viewer-relative ──
    is_owner: boolish,
    is_bookmark: boolish,
    user_reaction: nullable(postReactionSchema),

    // ── Tallies ──
    reaction_count: count,
    reply_count: count,

    // ── Replies ──
    reply_allowed: boolish,
    can_reply: boolish,
    reply_allowed_user: nullableText,
    /**
     * The creator's "links are allowed in replies" switch — a **boolean**, and `null` when the
     * payload does not carry it.
     *
     * It was `nullableText` here, which is wrong in a way nothing would have surfaced: legacy reads
     * `postInfo?.reply_allowed_link` as a boolean (`postForm/provider` writes it as
     * `reply_allowed_link || false`), and a boolean run through `nullableText` lands as `null` —
     * which the composer would then have had to read as "not allowed" and silently refuse every
     * reply on every post.
     *
     * Absence is kept distinguishable from `false` rather than defaulted, because the two mean
     * different things to the box: `false` is a creator's refusal to display, `null` is a field
     * this client did not receive. `allowsReplyLinks` decides what to do with the second, and
     * decides it **once**.
     */
    reply_allowed_link: z
        .unknown()
        .transform(value => (typeof value === 'boolean' ? value : null))
        .catch(null),

    // ── Presentation ──
    pinned: boolish,
    edited: boolish,

    /**
     * What this post has earned — **only ever present on the reader's own post**.
     *
     * The underscore is the backend's, not a private-field convention of ours: legacy reads
     * `postInfo._insights.post_total_revenue` verbatim and the field is absent from every payload
     * an ordinary reader receives. Modelled here so `PostInsights` does not have to reach through
     * `looseObject`'s unknown-key bag for it, which is the reading `CLAUDE.md` bars.
     *
     * The figure is in the **earnings currency**, not Star — it is money the creator made, so it
     * goes through `useCurrency`, not `formatStarAmount`.
     */
    _insights: nullable(z.looseObject({ post_total_revenue: nullableNumber })),
}

export const quotedPostSchema = z.looseObject(postCoreShape)
export type QuotedPost = z.infer<typeof quotedPostSchema>

export const postSchema = z.looseObject({
    ...postCoreShape,
    quoted_post: nullable(quotedPostSchema),
})

export type Post = z.infer<typeof postSchema>

/**
 * One post, or `null` when the body cannot be parsed at all.
 *
 * `null` rather than a throw for the same reason every field catches: the detail page can say "this
 * post is unavailable", and it cannot say anything at all from inside an error boundary.
 */
export function normalizePost(body: unknown): Post | null {
    const parsed = postSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * A list of posts, with unparseable rows **dropped**.
 *
 * Dropping rather than degrading is the difference between this and a single post: a feed with a
 * gap is ordinary (the backend already hides posts from a reader), a feed with a blank card is a
 * defect the reader is invited to tap.
 */
export function normalizePosts(body: unknown): Post[] {
    if (!Array.isArray(body)) return []
    return body
        .map(row => postSchema.safeParse(row))
        .filter(result => result.success)
        .map(result => result.data)
}
