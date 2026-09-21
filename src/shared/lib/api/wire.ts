import { z } from 'zod'

/**
 * The wire primitives every DTO schema in this app is built from.
 *
 * ## Why these live here and not in the feature that wrote them
 *
 * They started in `features/channel/api/types.ts`, whose header states the discipline they exist to
 * serve: **per-field `.catch()`, never a top-level throw**, because a hard throw takes a live page
 * down when the backend nulls one field it had never nulled before — trading a cosmetic defect for
 * an outage.
 *
 * By the time a second feature needed them (`features/nsfw`'s appeal queue) the alternative to
 * moving them was a copy, and a copy was made: `nsfw-appeal-api.ts` carried a hand-written
 * `nullableText` that collapsed the trim to one expression, no `nullableId` at all, and a `count`
 * the original never had. Nothing failed. That is the whole problem with this particular
 * duplication — **every one of these helpers fails by returning `null`**, so a wrong copy does not
 * throw, it silently discards a field.
 *
 * `nullableTimestamp` is the worked example, and its own history is the argument for this file: every
 * `created_at` in the channel schema was once declared `nullableText`, the backend answers epoch
 * **milliseconds as a JSON number**, and so the field arrived, was thrown away, and the joined-date
 * row dropped itself. It had **never rendered for any channel**, and nothing surfaced it. A third
 * copy is a third chance at exactly that, which is why `features/post` gets this module instead of
 * its own set.
 *
 * `shared/` may not import `features/` — these depend on nothing but zod, so this is where they
 * belong, and it is the same move `page-cursor.ts` made out of the same feature for the same reason.
 *
 * ## What does not belong here
 *
 * Anything that knows a domain. `privacySchema` fails closed to `'protected'` because exposing a
 * channel we could not parse is a privacy incident — that is a *product* fact about channels and it
 * stays in `features/channel`. This file holds only the shapes of the wire itself.
 */

/** A string that is present and non-blank, else `null`. `''` is not a URL or a name. */
export const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Ids arrive as either a string or a number depending on the service. Normalise to string. */
export const id = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * The same normalisation as `id`, but **absence stays absent**: `null` rather than `''`.
 *
 * `id` is for a field that identifies the object it is on — a channel always has one, so `''` is a
 * body that could not be parsed and the caller has bigger problems. This is for an id *pointing at
 * something else* (`mcn.identifier`, a post's `quoted_post`), where "not sent" is an ordinary answer
 * and the caller has to be able to see it: `''` would become a request against `…/posts//`.
 */
export const nullableId = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A moment in time, normalised to an ISO 8601 string — or `null`.
 *
 * ## The backend sends a number, and `nullableText` was throwing it away
 *
 * `GET /core/v3/channel/channels/{slug}/` answers `created_at: 1660516880264` — **epoch
 * milliseconds, as a JSON number.** Found by querying the real endpoint rather than by reading the
 * code, which is the only way this class of bug shows up: the client's own types agree with
 * themselves.
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
 * defensive rather than observed — the endpoints that use this need not agree with each other.
 */
export const nullableTimestamp = z
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

/**
 * A viewer-relative flag, coerced and defaulting to `false`.
 *
 * Non-optional `boolean` out, which is the point: declaring these optional pushes `?? false` to
 * every call site, and the one that forgets renders "Follow" for a channel the visitor already
 * follows.
 */
export const boolish = z.coerce.boolean().catch(false)

/**
 * A tally — a non-negative integer, defaulting to `0`.
 *
 * Separate from `nullableNumber` because a count's absence is not interesting: a post with no
 * `reaction_count` has zero reactions, and every consumer formats a number. `null` here would buy
 * a `?? 0` at each of them.
 */
export const count = z.coerce.number().int().nonnegative().catch(0)

/**
 * A number that is present and finite, else `null`.
 *
 * Unlike `count`, absence is meaningful — an image with no `w` cannot have its aspect ratio
 * computed, and the renderer needs to see that rather than be handed a `0` it would divide by.
 */
export const nullableNumber = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        const parsed = Number(trimmed)
        return Number.isFinite(parsed) ? parsed : null
    })
    .catch(null)

/**
 * Optional and absent both mean `null` — never `undefined`.
 *
 * `.nullish()` alone leaves a *missing* key as `undefined` while an explicit `null` stays `null`, so
 * every consumer would have to test for both. Collapsing them here means `channel.mcn === null` is
 * the only check anyone writes, and a field that starts arriving as `null` instead of being omitted
 * changes nothing downstream.
 */
export function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .catch(null)
        .transform(value => value ?? null)
}
