import { normalizePost, type Post } from '../api/types'
import { isPaywalled, type PostDraft } from './post-draft'
import type { ReplyComposerAuthor } from './reply-author'

/**
 * Turn a draft into the **post its audience would receive** — legacy's `useReviewPost`.
 *
 * ## It answers a question nothing else in the composer can
 *
 * Everything else the composer draws is the *author's* view: the words as typed, the pictures as
 * picked, a price in a field. What a reader gets is a different object — a paid post's media is not
 * in the payload at all, its caption may be withheld, and a cover the author never looked at is
 * what stands in for the lot. The only way to check that before publishing is to build the reader's
 * object and render it, which is what this does.
 *
 * ## It goes through `normalizePost`, on purpose
 *
 * The raw object below is handed to the **same parser every real post goes through** rather than
 * cast to `Post`. That buys two things. A preview can never be a shape `PostCard` would not accept
 * — if a field's spelling drifts, the preview fails here instead of rendering something the feed
 * never would. And every per-field `.catch()` in `api/types.ts` applies, so a half-measured image
 * degrades exactly as a half-sent one does.
 *
 * ## What it deliberately does not reproduce
 *
 * - **`html_text`.** Legacy's preview runs the caption through `linkifyjs` and the short-link
 *   endpoint to show live anchors. `PostCard` refuses to render `html_text` at all (its header says
 *   why: creator-authored markup, no sanitiser in this repo), so building it here would be work
 *   whose only consumer is a `dangerouslySetInnerHTML` this app does not have. The words are the
 *   same either way.
 * - **The default cover.** Legacy falls back to `static.tevi.dev/…/default-covers.webp` when a paid
 *   post has no picture to stand in for it. That asset is legacy's **client-side** stand-in, not
 *   the backend's: nothing else in that app references it, and no real post payload carries it. A
 *   preview built on it would promise the author a cover their published post may not have. Left
 *   `null`, and `PostLockPanel` draws its pill on the plain surface — which is the one thing here
 *   that is certainly true.
 * - **`paid_interaction`.** Not sent on create either; `buildPostBody` carries that reasoning
 *   (**B110**).
 */

/** `null` when the draft has nothing in it to show — the button that calls this is off by then. */
export function buildPreviewPost(
    draft: PostDraft,
    {
        author,
        now = Date.now(),
    }: {
        /** The reader's own space, as the composer already received it. */
        author: ReplyComposerAuthor | null
        /** Injected so the timestamp is assertable. */
        now?: number
    },
): Post | null {
    const paywalled = isPaywalled(draft)
    const text = draft.text.trim()

    const images = draft.images.map(image => ({
        uri: image.previewUrl,
        w: image.width,
        h: image.height,
    }))

    /*
     * The cover, and the one field whose *type* forces a decision.
     *
     * Legacy writes `blur: needUnlockPackage` — a boolean. On the wire `blur` is **text** (the URL
     * of a pre-blurred variant), so that boolean parses to `null` here and the cover would render
     * sharp: the author would be shown their paid picture in full on the very screen meant to prove
     * it is hidden. The cover's own URL goes in instead, which is both true (that *is* the image
     * the blurred variant is of) and enough — `PostLockPanel` reads the field as a boolean and
     * applies its own `blur(10px)`.
     */
    const coverUri = draft.coverImage?.previewUrl ?? draft.images[0]?.previewUrl ?? null
    const coverImage = coverUri
        ? {
              uri: coverUri,
              w: draft.coverImage?.width ?? draft.images[0]?.width ?? null,
              h: draft.coverImage?.height ?? draft.images[0]?.height ?? null,
              blur: paywalled ? coverUri : null,
          }
        : null

    const video = draft.video
        ? {
              id: 'preview-video',
              // A bare string is accepted by `playbackSchema` for exactly this case; it says so.
              playback: draft.video.previewUrl,
              thumbnail: null,
              duration_seconds: draft.video.durationSeconds,
              width: draft.video.width,
              height: draft.video.height,
          }
        : null

    const hasMedia = images.length > 0 || video !== null
    if (!text && !hasMedia && !draft.quotedPostId) return null

    return normalizePost({
        id: 'preview',
        code: null,
        created_at: now,
        /*
         * Legacy's rule, and it reads backwards until you see what it protects. A paid post with
         * media keeps its caption — the caption is the sales pitch and the media is what is sold.
         * A paid post that is **only words** has nothing else to sell, so the words themselves are
         * the locked thing and the reader gets none of them.
         */
        text: paywalled && !hasMedia ? null : text || null,
        html_text: null,
        shareable_url: null,

        channel: {
            id: 'preview',
            slug: author?.slug ?? null,
            name: author?.name ?? null,
            owner_id: null,
            images: { thumb: author?.thumb ?? null, uri: null, avatar_video: author?.avatarVideo },
            verified_tick_badge: author?.verifiedBadge ? { image: author.verifiedBadge } : null,
            is_premium: author?.isPremium ?? false,
        },

        // Withheld from the audience exactly as the backend withholds them. See `unlock_detail`.
        images: paywalled ? null : images,
        video: paywalled ? null : video,
        cover_image: coverImage,

        // ── Paywall ──
        price: draft.price,
        /*
         * `product_id` is what makes a post *buyable*, and `required_packages` what makes it
         * members-only; `postGate` reads both and names the four combinations. Synthesised from the
         * draft rather than invented per branch, so the preview's lock pill says the same sentence
         * the published post's will.
         */
        product_id: paywalled && draft.price !== null && draft.price > 0 ? 'preview-product' : null,
        required_packages: paywalled ? draft.requiredPackages : [],
        viewer: paywalled ? 'STARGAZERS' : 'EVERYONE',
        need_unlock_package: paywalled,
        /*
         * The counts the lock pill prints, and they describe what was **withheld** — so they are
         * filled in only on a paywalled draft, where `images`/`video` above are null. On an open
         * post the media is right there and there is nothing to summarise.
         */
        unlock_detail: paywalled
            ? {
                  images_count: images.length,
                  video_duration_seconds: draft.video?.durationSeconds ?? null,
                  text_length: text.length,
              }
            : null,

        // ── Moderation ──
        detected_nsfw: false,
        marked_nsfw: draft.markedNsfw,
        deleted: false,

        /*
         * `is_owner` is **false**, and that is the point of the screen. The author is looking at
         * their audience's copy, not at their own — a true here would let owner-only affordances
         * (the sensitive-content reveal, the insights strip) into a view whose whole claim is that
         * it shows what somebody else gets.
         */
        is_owner: false,
        is_bookmark: false,
        user_reaction: null,

        reaction_count: 0,
        reply_count: 0,

        reply_allowed: draft.replyAllowedUser !== 'NONE',
        // Nobody is replying to a post that does not exist; the preview draws no action bar anyway.
        can_reply: false,
        reply_allowed_user: draft.replyAllowedUser,
        reply_allowed_link: draft.replyAllowedLink,

        pinned: draft.pinned,
        edited: false,
        _insights: null,
        /*
         * The quoted post is **not** rebuilt. The composer cannot quote anything yet — `quotedPostId`
         * is a field the draft models ahead of the control — and a preview that fetched the quoted
         * body would make this builder impure and asynchronous for a case that cannot arise. It
         * becomes a prop on the dialog the day the control ships.
         */
        quoted_post: null,
    })
}
