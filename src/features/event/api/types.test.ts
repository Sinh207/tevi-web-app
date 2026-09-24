import { describe, expect, it } from 'vitest'
import { eventDetailSchema, normalizeEvent } from './types'

const body = (fields: Record<string, unknown> = {}) => ({
    code: 'abc',
    title: 'A stream',
    status: 'LIVE',
    channel: { id: 7, slug: 'ada' },
    ...fields,
})

describe('normalizeEvent — the two required fields', () => {
    it('parses a minimal body', () => {
        const event = normalizeEvent(body())
        expect(event?.code).toBe('abc')
        expect(event?.channel?.slug).toBe('ada')
        // Numeric ids are normalised to strings, because the services disagree about which they send.
        expect(event?.channel?.id).toBe('7')
    })

    /** No code: no share URL, no purchase, no identity. */
    it('refuses a body with no code', () => {
        expect(normalizeEvent(body({ code: null }))).toBeNull()
        expect(normalizeEvent(body({ code: '  ' }))).toBeNull()
    })

    /** No slug: the host card links nowhere and the canonical URL cannot be built. */
    it('refuses a body with no channel, or a channel with no slug', () => {
        expect(normalizeEvent(body({ channel: null }))).toBeNull()
        expect(normalizeEvent(body({ channel: { id: '7' } }))).toBeNull()
    })

    it('refuses something that is not an object at all', () => {
        expect(normalizeEvent(null)).toBeNull()
        expect(normalizeEvent('nope')).toBeNull()
    })
})

/**
 * Everything else fails **soft**. `null` from `normalizeEvent` means "this is not an event" and the
 * caller turns it into a 404 — it must never mean "one field was odd", or a stream with no banner
 * would render somebody a broken-link page.
 */
describe('normalizeEvent — everything else fails soft', () => {
    it('survives a payload with nothing optional in it', () => {
        const event = normalizeEvent(body())
        expect(event).not.toBeNull()
        expect(event?.description).toBeNull()
        expect(event?.price).toBeNull()
        expect(event?.product_id).toBeNull()
        expect(event?.images.banner).toBeNull()
        expect(event?.required_packages).toEqual([])
        expect(event?.restricted_platforms).toEqual([])
        expect(event?.age_restriction).toBe(false)
        expect(event?.purchased).toBe(false)
        expect(event?.need_unlock_package).toBe(false)
    })

    it('survives every optional field arriving as the wrong type', () => {
        const event = normalizeEvent(
            body({
                description: 42,
                price: {},
                product_id: [],
                images: 'banner.png',
                required_packages: 'pkg',
                restricted_platforms: 'Website',
                age_restriction: 'yes',
                start_at: 'soon',
            }),
        )
        expect(event).not.toBeNull()
        expect(event?.description).toBeNull()
        expect(event?.price).toBeNull()
        expect(event?.images.banner).toBeNull()
        expect(event?.required_packages).toEqual([])
        expect(event?.restricted_platforms).toEqual([])
        expect(event?.start_at).toBeNull()
        // `boolish` coerces, so a non-empty string is `true` — which is the fail-**closed**
        // direction for an age flag and therefore the right way round.
        expect(event?.age_restriction).toBe(true)
    })
})

describe('eventDetailSchema.required_packages', () => {
    /**
     * The array trapdoor, defended twice in this repo. Filtering to `typeof === 'string'` emptied
     * the array for a payload of objects, `liveAccess` then read a members-only stream as **open**,
     * and a paid broadcast was advertised as free with nothing throwing.
     */
    it('reduces a row to an id whichever of the shapes it arrives in', () => {
        const parse = (rows: unknown) =>
            eventDetailSchema.parse(body({ required_packages: rows })).required_packages
        expect(parse(['pkg'])).toEqual(['pkg'])
        expect(parse([{ id: 'pkg' }])).toEqual(['pkg'])
        expect(parse([{ package_id: 'pkg' }])).toEqual(['pkg'])
        expect(parse([{ id: 42 }])).toEqual(['42'])
        // One unparseable element must not take the parseable ones with it.
        expect(parse(['pkg', null, {}, 7, ''])).toEqual(['pkg'])
    })
})

describe('eventDetailSchema timestamps', () => {
    it('normalises epoch milliseconds and seconds to ISO', () => {
        expect(eventDetailSchema.parse(body({ start_at: 1_700_000_000_000 })).start_at).toBe(
            new Date(1_700_000_000_000).toISOString(),
        )
        expect(eventDetailSchema.parse(body({ start_at: 1_700_000_000 })).start_at).toBe(
            new Date(1_700_000_000_000).toISOString(),
        )
    })

    it('keeps an ISO string as it arrived, so a caller can put it in dateTime verbatim', () => {
        expect(eventDetailSchema.parse(body({ ended_at: '2026-02-20T12:00:00Z' })).ended_at).toBe(
            '2026-02-20T12:00:00Z',
        )
    })

    it('is null for a zero, a negative, or unparseable text', () => {
        for (const value of [0, -1, 'soon', '']) {
            expect(
                eventDetailSchema.parse(body({ start_at: value })).start_at,
                String(value),
            ).toBeNull()
        }
    })
})

describe('eventDetailSchema.status', () => {
    it('upper-cases, so no call site has to know the wire is inconsistent', () => {
        expect(eventDetailSchema.parse(body({ status: '  live ' })).status).toBe('LIVE')
    })

    it('is null for anything that is not a string', () => {
        expect(eventDetailSchema.parse(body({ status: 3 })).status).toBeNull()
    })
})

/**
 * `looseObject`, so the live-session fields this pass does not read — `allow_chat`, `paid_chat`,
 * `paid_interactions`, `visibility`, `host` — survive the parse and reach whoever builds the player.
 * Declaring them now would be anticipation; losing them would be a schema change later.
 */
describe('eventDetailSchema keeps what it does not declare', () => {
    it('carries the player fields through untouched', () => {
        const parsed = eventDetailSchema.parse(body({ paid_chat: true, host: 'u1' })) as Record<
            string,
            unknown
        >
        expect(parsed.paid_chat).toBe(true)
        expect(parsed.host).toBe('u1')
    })
})
