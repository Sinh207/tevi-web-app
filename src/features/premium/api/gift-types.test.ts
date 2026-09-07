import { describe, expect, it } from 'vitest'
import { giftRecipientName, normalizeGiftRecipients } from './gift-types'

/**
 * The DTO for the one field a **charge** is created against.
 *
 * `receiver_user_id` is what `checkout/v3/checkout/gift-premium/` prices the gift on, and this file
 * exists because the first version of the parser read it as text while the backend sends a
 * **number** — so every gift refused itself with "we couldn't reach that creator" and no request
 * failed anywhere. Every fixture in the repo happened to seed a string, which is why the tests, the
 * e2e specs and the screenshots all agreed with the bug.
 */

describe('the receiver id', () => {
    /**
     * `receiver_user_id` is what `checkout/gift-premium/` prices the gift against, and it comes off
     * the channel payload as a **number**. The parser read it as text, dropped it, and every gift
     * refused itself with "we couldn't reach that creator" — no request failed anywhere. Every
     * fixture in the repo seeded a string, which is why the tests agreed with the bug.
     *
     * It is read through `normalizeGiftRecipients` now rather than a field-picker of its own:
     * `giftRecipientApi.getRecipient` parses the whole channel body into a recipient, so one request
     * yields both the id and the person.
     */
    it('reads a numeric owner_id', () => {
        const [row] = normalizeGiftRecipients([{ slug: 'ada', name: 'Ada', owner_id: 123456 }])
        expect(row?.owner_id).toBe('123456')
    })

    it('reads a string one too, and treats blank as absent', () => {
        expect(normalizeGiftRecipients([{ slug: 'ada', owner_id: '77' }])[0]?.owner_id).toBe('77')
        expect(normalizeGiftRecipients([{ slug: 'ada', owner_id: '  ' }])[0]?.owner_id).toBeNull()
        expect(normalizeGiftRecipients([{ slug: 'ada' }])[0]?.owner_id).toBeNull()
    })
})

describe('normalizeGiftRecipients', () => {
    const row = (over: Record<string, unknown> = {}) => ({
        id: 1,
        slug: 'ada',
        name: 'Ada',
        ...over,
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
