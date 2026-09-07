import { describe, expect, it } from 'vitest'
import { isActionSupported, parseChargedAmount, parseCheckoutAction } from './checkout-action'

describe('parseCheckoutAction', () => {
    it('reads the Stripe branch', () => {
        expect(
            parseCheckoutAction({ action: 'STRIPE', action_data: { clientSecret: 'pi_1_secret' } }),
        ).toEqual({ kind: 'card', clientSecret: 'pi_1_secret' })
    })

    it('accepts a lower-cased action, because legacy upper-cases at every read', () => {
        expect(
            parseCheckoutAction({ action: 'stripe', action_data: { clientSecret: 'pi_1' } }).kind,
        ).toBe('card')
    })

    it('reads the redirect branch', () => {
        expect(
            parseCheckoutAction({
                action: 'REDIRECT',
                action_data: { redirectURL: 'https://checkout.stripe.com/c/pay/cs_test' },
            }),
        ).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_test' })
    })

    it('refuses a redirect that is not http(s) — the client navigates to this string', () => {
        for (const url of ['javascript:alert(1)', 'data:text/html,<script>', '//evil.example']) {
            expect(
                parseCheckoutAction({ action: 'REDIRECT', action_data: { redirectURL: url } }),
            ).toEqual({ kind: 'unsupported', action: 'REDIRECT' })
        }
    })

    it('reads Coda and NOW_PAYMENT', () => {
        expect(parseCheckoutAction({ action: 'CODA', action_data: { txnId: 'txn_9' } })).toEqual({
            kind: 'embedded',
            provider: 'coda',
            txnId: 'txn_9',
        })
        expect(
            parseCheckoutAction({ action: 'NOW_PAYMENT', action_data: { address: 'bc1q' } }),
        ).toEqual({ kind: 'crypto', data: { address: 'bc1q' } })
    })

    it('is unsupported when the action_data lacks the field its action needs', () => {
        expect(parseCheckoutAction({ action: 'STRIPE', action_data: {} }).kind).toBe('unsupported')
        expect(parseCheckoutAction({ action: 'CODA' }).kind).toBe('unsupported')
        expect(parseCheckoutAction({ action: 'NOW_PAYMENT', action_data: {} }).kind).toBe(
            'unsupported',
        )
    })

    it('fails closed on an action this client has never seen, and on rubbish', () => {
        expect(parseCheckoutAction({ action: 'MOMO', action_data: { foo: 1 } })).toEqual({
            kind: 'unsupported',
            action: 'MOMO',
        })
        expect(parseCheckoutAction(null)).toEqual({ kind: 'unsupported', action: '' })
        expect(parseCheckoutAction('nope')).toEqual({ kind: 'unsupported', action: '' })
    })
})

describe('isActionSupported', () => {
    it('crypto is not completable in this client yet', () => {
        expect(isActionSupported({ kind: 'crypto', data: {} })).toBe(false)
        expect(isActionSupported({ kind: 'unsupported', action: 'MOMO' })).toBe(false)
        expect(isActionSupported({ kind: 'card', clientSecret: 'x' })).toBe(true)
    })
})

/**
 * The `payment` block, from a **live** membership response. Transcribed rather than invented, because
 * the whole value of reading it is that it is the gateway's own figure — a fixture somebody typed
 * would prove nothing about the shape that actually arrives.
 */
const LIVE_SUBSCRIBE_BODY = {
    payment: {
        id: '01a039af-2ad0-7496-922f-fddf0090d63a',
        payment_method: {
            id: 'gw.stripe',
            name: 'Credit or Debit Card (USD)',
            gateway: 'gw.stripe',
            fee_flat_amount: '0.60',
            fee_percent_rate: '25.00',
            currency: null,
            min_payment_amount: '0.00',
            max_payment_amount: null,
        },
        gateway: 'gw.stripe',
        amount: '1.38',
        amount_currency: 'USD',
        charge_status: 'PENDING',
    },
    action: 'STRIPE',
    action_data: { clientSecret: 'pi_3U8MurBfiRzT30LK1mZJ4pf2_secret_yr4fT78RhNAqbLJm7d328XQcj' },
}

describe('parseChargedAmount', () => {
    it('reads the live payload’s decimal string and currency', () => {
        expect(parseChargedAmount(LIVE_SUBSCRIBE_BODY)).toEqual({ amount: 1.38, currency: 'USD' })
    })

    /** The same body still yields the action — the two parsers read one envelope independently. */
    it('coexists with the action parser on one body', () => {
        expect(parseCheckoutAction(LIVE_SUBSCRIBE_BODY)).toEqual({
            kind: 'card',
            clientSecret: 'pi_3U8MurBfiRzT30LK1mZJ4pf2_secret_yr4fT78RhNAqbLJm7d328XQcj',
        })
    })

    it('accepts a bare number as well as a decimal string', () => {
        expect(parseChargedAmount({ payment: { amount: 1.38, amount_currency: 'usd' } })).toEqual({
            amount: 1.38,
            currency: 'USD',
        })
    })

    it('is null for a body with no payment block, or an unusable amount', () => {
        expect(parseChargedAmount({ action: 'STRIPE' })).toBeNull()
        expect(parseChargedAmount({ payment: null })).toBeNull()
        expect(parseChargedAmount({ payment: { amount: '0' } })).toBeNull()
        expect(parseChargedAmount({ payment: { amount: 'free' } })).toBeNull()
        expect(parseChargedAmount(null)).toBeNull()
    })

    it('reports a missing currency as null rather than assuming USD', () => {
        expect(parseChargedAmount({ payment: { amount: '1.38' } })).toEqual({
            amount: 1.38,
            currency: null,
        })
    })
})
