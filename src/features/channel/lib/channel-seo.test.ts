import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { normalizeChannel } from '../api/types'
import {
    buildChannelDescription,
    buildChannelTitle,
    channelProfileJsonLd,
    isIndexableChannel,
    resolveChannelFetchStatus,
    serializeJsonLd,
    truncateByCodePoint,
} from './channel-seo'

function channel(overrides: Record<string, unknown> = {}) {
    const parsed = normalizeChannel({
        id: 1,
        owner_id: 9,
        slug: 'ada',
        name: 'Ada',
        description: 'Writes about looms.',
        privacy: 'public',
        ...overrides,
    })
    if (!parsed) throw new Error('fixture failed to parse')
    return parsed
}

describe('buildChannelTitle', () => {
    /** Changing the format churns every indexed title, so the exact string is the assertion. */
    it('matches legacy exactly', () => {
        expect(buildChannelTitle(channel())).toBe('Ada (@ada) | Content Creator - Tevi')
    })

    it('falls back to the slug when there is no display name', () => {
        expect(buildChannelTitle(channel({ name: null }))).toBe(
            'ada (@ada) | Content Creator - Tevi',
        )
    })
})

describe('truncateByCodePoint', () => {
    it('leaves short text alone', () => {
        expect(truncateByCodePoint('short', 10)).toBe('short')
    })

    /**
     * `slice` counts UTF-16 units, so cutting at a limit can split a surrogate pair and emit a
     * lone half, which renders as `�` in a search result. Emoji in a bio make this common.
     */
    it('never splits a surrogate pair', () => {
        const emoji = '🧶'.repeat(10)
        const cut = truncateByCodePoint(emoji, 5)
        expect(cut).toBe(`${'🧶'.repeat(5)}…`)
        expect(cut).not.toContain('�')
        // Naive slicing is what this avoids: it lands mid-pair.
        expect([...cut].length).toBe(6)
    })
})

describe('buildChannelDescription', () => {
    it('uses the bio, collapsing whitespace', () => {
        expect(buildChannelDescription(channel({ description: 'Two   lines\nhere' }))).toBe(
            'Two lines here',
        )
    })

    it('truncates a long bio to 100 code points', () => {
        const long = 'a'.repeat(200)
        const result = buildChannelDescription(channel({ description: long }))
        expect([...result].length).toBe(101) // 100 + the ellipsis
    })

    it('falls back to a generated line when there is no bio', () => {
        expect(buildChannelDescription(channel({ description: null }))).toBe('Ada on Tevi')
    })
})

describe('isIndexableChannel', () => {
    it('indexes a complete public profile', () => {
        expect(isIndexableChannel(channel())).toBe(true)
    })

    it('refuses every page that should not be in an index', () => {
        const cases: [string, Record<string, unknown>][] = [
            ['nsfw', { is_nsfw: true }],
            ['suspended', { is_suspended: true }],
            ['protected', { privacy: 'protected' }],
            ['unpublished', { privacy: 'unpublished' }],
            ['unparseable privacy', { privacy: 'brand-new' }],
            ['numeric slug', { slug: '12345' }],
            ['no name', { name: null }],
            ['blank name', { name: '   ' }],
            ['no description — a thin page', { description: null }],
        ]
        for (const [label, overrides] of cases) {
            expect(isIndexableChannel(channel(overrides)), label).toBe(false)
        }
    })

    it('does not mistake a slug that merely contains digits for a numeric one', () => {
        expect(isIndexableChannel(channel({ slug: 'ada99' }))).toBe(true)
    })
})

describe('resolveChannelFetchStatus', () => {
    it('is ok when nothing went wrong', () => {
        expect(resolveChannelFetchStatus(null)).toBe('ok')
        expect(resolveChannelFetchStatus(undefined)).toBe('ok')
    })

    it('treats a definitive 404 as gone — the only status that may become notFound()', () => {
        expect(resolveChannelFetchStatus(new ApiError({ message: 'x', status: 404 }))).toBe('gone')
    })

    /**
     * **The most consequential assertion in the feature.** Turning an outage into a 404 tells
     * every crawler that live profiles have been deleted, and nothing in the rendered page
     * would reveal it. Legacy draws the same line for the same reason.
     */
    it('never turns an outage into a 404', () => {
        for (const status of [500, 502, 503, 504]) {
            expect(
                resolveChannelFetchStatus(new ApiError({ message: 'x', status })),
                String(status),
            ).toBe('unavailable')
        }
        // Network failure and the server client's 10s timeout both arrive as isNetwork.
        expect(resolveChannelFetchStatus(new ApiError({ message: 'x', isNetwork: true }))).toBe(
            'unavailable',
        )
        // A status-less ApiError, and anything that is not an ApiError at all.
        expect(resolveChannelFetchStatus(new ApiError({ message: 'x' }))).toBe('unavailable')
        expect(resolveChannelFetchStatus(new Error('boom'))).toBe('unavailable')
        expect(resolveChannelFetchStatus('a string')).toBe('unavailable')
    })

    /** Refused, not absent — so noindex rather than 404. */
    it('separates a refusal from an outage', () => {
        for (const status of [400, 401, 403, 422, 429]) {
            expect(
                resolveChannelFetchStatus(new ApiError({ message: 'x', status })),
                String(status),
            ).toBe('restricted')
        }
    })
})

describe('channelProfileJsonLd', () => {
    it('describes the profile as a ProfilePage over a Person', () => {
        const jsonLd = channelProfileJsonLd(channel())
        expect(jsonLd).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            url: 'https://tevi.dev/@ada',
            mainEntity: { '@type': 'Person', name: 'Ada', alternateName: '@ada' },
        })
    })

    it('omits fields it has no value for rather than emitting null', () => {
        const jsonLd = channelProfileJsonLd(channel({ description: null, images: null }))
        expect(jsonLd.mainEntity).not.toHaveProperty('description')
        expect(jsonLd.mainEntity).not.toHaveProperty('image')
        expect(jsonLd.mainEntity).not.toHaveProperty('sameAs')
    })

    it('lists social links as sameAs, dropping the ones with no url', () => {
        const jsonLd = channelProfileJsonLd(
            channel({
                social_links: [
                    { id: 1, platform: 'x', url: 'https://x.com/ada', title: 'X' },
                    { id: 2, platform: 'custom_link', url: null, title: 'Broken' },
                ],
            }),
        )
        expect(jsonLd.mainEntity).toMatchObject({ sameAs: ['https://x.com/ada'] })
    })
})

describe('serializeJsonLd', () => {
    /**
     * The assertion that caught a real hole: bare `JSON.stringify` leaves `<` and `>` alone, so
     * a bio containing a closing script tag ends our `<script>` early and runs the attacker's.
     * `JSON.stringify` keeping the *JSON* valid is not the same as keeping the *document* safe.
     */
    it('neutralises a bio that tries to close our script tag', () => {
        const bio = '</script><script>alert(1)</script>'
        const serialised = serializeJsonLd(channelProfileJsonLd(channel({ description: bio })))
        expect(serialised).not.toContain('</script>')
        expect(serialised).not.toContain('<')
        expect(serialised).not.toContain('>')
        expect(serialised).toContain('\\u003c')
    })

    it('escapes the ampersand and the two line separators too', () => {
        // U+2028/U+2029 are legal in JSON but illegal raw in a JS string literal.
        const serialised = serializeJsonLd({ a: 'x & y\u2028z\u2029w' })
        expect(serialised).not.toContain('&')
        expect(serialised).not.toContain('\u2028')
        expect(serialised).not.toContain('\u2029')
    })

    /** Escaping must not change the data a crawler reads back. */
    it('round-trips to exactly the same object', () => {
        const jsonLd = channelProfileJsonLd(channel({ description: 'Looms & <heddles>' }))
        expect(JSON.parse(serializeJsonLd(jsonLd))).toEqual(jsonLd)
    })
})
