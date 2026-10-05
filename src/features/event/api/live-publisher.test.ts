import { describe, expect, it } from 'vitest'
import { livePublisherSchema } from './live-types'

const base = { id: 'u1', name: 'Ada', avatar: null, audio: true, video: true, is_host: false }

/**
 * **B120** — the room's publishers carry no slug that legacy reads, so a co-host's card has no way
 * to their space. The parser tries the three spellings a Tevi payload uses elsewhere; whichever the
 * service sends lights *View space*, and none of them leaves it off rather than wrong.
 */
describe('livePublisherSchema', () => {
    it('reads the slug under any of its three spellings', () => {
        for (const key of ['channel_slug', 'slug', 'username']) {
            expect(livePublisherSchema.parse({ ...base, [key]: ' ada ' }).channel_slug).toBe('ada')
        }
    })

    it('has no slug when the payload carries none', () => {
        expect(livePublisherSchema.parse(base).channel_slug).toBeNull()
    })

    it('reads the Premium badge as the chat reads it', () => {
        expect(
            livePublisherSchema.parse({ ...base, premium_badge: { image: 'https://cdn/p.png' } })
                .premium_badge,
        ).toEqual({ image: 'https://cdn/p.png' })
        expect(livePublisherSchema.parse(base).premium_badge).toBeNull()
    })
})
