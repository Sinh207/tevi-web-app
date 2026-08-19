import { describe, expect, it } from 'vitest'
import { canonicalChannelRedirect, parseChannelSlug, toChannelPath } from './channel-slug'

describe('parseChannelSlug', () => {
    it('strips the leading @ and keeps the slug', () => {
        expect(parseChannelSlug('@ada')).toBe('ada')
        expect(parseChannelSlug('@a_b.c-d')).toBe('a_b.c-d')
    })

    /**
     * Legacy does `replaceAll('@', '')`, which turns `@foo@bar` into `foobar` — a different
     * channel, with no error. This is the whole reason the function is not a one-liner.
     */
    it('strips only the leading @, never an inner one', () => {
        // `@` is not in the allowed charset, so an inner one is a rejection, not a rewrite.
        expect(parseChannelSlug('@foo@bar')).toBeNull()
    })

    it('preserves case — the canonical spelling is the creator’s own', () => {
        expect(parseChannelSlug('@Noraazima')).toBe('Noraazima')
        expect(parseChannelSlug('@ADA')).toBe('ADA')
    })

    /**
     * `null` here means `notFound()` with **no upstream request**. `[slug]` matches every
     * unclaimed single-segment path, so without this every bot scan costs a fetch.
     */
    it('rejects anything that is not a channel URL, before any fetch', () => {
        for (const param of [
            'ada', // no @ — a static route's name, or a bot
            '@',
            '@ ',
            '',
            '   ',
            'wp-admin',
            '.env',
            '@wp admin', // space is not in the charset
            '@a/b',
            '@a?b',
            '@a#b',
            undefined,
            null,
        ]) {
            expect(parseChannelSlug(param), String(param)).toBeNull()
        }
    })

    it('tolerates surrounding whitespace on the param itself', () => {
        expect(parseChannelSlug('  @ada  ')).toBe('ada')
    })

    /**
     * **The regression this function shipped with.** Next hands the dynamic segment over
     * percent-encoded, so `/@sinhpn11` arrives as `"%40sinhpn11"` — which does not start with `@`, so
     * every real channel was rejected before any fetch and the page said "This space does not exist"
     * for spaces that exist. An earlier comment in the source asserted that Next decodes; it does not.
     */
    it('accepts the percent-encoded form the router actually passes', () => {
        expect(parseChannelSlug('%40sinhpn11')).toBe('sinhpn11')
        expect(parseChannelSlug('%40ada')).toBe('ada')
        // Case still survives, for the canonical comparison.
        expect(parseChannelSlug('%40Noraazima')).toBe('Noraazima')
    })

    /** A crafted URL will contain a broken escape; `decodeURIComponent` throws on those. */
    it('does not throw on a malformed escape', () => {
        for (const param of ['%', '%zz', '%40%', '@ada%']) {
            expect(() => parseChannelSlug(param), param).not.toThrow()
        }
        expect(parseChannelSlug('%')).toBeNull()
        expect(parseChannelSlug('%zz')).toBeNull()
    })
})

describe('toChannelPath', () => {
    it('is the one place the @ goes back on', () => {
        expect(toChannelPath('ada')).toBe('/@ada')
    })
})

describe('canonicalChannelRedirect', () => {
    it('does not redirect when the spelling already matches', () => {
        expect(canonicalChannelRedirect('ada', 'ada')).toBeNull()
        expect(canonicalChannelRedirect('ada', 'ada', '?tab=media')).toBeNull()
    })

    it('redirects a differently-cased slug to the canonical spelling', () => {
        expect(canonicalChannelRedirect('ada', 'Noraazima')).toBe('/@Noraazima')
        expect(canonicalChannelRedirect('ADA', 'ada')).toBe('/@ada')
    })

    /**
     * `proxy.ts` turns `/@ada/direct-donation` into `/@ada?action=direct_donation`, so a
     * redirect that drops the query swallows the intent the visitor arrived with.
     */
    it('carries the query string through', () => {
        expect(canonicalChannelRedirect('ADA', 'ada', '?action=direct_donation')).toBe(
            '/@ada?action=direct_donation',
        )
        expect(canonicalChannelRedirect('ADA', 'ada', 'tab=media')).toBe('/@ada?tab=media')
        expect(canonicalChannelRedirect('ADA', 'ada', new URLSearchParams({ tab: 'media' }))).toBe(
            '/@ada?tab=media',
        )
    })

    /** Matching legacy: a lone `?` is dropped rather than reproduced. */
    it('emits no trailing ? when there is no query', () => {
        for (const search of ['', '?', null, undefined, new URLSearchParams()]) {
            expect(canonicalChannelRedirect('ADA', 'ada', search)).toBe('/@ada')
        }
    })

    it('does not redirect to an empty slug when the payload had none', () => {
        expect(canonicalChannelRedirect('ada', '')).toBeNull()
    })
})
