import { describe, expect, it } from 'vitest'
import { giftPackageThumb, normalizeGiftPackages, splitGiftPackages } from './gift-types'

const row = (over: Record<string, unknown> = {}) => ({
    id: 12,
    quantity: 10,
    price: '99.00',
    price_currency: 'TVS',
    product: {
        slug: 'rose',
        name: 'Rose',
        logo: 'https://cdn/rose-logo.png',
        images: {
            thumb: 'https://cdn/rose.png',
            anim_background: 'https://cdn/rose-bg.png',
            animation: 'https://cdn/rose.svga',
        },
        exclusive: '',
        required_level: '0',
    },
    ...over,
})

describe('normalizeGiftPackages', () => {
    it('reads a page of the catalogue off the unwrapped envelope', () => {
        const [pkg] = normalizeGiftPackages({ count: 1, results: [row()] })
        expect(pkg).toMatchObject({ id: 12, quantity: 10, price_currency: 'TVS' })
        expect(pkg.product?.images?.animation).toBe('https://cdn/rose.svga')
    })

    /**
     * The schema types `price` as a decimal **string**; legacy `parseFloat`s it at each call site
     * and prints `99.00` where the design shows `99`.
     */
    it('parses the decimal string price to a number, once', () => {
        const [pkg] = normalizeGiftPackages({ results: [row({ price: '99.00' })] })
        expect(pkg.price).toBe(99)
    })

    /** `product_package_id` is an integer, so a row whose id is not one cannot be sent. */
    it('drops a row with no usable id', () => {
        expect(normalizeGiftPackages({ results: [row({ id: null })] })).toHaveLength(0)
        expect(normalizeGiftPackages({ results: [row({ id: 'abc' })] })).toHaveLength(0)
    })

    it('accepts a numeric id that arrived as a string', () => {
        const [pkg] = normalizeGiftPackages({ results: [row({ id: '7' })] })
        expect(pkg.id).toBe(7)
    })

    it('drops a row with no product — a tile with no picture and no name', () => {
        expect(normalizeGiftPackages({ results: [row({ product: null })] })).toHaveLength(0)
    })

    /** A paginated endpoint that stops paginating must not blank the tray. */
    it('accepts a bare array as well as a page', () => {
        expect(normalizeGiftPackages([row()])).toHaveLength(1)
    })

    it('answers empty for a body that is neither', () => {
        expect(normalizeGiftPackages(null)).toEqual([])
        expect(normalizeGiftPackages({ results: 'nope' })).toEqual([])
    })

    it('falls back to one unit when the payload omits the quantity', () => {
        const [pkg] = normalizeGiftPackages({ results: [row({ quantity: undefined })] })
        expect(pkg.quantity).toBe(1)
    })
})

/**
 * ⚠ The divergence from legacy worth pinning: `exclusive` is a **string** on the wire, and legacy's
 * bare truthiness test would move a catalogue serialised as `"False"` entirely into the Exclusive
 * tab and leave the ordinary one empty.
 */
describe('the exclusive flag', () => {
    it.each([
        ['true', true],
        ['1', true],
        ['yes', true],
        ['', false],
        ['false', false],
        ['False', false],
        ['0', false],
    ])('reads %j as %s', (wire, expected) => {
        const [pkg] = normalizeGiftPackages({
            results: [row({ product: { ...row().product, exclusive: wire } })],
        })
        expect(pkg.product?.exclusive).toBe(expected)
    })

    it('accepts a real boolean too', () => {
        const [pkg] = normalizeGiftPackages({
            results: [row({ product: { ...row().product, exclusive: true } })],
        })
        expect(pkg.product?.exclusive).toBe(true)
    })
})

describe('splitGiftPackages', () => {
    /** Two tabs that do **not** partition — an exclusive gift is in both. */
    it('keeps exclusives in the main list as well as in their own', () => {
        const packages = normalizeGiftPackages({
            results: [
                row({ id: 1 }),
                row({ id: 2, product: { ...row().product, exclusive: 'true' } }),
            ],
        })
        const { all, exclusive } = splitGiftPackages(packages)
        expect(all.map(p => p.id)).toEqual([1, 2])
        expect(exclusive.map(p => p.id)).toEqual([2])
    })
})

describe('giftPackageThumb', () => {
    it('prefers the thumb and falls back to the product logo', () => {
        const [withThumb] = normalizeGiftPackages({ results: [row()] })
        expect(giftPackageThumb(withThumb)).toBe('https://cdn/rose.png')

        const [noThumb] = normalizeGiftPackages({
            results: [row({ product: { ...row().product, images: { thumb: null } } })],
        })
        expect(giftPackageThumb(noThumb)).toBe('https://cdn/rose-logo.png')
    })

    it('answers null when the product carries no picture at all', () => {
        const [bare] = normalizeGiftPackages({
            results: [row({ product: { name: 'Rose' } })],
        })
        expect(giftPackageThumb(bare)).toBeNull()
    })
})
