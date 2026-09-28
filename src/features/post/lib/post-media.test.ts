import { describe, expect, it } from 'vitest'
import { normalizePost, type Post, type PostImage, postImageSchema } from '../api/types'
import {
    detectAspectRatio,
    formatDuration,
    formatDurationPadded,
    gallerySlideRatio,
    imageAspectRatio,
    lockCoverAspectRatio,
    lockedSummary,
    mediaTileSummary,
    postMediaKind,
    videoAspectRatio,
    videoFallbackSrc,
    videoSrc,
} from './post-media'

function image(overrides: Record<string, unknown>): PostImage {
    return postImageSchema.parse(overrides)
}

describe('imageAspectRatio', () => {
    it('reads either spelling the payload uses', () => {
        expect(imageAspectRatio(image({ w: 1600, h: 900 }))).toBeCloseTo(16 / 9)
        expect(imageAspectRatio(image({ width: 1600, height: 900 }))).toBeCloseTo(16 / 9)
    })

    /**
     * Where a row carries both they agree; pinning the preference anyway means a row that ever
     * disagrees resolves the same way everywhere rather than differently per call site.
     */
    it('prefers width/height when both are present', () => {
        expect(imageAspectRatio(image({ w: 100, h: 100, width: 1600, height: 900 }))).toBeCloseTo(
            16 / 9,
        )
    })

    /**
     * `null`, never a default ratio: a guessed box is a layout shift that lands after the reader
     * has started reading.
     */
    it('answers null rather than guessing when dimensions are absent', () => {
        expect(imageAspectRatio(image({}))).toBe(null)
        expect(imageAspectRatio(image({ w: 1600 }))).toBe(null)
    })

    it('rejects zero and negative dimensions instead of dividing by them', () => {
        expect(imageAspectRatio(image({ w: 1600, h: 0 }))).toBe(null)
        expect(imageAspectRatio(image({ w: -1600, h: 900 }))).toBe(null)
    })
})

describe('videoAspectRatio', () => {
    it('has the same guards as the image case', () => {
        const post = normalizePost({ id: '1', video: { width: 1080, height: 1920 } })
        expect(videoAspectRatio(post!.video!)).toBeCloseTo(1080 / 1920)

        const flat = normalizePost({ id: '1', video: { width: 0, height: 1920 } })
        expect(videoAspectRatio(flat!.video!)).toBe(null)
    })
})

describe('postMediaKind', () => {
    it('is none for a text post', () => {
        expect(postMediaKind(normalizePost({ id: '1' })!)).toBe('none')
    })

    it('is image when images are present', () => {
        const post = normalizePost({ id: '1', images: [{ uri: 'a.jpg' }] })
        expect(postMediaKind(post!)).toBe('image')
    })

    it('is video when the video has a playback url', () => {
        const post = normalizePost({ id: '1', video: { playback: 'v.m3u8' } })
        expect(postMediaKind(post!)).toBe('video')
    })

    /** A post carries at most one video and it is what the reader came for. */
    it('prefers video when a post somehow carries both', () => {
        const post = normalizePost({
            id: '1',
            images: [{ uri: 'a.jpg' }],
            video: { playback: 'v.m3u8' },
        })
        expect(postMediaKind(post!)).toBe('video')
    })

    /** A video row with no playback url cannot be played, so it is not video media. */
    it('ignores a video with no playback url', () => {
        const post = normalizePost({ id: '1', video: { id: 'v1' } })
        expect(postMediaKind(post!)).toBe('none')
    })
})

describe('formatDuration', () => {
    it('renders m:ss', () => {
        expect(formatDuration(0)).toBe('0:00')
        expect(formatDuration(9)).toBe('0:09')
        expect(formatDuration(75)).toBe('1:15')
    })

    /** `90:00` for a 90-minute video is legacy's output and reads as a bug. */
    it('rolls over into hours rather than counting past sixty minutes', () => {
        expect(formatDuration(5400)).toBe('1:30:00')
        expect(formatDuration(3661)).toBe('1:01:01')
    })

    /** Rounding up gives a badge that outlives the video. */
    it('floors rather than rounds', () => {
        expect(formatDuration(59.6)).toBe('0:59')
    })

    it('answers null for absent or nonsensical input', () => {
        expect(formatDuration(null)).toBe(null)
        expect(formatDuration(-1)).toBe(null)
        expect(formatDuration(Number.NaN)).toBe(null)
    })
})

describe('lockedSummary', () => {
    it('omits each part rather than printing a zero', () => {
        const post = normalizePost({
            id: '1',
            unlock_detail: { images_count: 0, video_duration_seconds: null, text_length: 0 },
        })
        expect(lockedSummary(post!.unlock_detail)).toEqual({
            images: null,
            videoDuration: null,
            textLength: null,
        })
    })

    it('describes what is behind the paywall when there is something to describe', () => {
        const post = normalizePost({
            id: '1',
            unlock_detail: { images_count: 3, video_duration_seconds: 75, text_length: 280 },
        })
        expect(lockedSummary(post!.unlock_detail)).toEqual({
            images: 3,
            videoDuration: '1:15',
            textLength: 280,
        })
    })

    it('handles a post with no unlock detail at all', () => {
        expect(lockedSummary(null)).toEqual({
            images: null,
            videoDuration: null,
            textLength: null,
        })
    })
})

describe('detectAspectRatio', () => {
    /**
     * Legacy's presentation rule, and the reason it is separate from `imageAspectRatio`: this one
     * snaps and guesses, so a column of posts is a column of the same few rectangles.
     */
    it('snaps a near-ratio to its bucket', () => {
        expect(detectAspectRatio(image({ w: 1000, h: 1000 }))).toBe('1/1')
        expect(detectAspectRatio(image({ w: 1600, h: 900 }))).toBe('16/9')
        expect(detectAspectRatio(image({ w: 1200, h: 900 }))).toBe('4/3')
        expect(detectAspectRatio(image({ w: 900, h: 1200 }))).toBe('3/4')
    })

    it('falls into a bucket by range when nothing is near', () => {
        expect(detectAspectRatio(image({ w: 2000, h: 1000 }))).toBe('16/9')
        expect(detectAspectRatio(image({ w: 1300, h: 1000 }))).toBe('4/3')
        expect(detectAspectRatio(image({ w: 1000, h: 1100 }))).toBe('1/1')
        expect(detectAspectRatio(image({ w: 1000, h: 2000 }))).toBe('3/4')
    })

    /** Legacy's guess, ported knowingly — the opposite trade lives in `imageAspectRatio`. */
    it('defaults to 16/9 when the payload gives no dimensions', () => {
        expect(detectAspectRatio(image({}))).toBe('16/9')
        expect(detectAspectRatio(image({ w: 0, h: 0 }))).toBe('16/9')
    })
})

describe('lockCoverAspectRatio', () => {
    it('is always 16/9 when there is video behind the paywall', () => {
        expect(lockCoverAspectRatio(image({ w: 900, h: 1600 }), 120)).toBe('16/9')
    })

    it('is coarse for the cover itself — landscape, portrait or square', () => {
        expect(lockCoverAspectRatio(image({ w: 1600, h: 900 }), null)).toBe('16/9')
        expect(lockCoverAspectRatio(image({ w: 900, h: 1600 }), null)).toBe('3/4')
        expect(lockCoverAspectRatio(image({ w: 800, h: 800 }), null)).toBe('1/1')
    })

    it('is square for a post with no cover at all', () => {
        expect(lockCoverAspectRatio(null, null)).toBe('1/1')
        expect(lockCoverAspectRatio(image({}), null)).toBe('1/1')
    })
})

describe('formatDurationPadded', () => {
    /** The lock pill pads every part; the video tile does not. Both are legacy's. */
    it('pads every part, unlike the tile format', () => {
        expect(formatDurationPadded(75)).toBe('01:15')
        expect(formatDurationPadded(5400)).toBe('01:30:00')
        expect(formatDuration(75)).toBe('1:15')
        expect(formatDuration(5400)).toBe('1:30:00')
    })

    it('answers null on the same inputs the tile format does', () => {
        expect(formatDurationPadded(null)).toBe(null)
        expect(formatDurationPadded(-1)).toBe(null)
    })
})

describe('gallerySlideRatio', () => {
    /**
     * The slide is given a ratio rather than a pixel width, so the 260 → 310 height step at `md`
     * needs no viewport read — and therefore cannot produce a hydration mismatch.
     */
    it('is the image ratio, or square when unknown', () => {
        expect(gallerySlideRatio(image({ w: 1600, h: 900 }))).toBeCloseTo(16 / 9)
        expect(gallerySlideRatio(image({}))).toBe(1)
    })
})

describe('videoSrc', () => {
    /**
     * The regression this exists for. `playback` is an **object** on the wire; parsed as a string
     * it became `null`, and every video post in the home feed rendered as a card with no media and
     * no error. Taken from a real `followed-channels/threads/` page.
     */
    it('reads the transcoded feed shape', () => {
        const post = normalizePost({
            id: 'p1',
            video: {
                id: '379380f0-e56a-4cec-8323-51fcec8efa11',
                duration_seconds: 6,
                width: 720,
                height: 1280,
                playback: { hls: 'https://feed-stg.tevicdn.com/videos/26/07/30/T/stream.m3u8' },
                thumbnail: 'https://tevi-cdn.tevi.dev/Post/VideoThumbnails/thumb.jpeg',
                is_ready: true,
            },
        })

        expect(videoSrc(post?.video)).toBe(
            'https://feed-stg.tevicdn.com/videos/26/07/30/T/stream.m3u8',
        )
        // The consequence, which is the half that was actually visible: the card decides whether to
        // draw a media block from this.
        expect(postMediaKind({ images: null, video: post?.video ?? null })).toBe('video')
    })

    /**
     * The precedence the two native clients use: iOS's `VideoPlayback.url` computed property and
     * Android's `playback?.hls ?: playback?.url`. Pinned because "prefer the mp4, it needs no media
     * engine" is the plausible-sounding inversion, and it silently disagrees with both shipped apps
     * on every post that carries both.
     */
    it('prefers the manifest, as iOS and Android do', () => {
        const post = normalizePost({
            id: 'p2',
            video: {
                playback: {
                    dash: 'https://x/v.mpd',
                    hls: 'https://x/v.m3u8',
                    url: 'https://x/v.mp4',
                },
            },
        })

        expect(videoSrc(post?.video)).toBe('https://x/v.m3u8')
        expect(videoFallbackSrc(post?.video)).toBe('https://x/v.mp4')
    })

    it('takes the mp4 when there is no manifest', () => {
        const post = normalizePost({ id: 'p3', video: { playback: { url: 'https://x/v.mp4' } } })

        expect(videoSrc(post?.video)).toBe('https://x/v.mp4')
    })

    /**
     * `dash` is on the wire and in Android's model, and **nothing on Android reads it**. No browser
     * plays it unaided either, so selecting it could only produce the unplayable notice.
     */
    it('never selects dash, even when it is the only member', () => {
        const post = normalizePost({ id: 'p4', video: { playback: { dash: 'https://x/v.mpd' } } })

        expect(videoSrc(post?.video)).toBe(null)
        expect(videoFallbackSrc(post?.video)).toBe(null)
    })

    it('still accepts a bare string, which a local preview produces before transcoding', () => {
        const post = normalizePost({ id: 'p5', video: { playback: 'https://x/preview.mp4' } })

        expect(videoSrc(post?.video)).toBe('https://x/preview.mp4')
    })

    /**
     * A video object carrying no playable member must read as **no video**, not as one that fails
     * to play: `playback` is now an object and therefore always truthy, so every call site has to
     * go through here rather than testing the field.
     */
    it('is null for a video with nothing playable on it, and for no video at all', () => {
        const empty = normalizePost({ id: 'p6', video: { id: 'v', playback: {} } })

        expect(videoSrc(empty?.video)).toBe(null)
        expect(postMediaKind({ images: null, video: empty?.video ?? null })).toBe('none')
        expect(videoSrc(null)).toBe(null)
        expect(videoSrc(undefined)).toBe(null)
    })

    it('survives a playback field that is not an object at all', () => {
        const post = normalizePost({ id: 'p7', video: { playback: 42 } })

        // A row is never dropped for this — `normalizePosts`' rule, and one bad video must not cost
        // the reader the post's text.
        expect(post).not.toBeNull()
        expect(videoSrc(post?.video)).toBe(null)
    })
})

describe('mediaTileSummary', () => {
    function post(overrides: Record<string, unknown>): Post {
        const parsed = normalizePost({ id: 'p1', ...overrides })
        if (!parsed) throw new Error('fixture did not parse')
        return parsed
    }

    it('prefers the first image, then the poster, then the cover', () => {
        const cover = { uri: 'https://cdn/cover.jpg' }
        expect(
            mediaTileSummary(
                post({
                    images: [{ uri: 'https://cdn/a.jpg', thumb: 'https://cdn/a-t.jpg' }],
                    cover_image: cover,
                }),
            ).src,
        ).toBe('https://cdn/a-t.jpg')
        expect(
            mediaTileSummary(
                post({
                    video: {
                        playback: { hls: 'https://cdn/v.m3u8' },
                        thumbnail: 'https://cdn/p.jpg',
                    },
                    cover_image: cover,
                }),
            ).src,
        ).toBe('https://cdn/p.jpg')
        expect(mediaTileSummary(post({ cover_image: cover })).src).toBe('https://cdn/cover.jpg')
        expect(mediaTileSummary(post({})).src).toBeNull()
    })

    /**
     * A locked row carries no media, only the counts — and those counts are what the tile sells
     * with. Reading `images.length` alone would draw a locked four-photo post as a single photo.
     */
    it('falls back to the unlock detail on a locked row', () => {
        const summary = mediaTileSummary(
            post({
                cover_image: { uri: 'https://cdn/cover.jpg', blur: 'yes' },
                unlock_detail: { images_count: 4, video_duration_seconds: 80, text_length: 0 },
            }),
        )
        expect(summary.images).toBe(4)
        expect(summary.duration).toBe('01:20')
        expect(summary.blurCover).toBe(true)
        expect(summary.hasVideo).toBe(false)
    })

    it("never blurs a post's own media for the cover's sake", () => {
        const summary = mediaTileSummary(
            post({
                images: [{ uri: 'https://cdn/a.jpg' }],
                cover_image: { uri: 'https://cdn/cover.jpg', blur: 'yes' },
            }),
        )
        expect(summary.blurCover).toBe(false)
    })

    it('omits a zero duration rather than printing 00:00', () => {
        expect(
            mediaTileSummary(post({ video: { playback: {}, duration_seconds: 0 } })).duration,
        ).toBeNull()
    })
})
