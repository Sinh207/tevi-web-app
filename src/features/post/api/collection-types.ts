import { id, nullableText } from '@shared/lib/api/wire'
import { z } from 'zod'

/**
 * A collection — a creator's own folder of posts.
 *
 * ## Only what the picker draws
 *
 * The payload carries more (a cover, a post count, timestamps), and none of it is modelled here
 * because nothing renders it: the composer shows a name and a checkbox. `looseObject` keeps the
 * rest, so the day a collections screen lands it reads the fields it needs rather than re-parsing.
 *
 * That is the same call `reply-types.ts` makes in the other direction — there, every field was
 * modelled because the row draws them. A schema should be as wide as its surface.
 */
export const postCollectionSchema = z.looseObject({
    id,
    name: nullableText,
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
