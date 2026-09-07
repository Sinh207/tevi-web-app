import { describe, expect, it } from 'vitest'
import { giftRecipientName, normalizeGiftRecipients, toReceiverUserId } from './gift-types'

/**
 * The DTO for the one field a **charge** is created against.
 *
 * `receiver_user_id` is what `checkout/v3/checkout/gift-premium/` prices the gift on, and this file
 * exists because the first version of the parser read it as text while the backend sends a
 * **number** — so every gift refused itself with "we couldn't reach that creator" and no request
 * failed anywhere. Every fixture in the repo happened to seed a string, which is why the tests, the
 * e2e specs and the screenshots all agreed with the bug.
 */

describe('toReceiverUserId', () => {
    it('reads a **numeric** owner_id, which is what the backend sends', () => {
        // `features/channel`'s own DTO unions string|number for this field, and B11 records that
        // `/me` sends `id` as a number. This is the regression that broke Send gift.
        expect(toReceiverUserId({ owner_id: 123456 })).toBe('123456')
    })

    it('reads a string one too', () => {
        expect(toReceiverUserId({ owner_id: '77' })).toBe('77')
    })

    it('is null for a body that does not carry one', () => {
        // The caller turns this into a refusal to charge, rather than a checkout with an empty
        // `receiver_user_id` — which comes back as a 4xx reading like a payment problem.
        for (const body of [null, undefined, 'nope', {}, { owner_id: null }, { owner_id: '  ' }]) {
            expect(toReceiverUserId(body)).toBeNull()
        }
    })

    it('ignores the forty other fields a channel payload carries', () => {
        const channel = {
            id: 9,
            slug: 'ada',
            owner_id: 42,
            privacy: 'PUBLIC',
            lives: [],
            mcn: null,
        }
        expect(toReceiverUserId(channel)).toBe('42')
    })
})

describe('normalizeGiftRecipients', () => {
    const row = (over: Record<string, unknown> = {}) => ({
        id: 1,
        slug: 'ada',
        name: 'Ada',
        ...over,
    })

    it('keeps a numeric owner_id on the row, so the lookup can be skipped', () => {
        // Not a break when it was wrong — `confirm()` falls back to the fetch — but it was a
        // request per gift that did not need to happen.
        expect(normalizeGiftRecipients([row({ owner_id: 512 })])[0]?.owner_id).toBe('512')
    })

    it('drops a row that cannot be resolved to anybody', () => {
        // The slug is the whole bar: every other field degrades, but a row with no handle is a face
        // that cannot become a `receiver_user_id`.
        expect(normalizeGiftRecipients([row({ slug: '' }), row({ slug: '   ' })])).toEqual([])
    })

    it('is empty for a body that is not a list', () => {
        for (const body of [null, undefined, {}, 'x'])
            expect(normalizeGiftRecipients(body)).toEqual([])
    })
})

describe('giftRecipientName', () => {
    it('prefers the display name, then the name, then nothing', () => {
        const [a] = normalizeGiftRecipients([{ slug: 'ada', name: 'Ada', display_name: 'Ada L.' }])
        const [b] = normalizeGiftRecipients([{ slug: 'ada', name: 'Ada' }])
        const [c] = normalizeGiftRecipients([{ slug: 'ada' }])
        expect(a && giftRecipientName(a)).toBe('Ada L.')
        expect(b && giftRecipientName(b)).toBe('Ada')
        // `''` and not `null`, so the caller's `|| '@slug'` fallback is the one decision point.
        expect(c && giftRecipientName(c)).toBe('')
    })
})
