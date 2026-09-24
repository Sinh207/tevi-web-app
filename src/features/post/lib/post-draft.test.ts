import { describe, expect, it } from 'vitest'
import {
    buildPostBody,
    emptyPostDraft,
    isAttachableVideo,
    NO_UPLOAD_LIMITS,
    POST_IMAGE_MAX,
    type PostDraft,
    postDraftProblem,
    postLang,
} from './post-draft'

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
    return { ...emptyPostDraft(), ...overrides }
}

function image(id: string) {
    return {
        id,
        file: new File([], `${id}.jpg`, { type: 'image/jpeg' }),
        previewUrl: `blob:${id}`,
        width: 100,
        height: 100,
    }
}

function video(durationSeconds = 30) {
    return {
        file: new File([], 'clip.mp4', { type: 'video/mp4' }),
        durationSeconds,
        // Inside every ceiling — the long edge is 960 against a 1080 cap — so a test about
        // duration is only about duration.
        width: 960,
        height: 540,
        codec: null,
        poster: null,
        previewUrl: 'blob:clip',
    }
}

const LIMITS = {
    characterLimit: 500,
    limits: { videoDurationMax: 180, videoSizeMaxMb: 500, videoResolutionMax: 1080 },
}
const UPLOADED = { images: [], videoId: null, coverImage: null, lang: 'en' }

describe('emptyPostDraft', () => {
    /**
     * Followers-only is the product's default, not "everyone" — measured on 20 consecutive posts,
     * and iOS defaults an unparseable value to the same. A composer that opened on "everyone" would
     * quietly widen the audience of every post written through it.
     */
    it('opens on the defaults both other clients use', () => {
        const d = emptyPostDraft()
        expect(d.replyAllowedUser).toBe('FOLLOWERS')
        expect(d.replyAllowedLink).toBe(true)
        expect(d.audience).toBe('everyone')
        expect(d.markedNsfw).toBe(false)
    })
})

describe('postDraftProblem', () => {
    it("calls an untouched draft 'empty' — the state the composer rests in", () => {
        expect(postDraftProblem(draft(), LIMITS)).toBe('empty')
        expect(postDraftProblem(draft({ text: '   \n ' }), LIMITS)).toBe('empty')
    })

    it.each([
        ['words', { text: 'hello' }],
        ['a picture', { images: [image('a')] }],
        ['a video', { video: video() }],
        ['a quote', { quotedPostId: 'p-1' }],
    ])('accepts a draft carrying %s alone', (_label, overrides) => {
        expect(postDraftProblem(draft(overrides), LIMITS)).toBe(null)
    })

    it('refuses text past the console limit', () => {
        expect(postDraftProblem(draft({ text: 'x'.repeat(501) }), LIMITS)).toBe('too-long')
        expect(postDraftProblem(draft({ text: 'x'.repeat(500) }), LIMITS)).toBe(null)
    })

    it('refuses more pictures than one post may carry', () => {
        const images = Array.from({ length: POST_IMAGE_MAX + 1 }, (_, i) => image(String(i)))
        expect(postDraftProblem(draft({ images }), LIMITS)).toBe('too-many-images')
    })

    it('refuses a clip longer than the account allows', () => {
        expect(postDraftProblem(draft({ video: video(181) }), LIMITS)).toBe('video-too-long')
        expect(postDraftProblem(draft({ video: video(180) }), LIMITS)).toBe(null)
    })

    /**
     * No configured ceiling is not a ceiling of zero — an unset limit refuses nothing, which is
     * legacy's own `if (LIMIT)` guard. It matters because two of the three come from a Premium
     * entitlement this client can only read for a Premium account.
     */
    it('refuses nothing when no limits could be read', () => {
        const noLimits = { characterLimit: 500, limits: NO_UPLOAD_LIMITS }
        expect(postDraftProblem(draft({ video: video(99999) }), noLimits)).toBe(null)
    })

    it('refuses a file bigger than the size ceiling', () => {
        const big = video()
        Object.defineProperty(big.file, 'size', { value: 600 * 1024 * 1024 })
        expect(postDraftProblem(draft({ video: big }), LIMITS)).toBe('video-too-large')
    })

    /**
     * The **long** edge. A portrait 1080×1920 clip is a 1920 video, and comparing width alone waves
     * it past a 1080 ceiling — which is the shape a phone recording arrives in.
     */
    it('measures resolution on the long edge, whichever way round the clip is', () => {
        const portrait = { ...video(), width: 1080, height: 1920 }
        const landscape = { ...video(), width: 1920, height: 1080 }
        expect(postDraftProblem(draft({ video: portrait }), LIMITS)).toBe(
            'video-too-big-resolution',
        )
        expect(postDraftProblem(draft({ video: landscape }), LIMITS)).toBe(
            'video-too-big-resolution',
        )
    })

    /**
     * `0` is the shape `postUnlockPrice` already refuses to act on downstream — it draws a confirm
     * button saying "unlock for 0". Refusing it at the point it is written is the cheaper place.
     */
    it('refuses a non-positive price on a members-only post', () => {
        expect(
            postDraftProblem(draft({ text: 'x', audience: 'stargazers', price: 0 }), LIMITS),
        ).toBe('bad-price')
        expect(
            postDraftProblem(draft({ text: 'x', audience: 'stargazers', price: -5 }), LIMITS),
        ).toBe('bad-price')
        expect(
            postDraftProblem(draft({ text: 'x', audience: 'stargazers', price: 5 }), LIMITS),
        ).toBe(null)
    })

    /** A price on a public post is not a price — the field is ignored, so it cannot be wrong. */
    it('ignores a price on a public post', () => {
        expect(postDraftProblem(draft({ text: 'x', audience: 'everyone', price: 0 }), LIMITS)).toBe(
            null,
        )
    })
})

describe('buildPostBody — where legacy web and iOS disagree', () => {
    /**
     * `text`, never `html_text`. Legacy web converts newlines to `<br/>` and sends markup for
     * **every** post; this client renders none, and iOS falls back to `text` when `html_text` is
     * absent — so plain text is the only shape all three can display.
     */
    it('sends the words as text, trimmed', () => {
        const body = buildPostBody(draft({ text: '  hello\nworld  ' }), UPLOADED)
        expect(body.text).toBe('hello\nworld')
        expect('html_text' in body).toBe(false)
    })

    it('omits the words entirely when there are none', () => {
        expect('text' in buildPostBody(draft({ images: [image('a')] }), UPLOADED)).toBe(false)
    })

    /**
     * `{ id }` alone. Legacy web also sends the poster's **upload** URL as `thumbnail` — a signed,
     * expiring link to a bucket write, stored on the post. iOS sends the id and nothing else.
     */
    it('sends a video as its id alone', () => {
        const body = buildPostBody(draft({ video: video() }), { ...UPLOADED, videoId: 'vid-1' })
        expect(body.video).toEqual({ id: 'vid-1' })
    })

    /**
     * The fallback iOS makes and legacy web does not. A members-only post with no tier and no price
     * reaches nobody but its author — not the public, and no membership, because it names none.
     */
    it('publishes a members-only post with no tier and no price as public', () => {
        const body = buildPostBody(draft({ text: 'x', audience: 'stargazers' }), UPLOADED)
        expect(body.viewer).toBe('everyone')
        expect('required_packages' in body).toBe(false)
        expect('price' in body).toBe(false)
    })

    it('keeps it members-only once a tier is chosen', () => {
        const body = buildPostBody(
            draft({ text: 'x', audience: 'stargazers', requiredPackages: ['tier-1'] }),
            UPLOADED,
        )
        expect(body.viewer).toBe('stargazers')
        expect(body.required_packages).toEqual(['tier-1'])
    })

    it('keeps it members-only once a price is set, and names the currency', () => {
        const body = buildPostBody(
            draft({ text: 'x', audience: 'stargazers', price: 20 }),
            UPLOADED,
        )
        expect(body.viewer).toBe('stargazers')
        expect(body.price).toBe(20)
        expect(body.price_currency).toBe('TVS')
    })

    it('sends no price at all on a public post', () => {
        const body = buildPostBody(draft({ text: 'x', price: 20 }), UPLOADED)
        expect(body.viewer).toBe('everyone')
        expect('price' in body).toBe(false)
        expect('price_currency' in body).toBe(false)
    })

    /**
     * The cover is a **paid video post's** teaser and nothing else — it is what a non-buyer sees
     * instead of the clip. Legacy gates it on exactly this pair.
     */
    it('sends a cover only for a paid video post', () => {
        const cover = { uri: 'https://cdn.invalid/cover.jpg', w: 16, h: 9 }
        const paidVideo = draft({ text: 'x', audience: 'stargazers', price: 5, video: video() })

        expect(
            buildPostBody(paidVideo, { ...UPLOADED, videoId: 'v', coverImage: cover }).cover_image,
        ).toEqual(cover)
        // Free video: no cover.
        expect(
            'cover_image' in
                buildPostBody(draft({ text: 'x', video: video() }), {
                    ...UPLOADED,
                    videoId: 'v',
                    coverImage: cover,
                }),
        ).toBe(false)
        // Paid, but no video: no cover either.
        expect(
            'cover_image' in
                buildPostBody(draft({ text: 'x', audience: 'stargazers', price: 5 }), {
                    ...UPLOADED,
                    coverImage: cover,
                }),
        ).toBe(false)
    })

    it('always states the paid-interaction setting, enabled or not', () => {
        expect(buildPostBody(draft({ text: 'x' }), UPLOADED).paid_interaction).toEqual({
            is_enabled: false,
            star_cost: 0,
        })
        expect(
            buildPostBody(draft({ text: 'x', paidInteractionCost: 5 }), UPLOADED).paid_interaction,
        ).toEqual({ is_enabled: true, star_cost: 5 })
    })

    it('omits pinned and quoted_post rather than nulling them', () => {
        const plain = buildPostBody(draft({ text: 'x' }), UPLOADED)
        expect('pinned' in plain).toBe(false)
        expect('quoted_post' in plain).toBe(false)

        const full = buildPostBody(
            draft({ text: 'x', pinned: true, quotedPostId: 'p-9' }),
            UPLOADED,
        )
        expect(full.pinned).toBe(true)
        expect(full.quoted_post).toBe('p-9')
    })

    it('always states the reply rules and the NSFW mark', () => {
        const body = buildPostBody(draft({ text: 'x', markedNsfw: true }), UPLOADED)
        expect(body.reply_allowed_user).toBe('FOLLOWERS')
        expect(body.reply_allowed_link).toBe(true)
        expect(body.marked_nsfw).toBe(true)
    })
})

describe('postLang', () => {
    /** iOS sends the current locale's two-letter code; the field takes one from a shipped client. */
    it('narrows a locale to two letters', () => {
        expect(postLang('vi')).toBe('vi')
        expect(postLang('zh-CN')).toBe('zh')
        expect(postLang('zh-TW')).toBe('zh')
        expect(postLang('EN')).toBe('en')
    })

    /** Anything that cannot produce two letters falls back rather than sending a malformed tag. */
    it('falls back to en for anything unusable, including nothing at all', () => {
        expect(postLang(undefined)).toBe('en')
        expect(postLang(null)).toBe('en')
        expect(postLang('')).toBe('en')
        expect(postLang('x')).toBe('en')
        expect(postLang('123')).toBe('en')
    })
})

describe('isAttachableVideo', () => {
    it('accepts the three containers the upload takes', () => {
        for (const type of ['video/mp4', 'video/quicktime', 'video/webm']) {
            expect(isAttachableVideo({ type })).toBe(true)
        }
    })

    /** The type, never the name: the pre-signed URL is signed with the `Content-Type`. */
    it('refuses anything else', () => {
        expect(isAttachableVideo({ type: 'video/x-matroska' })).toBe(false)
        expect(isAttachableVideo({ type: 'image/jpeg' })).toBe(false)
        expect(isAttachableVideo({ type: '' })).toBe(false)
    })
})
