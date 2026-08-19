import { describe, expect, it } from 'vitest'
import { nextPageParam, paramsFromNextUrl } from './next-page-param'

describe('paramsFromNextUrl', () => {
    it('keeps the query and discards the host', () => {
        expect(
            paramsFromNextUrl(
                'https://wapi.tevi.com/core/v3/channel/x/threads/?limit=20&created_at_lt=17',
            ),
        ).toEqual({ limit: ['20'], created_at_lt: ['17'] })
    })

    /**
     * The reason the host is dropped rather than followed: an internal hostname resolves
     * nowhere from a browser, and a non-W_API origin silently receives no bearer.
     */
    it('handles an internal cluster hostname', () => {
        expect(paramsFromNextUrl('http://tevi-channel/tevi-channel/v3/x/?limit=21')).toEqual({
            limit: ['21'],
        })
    })

    it('accepts a relative next', () => {
        expect(paramsFromNextUrl('?limit=20')).toEqual({ limit: ['20'] })
        expect(paramsFromNextUrl('/core/v3/x/?limit=20')).toEqual({ limit: ['20'] })
    })

    /**
     * Collapsing this to one value narrows the media tab from images+videos to videos on
     * page two — and the list keeps loading, so nothing looks wrong.
     */
    it('keeps a repeated key as every value it had', () => {
        expect(paramsFromNextUrl('?media_type=image&media_type=video&limit=21')).toEqual({
            media_type: ['image', 'video'],
            limit: ['21'],
        })
    })

    /** A stale signature is worse than none — the interceptor mints a fresh one per request. */
    it('strips our own verify signature', () => {
        expect(paramsFromNextUrl('https://wapi.tevi.com/x/?limit=20&verify=abc123')).toEqual({
            limit: ['20'],
        })
    })

    /**
     * `null` rather than `{}`: an empty cursor would re-request page one forever, which reads
     * as an infinite list that simply never ends.
     */
    it('returns null when there is no usable cursor', () => {
        for (const next of [
            null,
            undefined,
            '',
            '   ',
            'not a url',
            'https://wapi.tevi.com/x/', // no query at all
            'https://wapi.tevi.com/x/?', // empty query
            'https://wapi.tevi.com/x/?verify=abc', // only our own signature
        ]) {
            expect(paramsFromNextUrl(next), String(next)).toBeNull()
        }
    })
})

describe('nextPageParam', () => {
    /**
     * `undefined` is what stops TanStack Query. `null` is a *valid* page param, so returning
     * it leaves `hasNextPage` true forever and the sentinel keeps firing.
     */
    it('returns undefined, not null, when the list is exhausted', () => {
        expect(nextPageParam(null)).toBeUndefined()
        expect(nextPageParam('https://wapi.tevi.com/x/')).toBeUndefined()
    })

    it('returns the cursor while there are more pages', () => {
        expect(nextPageParam('?created_at_lt=17')).toEqual({ created_at_lt: ['17'] })
    })
})
