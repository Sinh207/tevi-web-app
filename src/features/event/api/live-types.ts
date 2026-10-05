import { z } from 'zod'

/**
 * **What a live room is made of** — the three payloads the studio's player needs.
 *
 * ```
 * {W_API}/live/v1/streaming-events/{code}/preview/   → a LivePlayback, is_preview: true
 * {W_API}/core/v4/live/event/{code}/playback/        → a LivePlayback, the real stream
 * {W_API}/core/v4/live/event/{code}/layout/          → { layout, publishers }
 * ```
 *
 * Two bases, and they are not a mistake: legacy's `streaming.js` goes through `ApiLiveModel`
 * (`{W_API}/live`) and its `live.js` through the default `ApiModel` (`{W_API}/core`). Same host,
 * different service prefix, so both are ordinary authenticated W_API calls — no new origin, no new
 * env var, and `origins.ts` already lets both carry credentials.
 *
 * ## These schemas were derived from *reads*, not from a spec
 *
 * There is no swagger for `live/`, so the field set below is every property legacy dereferences
 * across the whole `liveView` tree — `playback?.live_channel`, `publisher?.audio`, and the rest —
 * collected by grep rather than read off a contract. Two consequences, and both are why everything
 * here is `looseObject` with per-field fallbacks:
 *
 * - **a field this client has never seen is carried, not dropped**, so a future addition does not
 *   need a schema change to be inspectable;
 * - **nothing here may be trusted to exist.** A missing `live_channel` is a room that cannot be
 *   joined, and the player has to say so rather than joining `''`.
 *
 * The open questions this raised are **B108** in `docs/BACKEND_QUESTIONS.md`.
 */

/** A string that is present and non-blank, else `null`. Same rule as `api/types.ts`; see its note
 *  on why the parsers are deliberately duplicated per service rather than shared. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Ids arrive as a string or a number depending on the service. */
const nullableId = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

const boolish = z.coerce.boolean().catch(false)

/**
 * One person on camera in the room.
 *
 * `id` is what the seat's mount node is keyed on (`player-{id}`) **and** what Agora reports as the
 * publishing `uid`, so the two have to be the same string — a numeric uid arriving as a JSON number
 * on one side and a string on the other is exactly how a video track gets played into a node that
 * does not exist. `nullableId` normalises both to a string.
 *
 * `audio` and `video` are **states, not capabilities**: `video: false` is a co-host who has turned
 * their camera off, and the seat draws their avatar with a mic ring instead of a black rectangle.
 * Defaulting either to `true` would leave an empty box where a person should be.
 */
const livePublisherBase = z.looseObject({
    id: nullableId,
    name: nullableText,
    avatar: nullableText,
    audio: boolish,
    video: boolish,
    is_host: boolish,
    /** Premium, as the chat's people carry it (`{ image }`) — legacy reads `publisher.premium_badge`. */
    premium_badge: z
        .unknown()
        .transform(v => {
            if (typeof v === 'string') return v.trim() ? { image: v.trim() } : null
            const p = z.looseObject({ image: nullableText }).safeParse(v)
            return p.success && p.data.image ? p.data : null
        })
        .catch(null),
    verified_tick_badge: z
        .unknown()
        .transform(v => {
            const parsed = z.looseObject({ image: nullableText }).safeParse(v)
            return parsed.success ? parsed.data : null
        })
        .catch(null),
})
/**
 * The publisher's channel slug, **if the room payload carries one** — legacy reads none, so the
 * spelling is unconfirmed (**B111**). The three a Tevi payload uses elsewhere are tried in turn,
 * off the raw object `looseObject` keeps; absent, only the host (whose channel is the event's) can
 * be linked to.
 */
function slugOf(raw: Record<string, unknown>): string | null {
    for (const key of ['channel_slug', 'slug', 'username']) {
        const v = raw[key]
        if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
}

export const livePublisherSchema = livePublisherBase.transform(p => ({
    ...p,
    channel_slug: slugOf(p as Record<string, unknown>),
}))
/**
 * The two additions are **optional on the type**: both are "if the payload carries it", and a
 * publisher assembled elsewhere (a fixture, a socket frame) is complete without them.
 */
export type LivePublisher = Omit<
    z.infer<typeof livePublisherSchema>,
    'channel_slug' | 'premium_badge'
> & {
    channel_slug?: string | null
    premium_badge?: { image: string | null } | null
}

/**
 * One pullable rendition of the stream — the CDN path, as opposed to the Agora path.
 *
 * `protocol` is the whole of the choice: legacy prefers **flv** and falls back to **hls**, in that
 * order and for a real reason — FLV over HTTP-FLV is seconds of latency where HLS is tens, and on a
 * live broadcast that difference is whether the chat is answering the thing on screen. Anything
 * else in the list is kept as a fallback URL but never chosen first.
 */
export const livePlaylistEntrySchema = z.looseObject({
    protocol: nullableText,
    url: nullableText,
})
export type LivePlaylistEntry = z.infer<typeof livePlaylistEntrySchema>

/**
 * How to play this room — **and it is two different things in one payload.**
 *
 * | | when | fields |
 * |---|---|---|
 * | CDN pull | a solo broadcast | `alternative_playlist` |
 * | Agora RTC | co-hosts on camera together | `live_channel` · `viewer_token` · `viewer_id` |
 *
 * Legacy picks between them in `LayoutProvider`: `publishers.length <= 1 && alternative_playlist`
 * non-empty ⇒ the CDN player, otherwise join the Agora channel as an `audience`. So the payload
 * does not say which transport to use — the *publisher count* does, and both sets of fields can be
 * present at once.
 *
 * ⚠ **`is_preview` is the backend's own word for "this is the free sample"**, and it is what the
 * seat area reads to blur itself by 4px. It is not inferred from which endpoint was called, which
 * matters: a preview payload that forgets the flag would otherwise be rendered as the real stream.
 */
export const livePlaybackSchema = z.looseObject({
    is_preview: boolish,
    live_channel: nullableText,
    viewer_token: nullableText,
    viewer_id: nullableId,
    alternative_playlist: z
        .unknown()
        .transform(v =>
            Array.isArray(v)
                ? v
                      .map(row => livePlaylistEntrySchema.safeParse(row))
                      .flatMap(r => (r.success && r.data.url ? [r.data] : []))
                : [],
        )
        .catch([]),
    /**
     * The preview's window, in seconds — the backend's, not legacy's hard-coded ten. Present on a
     * preview answer only; `null` on the real stream or an older payload.
     */
    preview_duration: z
        .unknown()
        .transform(v => {
            const n = typeof v === 'string' ? Number(v) : v
            return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
        })
        .catch(null),
    /**
     * When the preview window closes, as an ISO timestamp. **The same value on every call within
     * one window**, which is what makes a reload resume the look instead of restarting it — see
     * `previewDeadline`.
     */
    preview_expires_at: nullableText,
})
export type LivePlayback = z.infer<typeof livePlaybackSchema>

/**
 * Which of the eighteen seat arrangements the room is in.
 *
 * `P1`–`P9` portrait, `L1`–`L9` landscape. **Not** a zod enum: a layout code this client has never
 * seen must fall back to `P1` and keep playing, not fail the parse and blank the room. The renderer
 * owns that fallback (legacy's `componentMap[layoutType] || P1`), so the wire value is carried
 * through as written.
 *
 * ⚠ **`spotlightUid` is camelCase in a snake_case API**, and this is almost certainly a legacy bug
 * rather than a quirk of the service. Every other field on every other Tevi payload is
 * snake_case; if the wire really sends `spotlight_uid`, then legacy's `layout?.spotlightUid` has
 * been `undefined` since it was written, the spotlight branch never resolves the person it names,
 * and `publishers[0]` is silently spotlighted instead — which looks completely normal whenever the
 * host *is* the spotlight, i.e. most of the time.
 *
 * Both spellings are accepted here, snake first. That fails in the safe direction: if the API sends
 * camelCase after all, nothing is lost, and if it sends snake_case the feature starts working. The
 * question is **B108**.
 */
export const liveLayoutSchema = z.looseObject({
    layout: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : null))
        .catch(null),
    spotlight: boolish,
    spotlight_uid: nullableId,
    spotlightUid: nullableId,
})
export type LiveLayout = z.infer<typeof liveLayoutSchema>

/** `v4/live/event/{code}/layout/` answers with both halves at once. */
export const liveRoomSchema = z.looseObject({
    layout: z
        .unknown()
        .transform(v => {
            const parsed = liveLayoutSchema.safeParse(v)
            return parsed.success ? parsed.data : null
        })
        .catch(null),
    publishers: z
        .unknown()
        .transform(v =>
            Array.isArray(v)
                ? v
                      .map(row => livePublisherSchema.safeParse(row))
                      /*
                       * A publisher with no `id` is dropped, and it is the one strict rule in this
                       * file. The id is the mount node's key: keep the row and the seat renders a
                       * `player-null` box that the SDK will never attach anything to — a permanent
                       * black rectangle in the middle of the grid, with nothing logged.
                       */
                      .flatMap(r => (r.success && r.data.id ? [r.data] : []))
                : [],
        )
        .catch([]),
})
export type LiveRoom = z.infer<typeof liveRoomSchema>

/**
 * The publisher the spotlight names, or the first one.
 *
 * Both single-seat layouts (`P1`, `L1`) resolve it identically in legacy, and the fallback chain is
 * the part worth keeping: a spotlight pointing at somebody who has **left the room** falls back to
 * `publishers[0]` rather than rendering an empty seat. The payload's two halves can disagree — the
 * layout is a moment older than the publisher list — and when they do, showing the host beats
 * showing nobody.
 */
export function spotlitPublisher(
    layout: LiveLayout | null,
    publishers: LivePublisher[],
): LivePublisher | null {
    if (publishers.length === 0) return null
    const uid = layout?.spotlight_uid ?? layout?.spotlightUid ?? null
    if (layout?.spotlight && uid) {
        return publishers.find(p => p.id === uid) ?? publishers[0]
    }
    return publishers[0]
}

/**
 * Which rendition to play, and in what order to fall back.
 *
 * Returns the whole list with the chosen one first, because the player takes both: a primary `url`
 * and a `fallbackUrls` array it walks when a rendition stalls. Legacy passes the *unsorted* list as
 * the fallbacks, so its first retry is whatever the array happened to begin with — frequently the
 * HLS rendition it had just decided against.
 *
 * `null` when the list has nothing playable, which is a real state: a room whose transport is Agora
 * carries no playlist at all.
 */
export function preferredRendition(playback: LivePlayback | null): {
    url: string
    fallbacks: string[]
} | null {
    const entries = playback?.alternative_playlist ?? []
    if (entries.length === 0) return null

    const rank = (protocol: string | null) => (protocol === 'flv' ? 0 : protocol === 'hls' ? 1 : 2)
    const ordered = [...entries].sort((a, b) => rank(a.protocol) - rank(b.protocol))
    const urls = ordered.flatMap(e => (e.url ? [e.url] : []))
    if (urls.length === 0) return null

    return { url: urls[0], fallbacks: urls }
}

/**
 * Is this room played by pulling a CDN rendition, or by joining an RTC channel?
 *
 * Legacy's condition exactly — `publishers.length <= 1 && alternative_playlist.length > 0` — and
 * the ordering is what makes it correct rather than merely equivalent: a **solo** broadcast with a
 * playlist is a CDN pull, and everything else is Agora. A room with co-hosts is Agora even when a
 * playlist is present, because the playlist is a composited mix and the seats need the tracks apart.
 */
export function liveTransport(
    playback: LivePlayback | null,
    publishers: LivePublisher[],
): 'cdn' | 'rtc' | 'none' {
    if (!playback) return 'none'
    if (publishers.length <= 1 && preferredRendition(playback) !== null) return 'cdn'
    if (playback.live_channel) return 'rtc'
    return 'none'
}
