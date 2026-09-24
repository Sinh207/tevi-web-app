import { describe, expect, it } from 'vitest'
import { thumborBlurUrl, thumborSquareUrl } from './thumbor'

/**
 * The base is read through `serverEnv()`, which parses **once per process** and caches — so these
 * cases run against the built-in fallback rather than trying to swap the variable between them. The
 * fallback is the value that matters anyway: it is what every environment currently uses, and a
 * deploy that never sets `THUMBOR_IMAGE_BASE` is the case a per-test override would hide.
 */
const BASE = 'https://imge.cdn.flowstreamx.com/unsafe'
const AVATAR = 'https://static.tevicdn.com/Channel/Images/tevi/blank.png'

describe('thumborSquareUrl', () => {
    it('asks for a square at the size given', () => {
        expect(thumborSquareUrl(AVATAR, 192)).toBe(`${BASE}/192x192/${AVATAR}`)
        expect(thumborSquareUrl(AVATAR, 512)).toBe(`${BASE}/512x512/${AVATAR}`)
    })

    /**
     * `null` in, `null` out, at every rejection — the callers write `icon && { src: icon }`, so an
     * unusable source has to *drop* the entry rather than produce one pointing at a broken URL. A
     * manifest icon that 404s installs a blank square, and nothing reports it.
     */
    it('answers null for nothing to point at', () => {
        expect(thumborSquareUrl(null, 192)).toBeNull()
        expect(thumborSquareUrl(undefined, 192)).toBeNull()
        expect(thumborSquareUrl('', 192)).toBeNull()
    })

    /**
     * Absolute `http(s)` only. The API sends fully-qualified URLs, so anything else is a payload we
     * do not understand — and this string is interpolated into a `<link href>` and a manifest
     * `src`, neither of which should be handed a scheme nobody checked.
     */
    it('refuses a source that is not an absolute http(s) URL', () => {
        expect(thumborSquareUrl('/Channel/Images/tevi/blank.png', 192)).toBeNull()
        expect(thumborSquareUrl('Channel/Images/tevi/blank.png', 192)).toBeNull()
        expect(thumborSquareUrl('javascript:alert(1)', 192)).toBeNull()
        expect(thumborSquareUrl('data:image/png;base64,AAAA', 192)).toBeNull()
    })

    it('refuses a size that is not a positive whole number of pixels', () => {
        expect(thumborSquareUrl(AVATAR, 0)).toBeNull()
        expect(thumborSquareUrl(AVATAR, -192)).toBeNull()
        expect(thumborSquareUrl(AVATAR, 192.5)).toBeNull()
        expect(thumborSquareUrl(AVATAR, Number.NaN)).toBeNull()
    })

    /** A trailing slash on the base would otherwise leave `//192x192/`, an empty size segment. */
    it('never doubles the slash between the base and the size', () => {
        expect(thumborSquareUrl(AVATAR, 192)).not.toContain('unsafe//')
    })

    /**
     * The source keeps its own query string. Stripping it would break any CDN that signs URLs that
     * way; the proxy resolves the rest of the line as the source URL either way.
     */
    it('keeps a signed source URL intact', () => {
        expect(thumborSquareUrl(`${AVATAR}?v=2`, 192)).toBe(`${BASE}/192x192/${AVATAR}?v=2`)
    })
})

describe('thumborBlurUrl', () => {
    it('asks the proxy for a blurred copy, source appended as-is', () => {
        expect(thumborBlurUrl('https://static.tevicdn.com/a/b.png?v=1', 40)).toBe(
            'https://imge.cdn.flowstreamx.com/unsafe/filters:blur(40)/https://static.tevicdn.com/a/b.png?v=1',
        )
    })

    it.each([null, undefined, '', 'not a url', 'javascript:alert(1)', 'data:image/png;base64,AA'])(
        'returns null for %s',
        source => {
            expect(thumborBlurUrl(source as string | null | undefined, 40)).toBeNull()
        },
    )

    it('refuses a radius that is not a positive integer', () => {
        expect(thumborBlurUrl('https://x.dev/a.png', 0)).toBeNull()
        expect(thumborBlurUrl('https://x.dev/a.png', 2.5)).toBeNull()
    })
})
