import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import {
    allowsReplyLinks,
    hasLink,
    isAttachableImage,
    REPLY_IMAGE_MAX,
    type ReplyDraft,
    type ReplyDraftImage,
    replyDraftProblem,
    replyText,
} from './reply-draft'

function post(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: 'p1', ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

function image(id: string): ReplyDraftImage {
    return {
        id,
        file: new File([], `${id}.jpg`, { type: 'image/jpeg' }),
        previewUrl: `blob:${id}`,
        width: 100,
        height: 100,
    }
}

function draft(overrides: Partial<ReplyDraft> = {}): ReplyDraft {
    return { text: '', images: [], ...overrides }
}

describe('allowsReplyLinks — absence is not a refusal', () => {
    it('honours an explicit false', () => {
        expect(allowsReplyLinks(post({ reply_allowed_link: false }))).toBe(false)
    })

    it('honours an explicit true', () => {
        expect(allowsReplyLinks(post({ reply_allowed_link: true }))).toBe(true)
    })

    /**
     * The bug this whole helper exists to stop. Legacy reads the raw field on the detail page, so a
     * payload without it bans links on every post — and the reader is told about a rule the creator
     * never set.
     */
    it('allows links when the payload does not carry the field', () => {
        expect(allowsReplyLinks(post())).toBe(true)
    })

    /**
     * The field used to be parsed as `nullableText`, which turns a wire boolean into `null`. That is
     * the same "true" case as above by accident rather than by intent — this pins that a real
     * boolean survives the parse, which is what makes the `false` case reachable at all.
     */
    it('parses the wire boolean rather than dropping it', () => {
        expect(post({ reply_allowed_link: false }).reply_allowed_link).toBe(false)
        expect(post({ reply_allowed_link: true }).reply_allowed_link).toBe(true)
        expect(post().reply_allowed_link).toBe(null)
    })
})

describe('hasLink', () => {
    it.each([
        'read https://tevi.com/@ada',
        'read http://example.invalid',
        'www.tevi.com',
        'go to tevi.com for more',
        'mailto:someone@example.com',
    ])('finds a link in %j', text => {
        expect(hasLink(text)).toBe(true)
    })

    it.each(['no links here', 'the price is 4.5 stars', 'hello world'])(
        'finds none in %j',
        text => {
            expect(hasLink(text)).toBe(false)
        },
    )

    /**
     * A scheme-less domain counts, and that is the point: a rule that only matched `https://` could
     * be walked around by deleting five characters, which would make the creator's switch
     * decorative.
     */
    it('catches a bare domain with no scheme', () => {
        expect(hasLink('find me at tevi.com')).toBe(true)
    })
})

describe('isAttachableImage', () => {
    it('accepts the three types the bucket signs for', () => {
        for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
            expect(isAttachableImage({ type })).toBe(true)
        }
    })

    it('refuses anything else, including a GIF and a video', () => {
        expect(isAttachableImage({ type: 'image/gif' })).toBe(false)
        expect(isAttachableImage({ type: 'video/mp4' })).toBe(false)
        expect(isAttachableImage({ type: '' })).toBe(false)
    })
})

describe('replyDraftProblem', () => {
    it("calls an untouched draft 'empty' — the state every composer rests in", () => {
        expect(replyDraftProblem(draft(), { linksAllowed: true })).toBe('empty')
        expect(replyDraftProblem(draft({ text: '   \n ' }), { linksAllowed: true })).toBe('empty')
    })

    it('lets words through', () => {
        expect(replyDraftProblem(draft({ text: 'nice' }), { linksAllowed: true })).toBe(null)
    })

    /**
     * The case legacy's detail bar refuses and its modal allows — pictures with no words is a reply.
     */
    it('lets an images-only draft through', () => {
        expect(replyDraftProblem(draft({ images: [image('a')] }), { linksAllowed: true })).toBe(
            null,
        )
    })

    it('refuses a link only where the creator turned links off', () => {
        const withLink = draft({ text: 'see https://tevi.com' })
        expect(replyDraftProblem(withLink, { linksAllowed: false })).toBe('link')
        expect(replyDraftProblem(withLink, { linksAllowed: true })).toBe(null)
    })

    /**
     * A picture cannot carry a link, so a draft of nothing but images is never refused for one —
     * otherwise the message would name a rule the reader had no way to have broken.
     */
    it('does not refuse an images-only draft for links', () => {
        expect(replyDraftProblem(draft({ images: [image('a')] }), { linksAllowed: false })).toBe(
            null,
        )
    })

    it('refuses more pictures than one reply may carry', () => {
        const images = Array.from({ length: REPLY_IMAGE_MAX + 1 }, (_, i) => image(String(i)))
        expect(replyDraftProblem(draft({ images }), { linksAllowed: true })).toBe('too-many-images')
        expect(
            replyDraftProblem(draft({ images: images.slice(0, REPLY_IMAGE_MAX) }), {
                linksAllowed: true,
            }),
        ).toBe(null)
    })
})

describe('replyText', () => {
    it('trims, and answers null for nothing — so the key can be left off the body', () => {
        expect(replyText(draft({ text: '  hi  ' }))).toBe('hi')
        expect(replyText(draft({ text: '   ' }))).toBe(null)
        expect(replyText(draft())).toBe(null)
    })
})
