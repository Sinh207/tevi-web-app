import { describe, expect, it } from 'vitest'
import { MEMBERSHIP_FEE_RATE, membershipChargedTotal, membershipFee } from './membership-fee'

describe('membershipFee', () => {
    it('applies legacy’s formula', () => {
        // (0.059 × 5 + 0.3) / 0.941 = 0.6323… → 0.63
        expect(membershipFee(5)).toBe(0.63)
    })

    it('grosses up so the creator receives the tier price', () => {
        // The processor takes its cut of the **total**, so the fee is computed from the total:
        // 5.9% of 5.63 + 0.30 = 0.632, which is the fee itself.
        const fee = membershipFee(5)
        const total = membershipChargedTotal(5)
        expect(total).toBe(5.63)
        expect(
            Math.round((total * MEMBERSHIP_FEE_RATE.percent + MEMBERSHIP_FEE_RATE.flat) * 100) /
                100,
        ).toBe(fee)
    })

    it('stays a fraction of the price, not a multiple of it', () => {
        expect(membershipFee(100)).toBeGreaterThan(0)
        expect(membershipFee(100)).toBeLessThan(100 * 0.15)
    })

    it('matches legacy cent for cent — the rate has no endpoint to check it against (B71)', () => {
        /*
         * The backend's answer to B71 is that there is **no fee API for memberships** and the client
         * should mirror the legacy web app. So legacy's expression *is* the specification, and this
         * asserts against a transcription of it rather than against numbers somebody typed here:
         *
         *   src/components/membership/checkout/content/index.js:52
         *   src/containers/app/membershipDetails/hooks/useMembershipDetails.js:33
         *   → Math.round(((0.059 * price + 0.3) / 0.941) * 100) / 100
         *
         * Every whole cent from $0.01 to $200.00 is checked because a gross-up divides, and a
         * transcription error there is invisible at $5 and material at $500.
         */
        const legacy = (price: number) =>
            price ? Math.round(((0.059 * price + 0.3) / 0.941) * 100) / 100 : 0

        const mismatches: number[] = []
        for (let cents = 1; cents <= 20_000; cents += 1) {
            const price = cents / 100
            if (membershipFee(price) !== legacy(price)) mismatches.push(price)
        }
        expect(mismatches).toEqual([])
    })

    it('rounds the charge to cents, where legacy carries a sub-cent price through', () => {
        /*
         * The one deliberate divergence, and it only exists for a price with more than two decimals:
         * legacy scrubs float noise at 1e-12 (`Math.round((price + fee) * 1e12) / 1e12`) and would
         * print a total of $5.629. Nothing can charge that. Tier prices arrive as decimal strings and
         * are whole cents in practice, so this is a guard on an input that should not occur rather
         * than a difference in the fee itself — the fee agrees even here.
         */
        expect(membershipFee(4.999)).toBe(0.63)
        expect(membershipChargedTotal(4.999)).toBe(5.63)
    })

    it('is a different rate from a donation’s, deliberately', () => {
        // 5.9% + $0.30, where the donation endpoint answers its own coefficients. Same shape, and
        // that is exactly why they are easy to conflate.
        expect(MEMBERSHIP_FEE_RATE.percent).toBe(0.059)
    })

    it('answers 0 for a price that is not one', () => {
        for (const value of [0, -5, Number.NaN, null, undefined]) {
            expect(membershipFee(value as number)).toBe(0)
        }
        expect(membershipChargedTotal(null)).toBe(0)
    })
})
