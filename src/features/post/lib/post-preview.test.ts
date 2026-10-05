import { describe, expect, it } from 'vitest'
import { isLocked, postDisplay, postGate } from './post-access'
import { buildPostBody, emptyPostDraft, isPaywalled, type PostDraft } from './post-draft'
import { buildPreviewPost } from './post-preview'
import type { ReplyComposerAuthor } from './reply-author'

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
    return { ...emptyPostDraft(), ...overrides }
}

function image(id: string) {
    return {
        id,
        file: new File([], `${id}.jpg`, { type: 'image/jpeg' }),
        previewUrl: `blob:${id}`,
        width: 1200,
        height: 800,
    }
}

function video(durationSeconds = 42) {
    return {
        file: new File([], 'clip.mp4', { type: 'video/mp4' }),
        durationSeconds,
        width: 1920,
        height: 1080,
        codec: null,
        poster: null,
        previewUrl: 'blob:clip',
    }
}

const AUTHOR: ReplyComposerAuthor = {
    name: 'Alice Nguyen',
    slug: 'alice',
    thumb: 'https://static.tevi.dev/a.jpg',
    avatarVideo: null,
    isPremium: true,
    verifiedBadge: 'https://static.tevi.dev/tick.png',
}

const AT = { author: AUTHOR, now: 1_700_000_000_000 }

describe('buildPreviewPost', () => {
    it('is null for a draft with nothing in it', () => {
        expect(buildPreviewPost(draft(), AT)).toBeNull()
        // Whitespace is not content either — `postDraftProblem` says the same about `empty`.
        expect(buildPreviewPost(draft({ text: '   \n ' }), AT)).toBeNull()
    })

    it('carries the words, the author and the pictures of an open post', () => {
        const post = buildPreviewPost(draft({ text: '  hello  ', images: [image('a')] }), AT)

        expect(post?.text).toBe('hello')
        expect(post?.channel?.name).toBe('Alice Nguyen')
        expect(post?.channel?.slug).toBe('alice')
        expect(post?.channel?.is_premium).toBe(true)
        expect(post?.channel?.verified_tick_badge?.image).toBe('https://static.tevi.dev/tick.png')
        expect(post?.images?.map(i => i.uri)).toEqual(['blob:a'])
        expect(postDisplay(post!)).toBe('body')
    })

    /**
     * The whole reason the screen exists. A paid post's media is **not in the payload** its audience
     * receives, so a preview that showed the pictures would be showing the one thing the reader
     * cannot have — and the author would ship a paywall having never seen it.
     */
    it('withholds the media of a paid post and routes to the lock panel', () => {
        const post = buildPreviewPost(
            draft({
                text: 'behind the scenes',
                images: [image('a'), image('b')],
                audience: 'STARGAZERS',
                price: 50,
            }),
            AT,
        )

        expect(post?.images).toBeNull()
        expect(post?.video).toBeNull()
        expect(isLocked(post!)).toBe(true)
        expect(postDisplay(post!)).toBe('locked')
        // The caption survives: on a paid post with media it is the pitch, not the product.
        expect(post?.text).toBe('behind the scenes')
        expect(post?.unlock_detail?.images_count).toBe(2)
    })

    /** A paid post that is only words has nothing else to sell, so the words are the locked thing. */
    it('withholds the caption of a paid text-only post', () => {
        const post = buildPreviewPost(
            draft({ text: 'the secret', audience: 'STARGAZERS', price: 10 }),
            AT,
        )

        expect(post?.text).toBeNull()
        expect(post?.unlock_detail?.text_length).toBe(10)
    })

    /**
     * ⚠ `blur` is **text** on the wire, not a boolean — legacy writes `blur: needUnlockPackage`,
     * which this parser turns into `null`. The author would then be shown their paid picture in
     * full on the very screen meant to prove it is hidden.
     */
    it('marks a paid cover as blurred in a shape the parser keeps', () => {
        const paid = buildPreviewPost(
            draft({ images: [image('a')], audience: 'STARGAZERS', price: 5 }),
            AT,
        )
        expect(paid?.cover_image?.uri).toBe('blob:a')
        expect(paid?.cover_image?.blur).toBeTruthy()

        const free = buildPreviewPost(draft({ images: [image('a')] }), AT)
        expect(free?.cover_image?.blur).toBeNull()
    })

    it('prefers the chosen cover over the first picture', () => {
        const post = buildPreviewPost(
            draft({
                video: video(),
                coverImage: image('chosen'),
                audience: 'STARGAZERS',
                price: 5,
            }),
            AT,
        )
        expect(post?.cover_image?.uri).toBe('blob:chosen')
        expect(post?.unlock_detail?.video_duration_seconds).toBe(42)
    })

    /**
     * The four gate combinations `postGate` names, reached from the draft alone. A preview whose
     * pill said "Become a member" on a post that publishes as buyable would be worse than no pill.
     */
    it.each([
        [{}, 'open'],
        [{ audience: 'STARGAZERS' as const, price: 100 }, 'purchase'],
        [{ audience: 'STARGAZERS' as const, requiredPackages: ['tier-1'] }, 'members'],
        [
            { audience: 'STARGAZERS' as const, price: 100, requiredPackages: ['tier-1'] },
            'members-or-purchase',
        ],
    ])('reaches the %o gate', (overrides, gate) => {
        const post = buildPreviewPost(draft({ text: 'hi', ...overrides }), AT)
        expect(postGate(post!)).toBe(gate)
    })

    /**
     * ⚠ The claim the screen makes. `buildPostBody` decides what is **sent** and this decides what
     * is **shown**; if the two could disagree, the preview would be a lie at exactly the moment it
     * is consulted. They share `isPaywalled`, and this pins that they still do.
     *
     * The case that catches a drift is the one legacy gets wrong: *Exclusive* chosen with neither a
     * tier nor a price names no way in, so it publishes as `EVERYONE`. Legacy's `useReviewPost`
     * reads `isPaid && stargazers` and misses the tier half, so its preview and its publish
     * disagree in both directions.
     */
    it.each([
        [{}],
        [{ audience: 'STARGAZERS' as const }],
        [{ audience: 'STARGAZERS' as const, price: 0 }],
        [{ audience: 'STARGAZERS' as const, price: 100 }],
        [{ audience: 'STARGAZERS' as const, requiredPackages: ['tier-1'] }],
    ])('shows the same audience the publish will send, for %o', overrides => {
        const d = draft({ text: 'hi', ...overrides })
        const body = buildPostBody(d, { images: [], videoId: null, coverImage: null, lang: 'en' })

        expect(buildPreviewPost(d, AT)?.viewer).toBe(body.viewer)
        expect(isPaywalled(d)).toBe(body.viewer === 'STARGAZERS')
    })

    /**
     * The author is looking at somebody else's copy. `is_owner` true would let owner-only
     * affordances into a view whose whole claim is that it shows what a stranger gets.
     */
    it('is not the reader’s own post', () => {
        const post = buildPreviewPost(draft({ text: 'hi' }), AT)
        expect(post?.is_owner).toBe(false)
        expect(post?.reaction_count).toBe(0)
        expect(post?.reply_count).toBe(0)
    })

    it('carries the settings a reader can see', () => {
        const post = buildPreviewPost(
            draft({ text: 'hi', markedNsfw: true, pinned: true, replyAllowedUser: 'NONE' }),
            AT,
        )
        expect(post?.marked_nsfw).toBe(true)
        expect(post?.pinned).toBe(true)
        expect(post?.reply_allowed).toBe(false)
    })

    /** A video draft's `blob:` has to survive `playbackSchema`, which takes a bare string for this. */
    it('keeps a local clip playable', () => {
        const post = buildPreviewPost(draft({ video: video() }), AT)
        expect(post?.video?.playback.url).toBe('blob:clip')
        expect(post?.video?.duration_seconds).toBe(42)
    })

    it('survives an author the composer has not resolved yet', () => {
        const post = buildPreviewPost(draft({ text: 'hi' }), { author: null, now: AT.now })
        expect(post).not.toBeNull()
        expect(post?.channel?.name).toBeNull()
    })
})
