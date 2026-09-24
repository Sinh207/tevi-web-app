/**
 * **What** is being shared, as the link service needs to hear it.
 *
 * `POST v1/links` does not mint a redirect and stop there: it records who is sharing what, from
 * where, over which channel, and the backend emits `share_link_created_v2` off the back of it. So a
 * share is only a *content* share when the caller can name the content — and when it cannot, the
 * request is not merely thinner, it is **refused** (`422`), because `content_type` and `content_id`
 * are required and `content_type` is a three-value enum rather than a media type.
 *
 * That is the whole reason this type exists as a nullable thing rather than a bag of optional
 * fields: `null` is a legible state ("share this URL, we cannot say what it is") that routes to the
 * older `v1/shorten/` endpoint, and a half-filled context is not a state at all. Legacy encodes the
 * same split as `isContentShare = Boolean(content_type && content_id)` and builds the object with
 * whatever `post?.id` happened to be, so a post whose payload had not landed silently degraded to a
 * plain shorten — the link still worked and the attribution was gone.
 *
 * Contract questions still open on the payload: **B97** in `docs/BACKEND_QUESTIONS.md`.
 */

/**
 * The enum, verbatim. Not a media type — a Live is `live` whether it is drawing video or has ended,
 * and a space is `space` rather than `channel` or `profile`.
 */
export type ShareContentType = 'post' | 'live' | 'space'

export type ShareContext = {
    contentType: ShareContentType
    /** The content's own id, stringified — `POST v1/links` takes it as a string. */
    contentId: string
    /**
     * The creator's **handle**, not their account id. Optional on the wire and optional here: it is
     * attribution, and a missing handle must not stop a link being minted.
     */
    creatorId?: string | null
    /**
     * Where the press happened, for the analytics event. Free text on the wire; legacy sends
     * `'post'` and `'space'`, so anything new here should be as short and as literal.
     */
    sourceScreen?: string
}

/**
 * A space (a creator's profile) as a share context — legacy's `buildSpaceShareContext`.
 *
 * Returns `null` when the channel carries no id, which is the case this replaces: legacy builds
 * `{ content_type: 'space', content_id: undefined }`, whose truthiness test then sends the share
 * down the `v1/shorten/` path anyway. Same outcome, one less way to be surprised by it — a caller
 * that gets `null` can see it decided nothing.
 */
export function spaceShareContext(
    channel: { id?: string | number | null; slug?: string | null },
    sourceScreen = 'space',
): ShareContext | null {
    if (channel.id === null || channel.id === undefined || channel.id === '') return null
    return {
        contentType: 'space',
        contentId: String(channel.id),
        creatorId: channel.slug ?? null,
        sourceScreen,
    }
}

/**
 * A **live event** as a share context.
 *
 * ## No legacy twin, and that is the interesting part
 *
 * `live` has been in the `content_type` enum since the contract landed (TEV-1511) and legacy has
 * never built a context for it: its event page shares by copying `shareable_url` to the clipboard,
 * so every live shared from the website has been attributed as a bare `v1/shorten/` link. This is
 * the first caller, which means there is no shipped behaviour to copy and one open question.
 *
 * ## `content_id` — **B106**
 *
 * A space sends its `id`, a post sends its `id`, and an event has two candidate identities: the
 * opaque `id` and the `code` that every URL, deep link and API path is built from. `id` is sent when
 * the payload carries one, on the grounds that the other two content types send an id and
 * consistency is the better guess; `code` is the fallback, because a context that names the content
 * imperfectly still attributes the share, while `null` sends it down the unattributed path — and the
 * event page is one of the two surfaces where a share is most likely to be the *first* time anybody
 * hears about the creator.
 *
 * `null` only when the event has neither, which `normalizeEvent` already refuses to produce.
 */
export function liveShareContext(
    event: { id?: string | number | null; code?: string | null },
    creatorSlug?: string | null,
    sourceScreen = 'live',
): ShareContext | null {
    const contentId =
        event.id === null || event.id === undefined || event.id === ''
            ? (event.code ?? null)
            : String(event.id)
    if (!contentId) return null
    return {
        contentType: 'live',
        contentId,
        creatorId: creatorSlug ?? null,
        sourceScreen,
    }
}
