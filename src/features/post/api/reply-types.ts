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
import { postImageSchema } from './types'

/**
 * A reply, as `v1/posts/{id}/replies/` and `v1/posts/replies/{id}/child-replies/` actually send it.
 *
 * ## ⚠ A reply is **not** a post, and this file exists because the client believed it was
 *
 * `usePostReplies` used to parse these rows with `normalizePosts`, on the strength of a comment
 * saying "a reply carries the same DTO as a post". It does not. Measured against
 * `wapi.tevi.dev` — the whole row, printed — the two payloads share `id`, `text`, `html_text`,
 * `images`, `created_at`, `edited`, `deleted`, `reaction_count`, `reply_count` and `user_reaction`,
 * and then diverge completely:
 *
 * | | post | reply |
 * |---|---|---|
 * | the author | `channel` | **`owner_channel`** (plus `owner`, the *user*) |
 * | the space it is in | is the author | **`post_channel`** — the parent post's space |
 * | what it hangs off | — | **`post_id`**, and `parent_id` for a nested one |
 * | ownership | `is_owner` | **absent** — derive it (see `isOwnReply`) |
 * | badges | `space_tier`, `pinned` | **`from_post_owner`**, **`from_subscriber`** |
 * | paywall | `product_id`, `required_packages`, `viewer`, `need_unlock_package` | **none of them** |
 * | moderation | `detected_nsfw`, `marked_nsfw` | **absent** |
 * | replying | `reply_allowed`, `can_reply` | **absent** |
 * | sharing | `shareable_url` | **absent** |
 * | media | `playback`, `cover_image`, `quoted_post` | **absent** — `images` only |
 *
 * The consequence of the old reading was not a parse failure, which is why nothing caught it: every
 * missing field simply caught to its default, so every reply on the detail page rendered with **no
 * author, no avatar and no name**, a share button, a bookmark button, and a menu whose *Block* row
 * could never work (it needs `channel.owner_id`, and there is no `channel`).
 *
 * ## No `count` on the envelope either
 *
 * `{ next, previous, results }` — cursor pagination, so there is no total, and the `count ?? 0` the
 * model used to read meant the heading said **"0 replies"** on every post that had any. The number
 * beside the heading now comes from the parent post's own `reply_count`, which is a real field.
 *
 * `lang` comes back on every row, echoing what `createReply` sent — see **B109** for what it is for.
 */
export const replySchema = z.looseObject({
    id,
    /** The post this hangs off. Present on a child reply too, which is why `parent_id` exists. */
    post_id: nullableId,
    /** Set only on a **child** reply: the reply it answers. `null` on a top-level one. */
    parent_id: nullableId,

    text: nullableText,
    /**
     * Never rendered, for the reason `post-card.tsx` gives about the same field: creator-authored
     * markup with no sanitiser in this repo. Parsed so a row that carries *only* `html_text` can be
     * recognised as having content rather than treated as empty.
     */
    html_text: nullableText,
    images: z.array(postImageSchema).catch([]),

    created_at: nullableTimestamp,
    edited: boolish,
    deleted: boolish,

    /** The space the parent post lives in — and the one that prices an interaction on this reply. */
    post_channel: nullable(
        z.looseObject({
            id,
            slug: nullableText,
            name: nullableText,
            owner_id: nullableId,
            paid_interaction_enabled: boolish,
            paid_interaction_cost: nullableNumber,
        }),
    ),

    /**
     * Who wrote it — **the author's space**, and the only thing the row's header can draw.
     *
     * A narrower object than a post's `channel`: no `space_tier`, no `promote`, no mini-app fields.
     * Modelled as what is really there rather than as the post's channel with holes in it, so a
     * component cannot reach for a tier badge the payload will never carry.
     */
    owner_channel: nullable(
        z.looseObject({
            id,
            slug: nullableText,
            name: nullableText,
            images: nullable(
                z.looseObject({
                    thumb: nullableText,
                    uri: nullableText,
                    avatar_video: nullable(z.unknown()),
                }),
            ),
            verified_tick_badge: nullable(z.object({ image: nullableText })),
            is_premium: boolish,
            is_nsfw: boolish,
        }),
    ),

    /**
     * The author as a **user**, not a space. Carried because it is the only identifier that can be
     * compared against `/me` — see `isOwnReply`.
     */
    owner: nullable(
        z.looseObject({
            id: nullableId,
            display_name: nullableText,
            avatar: nullable(z.looseObject({ thumb: nullableText })),
        }),
    ),

    /** The reply is by the **post's** author. Legacy draws no mark for it; kept because it is free. */
    from_post_owner: boolish,
    /** The author is a paying member of the space — legacy's `BadgeMember`. */
    from_subscriber: boolish,

    reaction_count: count,
    /** How many **child** replies hang off this one. */
    reply_count: count,
    user_reaction: nullable(z.looseObject({ type: nullableText })),

    /** Echoed back from the write. **B109**. */
    lang: nullableText,
})

export type Reply = z.infer<typeof replySchema>

/** One reply, or `null` when the body cannot be parsed — the same contract as `normalizePost`. */
export function normalizeReply(body: unknown): Reply | null {
    const parsed = replySchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * A list of replies, dropping rows that will not parse.
 *
 * Same discipline as `normalizePosts`: one malformed row costs that row, not the list.
 */
export function normalizeReplies(body: unknown): Reply[] {
    if (!Array.isArray(body)) return []
    const rows: Reply[] = []
    for (const row of body) {
        const parsed = normalizeReply(row)
        if (parsed) rows.push(parsed)
    }
    return rows
}

/**
 * Is this reply the reader's own?
 *
 * **Derived, because the payload does not say.** A post carries `is_owner`; a reply carries nothing
 * of the sort, so the menu's *Delete* row has to be decided here. Two identifiers could answer it
 * and only one is reachable from this feature:
 *
 * - `owner_channel.slug` against the reader's own channel slug — which is what legacy compares
 *   (`isMyComment`), and which needs `useMyChannel`, in `features/channel`, which imports this
 *   feature.
 * - `owner.id` against `/me`'s `id`. **B11** established that those are one identifier space, and
 *   `owner.id` arrives as a string while `/me` sends a number, so the compare is on `String(…)` —
 *   exactly as `use-channel-ownership.ts` does for `owner_id`.
 *
 * The second, therefore. A reader with no id — a guest — owns nothing, which is the right answer
 * and not merely a safe one.
 */
export function isOwnReply(reply: Pick<Reply, 'owner'>, userId: string | number | null): boolean {
    const ownerId = reply.owner?.id
    if (!ownerId || userId === null || userId === undefined) return false
    return String(userId) === ownerId
}

/**
 * Has the reply got anything to draw?
 *
 * A row with neither words nor pictures is not something the API is expected to produce, but
 * `html_text`-only rows **are** real (legacy writes them for any reply containing a link), and this
 * client renders no markup. Such a row still draws its header, its timestamp and its actions — the
 * alternative, hiding it, would silently remove replies people can see in the mobile apps.
 */
export function replyHasBody(reply: Pick<Reply, 'text' | 'images' | 'html_text'>): boolean {
    return Boolean(reply.text) || reply.images.length > 0 || Boolean(reply.html_text)
}
