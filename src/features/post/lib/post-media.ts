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
