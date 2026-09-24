/**
 * What a new post is, and what it turns into on the wire.
 *
 * ## Two reference clients disagree, and this file is where that is settled
 *
 * Legacy web's `useCreatePost` and iOS's `PostLocal.swift` build the same request from the same
 * screen and differ in six places. Each one is decided here, with the decision written at the field
 * rather than in a commit message, because the failures they produce are silent: a post that
 * renders blank, a paid post nobody can buy, an expiring URL stored as a poster.
 *
 * | | legacy web | iOS | here |
 * |---|---|---|---|
 * | the words | always `html_text` (newlines → `<br/>`) | `text`, `html_text` only if it has one | **`text`** |
 * | `video` | `{ id, thumbnail: <upload URL> }` | `{ id }` | **`{ id }`** |
 * | `lang` | `'en'`, hard-coded | the reader's own 2-letter code | **the reader's** |
 * | empty paid tier | sends `viewer: 'stargazers'` regardless | falls back to `everyone` | **falls back** |
 * | `paid_interaction` | sent | commented out | **sent** |
 * | `hidden_links` | absent | sent | **absent** |
 *
 * The three that matter most:
 *
 * - **`text`, not `html_text`.** `PostCard` renders no markup (its own header states the refusal),
 *   so a post written here as `html_text` would be one this client cannot display. iOS reads
 *   `html_text` *and falls back to `text`*, so plain text is safe everywhere — verified in
 *   `Post.swift`, where the content builder tries `textHtml` then `text`. Newlines survive as
 *   `whitespace-pre-wrap`, which is what legacy's `<br/>` conversion was for.
 * - **`video: { id }`.** Legacy also sends the poster's **upload** URL — a signed, expiring link to
 *   a bucket write — as `thumbnail`. iOS sends the id alone. A poster the backend already received
 *   needs no URL back. **B110**.
 * - **The paid fallback.** A post marked members-only with no tier selected and no price is a post
 *   nobody can reach: not the public, and not a member, because it names no tier. iOS rewrites the
 *   audience to `everyone` rather than publishing it; legacy web does not, which is how a creator
 *   ends up with a post only they can see.
 */

/**
 * An image as it goes **out**, which is a narrower thing than one coming in.
 *
 * `PostImage` is the read schema — seven fields, both dimension spellings, `thumb` and `blur` the
 * backend adds. A client that has just uploaded a file knows three of them, and sending the rest as
 * nulls would be claiming a shape it did not produce. Legacy sends exactly this triple for both
 * posts and comments, which is why `ReplyImage` is an alias of it rather than a second declaration.
 */
export interface UploadedImage {
    uri: string
    w: number | null
    h: number | null
}

/** Who may see the post. The two values the backend's `viewer` field takes. */
export type PostAudience = 'everyone' | 'stargazers'

/** A video the reader has attached but not yet uploaded. */
export interface PostDraftVideo {
    file: File
    durationSeconds: number
    width: number
    height: number
    /** `null` when the browser would not name it — the endpoint accepts that. */
    codec: string | null
    /** The frame the reader picked as a poster, or `null`. */
    poster: Blob | null
    /** A local `blob:` URL for the preview. The owner revokes it. */
    previewUrl: string
}

/** One picture the reader has attached but not yet uploaded. */
export interface PostDraftImage {
    id: string
    file: File
    previewUrl: string
    width: number | null
    height: number | null
}

export interface PostDraft {
    text: string
    images: PostDraftImage[]
    /** At most one — legacy and iOS both allow a single clip per post. */
    video: PostDraftVideo | null
    /** The poster for a **paid** video post; ignored on every other shape (see `buildPostBody`). */
    coverImage: PostDraftImage | null

    audience: PostAudience
    /** Membership tiers that unlock it. Empty means membership is not a route in. */
    requiredPackages: string[]
    /** Star to unlock it one-off. `null` means it is not individually purchasable. */
    price: number | null

    /** Who may reply — the same six values the reader sees on a post (`lib/who-can-reply.ts`). */
    replyAllowedUser: string
    /** Links permitted in replies. */
    replyAllowedLink: boolean
    /** Charge readers to react and comment on this post. `null` when the creator has it off. */
    paidInteractionCost: number | null

    pinned: boolean
    markedNsfw: boolean
    /** The post this one quotes, by id. */
    quotedPostId: string | null
}

/** Nothing typed, nothing attached — the resting state, and the one that cannot be posted. */
export function emptyPostDraft(): PostDraft {
    return {
        text: '',
        images: [],
        video: null,
        coverImage: null,
        audience: 'everyone',
        requiredPackages: [],
        price: null,
        /*
         * `FOLLOWERS` is the product's default rather than "everyone" — measured on 20 consecutive
         * posts, and iOS defaults an unparseable value to the same. `lib/who-can-reply.ts` has the
         * evidence. Legacy's post form opens on `reply_allowed_user || FOLLOWERS` too.
         */
        replyAllowedUser: 'FOLLOWERS',
        replyAllowedLink: true,
        paidInteractionCost: null,
        pinned: false,
        markedNsfw: false,
        quotedPostId: null,
    }
}

/**
 * Why this draft cannot be posted, or `null` when it can.
 *
 * A reason rather than a boolean, and `'empty'` is the resting state that must print nothing — the
 * same shape `replyDraftProblem` uses, and for the same reason: a composer that opens complaining
 * is a composer nobody reads.
 */
export type PostDraftProblem =
    /** No words, no pictures, no video, nothing quoted. */
    | 'empty'
    | 'too-long'
    | 'too-many-images'
    | 'video-too-long'
    | 'video-too-large'
    | 'video-too-big-resolution'
    /** Members-only, with a price that is not a number the backend can charge. */
    | 'bad-price'

/**
 * The video containers the upload accepts.
 *
 * Legacy's `MEDIA_UPLOAD_MESSAGES` names MP4, MOV and WebM, and the check is on the **file's own
 * type** rather than its name — the extension is a claim, and the pre-signed URL is signed with the
 * `Content-Type`, so a mislabelled file fails at Google with a 403 that reads like a backend fault.
 */
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

export function isAttachableVideo(file: { type: string }): boolean {
    return (VIDEO_TYPES as readonly string[]).includes(file.type)
}

/**
 * What the reader's account is allowed to upload.
 *
 * ## Every one of these is `null` for "no ceiling", and that is legacy's own behaviour
 *
 * Legacy guards each check with `if (LIMIT)`, so an unset limit refuses nothing. That matters more
 * than it looks: two of the three come from a **Premium entitlement**
 * (`enhanced-storage-upload`'s `video-length` and `file-upload-size`), which this client can only
 * read for an account that *has* Premium — `usePremiumInfo` is gated on it. A reader without
 * Premium therefore gets no client-side ceiling and the backend refuses instead, which is worse
 * than checking but better than inventing a number. **B110**.
 *
 * `resolutionMax` is the one that comes from remote config and is therefore known for everybody.
 */
export interface PostUploadLimits {
    /** Seconds. The entitlement carries **minutes**; the caller multiplies. */
    videoDurationMax: number | null
    /** Megabytes, as the entitlement states them. */
    videoSizeMaxMb: number | null
    /** Pixels on the **long** edge — legacy compares `Math.max(width, height)`. */
    videoResolutionMax: number | null
}

/** No ceilings at all: what a reader gets when nothing could be read. */
export const NO_UPLOAD_LIMITS: PostUploadLimits = {
    videoDurationMax: null,
    videoSizeMaxMb: null,
    videoResolutionMax: null,
}

/**
 * The most images one post may carry.
 *
 * Legacy's `LIMIT_UPLOAD_IMAGE`. Ten is also the reply ceiling, which is a coincidence rather than
 * a shared constant: one is a comment's limit and the other a post's, and the backend may well move
 * them independently.
 */
export const POST_IMAGE_MAX = 10

export function postDraftProblem(
    draft: PostDraft,
    {
        characterLimit,
        limits,
    }: {
        characterLimit: number
        /** What this account may upload. `NO_UPLOAD_LIMITS` refuses nothing. */
        limits: PostUploadLimits
    },
): PostDraftProblem | null {
    const text = draft.text.trim()
    const hasContent =
        Boolean(text) ||
        draft.images.length > 0 ||
        draft.video !== null ||
        Boolean(draft.quotedPostId)
    if (!hasContent) return 'empty'

    if (text.length > characterLimit) return 'too-long'
    if (draft.images.length > POST_IMAGE_MAX) return 'too-many-images'

    if (draft.video) {
        const { videoDurationMax, videoSizeMaxMb, videoResolutionMax } = limits

        if (
            videoDurationMax !== null &&
            videoDurationMax > 0 &&
            draft.video.durationSeconds > videoDurationMax
        ) {
            return 'video-too-long'
        }

        if (
            videoSizeMaxMb !== null &&
            videoSizeMaxMb > 0 &&
            draft.video.file.size / (1024 * 1024) > videoSizeMaxMb
        ) {
            return 'video-too-large'
        }

        /*
         * The **long** edge, which is how legacy compares it (`Math.max(width, height)`). A
         * portrait 1080×1920 clip is a 1920 video, and comparing width alone would wave it past a
         * 1080 ceiling.
         */
        if (
            videoResolutionMax !== null &&
            videoResolutionMax > 0 &&
            Math.max(draft.video.width, draft.video.height) > videoResolutionMax
        ) {
            return 'video-too-big-resolution'
        }
    }

    /*
     * A price is only meaningful on a members-only post, and only as a positive number. `0` is the
     * shape `postUnlockPrice` already refuses to act on — it would draw a confirm button saying
     * "unlock for 0" — so it is refused at the point it is written rather than at the point some
     * reader meets it.
     */
    if (draft.audience === 'stargazers' && draft.price !== null && !(draft.price > 0)) {
        return 'bad-price'
    }

    return null
}

/** The body `POST v3/channel/my-channel/threads/` receives. Every key is the backend's own. */
export interface PostBody {
    text?: string
    images?: UploadedImage[]
    video?: { id: string }
    cover_image?: UploadedImage
    viewer?: PostAudience
    required_packages?: string[]
    price?: number
    price_currency?: 'TVS'
    reply_allowed_user?: string
    reply_allowed_link?: boolean
    paid_interaction?: { is_enabled: boolean; star_cost: number }
    pinned?: boolean
    marked_nsfw: boolean
    quoted_post?: string
    lang: string
}

/**
 * Turn a draft whose media has already been uploaded into the request body.
 *
 * **Uploads are the caller's**, which is what keeps this function pure and therefore testable
 * against the table at the top of the file. It takes the results — image rows, a video id — and
 * decides only what is *sent*.
 *
 * Fields are **omitted rather than nulled** when they do not apply. iOS sends explicit `NSNull` for
 * several of them, which matters to it because the same builder serves *edit*, where a null is how
 * you clear a field. This is create only: there is nothing to clear, and an absent key cannot be
 * misread as "set this to nothing".
 */
export function buildPostBody(
    draft: PostDraft,
    {
        images,
        videoId,
        coverImage,
        lang,
    }: {
        images: UploadedImage[]
        videoId: string | null
        coverImage: UploadedImage | null
        /** The reader's own language, two letters — iOS sends the same. **B109**. */
        lang: string
    },
): PostBody {
    const body: PostBody = { lang, marked_nsfw: draft.markedNsfw }

    const text = draft.text.trim()
    if (text) body.text = text
    if (images.length > 0) body.images = images
    if (videoId) body.video = { id: videoId }

    /*
     * The cover is a **paid video post's** teaser and nothing else — it is what a non-buyer sees in
     * place of the clip. Legacy gates it on exactly this pair (`uploadedCoverImage && audience ===
     * stargazers`), and sending it on a free post would attach a second poster the reader never
     * chose to a video they can already watch.
     */
    if (coverImage && videoId && draft.audience === 'stargazers') {
        body.cover_image = coverImage
    }

    /*
     * The paid fallback, and it is iOS's rather than legacy web's. A members-only post with no tier
     * and no price names no way in: the public cannot see it and no membership grants it, so the
     * only account it reaches is its author's. Publishing it as `everyone` is the honest reading of
     * "the creator asked for a paywall and then set none".
     */
    const paywalled =
        draft.audience === 'stargazers' &&
        (draft.requiredPackages.length > 0 || (draft.price !== null && draft.price > 0))

    body.viewer = paywalled ? 'stargazers' : 'everyone'

    if (paywalled) {
        if (draft.requiredPackages.length > 0) body.required_packages = draft.requiredPackages
        if (draft.price !== null && draft.price > 0) {
            body.price = draft.price
            // The only currency a post is priced in. Legacy and iOS both hard-code it.
            body.price_currency = 'TVS'
        }
    }

    body.reply_allowed_user = draft.replyAllowedUser
    body.reply_allowed_link = draft.replyAllowedLink

    /*
     * Sent on every create, with `is_enabled` carrying the answer — legacy's shape. iOS has the
     * line **commented out**, so its posts inherit whatever the channel's default is. Following
     * legacy here because this is the client being ported and the field is per-post on the wire;
     * **B110** asks which of the two the backend actually honours.
     */
    body.paid_interaction = {
        is_enabled: draft.paidInteractionCost !== null && draft.paidInteractionCost > 0,
        star_cost: draft.paidInteractionCost ?? 0,
    }

    if (draft.pinned) body.pinned = true
    if (draft.quotedPostId) body.quoted_post = draft.quotedPostId

    return body
}

/**
 * The two-letter language code the post is tagged with.
 *
 * iOS sends `LZ.getCurrentLanguage().twoCharactersCode`; legacy web hard-codes `'en'` from all nine
 * of its locales. The reader's own is the one that can be right, and two letters is what both the
 * field and every locale this app ships can produce — `zh-CN` and `zh-TW` both narrow to `zh`,
 * which is a loss the field's own shape forces rather than a choice made here. **B109**.
 */
export function postLang(locale: string | null | undefined): string {
    /*
     * Nullable on purpose. `useTranslation().currentLanguage` is undefined outside a mounted i18n
     * instance — which is every hook test in this repo — and a `.trim()` on that throws inside the
     * mutation, where it surfaces as "the write never happened" rather than as a type error. The
     * six tests that caught it were all asserting on a request that was never made.
     */
    const code = (locale ?? '').trim().slice(0, 2).toLowerCase()
    return /^[a-z]{2}$/.test(code) ? code : 'en'
}
