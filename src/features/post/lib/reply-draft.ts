import type { Post } from '../api/types'

/**
 * What a reply draft has to satisfy before it can be sent — the rules, with no React around them.
 *
 * Legacy spreads these across three files and disagrees with itself in two of them: the modal
 * composer caps the text at 10,000 characters and the post-detail bar at 500, and each re-derives
 * "can this be submitted" inline (`!text?.trim() && uploadedImages?.length === 0` in one place,
 * `!isCreatingComment && text?.trim()` in another — the second silently refuses an images-only
 * reply the first allows). One function, one answer.
 */

/**
 * The most images one reply may carry.
 *
 * Legacy's own ceiling, and it is the *message* that states it rather than a constant
 * (`'Maximum 10 images allowed per comment'`), so it is transcribed from there. The backend's real
 * limit is unknown — **B109**; being stricter than the server costs a reader nothing they can see,
 * being looser costs them a 400 after the upload has already run.
 */
export const REPLY_IMAGE_MAX = 10

/**
 * What a picture has to be to be attachable.
 *
 * Legacy's `UPLOAD_MEDIA_MESSAGES` names JPEG, PNG and WebP, and the check is on the **file's own
 * type** rather than its extension: the extension is a claim, and the `Content-Type` is what the
 * pre-signed URL is signed with (`shared/lib/api/upload-api.ts`), so a mislabelled file fails at
 * Google with a 403 that reads like a backend fault.
 */
export const REPLY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function isAttachableImage(file: { type: string }): boolean {
    return (REPLY_IMAGE_TYPES as readonly string[]).includes(file.type)
}

/**
 * Whether links may appear in a reply to this post.
 *
 * `reply_allowed_link` is the **creator's** switch and it is a boolean on the wire; `null` means the
 * payload did not carry it. Absence is read as *allowed*, which is the opposite of this repo's
 * fail-closed default for gates — deliberately, and for a reason that does not apply to the gates
 * that rule is about.
 *
 * Those gates guard money and content. This one guards a display preference the **backend enforces
 * anyway**: refusing wrongly does not protect anybody, it silently stops an ordinary reader from
 * replying at all, on every post, with an error naming a rule the creator never set. Legacy reads
 * the raw field on the detail page and therefore does exactly that whenever the field is missing.
 *
 * The check is a client-side courtesy either way — it turns a refusal the reader would otherwise
 * receive as a failed write into one they see before they press.
 */
export function allowsReplyLinks(post: Pick<Post, 'reply_allowed_link'>): boolean {
    return post.reply_allowed_link !== false
}

/**
 * Does this text contain something a reader would call a link?
 *
 * A regex, not `linkifyjs`. Legacy pulls in the parser because it *rewrites* what it finds into
 * anchors; this client only has to answer yes or no, and a dependency for that would ship a
 * tokeniser to every visitor who opens a post.
 *
 * Deliberately broad on the second alternative — a bare `tevi.com` with no scheme is a link to a
 * reader and to a moderator, and matching only `https://` would let the whole rule be walked around
 * by deleting five characters. It is broad enough to catch a sentence like `hi.there` written
 * without a space, which is the accepted cost: the outcome is a reader being asked to reword, not a
 * reply being lost, and the alternative error is a rule that does not work.
 */
const LINK_PATTERN =
    /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}\b/i

export function hasLink(text: string): boolean {
    return LINK_PATTERN.test(text)
}

/** One picture the reader has attached but not yet uploaded. */
export interface ReplyDraftImage {
    /** Stable across renders, so removing the second of three does not re-key the other two. */
    id: string
    file: File
    /** `URL.createObjectURL` — the caller owns revoking it. */
    previewUrl: string
    /** Natural dimensions, measured once on attach. `null` when the browser would not decode it. */
    width: number | null
    height: number | null
}

export interface ReplyDraft {
    text: string
    images: ReplyDraftImage[]
}

/**
 * Why this draft cannot be sent, or `null` when it can.
 *
 * A **reason**, not a boolean, because two of the three have to be said out loud — and the third
 * must not be. `'empty'` is the resting state of every composer on the page; printing an error for
 * it would mean every post opens with a complaint. The caller disables its button on any reason and
 * prints a message for `'link'` and `'too-many-images'` only.
 *
 * Text and images are **alternatives**, not a pair: a reply that is only pictures is a reply, which
 * is the case legacy's detail bar refuses and its modal allows.
 */
export type ReplyDraftProblem = 'empty' | 'link' | 'too-many-images'

export function replyDraftProblem(
    draft: ReplyDraft,
    { linksAllowed }: { linksAllowed: boolean },
): ReplyDraftProblem | null {
    const text = draft.text.trim()
    if (!text && draft.images.length === 0) return 'empty'
    if (draft.images.length > REPLY_IMAGE_MAX) return 'too-many-images'
    if (!linksAllowed && text && hasLink(text)) return 'link'
    return null
}

/**
 * The text as it goes on the wire, or `null` when there is none.
 *
 * Trimmed, and `null` rather than `''` so `createReply` can leave the key out entirely — legacy
 * omits `text` for an images-only comment rather than sending an empty string, and an empty string
 * is a value the backend would have to have an opinion about.
 */
export function replyText(draft: ReplyDraft): string | null {
    const text = draft.text.trim()
    return text === '' ? null : text
}
