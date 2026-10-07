import { BASE_URL } from '@shared/config/env'
import type { EventDetail } from '../api/types'
import { eventPath } from '../routes'

/**
 * What a crawler and a link-preview scraper are told about a live event.
 *
 * ## The page is `noindex, follow`, and that is deliberate on both halves
 *
 * **`noindex`** because a live event is the most perishable page this app has. Indexed, it puts
 * "watch now" in results for a broadcast that finished hours ago, and it competes with the space
 * page — which *is* meant to rank — for the same creator's name. Legacy sets exactly this pair on
 * this exact route, and the channel page is where `index` is earned instead.
 *
 * **`follow`** so a crawler still walks the links back to the space that hosts the stream. The
 * reflex is `nofollow` beside `noindex`, and it throws away the one thing this page is good for in a
 * crawl.
 *
 * ⚠ **Which is why this page must not be disallowed in `robots.ts`.** A disallowed URL is one a
 * crawler never *fetches*, so it never reads the `noindex` either — and a URL shared on the open web
 * can still surface as a bare address. Crawlable + `noindex` is what actually keeps it out.
 * `/mcn-partnership` and `/identification` carry the same note.
 *
 * ## The metadata is still built in full, for the reader that is not Google
 *
 * A **scraper** — Slack, iMessage, Facebook, WhatsApp — reads `og:*` and executes no JavaScript, and
 * it does not care about `robots`. Without this a shared stream unfurls as the site's default card,
 * which is the one thing a share link exists to avoid. That is the whole reason the page is
 * server-rendered at all (`api/event-server-api.ts`).
 */

/** Google truncates a title around 60 characters; the author suffix has to survive that. */
const TITLE_SNIPPET = 70
/** And a description around 155–160. */
const DESCRIPTION_LIMIT = 160

/**
 * Truncate by **code point**, not by `length`.
 *
 * `String.prototype.slice` cuts UTF-16 code units, so a limit landing between the two halves of an
 * emoji or a CJK extension character leaves a lone surrogate — which renders as a replacement glyph
 * in the very place these strings go (a share card, a search result). Creator-typed titles are full
 * of emoji. Legacy's own helper does this with `Array.from` for the same reason.
 *
 * The word boundary is honoured **only when it is not throwing most of the text away** (legacy's
 * 60% rule): without that guard, a title whose first space is at character 58 of a 70-character
 * budget gets cut to eight characters.
 */
export function truncateForSeo(value: string, limit: number): string {
    const normalized = collapseWhitespace(value)
    const chars = Array.from(normalized)
    if (chars.length <= limit) return normalized
    const clipped = chars.slice(0, limit).join('')
    const lastSpace = clipped.lastIndexOf(' ')
    const base = lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped
    return `${base.replace(/[\s,.;:!?-]+$/, '')}…`
}

/** Creator-authored text arrives with stray double spaces and trailing blanks. */
export function collapseWhitespace(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * `Feb 20, 2026, 14:30 UTC` — the date **inside a description string**, and the one place a
 * timestamp on this page is pinned to UTC.
 *
 * The opposite call from `EventSchedule`, which formats in the reader's own zone because it is an
 * appointment. A `<meta name="description">` has no reader whose zone is knowable: it is rendered
 * once on the server, cached, and read by a scraper that may be in any zone or none. So the zone is
 * pinned and **named**, which is what makes the string honest rather than merely stable — legacy
 * prints its own `convertTZ(start_at)` with no zone at all, so the same share card means a different
 * hour depending on which server rendered it.
 *
 * `en-US` and not the request's locale, deliberately: this is the fallback for every locale the
 * description is not translated into, and a mixed-language sentence reads worse than an English one.
 * `''` when there is no usable date, so the caller can leave the clause out.
 */
export function formatEventDateForSeo(value: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
    }).format(date)} UTC`
}

/**
 * `{title} - {name} (@{slug}) on Tevi` — legacy's shape.
 *
 * The **event's** words first, so every stream gets its own title rather than every stream on a
 * space sharing one: duplicate titles get folded together, and the fold would pick whichever the
 * crawler saw first.
 */
export function buildEventTitle(event: EventDetail, fallbackTitle: string): string {
    const slug = event.channel?.slug ?? ''
    const name = event.channel?.name
    const own = truncateForSeo(event.title ?? '', TITLE_SNIPPET) || fallbackTitle
    const author = name ? `${name} (@${slug})` : `@${slug}`
    return `${own} - ${author} on Tevi`
}

/**
 * The description: when it is, what it is about, and whose it is.
 *
 * Assembled from the parts that exist rather than from a template with holes in it — a stream with
 * no description would otherwise open with a stray separator, which is what legacy's
 * `` `${date} - ${description} Join …` `` produces for the majority of events.
 */
export function buildEventDescription(event: EventDetail, joinSentence: string): string {
    const when = formatEventDateForSeo(event.start_at)
    const own = collapseWhitespace(event.description)
    const parts = [when, own, joinSentence].filter(Boolean)
    return truncateForSeo(parts.join(' · '), DESCRIPTION_LIMIT)
}

/**
 * Whether a crawler may be told **what this broadcast is** — its title, description and banner.
 *
 * Metadata is what a chat app draws as a link preview, with no gate in front of it and no way for us
 * to put one there, so for these two cases withholding the words is the only control the surface
 * has (the rule `post-seo.ts`'s `mayRenderForCrawler` states for posts):
 *
 * - **The space is NSFW.** Legacy's exact rule: generic title, `noindex, nofollow`.
 * - **The stream is 18+.** A deliberate divergence — legacy describes these in full. But this page
 *   shows the banner and the description only *after* the reader confirms their age, so a share
 *   card printing both would hand any chat app what the page itself withholds.
 */
export function mayDescribeEventForCrawler(event: EventDetail): boolean {
    return !event.channel?.is_nsfw && !event.age_restriction
}

/** The canonical path — the one spelling of this URL, whatever casing the request used. */
export function eventCanonicalPath(event: EventDetail): string | null {
    const slug = event.channel?.slug
    if (!slug || !event.code) return null
    return eventPath(slug, event.code)
}

/**
 * Schema.org `Event`.
 *
 * ## `eventStatus` and `eventAttendanceMode` are the two fields that carry real information
 *
 * `EventCancelled` for a cancelled stream — legacy maps only this one and defaults everything else
 * to `EventScheduled`, which is wrong for a broadcast that has already happened: `EventScheduled`
 * on a finished stream is a claim about the future. `ENDED` and `PAUSED` therefore map to
 * `EventScheduled` only in the absence of anything better in the vocabulary, and the honest signal
 * is `endDate`, which is present for both.
 *
 * `OnlineEventAttendanceMode` is stated because it is the whole nature of the thing and the default
 * a consumer assumes is offline — without it, a search result can ask a reader for a location.
 *
 * ## `offers` is the price, and it is only stated when it is known
 *
 * A **free** stream gets `price: '0'`, which is a fact. A stream that is members-only or whose
 * payload omits `price` gets **no `offers` block at all** rather than a zero — the mistake
 * `liveAccess` documents from the UI side, where an absent price rendered as "Unlock for 0 ⭐". A
 * price of nothing on a paid broadcast is the same lie in a machine-readable form, and this one is
 * eligible for a rich result.
 *
 * `priceCurrency` is `price_currency` (`TVS`) verbatim. It is **not** an ISO 4217 code, and that is
 * a known limitation rather than an oversight: Star is not a currency, and inventing `USD` for it
 * would misstate the price by whatever today's rate is. **B114** in `docs/BACKEND_QUESTIONS.md`
 * carries whether a fiat equivalent should be published here instead.
 *
 * Returned as an object. **Do not render it with bare `JSON.stringify`** — use
 * `serializeJsonLd` from `@features/channel`, which is the escaping that makes it safe.
 */
export function eventJsonLd(event: EventDetail, fallbackTitle: string) {
    const path = eventCanonicalPath(event)
    const url = path ? `${BASE_URL}${path}` : undefined
    const slug = event.channel?.slug
    const rawPrice = event.price === null ? null : Number(event.price)
    const price = rawPrice !== null && Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null
    const membersOnly = event.required_packages.length > 0

    return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: collapseWhitespace(event.title) || fallbackTitle,
        ...(event.description ? { description: collapseWhitespace(event.description) } : {}),
        eventStatus:
            event.status === 'CANCELLED'
                ? 'https://schema.org/EventCancelled'
                : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        // `started_at` where the stream actually went on air, because a broadcast that began twenty
        // minutes late otherwise advertises a time that has passed. `start_at` is the schedule.
        ...(event.started_at || event.start_at
            ? { startDate: event.started_at ?? event.start_at }
            : {}),
        ...(event.ended_at ? { endDate: event.ended_at } : {}),
        ...(event.images.banner ? { image: event.images.banner } : {}),
        ...(url ? { url } : {}),
        /*
         * `VirtualLocation` rather than omitting the field: `Event` requires a location, and a
         * consumer that finds none falls back to asking where it is. The URL is the venue.
         */
        ...(url ? { location: { '@type': 'VirtualLocation', url } } : {}),
        ...(slug
            ? {
                  organizer: {
                      '@type': 'Organization',
                      name: event.channel?.name ?? `@${slug}`,
                      url: `${BASE_URL}/@${encodeURIComponent(slug)}`,
                  },
              }
            : {}),
        ...(price !== null && !membersOnly
            ? {
                  offers: {
                      '@type': 'Offer',
                      price: String(price),
                      priceCurrency: event.price_currency ?? 'TVS',
                      availability:
                          event.status === 'CANCELLED'
                              ? 'https://schema.org/SoldOut'
                              : 'https://schema.org/InStock',
                      ...(url ? { url } : {}),
                  },
              }
            : {}),
    }
}
