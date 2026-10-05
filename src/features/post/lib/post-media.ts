import type { Post, PostImage, PostVideo, UnlockDetail } from '../api/types'

/**
 * What a post's media *is*, and how big the box holding it should be.
 *
 * Kept apart from `post-access.ts` because the two answer different questions and only one of them
 * is about the reader: this file would give the same answers to everybody, if everybody could see
 * the media.
 */

/**
 * The aspect ratio of an image, or `null` when the payload does not say.
 *
 * ## The payload carries two spellings and legacy reads whichever it remembers
 *
 * Some rows have `w`/`h`, others `width`/`height` (`api/types.ts` says why both are modelled). This
 * is the **one** place that decides, and it prefers `width`/`height` only because that is the pair
 * the newer endpoints send; where both exist they agree.
 *
 * `null` rather than a `16/9` default is deliberate. A default ratio is a layout shift with extra
 * steps: the box is drawn at one shape and the image arrives another, so the feed jumps *after*
 * the reader has started reading. A caller that gets `null` should reserve nothing and let the
 * image size itself.
 */
export function imageAspectRatio(image: PostImage): number | null {
    const width = image.width ?? image.w
    const height = image.height ?? image.h
    if (width === null || height === null) return null
    if (width <= 0 || height <= 0) return null
    return width / height
}

/** The same for the video, whose dimensions have only one spelling. */
export function videoAspectRatio(video: PostVideo): number | null {
    if (video.width === null || video.height === null) return null
    if (video.width <= 0 || video.height <= 0) return null
    return video.width / video.height
}

/**
 * The video's **primary** source, or `null` when the payload carries none.
 *
 * ## `hls` first, and that number is the two native clients', not a guess
 *
 * iOS resolves the same field through one computed property —
 * `VideoPlayback.url { hls.isEmpty ? mp4 : hls }` (`Modules/Post/Model/Post.swift`) — and Android
 * writes `playback?.hls ?: playback?.url` at seven call sites. Both prefer the manifest, because a
 * transcoded post exposes **only** the manifest: `url` is frequently absent, which legacy's
 * `useEditPost` notes in as many words. Preferring the mp4 would mean falling back to the manifest
 * on nearly every real post anyway, while diverging from the clients for the few that have both.
 *
 * ## `dash` is modelled and deliberately never chosen
 *
 * It is in the payload and in Android's `PostPlaybackModel`, and **nothing on Android reads it**.
 * Only legacy web does, desktop-only, behind video.js. No browser plays DASH unaided, so selecting
 * it here could only ever produce the unplayable notice — it stays in the type as a record of the
 * wire, not as a source.
 *
 * The browser half of this — what to do when the primary is a manifest this browser cannot play —
 * is `videoFallbackSrc` below.
 */
export function videoSrc(video: PostVideo | null | undefined): string | null {
    if (!video) return null
    return video.playback.hls ?? video.playback.url ?? null
}

/**
 * The progressive mp4 to fall back to, or `null`.
 *
 * ## This is iOS's `backupAsset`, decided earlier
 *
 * `PostVideoView` is handed the manifest as its asset and the mp4 as `backupAsset`, and swaps to it
 * from a `AVPlayerItem.status == .failed` observer (`playBackupAssetIfNeeded`) — guarded on
 * `asset.url.isHLS`, so the swap only ever replaces a manifest. The web can answer the same
 * question **without waiting for a failure**: `canPlayType` says up front whether this browser has
 * HLS, so the lightbox picks the mp4 before the first frame rather than after a visible stall.
 *
 * Same fallback, one event earlier. Where neither is playable the reader is told, which is the case
 * iOS does not have because AVPlayer always has HLS.
 */
export function videoFallbackSrc(video: PostVideo | null | undefined): string | null {
    return video?.playback.url ?? null
}

/**
 * What kind of media a post leads with.
 *
 * Video wins over images when a post somehow has both, because a post carries at most one video and
 * it is the thing the reader came for. `'none'` is the common case — most posts are text.
 */
export type PostMediaKind = 'none' | 'image' | 'video'

export function postMediaKind(post: Pick<Post, 'images' | 'video'>): PostMediaKind {
    if (videoSrc(post.video)) return 'video'
    if (post.images && post.images.length > 0) return 'image'
    return 'none'
}

/**
 * A duration as `m:ss`, for the corner of a video tile.
 *
 * Hours are rendered `h:mm:ss` rather than as minutes past sixty — a 90-minute video reading
 * `90:00` is legacy's behaviour and it looks like a bug even when it is not. Seconds are floored:
 * a 59.6-second clip labelled `1:00` has a badge that outlives the video.
 */
export function formatDuration(seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
    const total = Math.floor(seconds)
    const s = total % 60
    const m = Math.floor(total / 60) % 60
    const h = Math.floor(total / 3600)
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * What a **locked** post can honestly say about what is behind the paywall.
 *
 * The media is not in the payload at all for a locked post (`unlockDetailSchema` says why), so this
 * is the only description available. Returning `null` for each absent part rather than zeroes lets
 * the lock screen omit a clause instead of printing "0 images".
 */
export function lockedSummary(detail: UnlockDetail | null): {
    images: number | null
    videoDuration: string | null
    textLength: number | null
} {
    if (!detail) return { images: null, videoDuration: null, textLength: null }
    return {
        images: detail.images_count > 0 ? detail.images_count : null,
        videoDuration: formatDuration(detail.video_duration_seconds),
        textLength: detail.text_length > 0 ? detail.text_length : null,
    }
}

/**
 * What one cell of a space's **Media** grid shows — legacy's `usePostMedia`, as a pure function.
 *
 * ## Both halves of the payload, because a locked row has only one
 *
 * An open post carries its media; a locked one carries `cover_image` and `unlock_detail` instead
 * (`unlockDetailSchema` says why). Legacy reads `images.length || unlock_detail.images_count` and
 * the same for the duration, so a locked tile still says "4 photos · 01:20" over its cover — which
 * is what sells it. Kept.
 *
 * - `src` — the first image, then the video's poster, then the cover. `thumb` before `uri` for the
 *   image, since the cell is a third of a column.
 * - `blurCover` — only when the thumbnail **is** the cover and the backend asked for it blurred,
 *   the same instruction `PostLockPanel` honours. A post's own media is never blurred here; the
 *   sensitive-content cover is the tile's business, not this.
 * - `duration` — legacy pads every part (`01:05`), unlike the card's tile, so this uses
 *   `formatDurationPadded`.
 */
export function mediaTileSummary(
    post: Pick<Post, 'images' | 'video' | 'cover_image' | 'unlock_detail'>,
): {
    src: string | null
    blurCover: boolean
    images: number
    duration: string | null
    hasVideo: boolean
} {
    const first = post.images?.[0]
    const own = first?.thumb ?? first?.uri ?? post.video?.thumbnail ?? null
    const cover = post.cover_image?.uri ?? null
    const detail = post.unlock_detail

    const seconds = post.video?.duration_seconds || detail?.video_duration_seconds || 0

    return {
        src: own ?? cover,
        blurCover: own === null && cover !== null && Boolean(post.cover_image?.blur),
        images: post.images?.length || detail?.images_count || 0,
        duration: seconds > 0 ? formatDurationPadded(seconds) : null,
        hasVideo: Boolean(videoSrc(post.video)),
    }
}

/**
 * Legacy's **presentation** ratio for an image — one of five buckets, defaulting to `16/9`.
 *
 * ## Why this exists beside `imageAspectRatio`, which answers `null`
 *
 * They answer different questions. `imageAspectRatio` reports what the payload actually said, and
 * `null` is the honest answer when it said nothing. This one is the **layout rule** legacy applies
 * on top: snap the measured ratio to the nearest of `1/1`, `16/9`, `4/3`, `3/4`, and when there is
 * no measurement at all, use `16/9`.
 *
 * Snapping is what keeps a column of posts from being a column of slightly different rectangles, and
 * it is legacy's `useImageMedia.detectAspectRatio` verbatim — the tolerances included, because they
 * are what decide whether a 1.6 ratio reads as `16/9` or `4/3`.
 *
 * The `16/9` default is a guess and it is legacy's guess. It trades a possible reflow when the image
 * lands for a stable box before it does; the opposite trade (reserve nothing) is what
 * `imageAspectRatio` supports, and the two are kept separate so the choice stays visible rather than
 * being buried in one function that does both.
 */
/*
 * ⚠ **Nothing draws with this today.** It was the gallery's single-image branch, which was removed
 * — legacy has no such branch, and at `3/4` it made a portrait photo 816px tall in a 612px column
 * (`post-image-gallery.tsx` has the account). Kept exported and tested rather than deleted: it is
 * the only place the five-bucket snapping rule is written down, and a surface that wants a shape
 * before the bytes land will want it again. Delete it if that surface never arrives.
 */
export function detectAspectRatio(image: PostImage): string {
    const width = image.width ?? image.w
    const height = image.height ?? image.h
    if (width === null || height === null || width <= 0 || height <= 0) return '16/9'

    const ratio = width / height
    if (Math.abs(ratio - 1) < 0.05) return '1/1'
    if (Math.abs(ratio - 16 / 9) < 0.08) return '16/9'
    if (Math.abs(ratio - 4 / 3) < 0.08) return '4/3'
    if (Math.abs(ratio - 3 / 4) < 0.08) return '3/4'
    if (ratio > 1.5) return '16/9'
    if (ratio > 1.2) return '4/3'
    if (ratio > 0.8) return '1/1'
    return '3/4'
}

/**
 * The **presentation** ratio for a clip in the feed — one of ten buckets, with both ends clamped.
 *
 * `videoAspectRatio` above is its raw counterpart and they pair exactly as `imageAspectRatio` pairs
 * with `detectAspectRatio`: one reports what the payload said (`null` when it said nothing), this
 * one is the layout rule applied on top.
 *
 * ## Why Android's rule and not legacy web's
 *
 * Legacy web has two buckets: `width / height > 1 ? '16/9' : '9/16'`
 * (`postMain/common/media/video`). That is enough to stop a portrait clip being drawn landscape —
 * which is the bug — but it is wrong in both directions either side of 1: a 4:3 clip is given a
 * 16:9 box and letterboxed, and a **square** clip falls to the `else` and gets a 9:16 box, i.e. a
 * tall column with a square video floating in it.
 *
 * Android carries the full table (`PostViewHolderHelper.getItemFeedViewType`, ten `FeedType`s and
 * ten view holders) and this is it, verbatim — the ten targets, the two clamps and the two
 * tolerance windows. The clamps are the part worth stating: a 1:10 clip does not get a card ten
 * screens tall, it is capped at `9/16`, and a panorama is capped at `16/9`.
 *
 * ## The order of the branches is the rule
 *
 * `1/1` and `9/20` are decided by **windows** rather than by nearest-neighbour, because at those
 * two ratios the neighbours are close enough that rounding would pick the wrong one — 1.0 sits
 * between `5/6` and `6/5`, and `9/20` (0.45) sits beside `9/16` (0.5625) and nothing below. Both
 * windows are checked before the nearest-of search, which is what Android does.
 *
 * No dimensions ⇒ `1/1`, which is Android's fallback (`?: FeedType.TYPE_VIDEO_1_1`) and not
 * legacy's `16/9`: a square reserves a box that is wrong by less, whichever way the clip turns out.
 */
export function detectVideoAspectRatio(video: Pick<PostVideo, 'width' | 'height'> | null): string {
    const width = video?.width ?? null
    const height = video?.height ?? null
    if (width === null || height === null || width <= 0 || height <= 0) return '1/1'

    const ratio = width / height

    /* Both ends clamped, so one absurd payload cannot hand a feed row an absurd height. */
    if (ratio <= 0.2) return '9/16'
    if (ratio >= 5) return '16/9'
    /* Two windows before the search — see the note above for why these two and not the rest. */
    if (ratio > 0.95 && ratio < 1.05) return '1/1'
    if (ratio > 0.43 && ratio < 0.47) return '9/20'

    let best: (typeof VIDEO_RATIOS)[number] = VIDEO_RATIOS[0]
    for (const candidate of VIDEO_RATIOS) {
        if (Math.abs(candidate.value - ratio) < Math.abs(best.value - ratio)) best = candidate
    }
    return best.label
}

/** Android's ten `FeedType` video shapes, in its own order. */
const VIDEO_RATIOS = [
    { label: '5/6', value: 5 / 6 },
    { label: '6/5', value: 6 / 5 },
    { label: '3/4', value: 3 / 4 },
    { label: '4/3', value: 4 / 3 },
    { label: '2/3', value: 2 / 3 },
    { label: '3/2', value: 3 / 2 },
    { label: '9/16', value: 9 / 16 },
    { label: '16/9', value: 16 / 9 },
    { label: '9/20', value: 9 / 20 },
    { label: '1/1', value: 1 },
] as const

/**
 * The aspect ratio of a **locked** post's cover, which follows a different rule again.
 *
 * A locked post's cover is not the post's media — it is the one image the creator chose to show
 * through the paywall — so legacy classifies it coarsely: video behind the lock is always `16/9`,
 * and the cover itself is landscape, portrait or square with nothing in between. Ported as-is,
 * including `1/1` for a post with no cover at all.
 */
export function lockCoverAspectRatio(
    cover: PostImage | null,
    videoDurationSeconds: number | null,
): string {
    if (!cover) return '1/1'
    if (videoDurationSeconds !== null && videoDurationSeconds > 0) return '16/9'
    const width = cover.width ?? cover.w
    const height = cover.height ?? cover.h
    if (width === null || height === null || height <= 0) return '1/1'
    const ratio = width / height
    if (ratio > 1) return '16/9'
    if (ratio < 1) return '3/4'
    return '1/1'
}

/**
 * The **lock panel's** duration format, which is not the video tile's.
 *
 * Legacy pads every part, so an hour-long video reads `01:30:00` and a short clip `01:15` — the
 * same function the video tile formats as `1:30:00` and `1:15`. Two formats for the same quantity in
 * one product is not a decision anybody made, but the lock pill and the tile are the two places a
 * reader compares against each other least, and changing either is a visual diff rather than a port.
 * Kept separate and named for where it is used, so the divergence is visible instead of averaged.
 */
export function formatDurationPadded(seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
    const total = Math.floor(seconds)
    const s = total % 60
    const m = Math.floor(total / 60) % 60
    const h = Math.floor(total / 3600)
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * The gallery's row height — legacy's two fixed values, kept as the record of where the numbers
 * come from. The component applies them as `h-[260px] md:h-[310px]`; a multi-image post is a
 * horizontal row of images at **one** height, each as wide as its own ratio makes it, which is what
 * lets images of different shapes sit in a row without letterboxing.
 */
export const GALLERY_HEIGHT = { mobile: 260, desktop: 310 } as const

/**
 * The same row, shorter — what the **composer** previews an attachment at.
 *
 * Legacy's `ImagePreview` is the feed's figure drawn smaller: `height: { xs: 200, md: 300 }`, slides
 * at `slidesPerView: 'auto'` with each one's own `aspectRatio`. Identical geometry, so it is the
 * same component with one number changed rather than a second preview strip — which is what the
 * composer had, and it could not page between pictures at all.
 *
 * Shorter because the box it sits in is shorter: the composer is a dialog with a caption above and
 * an upload row and an action bar below, and a feed-height gallery pushes both off screen.
 */
export const COMPOSER_GALLERY_HEIGHT = { mobile: 200, desktop: 300 } as const

/**
 * A slide's shape in the row — its own ratio, or a square when the payload does not say.
 *
 * Legacy computes a **pixel width** (`commonHeight * ratio`) because its height is a JS constant it
 * has already branched on. Here the height is two Tailwind classes, so the slide is given the ratio
 * instead and the browser derives the width from whichever height is in force — which is what makes
 * the 260 → 310 step at `md` work without the component knowing the viewport, and therefore without
 * a hydration mismatch between a server that has no breakpoint and a client that does.
 */
export function gallerySlideRatio(image: PostImage): number {
    return imageAspectRatio(image) ?? 1
}

/**
 * The `sizes` every image that fills the post column declares.
 *
 * ## The default that ships with a `fill` image describes a grid this app does not have
 *
 * `(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw` is the create-next-app shape — three
 * columns on a desktop, two on a tablet. A post card is **one** column capped at 612px (which is
 * also `--breakpoint-sm`, and what `(rail)/layout.tsx` pins the end rail against), so on a 900px
 * viewport the default claims 450px for a box that is really 612px wide. The browser then picks a
 * candidate for the smaller number, and on a 2× screen the cover lands visibly soft.
 *
 * It is a sharpness bug rather than a bandwidth one — the default under-declares here, it does not
 * over-declare — which is why it survives a glance at the network panel.
 */
export const POST_COLUMN_SIZES = '(max-width: 612px) 100vw, 612px'

/**
 * Whether a source is a picture **this browser is holding**, not one a server can serve.
 *
 * ⚠ Every `next/image` in this feature has to ask, because the composer's *Preview* renders the
 * same components over a draft: a `blob:` URL is the file the reader just picked, and the optimizer
 * would be asked to fetch `/_next/image?url=blob:…`, which it cannot resolve and which fails as a
 * broken tile rather than as an error anybody sees. `unoptimized` makes Next emit the src verbatim,
 * which is the only thing that can work — there is nothing to optimise in a local file that will
 * never be requested twice, and no loader that accepts it.
 *
 * Derived from the src rather than threaded down as a prop, for the reason `button.tsx`'s
 * `rendersNativeButton` gives: a flag every call site has to remember is a flag one of them will
 * forget, and this one fails **silently** at the tile.
 *
 * `data:` for the same reason — nothing produces one here today, but it is the other scheme with
 * bytes in the URL rather than a host behind it.
 */
export function isLocalImageSrc(src: string | null | undefined): boolean {
    if (!src) return false
    return src.startsWith('blob:') || src.startsWith('data:')
}
