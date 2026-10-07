import { BASE_URL } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import type { Channel } from '../api/types'
import { toChannelPath } from './channel-slug'

/**
 * What a crawler is told about a channel — and, more importantly, what it is **not** told
 * when the upstream is merely unwell.
 */

/** Legacy's exact format. Changing it churns every indexed title, so it is pinned by a test. */
export function buildChannelTitle(channel: Channel): string {
    const name = channel.name ?? channel.slug
    return `${name} (@${channel.slug}) | Content Creator - Tevi`
}

const DESCRIPTION_LIMIT = 100

/**
 * Truncate by **code point**, not by `length`.
 *
 * `String.prototype.slice` counts UTF-16 units, so cutting at 100 can land between the two
 * halves of a surrogate pair and emit a lone half — which renders as `�` in a search result.
 * Emoji in a creator bio make this the common case, not the exotic one. Legacy carries the
 * same fix; this is a port of it, not an invention.
 */
export function truncateByCodePoint(value: string, limit = DESCRIPTION_LIMIT): string {
    const points = [...value]
    if (points.length <= limit) return value
    return `${points.slice(0, limit).join('')}…`
}

export function buildChannelDescription(channel: Channel): string {
    const description = channel.description?.replace(/\s+/g, ' ').trim()
    if (description) return truncateByCodePoint(description)
    const name = channel.name ?? channel.slug
    return `${name} on Tevi`
}

/**
 * Whether this channel may be indexed at all.
 *
 * Every clause is a reason a page should not be in a search index, and each is legacy's:
 *
 * - **NSFW** and **suspended** are obvious.
 * - **Non-public privacy** — an unpublished or protected space has no public content, so an
 *   indexed URL is a dead end for the searcher and a leak of the name for the creator.
 * - **A numeric slug** is an auto-generated placeholder the creator never chose.
 * - **No name or no description** is a thin page. Indexing thousands of them is what gets a
 *   whole namespace demoted, which is why an empty profile is excluded rather than included
 *   "just in case".
 */
export function isIndexableChannel(channel: Channel): boolean {
    if (channel.is_nsfw || channel.is_suspended) return false
    if (channel.privacy !== 'public') return false
    if (!channel.slug || /^\d+$/.test(channel.slug)) return false
    if (!channel.name || !channel.description) return false
    return true
}

/**
 * The result of asking the upstream for a channel.
 *
 * A discriminated union rather than "the channel or an error", because `generateMetadata` and
 * the page body need *different* behaviour from the same failure, and the difference is the
 * most consequential decision in this feature.
 */
export type ChannelFetchStatus = 'ok' | 'gone' | 'restricted' | 'unavailable'

/**
 * **Only a definitive 404 may become `notFound()`.**
 *
 * A 5xx, a network failure or the server client's 10s timeout must render 200 + `noindex` and
 * let the client fill the page in. Treating an outage as a 404 tells every crawler that live
 * profiles have been deleted — and nothing in the code makes that visible, which is exactly
 * why this is a named function with a test rather than an `if` at the call site. Legacy draws
 * the same line, and its comment says so: *"a service outage must not deindex a URL that
 * still exists"*.
 *
 * `restricted` (any other 4xx) is separate from `unavailable` because it is not an outage —
 * the request was understood and refused — but it is still not proof of absence, so it is
 * also `noindex` rather than 404.
 */
export function resolveChannelFetchStatus(error: unknown): ChannelFetchStatus {
    if (!error) return 'ok'
    if (!(error instanceof ApiError)) return 'unavailable'
    if (error.isNetwork) return 'unavailable'
    const status = error.status
    if (status === 404) return 'gone'
    if (typeof status === 'number' && status >= 400 && status < 500) return 'restricted'
    return 'unavailable'
}

/**
 * Schema.org `ProfilePage` for the channel.
 *
 * Returned as an object. **Do not render it with bare `JSON.stringify`** — see
 * `serializeJsonLd`, which is the only safe way to get it into the document.
 */
export function channelProfileJsonLd(channel: Channel) {
    const sameAs = channel.social_links.map(link => link.url).filter((url): url is string => !!url)
    return {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        mainEntity: {
            '@type': 'Person',
            name: channel.name ?? channel.slug,
            alternateName: `@${channel.slug}`,
            ...(channel.description ? { description: channel.description } : {}),
            ...(channel.images.thumb ? { image: channel.images.thumb } : {}),
            ...(sameAs.length > 0 ? { sameAs } : {}),
        },
        // Absolute: JSON-LD is read outside the document, so there is no base for a path to
        // resolve against — `metadataBase` only applies to Next's own tags. `eventJsonLd` agrees.
        url: `${BASE_URL}${toChannelPath(channel.slug)}`,
        ...(channel.created_at ? { dateCreated: channel.created_at } : {}),
    }
}

/**
 * The JSON-LD body, safe to put inside `<script type="application/ld+json">`.
 *
 * **`JSON.stringify` alone is not enough, and it is easy to believe otherwise.** It escapes
 * quotes and backslashes — everything needed to keep the *JSON* valid — but the angle
 * brackets are ordinary characters to it. So a creator whose bio contains a closing script tag
 * followed by an opening one produces a document where the HTML parser closes our tag early and
 * runs theirs. The bio is the attacker-controlled string here, and it reaches this function
 * verbatim from the API.
 *
 * The two brackets are rewritten to their `\uXXXX` escapes, which are valid JSON and parse back
 * to the same characters — so the structured data is unchanged and the HTML parser never sees
 * a tag. `&` goes the same way, for the layer out. U+2028 and U+2029 are escaped too: legal in a
 * JSON string but *illegal* raw in a JavaScript string literal, so they break the parse rather
 * than the security — a different bug with the same one-line fix.
 *
 * A test asserts a hostile bio round-trips inertly. Do not "simplify" this back to
 * `JSON.stringify`.
 */
export function serializeJsonLd(value: unknown): string {
    return JSON.stringify(value).replace(
        /[<>&\u2028\u2029]/g,
        char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    )
}
