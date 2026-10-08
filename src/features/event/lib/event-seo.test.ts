import { describe, expect, it } from 'vitest'
import { eventDetailSchema } from '../api/types'
import {
    buildEventDescription,
    buildEventTitle,
    collapseWhitespace,
    eventCanonicalPath,
    eventJsonLd,
    formatEventDateForSeo,
    mayDescribeEventForCrawler,
    truncateForSeo,
} from './event-seo'

const event = (fields: Record<string, unknown> = {}) =>
    eventDetailSchema.parse({
        code: 'abc',
        title: 'Friday night jam',
        status: 'LIVE',
        channel: { id: '1', slug: 'ada', name: 'Ada' },
        ...fields,
    })

describe('truncateForSeo', () => {
    it('leaves a short string alone', () => {
        expect(truncateForSeo('A stream', 70)).toBe('A stream')
    })

    it('collapses whitespace, which creator-typed titles are full of', () => {
        expect(truncateForSeo('  A   stream\n\n', 70)).toBe('A stream')
    })

    it('cuts at a word boundary when one is available late enough', () => {
        expect(truncateForSeo('one two three four five', 14)).toBe('one two three…')
    })

    /**
     * Legacy's 60% rule. Without it a title whose first space falls early gets cut to almost
     * nothing — the boundary is only worth honouring when it is not throwing the text away.
     */
    it('ignores a word boundary that would throw most of the text away', () => {
        expect(truncateForSeo('a verylongsinglewordhere', 12)).toBe('a verylongsi…')
    })

    /**
     * ⚠ Cut by **code point**, not by `length`. A limit landing between the two halves of an emoji
     * leaves a lone surrogate, which renders as a replacement glyph in the one place these strings
     * go — a share card. Creator-typed titles are full of emoji.
     */
    it('never splits an astral character in half', () => {
        const out = truncateForSeo('🎸🎸🎸🎸🎸', 3)
        expect(out).toBe('🎸🎸🎸…')
        expect(out).not.toContain('�')
        // Three glyphs plus the ellipsis, which is four code points and *seven* UTF-16 units.
        expect(Array.from(out)).toHaveLength(4)
    })

    it('strips trailing punctuation before the ellipsis', () => {
        expect(truncateForSeo('hello world, more text', 13)).toBe('hello world…')
    })
})

describe('collapseWhitespace', () => {
    it('answers an empty string for nothing at all', () => {
        expect(collapseWhitespace(null)).toBe('')
        expect(collapseWhitespace(undefined)).toBe('')
        expect(collapseWhitespace('   ')).toBe('')
    })
})

describe('formatEventDateForSeo', () => {
    /**
     * Pinned to UTC **and named**, which is what makes the string honest rather than merely stable:
     * a description is rendered once on the server, cached, and read by a scraper in any zone.
     * Legacy prints its own with no zone, so the same share card means a different hour depending
     * on which server rendered it.
     */
    it('prints a UTC-labelled stamp', () => {
        expect(formatEventDateForSeo('2026-02-20T14:30:00Z')).toBe('Feb 20, 2026, 14:30 UTC')
    })

    it('is empty for nothing usable, so the caller can drop the clause', () => {
        expect(formatEventDateForSeo(null)).toBe('')
        expect(formatEventDateForSeo('soon')).toBe('')
    })
})

describe('buildEventTitle', () => {
    it('leads with the event and follows with the author', () => {
        expect(buildEventTitle(event(), 'Untitled event')).toBe(
            'Friday night jam - Ada (@ada) on Tevi',
        )
    })

    it('falls back to the handle when the space has no name', () => {
        expect(buildEventTitle(event({ channel: { id: '1', slug: 'ada' } }), 'Untitled')).toBe(
            'Friday night jam - @ada on Tevi',
        )
    })

    it('uses the caller fallback when the event has no title of its own', () => {
        expect(buildEventTitle(event({ title: null }), 'Untitled event')).toBe(
            'Untitled event - Ada (@ada) on Tevi',
        )
    })
})

describe('buildEventDescription', () => {
    it('joins only the parts that exist', () => {
        expect(
            buildEventDescription(event({ description: 'Two hours of covers.' }), 'Join Ada.'),
        ).toBe('Two hours of covers. · Join Ada.')
    })

    /**
     * The reason this is assembled rather than templated: legacy's
     * `` `${date} - ${description} Join …` `` opens with a stray separator for the majority of
     * events, which have no description.
     */
    it('opens with no stray separator when there is no description', () => {
        expect(buildEventDescription(event(), 'Join Ada.')).toBe('Join Ada.')
        expect(
            buildEventDescription(event({ start_at: '2026-02-20T14:30:00Z' }), 'Join Ada.'),
        ).toBe('Feb 20, 2026, 14:30 UTC · Join Ada.')
    })
})

describe('eventCanonicalPath', () => {
    it('is the space slug and the code', () => {
        expect(eventCanonicalPath(event())).toBe('/@ada/event/abc')
    })
})

describe('eventJsonLd', () => {
    it('states the attendance mode, which a consumer otherwise assumes is offline', () => {
        expect(eventJsonLd(event(), 'Untitled').eventAttendanceMode).toBe(
            'https://schema.org/OnlineEventAttendanceMode',
        )
    })

    it('marks a cancelled stream cancelled', () => {
        expect(eventJsonLd(event({ status: 'CANCELLED' }), 'Untitled').eventStatus).toBe(
            'https://schema.org/EventCancelled',
        )
    })

    /** `started_at` where it exists — a stream that began late must not advertise the schedule. */
    it('prefers the actual start over the scheduled one', () => {
        const ld = eventJsonLd(
            event({ start_at: '2026-02-20T14:00:00Z', started_at: '2026-02-20T14:20:00Z' }),
            'Untitled',
        )
        expect(ld.startDate).toBe('2026-02-20T14:20:00Z')
    })

    it('publishes a free stream at a price of zero, which is a fact', () => {
        expect(eventJsonLd(event({ price: '0' }), 'Untitled').offers).toMatchObject({ price: '0' })
    })

    /**
     * ⚠ The important negative. An absent price must **not** become `0` — that is the machine-readable
     * form of the "Unlock for 0 ⭐" bug `liveAccess` documents, and this one is eligible for a rich
     * result. Same for members-only, whose price is not expressible as a figure at all.
     */
    it('omits offers entirely when the price is unknown or the stream is members-only', () => {
        expect(eventJsonLd(event(), 'Untitled').offers).toBeUndefined()
        expect(eventJsonLd(event({ price: 'free' }), 'Untitled').offers).toBeUndefined()
        expect(
            eventJsonLd(event({ price: '250', required_packages: ['pkg'] }), 'Untitled').offers,
        ).toBeUndefined()
    })

    it('carries the Star currency verbatim rather than inventing an ISO code', () => {
        expect(
            eventJsonLd(event({ price: '250', price_currency: 'TVS' }), 'Untitled').offers,
        ).toMatchObject({ priceCurrency: 'TVS' })
        // Absent on the wire: `TVS` is the documented default, not a guess at fiat.
        expect(eventJsonLd(event({ price: '250' }), 'Untitled').offers).toMatchObject({
            priceCurrency: 'TVS',
        })
    })

    it('gives the event a virtual location, because Event requires one', () => {
        expect(eventJsonLd(event(), 'Untitled').location).toMatchObject({
            '@type': 'VirtualLocation',
        })
    })

    it('names the organizer and links their space', () => {
        expect(eventJsonLd(event(), 'Untitled').organizer).toMatchObject({
            '@type': 'Organization',
            name: 'Ada',
        })
    })
})

describe('mayDescribeEventForCrawler', () => {
    it('describes an ordinary stream', () => {
        expect(mayDescribeEventForCrawler(event())).toBe(true)
    })

    it('withholds a stream on an NSFW space', () => {
        expect(
            mayDescribeEventForCrawler(
                event({ channel: { id: '1', slug: 'ada', name: 'Ada', is_nsfw: true } }),
            ),
        ).toBe(false)
    })

    it('withholds an 18+ stream, whose banner the page itself gates', () => {
        expect(mayDescribeEventForCrawler(event({ age_restriction: true }))).toBe(false)
    })
})
