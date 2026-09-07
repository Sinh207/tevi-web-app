import { describe, expect, it } from 'vitest'
import type { StarPackage } from '../api/types'
import {
    defaultPackage,
    MOST_POPULAR_INDEX,
    packageStars,
    pickPackageForShortfall,
    recommendedIndex,
} from './star-packages'

const pkg = (id: string, amount: number, bonus = 0, price = amount / 100): StarPackage =>
    ({ id, amount, bonus_amount: bonus, price }) as StarPackage

const CATALOGUE = [pkg('a', 100), pkg('b', 500), pkg('c', 900, 100), pkg('d', 5000, 500)]

describe('packageStars', () => {
    it('counts the bonus, because the reader receives it', () => {
        expect(packageStars(pkg('c', 900, 100))).toBe(1000)
    })

    it('ignores a negative bonus — the field is loose off the wire', () => {
        expect(packageStars(pkg('x', 100, -50))).toBe(100)
    })
})

describe('pickPackageForShortfall', () => {
    it('picks the cheapest package that covers the gap', () => {
        expect(pickPackageForShortfall(CATALOGUE, 300)?.id).toBe('b')
    })

    it('counts the bonus when covering, so nobody is sold a bigger tier than they need', () => {
        // 900 + 100 bonus covers 1,000. Selecting on `amount` alone would jump to `d`.
        expect(pickPackageForShortfall(CATALOGUE, 1000)?.id).toBe('c')
    })

    it('falls back to the largest when nothing covers the gap', () => {
        expect(pickPackageForShortfall(CATALOGUE, 50_000)?.id).toBe('d')
    })

    it('has no opinion without a gap, or without a catalogue', () => {
        expect(pickPackageForShortfall(CATALOGUE, 0)).toBeNull()
        expect(pickPackageForShortfall(CATALOGUE, Number.NaN)).toBeNull()
        expect(pickPackageForShortfall([], 500)).toBeNull()
    })

    it('takes the exact match rather than the next one up', () => {
        expect(pickPackageForShortfall(CATALOGUE, 500)?.id).toBe('b')
    })
})

describe('defaultPackage', () => {
    it("is legacy's first tile — the backoffice ordering is the recommendation", () => {
        expect(defaultPackage(CATALOGUE)?.id).toBe('a')
        expect(defaultPackage([])).toBeNull()
    })
})

describe('recommendedIndex', () => {
    const tagged = (labels: string[]) => ({ ...pkg('x', 100), labels })

    it('follows the label the backoffice set, not the ordering', () => {
        // The live catalogue tags `500 stars` and lists `300 stars` first; the badge was on the wrong
        // one until this read the field.
        const packages = [tagged([]), tagged(['Most popular']), tagged([])] as StarPackage[]
        expect(recommendedIndex(packages)).toBe(1)
    })

    it('matches the label loosely — casing and padding are the backoffice’s business', () => {
        expect(recommendedIndex([tagged([]), tagged(['  MOST Popular '])] as StarPackage[])).toBe(1)
    })

    it('falls back to the first tile when no row is tagged', () => {
        expect(recommendedIndex([tagged([]), tagged([])] as StarPackage[])).toBe(MOST_POPULAR_INDEX)
    })

    it('takes the first tagged row — two badges would be two recommendations', () => {
        const packages = [
            tagged([]),
            tagged(['Most popular']),
            tagged(['Most popular']),
        ] as StarPackage[]
        expect(recommendedIndex(packages)).toBe(1)
    })

    it('survives a package built without going through the parser', () => {
        // `/dev/get-star` and every test that casts a literal `as StarPackage` produce exactly this.
        const bare = { id: 'a', amount: 100, bonus_amount: 0, price: 1 } as StarPackage
        expect(() => recommendedIndex([bare])).not.toThrow()
        expect(recommendedIndex([bare])).toBe(MOST_POPULAR_INDEX)
    })
})
