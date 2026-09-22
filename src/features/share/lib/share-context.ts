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
 * A post as a share context — legacy's `buildPostShareContext`.
 *
 * ## Structural, not `Post`
 *
 * It takes `{ id, channel: { slug } }` rather than importing `features/post`'s type, exactly as
 * `spaceShareContext` takes a shape rather than `Channel`. Two reasons, and the second is the one
 * that matters: this feature is below both of those in the dependency order, and a share sheet that
 * needed the whole post DTO to mint a link would be claiming a dependency it does not have — the
 * only fields a share *has* are the two below.
 *
 * ## `creatorId` is the **handle**
 *
 * Not the channel's id and not the account's. The field is attribution, the wire wants the handle,
 * and it is optional — a post whose channel did not parse still gets a link, it just carries no
 * creator. `spaceShareContext` carries the same note.
 *
 * `null` when the post has no id, which routes the sheet to the plain `v1/shorten/` path rather
 * than a `422`. Legacy passes `content_id: undefined` and finds that out from the server.
 */
export function postShareContext(
    post: { id?: string | number | null; channel?: { slug?: string | null } | null },
    sourceScreen = 'post',
): ShareContext | null {
    if (post.id === null || post.id === undefined || post.id === '') return null
    return {
        contentType: 'post',
        contentId: String(post.id),
        creatorId: post.channel?.slug ?? null,
        sourceScreen,
    }
}
