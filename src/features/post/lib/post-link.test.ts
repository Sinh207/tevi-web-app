import { describe, expect, it } from 'vitest'
import { postHref, postPath } from './post-link'

describe('postPath', () => {
    /**
     * The reason this function exists at all: `shareable_url` is minted by a service that does not
     * know which host the reader is on, so **staging serves URLs pointing at production**. Following
     * one whole walks a developer out of the environment they are testing, session included.
     */
    it('keeps only the path of an absolute URL', () => {
        expect(postPath({ shareable_url: 'https://tevi.com/@ada/post/abc' })).toBe('/@ada/post/abc')
        expect(postPath({ shareable_url: 'https://stg.tevi.com/@ada/post/abc' })).toBe(
            '/@ada/post/abc',
        )
    })

    /**
     * The query is dropped deliberately. What the backend appends is share attribution, and carrying
     * it into an in-app navigation would credit an internal click to whichever campaign last touched
     * the row.
     */
    it('drops the query and the hash', () => {
        expect(postPath({ shareable_url: 'https://tevi.com/@ada/post/abc?utm_source=x#top' })).toBe(
            '/@ada/post/abc',
        )
    })

    it('accepts a relative value without letting the fake origin escape', () => {
        expect(postPath({ shareable_url: '/@ada/post/abc' })).toBe('/@ada/post/abc')
    })

    it('keeps a percent-encoded slug exactly as the backend spelled it', () => {
        expect(postPath({ shareable_url: 'https://tevi.com/%40ada/post/abc' })).toBe(
            '/%40ada/post/abc',
        )
    })

    /**
     * `null`, not a throw and not `/`. A post with no `shareable_url` is ordinary — an optimistic
     * row the composer has not had confirmed yet — and the caller turns `null` into "not a link"
     * rather than a link to the home page.
     */
    it('answers null for anything unusable', () => {
        expect(postPath({ shareable_url: null })).toBeNull()
        expect(postPath({ shareable_url: '' })).toBeNull()
        expect(postPath({ shareable_url: '   ' })).toBeNull()
        expect(postPath({ shareable_url: 'not a url at all' })).toBeNull()
        // Relative-but-not-path-absolute. `URL` with a base resolves it happily; the app must not.
        expect(postPath({ shareable_url: '@ada/post/abc' })).toBeNull()
    })

    /**
     * A scheme that is not http(s) must not produce a path either. `javascript:` never reaches an
     * `href` from here — the card renders `null` as "not a link" — but the guard is cheap and the
     * one place it could matter is a future caller that does something else with the value.
     */
    it('answers null for a non-http scheme', () => {
        expect(postPath({ shareable_url: 'javascript:alert(1)' })).toBeNull()
        expect(postPath({ shareable_url: 'data:text/html,hi' })).toBeNull()
    })
})

describe('postHref', () => {
    const url = 'https://tevi.com/@ada/post/abc'

    it('navigates for an ordinary post', () => {
        expect(postHref({ shareable_url: url, deleted: false })).toBe('/@ada/post/abc')
    })

    /**
     * Legacy blanks `postDetailUrl` on `isPostDeleted`, which is what stops a reader tapping a
     * "this post is no longer available" card to be shown the same sentence on a page of its own.
     */
    it('does not navigate for a tombstone', () => {
        expect(postHref({ shareable_url: url, deleted: true })).toBeNull()
    })

    /** The caller is already on the post's page, or is rendering a preview. */
    it('does not navigate when the caller disables it', () => {
        expect(postHref({ shareable_url: url, deleted: false }, { disabled: true })).toBeNull()
    })
})
