import { SUPPORTED_LOCALES } from '@shared/i18n/settings'
import { describe, expect, it } from 'vitest'
import { stripeLocale } from './stripe-locale'

describe('stripeLocale', () => {
    it('maps Chinese to the two codes Stripe actually uses', () => {
        expect(stripeLocale('zh-CN')).toBe('zh')
        expect(stripeLocale('zh-TW')).toBe('zh-TW')
    })

    it('covers every locale this app ships', () => {
        for (const locale of SUPPORTED_LOCALES) {
            expect(stripeLocale(locale)).not.toBe('')
        }
        // ...and a locale added without touching this file must land on English, not on `auto`.
        expect(stripeLocale('th')).toBe('en')
        expect(stripeLocale(null)).toBe('en')
    })
})
