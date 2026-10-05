import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import {
    buildPostDescription,
    buildPostTitle,
    isCanonicalPath,
    mayRenderForCrawler,
    postCanonicalPath,
    postSnippet,
    resolvePostFetchStatus,
} from './post-seo'

function post(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({
        id: 'p1',
        channel: { id: 'c1', slug: 'ada', name: 'Ada' },
        ...overrides,
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

describe('postSnippet', () => {
    /**
     * The trap `channel-seo.ts` documents: `slice` counts UTF-16 units, so cutting mid-emoji emits
     * a lone surrogate half, which renders as `�` in a preview card. Post text is where emoji
     * live, so this is the common case rather than the exotic one.
     */
    it('cuts on code points, never mid-emoji', () => {
        const flags = '🇻🇳'.repeat(10)
        const cut = postSnippet(flags, 4)

        expect(cut.endsWith('…')).toBe(true)
        expect(cut).not.toMatch(/[\uD800-\uDFFF]$/)
        expect([...cut]).toHaveLength(5)
    })

    it('collapses the newlines that make a post readable on screen', () => {
        // `whitespace-pre-wrap` is right in the card and ragged in a preview card.
        expect(postSnippet('one\n\n  two   three', 100)).toBe('one two three')
    })

    it('is empty for nothing, rather than a stray ellipsis', () => {
        expect(postSnippet(null, 10)).toBe('')
        expect(postSnippet('   \n ', 10)).toBe('')
    })
})

describe('buildPostTitle', () => {
    /** Legacy's exact format. Changing it churns the preview of every link already shared. */
    it('is the snippet, the author and the site', () => {
        expect(buildPostTitle(post({ text: 'Hello there' }))).toBe(
            'Hello there - Ada (@ada) | Tevi',
        )
    })

    it('falls back to the author alone when the post has no words', () => {
        expect(buildPostTitle(post({ text: null }))).toBe('Ada (@ada) on Tevi')
    })

    it('drops the name when the channel has none', () => {
        expect(buildPostTitle(post({ text: null, channel: { id: 'c1', slug: 'ada' } }))).toBe(
            '@ada on Tevi',
        )
    })
})

describe('buildPostDescription', () => {
    it('quotes the post when there is text to quote', () => {
        expect(buildPostDescription(post({ text: 'A short note' }))).toBe('A short note')
    })

    /**
     * A gated post's text is **withheld by the backend**, so there is nothing to quote and the
     * sentence has to describe what opening it would give rather than what it says.
     */
    it('says a gated post is exclusive rather than describing content it cannot see', () => {
        const gated = post({ text: null, product_id: 'prod-1', price: 100 })

        expect(buildPostDescription(gated)).toBe(
            'Exclusive content by Ada on Tevi. Follow for more updates.',
        )
    })

    it('has a different sentence for a free post with no text', () => {
        expect(buildPostDescription(post({ text: null }))).toBe(
            'Post by Ada on Tevi. Follow for exclusive content and updates.',
        )
    })
})

describe('postCanonicalPath', () => {
    /**
     * Only the **pathname** of `shareable_url` — the rule `post-link.ts` states, and not tidiness:
     * staging serves URLs pointing at production, so following one whole walks a developer out of
     * the environment they are testing.
     */
    it('takes the path of shareable_url, never its origin', () => {
        const withUrl = post({ shareable_url: 'https://tevi.com/@ada/post/abc' })

        expect(postCanonicalPath(withUrl, 'p1')).toBe('/@ada/post/abc')
    })

    it('constructs one from the code when there is no shareable_url', () => {
        expect(postCanonicalPath(post({ code: 'abc' }), 'p1')).toBe('/@ada/post/abc')
    })

    it('falls back to the identifier the reader used when there is no code either', () => {
        expect(postCanonicalPath(post(), 'p1')).toBe('/@ada/post/p1')
    })

    it('is null without a channel slug, so nothing redirects on a guess', () => {
        expect(postCanonicalPath(post({ channel: null }), 'p1')).toBe(null)
    })
})

describe('isCanonicalPath', () => {
    it('ignores a trailing slash and percent-encoding', () => {
        expect(isCanonicalPath('/%40ada/post/abc/', '/@ada/post/abc')).toBe(true)
    })

    it('ignores the query and hash', () => {
        expect(isCanonicalPath('/@ada/post/abc?utm_source=x#top', '/@ada/post/abc')).toBe(true)
    })

    /**
     * ⚠ Case is significant on purpose. The canonical comes from `shareable_url`, so its slug is
     * already the channel's own casing and its code is the backend's — folding either would report
     * a URL as canonical when it is not, and a post code is case-sensitive.
     */
    it('treats a differently-cased address as not yet canonical', () => {
        expect(isCanonicalPath('/@Ada/post/abc', '/@ada/post/abc')).toBe(false)
        expect(isCanonicalPath('/@ada/post/AbC', '/@ada/post/abc')).toBe(false)
        expect(isCanonicalPath('/@ada/post/abc', '/@ada/post/abc')).toBe(true)
    })

    it('sees a genuinely different post as different', () => {
        expect(isCanonicalPath('/@ada/post/xyz', '/@ada/post/abc')).toBe(false)
    })
})

describe('resolvePostFetchStatus', () => {
    /**
     * The distinction that keeps an outage from reading as a deletion. Only a definitive 404 is
     * `gone`; a 422 is a protected space refusing an anonymous render, and everything else — a
     * 5xx, a network fault — is `unavailable` and must not 404 a live post.
     */
    it('separates gone, restricted and merely unwell', () => {
        expect(resolvePostFetchStatus(new ApiError({ message: 'nope', status: 404 }))).toBe('gone')
        expect(resolvePostFetchStatus(new ApiError({ message: 'nope', status: 422 }))).toBe(
            'restricted',
        )
        expect(resolvePostFetchStatus(new ApiError({ message: 'nope', status: 503 }))).toBe(
            'unavailable',
        )
        expect(resolvePostFetchStatus(new Error('socket hang up'))).toBe('unavailable')
    })
})

describe('mayRenderForCrawler', () => {
    /**
     * This gates what a **scraper** is handed, not what is indexed — nothing here is indexed. A
     * link preview is rendered by the chat app, with no consent gate in front of it and no way for
     * us to put one there, so withholding the words is the only control this surface has.
     */
    it('withholds a deleted post, an NSFW post and a post in an NSFW space', () => {
        expect(mayRenderForCrawler(post({ text: 'fine' }))).toBe(true)
        expect(mayRenderForCrawler(post({ deleted: true }))).toBe(false)
        expect(mayRenderForCrawler(post({ marked_nsfw: true }))).toBe(false)
        expect(mayRenderForCrawler(post({ detected_nsfw: true }))).toBe(false)
        expect(
            mayRenderForCrawler(post({ channel: { id: 'c1', slug: 'ada', is_nsfw: true } })),
        ).toBe(false)
    })
})
