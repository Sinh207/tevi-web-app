import { describe, expect, it } from 'vitest'
import { channelEventSchema } from './events-api'

const parse = (fields: Record<string, unknown>) =>
    channelEventSchema.parse({ code: 'c', title: 't', status: 'LIVE', ...fields })

/**
 * The parsing half of the live-access rule.
 *
 * These cases used to be asserted **through** `liveAccess` (now `@features/event/access`), which
 * hid what they were really about: not the product rule, but this schema's willingness to keep a
 * field it cannot read cleanly. They moved here when the rule did, because the failure they pin is
 * the schema's and it is silent — an emptied `required_packages` array makes a members-only stream
 * read as **open**, and the visible half is a paid broadcast advertised as free.
 */
describe('channelEventSchema.required_packages', () => {
    it('reduces a row to an id whichever of the three shapes it arrives in', () => {
        expect(parse({ required_packages: ['pkg'] }).required_packages).toEqual(['pkg'])
        expect(parse({ required_packages: [{ id: 'pkg' }] }).required_packages).toEqual(['pkg'])
        expect(parse({ required_packages: [{ package_id: 'pkg' }] }).required_packages).toEqual([
            'pkg',
        ])
        // A numeric id is still an id — `String()`, not a drop.
        expect(parse({ required_packages: [{ id: 42 }] }).required_packages).toEqual(['42'])
    })

    it('drops a row it cannot reduce without emptying the array', () => {
        // The whole point: one unparseable element must not take the parseable ones with it.
        expect(parse({ required_packages: ['pkg', null, {}, 7, ''] }).required_packages).toEqual([
            'pkg',
        ])
    })

    it('is empty for a payload that omits it, or sends something that is not a list', () => {
        expect(parse({}).required_packages).toEqual([])
        expect(parse({ required_packages: 'pkg' }).required_packages).toEqual([])
    })
})

describe('channelEventSchema.restricted_platforms', () => {
    it('keeps the strings and drops everything else', () => {
        expect(parse({ restricted_platforms: ['Website', 'iOS'] }).restricted_platforms).toEqual([
            'Website',
            'iOS',
        ])
        expect(parse({ restricted_platforms: ['Website', 3, null] }).restricted_platforms).toEqual([
            'Website',
        ])
    })

    /**
     * A bare string is the payload being odd, not a restriction. Empty is the right answer and the
     * event page enforces the same rule server-side: locking a stream out of the website over a
     * parse slip is the worse of the two mistakes.
     */
    it('is empty for a non-list', () => {
        expect(parse({ restricted_platforms: 'Website' }).restricted_platforms).toEqual([])
        expect(parse({}).restricted_platforms).toEqual([])
    })
})

describe('channelEventSchema.status', () => {
    it('upper-cases, so no call site has to know the wire is inconsistent', () => {
        expect(parse({ status: 'live' }).status).toBe('LIVE')
        expect(parse({ status: '  Ended ' }).status).toBe('ENDED')
    })

    it('is null for anything that is not a string', () => {
        expect(parse({ status: 3 }).status).toBeNull()
        expect(parse({ status: null }).status).toBeNull()
    })
})

describe('channelEventSchema timestamps', () => {
    it('normalises epoch milliseconds to an ISO string', () => {
        expect(parse({ start_at: 1_700_000_000_000 }).start_at).toBe(
            new Date(1_700_000_000_000).toISOString(),
        )
    })

    /** Seconds, the other spelling this service uses — `< 1e11` is the discriminator. */
    it('normalises epoch seconds too', () => {
        expect(parse({ start_at: 1_700_000_000 }).start_at).toBe(
            new Date(1_700_000_000_000).toISOString(),
        )
    })

    it('keeps an ISO string as it arrived', () => {
        expect(parse({ start_at: '2026-01-02T03:04:05Z' }).start_at).toBe('2026-01-02T03:04:05Z')
    })

    it('is null for a zero, a negative, or unparseable text', () => {
        expect(parse({ start_at: 0 }).start_at).toBeNull()
        expect(parse({ start_at: -1 }).start_at).toBeNull()
        expect(parse({ start_at: 'soon' }).start_at).toBeNull()
        expect(parse({}).start_at).toBeNull()
    })
})
