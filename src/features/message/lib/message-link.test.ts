import { describe, expect, it } from 'vitest'
import { normalizeMessages } from '../api/types'
import { giftPlanDuration, messageEmbed, premiumGiftName, teviPath } from './message-link'

const message = (raw: Record<string, unknown>) => normalizeMessages([{ id: 'm1', ...raw }])[0]

describe('teviPath', () => {
    it('keeps a Tevi link inside the app, path and query intact', () => {
        expect(teviPath('https://tevi.com/@ada/post/9?ref=dm', null)).toBe('/@ada/post/9?ref=dm')
        expect(teviPath('https://www.web.tevi.dev/@ada', null)).toBe('/@ada')
        expect(teviPath('https://preview.example/@ada', 'preview.example')).toBe('/@ada')
    })

    it('leaves every other host, and every other scheme, alone', () => {
        expect(teviPath('https://tevi.com.evil.example/@ada', null)).toBeNull()
        expect(teviPath('https://example.com/@ada', null)).toBeNull()
        expect(teviPath('javascript:alert(1)', null)).toBeNull()
        expect(teviPath('not a url', null)).toBeNull()
    })
})

describe('messageEmbed', () => {
    it('cards the first Tevi space or post link, as legacy does', () => {
        expect(messageEmbed(message({ text: 'look https://tevi.com/@ada' }), null)).toEqual({
            kind: 'space',
            slug: 'ada',
        })
        expect(
            messageEmbed(
                message({ text: 'https://tevi.com/@ada/post/42 and https://tevi.com/@bob' }),
                null,
            ),
        ).toEqual({ kind: 'post', slug: 'ada', postId: '42' })
    })

    it('cards a collection link, as legacy does', () => {
        expect(
            messageEmbed(message({ text: 'https://tevi.com/@ada/collections/3' }), null),
        ).toEqual({ kind: 'collection', slug: 'ada', collectionId: '3' })
    })

    it('draws no card for a photo message, an external site, or a Tevi page it has no card for', () => {
        expect(
            messageEmbed(message({ text: 'https://tevi.com/@ada', images: [{ url: 'x' }] }), null),
        ).toBeNull()
        expect(messageEmbed(message({ text: 'https://example.com/@ada' }), null)).toBeNull()
        expect(messageEmbed(message({ text: 'https://tevi.com/messages' }), null)).toBeNull()
        expect(messageEmbed(message({ text: 'https://tevi.com/@ada/event/7' }), null)).toBeNull()
    })

    it('recognises a gift in either spelling — the text Android sends, the attachment iOS reads', () => {
        expect(
            messageEmbed(
                message({
                    text: 'tevi://TEVI_PREMIUM_GIFT?product_name=Gift%20Premium%201%20year',
                }),
                null,
            ),
        ).toEqual({ kind: 'gift', productName: 'Gift Premium 1 year' })
        expect(
            messageEmbed(
                message({
                    text: 'Gift',
                    attachments: [
                        { type: 'TEVI_PREMIUM_GIFT', preview_data: { product_name: '3 months' } },
                    ],
                }),
                null,
            ),
        ).toEqual({ kind: 'gift', productName: '3 months' })
    })
})

describe('premiumGiftName', () => {
    it('is null when the gift names no plan', () => {
        expect(premiumGiftName(message({ text: 'tevi://TEVI_PREMIUM_GIFT?id=1' }))).toBeNull()
    })
})

describe('giftPlanDuration', () => {
    it('reads the duration out of every spelling iOS maps', () => {
        expect(giftPlanDuration('gift premium 1 year')).toEqual({ unit: 'year', count: 1 })
        expect(giftPlanDuration('Gift Premium (3 months)')).toEqual({ unit: 'month', count: 3 })
        expect(giftPlanDuration('6 Months')).toEqual({ unit: 'month', count: 6 })
        expect(giftPlanDuration('Premium')).toBeNull()
        expect(giftPlanDuration(null)).toBeNull()
    })
})
