import { describe, expect, it } from 'vitest'
import type { CheckoutEvent, CheckoutState } from './checkout-machine'
import {
    CHECKOUT_ERROR_KEYS,
    canDismissCheckout,
    checkoutActionOf,
    checkoutReducer,
    IDLE,
    isCheckoutBusy,
} from './checkout-machine'
import type { CheckoutOrder } from './checkout-order'

const ORDER: CheckoutOrder = { kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 }

/** Replay a sequence from idle — the transitions are only interesting in order. */
function run(...events: CheckoutEvent[]): CheckoutState {
    return events.reduce(checkoutReducer, IDLE)
}

const toCard = [
    { type: 'START', order: ORDER },
    { type: 'ACTION', action: { kind: 'card', clientSecret: 'pi_1_secret' } },
] satisfies CheckoutEvent[]

describe('checkoutReducer — the happy card path', () => {
    it('walks idle → creating → card → confirming → settling → succeeded', () => {
        expect(run({ type: 'START', order: ORDER })).toEqual({ kind: 'creating', order: ORDER })
        expect(run(...toCard)).toEqual({ kind: 'card', order: ORDER, clientSecret: 'pi_1_secret' })
        expect(run(...toCard, { type: 'SUBMIT' })).toMatchObject({ kind: 'confirming' })
        expect(run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRMED' })).toEqual({
            kind: 'settling',
            order: ORDER,
            settleRef: 'pi_1_secret',
            attempt: 0,
        })
        expect(
            run(
                ...toCard,
                { type: 'SUBMIT' },
                { type: 'CONFIRMED' },
                { type: 'SETTLED', purchaseType: 'star' },
            ),
        ).toEqual({ kind: 'succeeded', order: ORDER, purchaseType: 'star' })
    })

    it('counts the polls, so the schedule has something to read', () => {
        const state = run(
            ...toCard,
            { type: 'SUBMIT' },
            { type: 'CONFIRMED' },
            { type: 'SETTLE_PENDING' },
            { type: 'SETTLE_PENDING' },
        )
        expect(state).toMatchObject({ kind: 'settling', attempt: 2 })
    })

    it('a schedule that runs out is `slow`, never `failed`', () => {
        const state = run(
            ...toCard,
            { type: 'SUBMIT' },
            { type: 'CONFIRMED' },
            { type: 'EXHAUSTED' },
        )
        expect(state).toEqual({ kind: 'slow', order: ORDER, settleRef: 'pi_1_secret' })
    })
})

describe('checkoutReducer — the other three actions', () => {
    it('a redirect action leaves the app', () => {
        expect(
            run(
                { type: 'START', order: ORDER },
                { type: 'ACTION', action: { kind: 'redirect', url: 'https://pay.example/x' } },
            ),
        ).toEqual({ kind: 'leaving', order: ORDER, url: 'https://pay.example/x' })
    })

    it('an embedded checkout settles server-side, so CONFIRMED goes straight to success', () => {
        const state = run(
            { type: 'START', order: ORDER },
            { type: 'ACTION', action: { kind: 'embedded', provider: 'coda', txnId: 'txn_1' } },
            { type: 'CONFIRMED' },
        )
        expect(state).toEqual({ kind: 'succeeded', order: ORDER, purchaseType: null })
    })

    it('an action this client cannot complete fails closed with its own key', () => {
        for (const action of [
            { kind: 'crypto', data: { address: 'bc1q' } },
            { kind: 'unsupported', action: 'MOMO' },
        ] as const) {
            expect(run({ type: 'START', order: ORDER }, { type: 'ACTION', action })).toEqual({
                kind: 'failed',
                order: ORDER,
                messageKey: CHECKOUT_ERROR_KEYS.unsupported,
                text: null,
            })
        }
    })
})

describe('checkoutReducer — the guards', () => {
    it('ignores a settlement that arrives with nothing in flight', () => {
        expect(checkoutReducer(IDLE, { type: 'SETTLED', purchaseType: 'star' })).toBe(IDLE)
        expect(checkoutReducer(IDLE, { type: 'REJECTED', text: 'no' })).toBe(IDLE)
        expect(checkoutReducer(IDLE, { type: 'SETTLE_PENDING' })).toBe(IDLE)
    })

    it('will not abandon a charge that is confirming', () => {
        const confirming = run(...toCard, { type: 'SUBMIT' })
        expect(checkoutReducer(confirming, { type: 'START', order: ORDER })).toBe(confirming)
        expect(checkoutReducer(confirming, { type: 'CLOSE' })).toBe(confirming)
        expect(canDismissCheckout(confirming)).toBe(false)
    })

    it('closes from every other state', () => {
        for (const state of [
            run(...toCard),
            run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRMED' }),
            run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRM_FAILED', text: 'Card declined' }),
        ]) {
            expect(checkoutReducer(state, { type: 'CLOSE' })).toEqual(IDLE)
        }
    })

    it('retries from a terminal state with the same order', () => {
        const failed = run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRM_FAILED', text: null })
        expect(checkoutReducer(failed, { type: 'START', order: ORDER })).toEqual({
            kind: 'creating',
            order: ORDER,
        })
    })

    it('keeps a Stripe error sentence, and always sets a key beside it', () => {
        const state = run(
            ...toCard,
            { type: 'SUBMIT' },
            { type: 'CONFIRM_FAILED', text: 'Your card was declined.' },
        )
        expect(state).toEqual({
            kind: 'failed',
            order: ORDER,
            messageKey: CHECKOUT_ERROR_KEYS.generic,
            text: 'Your card was declined.',
        })
    })

    it('transport failure is reachable mid-flow but not from idle', () => {
        expect(checkoutReducer(IDLE, { type: 'FAILED', messageKey: 'k' })).toBe(IDLE)
        expect(
            checkoutReducer(run({ type: 'START', order: ORDER }), {
                type: 'FAILED',
                messageKey: 'payment_error_no_config',
            }),
        ).toMatchObject({ kind: 'failed', messageKey: 'payment_error_no_config', text: null })
    })
})

describe('checkoutReducer — resuming after a redirect', () => {
    it('starts settling with no order, because the page was reloaded', () => {
        expect(checkoutReducer(IDLE, { type: 'RESUME', settleRef: 'pi_2_secret' })).toEqual({
            kind: 'settling',
            order: null,
            settleRef: 'pi_2_secret',
            attempt: 0,
        })
    })

    it('is allowed from a mounted card form (a 3DS hop kept the page alive)', () => {
        expect(
            checkoutReducer(run(...toCard), { type: 'RESUME', settleRef: 'pi_3' }),
        ).toMatchObject({ kind: 'settling', order: ORDER, settleRef: 'pi_3' })
    })

    it('never interrupts a payment the client is already handling', () => {
        const confirming = run(...toCard, { type: 'SUBMIT' })
        expect(checkoutReducer(confirming, { type: 'RESUME', settleRef: 'pi_4' })).toBe(confirming)
        const settling = run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRMED' })
        expect(checkoutReducer(settling, { type: 'RESUME', settleRef: 'pi_4' })).toBe(settling)
    })
})

describe('isCheckoutBusy', () => {
    it('is true exactly while something is in flight', () => {
        expect(isCheckoutBusy(IDLE)).toBe(false)
        expect(isCheckoutBusy(run({ type: 'START', order: ORDER }))).toBe(true)
        expect(isCheckoutBusy(run(...toCard))).toBe(false)
        expect(isCheckoutBusy(run(...toCard, { type: 'SUBMIT' }))).toBe(true)
        expect(isCheckoutBusy(run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRMED' }))).toBe(true)
    })
})

describe('checkoutActionOf', () => {
    it('gives the union back for the states that carry one', () => {
        expect(checkoutActionOf(run(...toCard))).toEqual({
            kind: 'card',
            clientSecret: 'pi_1_secret',
        })
        expect(checkoutActionOf(run(...toCard, { type: 'SUBMIT' }))).toEqual({
            kind: 'card',
            clientSecret: 'pi_1_secret',
        })
        expect(
            checkoutActionOf(
                run(
                    { type: 'START', order: ORDER },
                    { type: 'ACTION', action: { kind: 'redirect', url: 'https://pay.example/x' } },
                ),
            ),
        ).toEqual({ kind: 'redirect', url: 'https://pay.example/x' })
        expect(
            checkoutActionOf(
                run(
                    { type: 'START', order: ORDER },
                    {
                        type: 'ACTION',
                        action: { kind: 'embedded', provider: 'coda', txnId: 'txn_1' },
                    },
                ),
            ),
        ).toEqual({ kind: 'embedded', provider: 'coda', txnId: 'txn_1' })
    })

    it('is null for every state with no panel to render', () => {
        for (const state of [
            IDLE,
            run({ type: 'START', order: ORDER }),
            run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRMED' }),
            run(...toCard, { type: 'SUBMIT' }, { type: 'CONFIRM_FAILED', text: null }),
        ]) {
            if (state.kind === 'confirming') continue
            expect(checkoutActionOf(state)).toBeNull()
        }
    })
})
