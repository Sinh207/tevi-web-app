import { describe, expect, it } from 'vitest'
import { spaceTierBadge } from './space-tier'

describe('spaceTierBadge', () => {
    const image = 'https://static.tevicdn.com/tier.png'

    it('draws the mark from tier 1 up', () => {
        expect(spaceTierBadge({ space_tier: 3, space_tier_image: image })).toBe(image)
    })

    /**
     * The bug this prevents: every channel has a `space_tier` and most are `0`, and the backend
     * still sends an image alongside. Gate on the image alone and every ordinary channel wears a
     * tier badge it has not earned.
     */
    it('draws nothing at tier 0, even though an image is sent', () => {
        expect(spaceTierBadge({ space_tier: 0, space_tier_image: image })).toBe(null)
    })

    /**
     * The backend's rungs are 0, 1, 2, 5, 10 — not consecutive. So the gate is a comparison against
     * zero and nothing else: no upper bound, no step assumption, no index into a list.
     */
    it('draws every rung above zero, however far apart they are', () => {
        for (const tier of [1, 2, 5, 10, 47]) {
            expect(spaceTierBadge({ space_tier: tier, space_tier_image: image })).toBe(image)
        }
    })

    it('draws nothing when the tier is absent or the image is', () => {
        expect(spaceTierBadge({ space_tier_image: image })).toBe(null)
        expect(spaceTierBadge({ space_tier: null, space_tier_image: image })).toBe(null)
        expect(spaceTierBadge({ space_tier: Number.NaN, space_tier_image: image })).toBe(null)
        expect(spaceTierBadge({ space_tier: 3 })).toBe(null)
        expect(spaceTierBadge(null)).toBe(null)
    })
})
