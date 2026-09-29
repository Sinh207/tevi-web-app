import { count, id, nullableText, nullableTimestamp } from '@shared/lib/api/wire'
import { z } from 'zod'

/**
 * A collection — a creator's own folder of posts.
 *
 * ## Only what is drawn
 *
 * The payload carries more (`add_new_at`, `shareable_url`), and a field is modelled here the day
 * something renders it — the picker and the chip row draw a name, the list a count and a date.
 * `looseObject` keeps the rest, so adding one is a line here rather than a re-parse. Both halves of
 * the contract (the owner's `v1` and a space's `v3`) answer with this same row.
 *
 * That is the same call `reply-types.ts` makes in the other direction — there, every field was
 * modelled because the row draws them. A schema should be as wide as its surface.
 */
export const postCollectionSchema = z.looseObject({
    id,
    name: nullableText,
    /**
     * How many posts are in it — drawn under the name, as legacy draws it.
     *
     * `count`, so an absent field is `0` rather than `null`: a collection with no posts has zero of
     * them, and every consumer would otherwise carry a `?? 0`.
     */
    post_count: count,
    /**
     * When it was made — the list's rows print it, as legacy's `CollectionItem` does. Epoch
     * milliseconds on the wire (both halves, measured on staging), ISO once parsed.
     */
    created_at: nullableTimestamp,
})

export type PostCollection = z.infer<typeof postCollectionSchema>

/** One collection, or `null` when the body will not parse. */
export function normalizeCollection(body: unknown): PostCollection | null {
    const parsed = postCollectionSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/** A page of them, dropping rows that will not parse rather than the page. */
export function normalizeCollections(body: unknown): PostCollection[] {
    if (!Array.isArray(body)) return []
    const rows: PostCollection[] = []
    for (const row of body) {
        const parsed = normalizeCollection(row)
        if (parsed) rows.push(parsed)
    }
    return rows
}
