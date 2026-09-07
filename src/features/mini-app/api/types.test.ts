import { describe, expect, it } from 'vitest'
import { buyItemOptionsSchema, normalizeAppToken, topupOptionsSchema } from './types'

/**
 * These are the only schemas in the app guarding against the **frame**, not the backend. A mini app
 * is third-party code asking this client to spend the reader's Star with the reader's bearer token,
 * so the request body is rebuilt from a parsed shape rather than forwarded.
 */
describe('buyItemOptionsSchema', () => {
    it('accepts the documented payload', () => {
        expect(
            buyItemOptionsSchema.parse({ item_id: 'item_001', price: 100, metadata: { level: 5 } }),
        ).toEqual({ item_id: 'item_001', price: 100, metadata: { level: 5 } })
    })

    it('coerces a numeric item id, because ids arrive both ways', () => {
        expect(buyItemOptionsSchema.parse({ item_id: 7 }).item_id).toBe('7')
    })

    it('defaults missing metadata to an empty bag', () => {
        expect(buyItemOptionsSchema.parse({ item_id: 'x' }).metadata).toEqual({})
    })

    it.each([
        ['an object item id', { item_id: { a: 1 } }],
        ['an empty item id', { item_id: '' }],
    ])('refuses %s', (_label, input) => {
        expect(buyItemOptionsSchema.safeParse(input).success).toBe(false)
    })

    it.each([
        ['a negative price', -5],
        ['a fractional price', 12.5],
        ['a price that is not a number', 'lots'],
    ])('forgets %s rather than blocking the purchase', (_label, price) => {
        // The price is display-only — it is never sent, and the backend prices the product. So an
        // unusable one costs the reader a shortfall figure in the top-up copy, and must not refuse
        // a purchase the backend would have accepted.
        const parsed = buyItemOptionsSchema.parse({ item_id: 'x', price })
        expect(parsed.price).toBeNull()
        expect(parsed.item_id).toBe('x')
    })

    it('refuses metadata that cannot be serialised, rather than hanging in axios', () => {
        // A cyclic object survives `postMessage`'s structured clone and then throws inside
        // `JSON.stringify`, leaving the app waiting forever for a reply.
        const cyclic: Record<string, unknown> = {}
        cyclic.self = cyclic
        expect(buyItemOptionsSchema.safeParse({ item_id: 'x', metadata: cyclic }).success).toBe(
            false,
        )
        expect(buyItemOptionsSchema.safeParse({ item_id: 'x', metadata: 'nope' }).success).toBe(
            false,
        )
    })
})

describe('topupOptionsSchema', () => {
    it('accepts the documented payload', () => {
        expect(
            topupOptionsSchema.parse({
                channel_id: 'ch_001',
                amount: 500,
                deposit_token: 'tok_xyz',
                metadata: { game_id: 'g1' },
            }).amount,
        ).toBe(500)
    })

    it.each([
        ['zero', 0],
        ['a negative amount', -500],
        ['a fraction', 12.5],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['an absurd amount', 1e21],
    ])('refuses %s', (_label, amount) => {
        // The last one is not superstition: `1e21` stringifies as `"1e+21"`, which the backend would
        // read as something other than a number.
        expect(
            topupOptionsSchema.safeParse({ channel_id: 'c', amount, deposit_token: 't' }).success,
        ).toBe(false)
    })

    it('requires the deposit token — a deposit without one is not one the app asked for', () => {
        expect(topupOptionsSchema.safeParse({ channel_id: 'c', amount: 10 }).success).toBe(false)
    })
})

describe('normalizeAppToken', () => {
    it('reads the token', () => {
        expect(normalizeAppToken({ access_token: 'eyJ' })).toBe('eyJ')
    })

    it.each([
        ['an empty token', { access_token: '' }],
        ['no token', { expires_in: 3600 }],
        ['null', null],
    ])('answers null for %s, which the bridge reports as "no token"', (_label, body) => {
        expect(normalizeAppToken(body)).toBeNull()
    })
})
