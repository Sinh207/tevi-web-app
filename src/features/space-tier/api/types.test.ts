import { describe, expect, it } from 'vitest'
import {
    FALLBACK_TIERS,
    mergeSpaceTier,
    normalizeSpaceTier,
    normalizeSpaceTierEstimate,
} from './types'

describe('normalizeSpaceTier', () => {
    it('reads the fields legacy reads', () => {
        expect(
            normalizeSpaceTier({
                space_tier: 2,
                all_tiers: [0, 1, 2, 5, 10],
                available_tiers: [0, 1, 2],
                tier_images: { '0': 'a.png', '2': 'c.png' },
                can_change: false,
                next_change_allowed_at: 1_900_000_000_000,
            }),
        ).toEqual({
            current: 2,
            tiers: [0, 1, 2, 5, 10],
            available: [0, 1, 2],
            images: { 0: 'a.png', 2: 'c.png' },
            canChange: false,
            cooldownEndsAt: 1_900_000_000_000,
        })
    })

    it('falls back to legacy’s ladder and tier 0 on an empty payload', () => {
        const state = normalizeSpaceTier({})
        expect(state.tiers).toEqual([...FALLBACK_TIERS])
        expect(state.current).toBe(0)
        expect(state.available).toEqual([])
        expect(state.canChange).toBe(false)
        expect(state.cooldownEndsAt).toBeNull()
    })

    it('reads a seconds epoch and an ISO string as milliseconds', () => {
        expect(normalizeSpaceTier({ next_change_allowed_at: 1_900_000_000 }).cooldownEndsAt).toBe(
            1_900_000_000_000,
        )
        expect(
            normalizeSpaceTier({ next_change_allowed_at: '2030-01-01T00:00:00Z' }).cooldownEndsAt,
        ).toBe(Date.parse('2030-01-01T00:00:00Z'))
    })

    it('survives junk in every field', () => {
        expect(() =>
            normalizeSpaceTier({
                space_tier: 'x',
                all_tiers: 'nope',
                tier_images: [1],
                can_change: 'yes',
                next_change_allowed_at: {},
            }),
        ).not.toThrow()
    })
})

describe('mergeSpaceTier', () => {
    it('keeps fields the POST answer leaves out', () => {
        const merged = mergeSpaceTier(
            { space_tier: 1, all_tiers: [0, 1, 2], tier_images: { '1': 'b.png' } },
            { space_tier: 2, can_change: false },
        )
        const state = normalizeSpaceTier(merged)
        expect(state.current).toBe(2)
        expect(state.tiers).toEqual([0, 1, 2])
        expect(state.images).toEqual({ 1: 'b.png' })
    })
})

describe('normalizeSpaceTierEstimate', () => {
    it('indexes revenue by tier and keeps the window', () => {
        expect(
            normalizeSpaceTierEstimate({
                estimates: [
                    { tier: 1, revenue: 12.5 },
                    { tier: 2, revenue: null },
                ],
                based_on_days: 14,
            }),
        ).toEqual({ revenueByTier: { 1: 12.5 }, basedOnDays: 14 })
    })

    it('defaults the window to 30 days', () => {
        expect(normalizeSpaceTierEstimate(null)).toEqual({ revenueByTier: {}, basedOnDays: 30 })
    })
})
