import { describe, expect, it } from 'vitest'
import {
    isPaymentMethodFilter,
    PAYMENT_METHOD_FILTER_LABELS,
    PAYMENT_METHOD_FILTERS,
    paymentMethodLabelKey,
    prettifyPaymentMethod,
} from './payment-methods'

describe('payment method filters', () => {
    it('offers All, Star and Card in the order the control draws them', () => {
        expect([...PAYMENT_METHOD_FILTERS]).toEqual(['', 'star', 'card'])
    })

    /** Every segment needs copy, or the control renders a blank pill. */
    it('has a label for every filter', () => {
        for (const filter of PAYMENT_METHOD_FILTERS) {
            expect(PAYMENT_METHOD_FILTER_LABELS[filter]).toBeTruthy()
        }
    })

    /**
     * `vip_pass` is a *label* but not a *filter* — an account can hold one, and legacy's tab for it
     * is commented out. Pinned because the asymmetry looks like an oversight.
     */
    it('does not offer a VIP-pass filter but can still label one', () => {
        expect(isPaymentMethodFilter('vip_pass')).toBe(false)
        expect(paymentMethodLabelKey('vip_pass')).toBe('my_membership_payment_vip_pass')
    })

    it('rejects anything outside the vocabulary', () => {
        expect(isPaymentMethodFilter('star')).toBe(true)
        expect(isPaymentMethodFilter('')).toBe(true)
        expect(isPaymentMethodFilter('paypal')).toBe(false)
        expect(isPaymentMethodFilter('STAR')).toBe(false)
    })
})

describe('paymentMethodLabelKey', () => {
    it('keys the three methods this client has copy for', () => {
        expect(paymentMethodLabelKey('star')).toBe('my_membership_payment_star')
        expect(paymentMethodLabelKey('card')).toBe('my_membership_payment_card')
    })

    it('normalises case and padding, since the wire does not guarantee either', () => {
        expect(paymentMethodLabelKey(' Card ')).toBe('my_membership_payment_card')
    })

    /** `null` is the signal to fall through to `prettifyPaymentMethod`, not a blank line. */
    it('answers null for a method that ships after this client', () => {
        expect(paymentMethodLabelKey('apple_pay')).toBeNull()
        expect(paymentMethodLabelKey(null)).toBeNull()
        expect(paymentMethodLabelKey('')).toBeNull()
    })
})

describe('prettifyPaymentMethod', () => {
    it('turns a wire slug into something a person can read', () => {
        expect(prettifyPaymentMethod('apple_pay')).toBe('Apple Pay')
        expect(prettifyPaymentMethod('CARD')).toBe('Card')
    })

    it('survives a slug with empty segments', () => {
        expect(prettifyPaymentMethod('__bank__transfer_')).toBe('Bank Transfer')
    })

    it('answers an empty string for nothing, so the row can drop the line', () => {
        expect(prettifyPaymentMethod(null)).toBe('')
        expect(prettifyPaymentMethod('')).toBe('')
    })
})
