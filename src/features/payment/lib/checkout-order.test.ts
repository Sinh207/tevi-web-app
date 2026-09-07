import { describe, expect, it } from 'vitest'
import { checkoutRequest, isCardOnlyOrder, mayReachCardStep } from './checkout-order'

const CTX = {
    successUrl: 'https://tevi.com/@ada',
    failUrl: 'https://tevi.com/@ada',
    timezone: 'Asia/Ho_Chi_Minh',
}

describe('checkoutRequest', () => {
    it('sends the Star count as `quantity`, and the gateway as `payment_method`', () => {
        const request = checkoutRequest(
            { kind: 'stars', gatewayId: 'gw.coda', quantity: 1000 },
            CTX,
        )
        expect(request).toEqual({
            path: 'checkout/v3/checkout/',
            body: {
                payment_method: 'gw.coda',
                quantity: 1000,
                success_url: CTX.successUrl,
                fail_url: CTX.failUrl,
                timezone: 'Asia/Ho_Chi_Minh',
            },
        })
    })

    it('sends a donation with the channel id and omits a blank message', () => {
        const withNote = checkoutRequest(
            {
                kind: 'donation',
                gatewayId: 'gw.stripe',
                channelId: 'ch_1',
                amountUsd: 5,
                message: '  thanks  ',
            },
            CTX,
        )
        expect(withNote?.body).toMatchObject({
            channel_id: 'ch_1',
            donation_usd_amount: 5,
            message: 'thanks',
        })

        const blank = checkoutRequest(
            {
                kind: 'donation',
                gatewayId: 'gw.stripe',
                channelId: 'ch_1',
                amountUsd: 5,
                message: '   ',
            },
            CTX,
        )
        expect(blank?.body).not.toHaveProperty('message')
    })

    it('defaults `save_payment_info` to false, as legacy does', () => {
        const request = checkoutRequest(
            { kind: 'premium', gatewayId: 'gw.stripe', priceId: 'price_1' },
            CTX,
        )
        expect(request?.body).toMatchObject({ price_id: 'price_1', save_payment_info: false })
    })

    it('puts the gift token on the success URL only', () => {
        const request = checkoutRequest(
            {
                kind: 'gift-premium',
                gatewayId: 'gw.stripe',
                priceId: 'price_1',
                receiverUserId: 'u_9',
                giftToken: 'tok_abc',
            },
            CTX,
        )
        expect(request?.body.success_url).toBe('https://tevi.com/@ada?gift_token=tok_abc')
        expect(request?.body.fail_url).toBe(CTX.failUrl)
        expect(request?.body.receiver_user_id).toBe('u_9')
    })

    it('has no request for a handoff — another feature already made it', () => {
        expect(
            checkoutRequest(
                {
                    kind: 'handoff',
                    source: 'membership',
                    action: { kind: 'card', clientSecret: 'pi' },
                },
                CTX,
            ),
        ).toBeNull()
    })
})

describe('isCardOnlyOrder', () => {
    it('only Star offers the gateway list', () => {
        expect(isCardOnlyOrder({ kind: 'stars', gatewayId: 'gw.stripe', quantity: 100 })).toBe(
            false,
        )
        expect(isCardOnlyOrder({ kind: 'premium', gatewayId: 'gw.stripe', priceId: 'p' })).toBe(
            true,
        )
    })
})

describe('mayReachCardStep', () => {
    /**
     * The predicate two prefetches hang off — the saved-card list and Stripe's publishable key, both
     * asked for during `creating` because that is the window in which they are free.
     *
     * It is a **reading of `docs/PAYMENT.md`'s action-branch table**, not a guess about a response,
     * and the asymmetry is the point: only the two kinds the doc pins as `REDIRECT` answer `false`.
     * Everything else keeps the prefetch, so the change cannot slow a flow the doc does not describe.
     */
    it('is false for the two kinds documented as hosted redirects', () => {
        // Stripe's hosted page: no Elements, no saved card, no publishable key — ever.
        expect(mayReachCardStep({ kind: 'premium', gatewayId: 'gw.stripe', priceId: 'p' })).toBe(
            false,
        )
        expect(
            mayReachCardStep({
                kind: 'gift-premium',
                gatewayId: 'gw.stripe',
                priceId: 'p',
                receiverUserId: '1',
                giftToken: 't',
            }),
        ).toBe(false)
    })

    it('is true for every kind whose branch the doc does not pin', () => {
        // `stars` takes all four branches; donation and membership are STRIPE. A wrong `false` here
        // would cost a prefetch on a real card form, which is the expensive direction.
        expect(mayReachCardStep({ kind: 'stars', gatewayId: 'gw.stripe', quantity: 100 })).toBe(
            true,
        )
        expect(
            mayReachCardStep({
                kind: 'donation',
                gatewayId: 'gw.stripe',
                channelId: 'c',
                amountUsd: 5,
            }),
        ).toBe(true)
        expect(mayReachCardStep({ kind: 'membership', packageId: 'p', priceId: 'r' })).toBe(true)
    })

    it('reads a handoff’s own action, which it already has', () => {
        const card = { kind: 'card', clientSecret: 'cs_x' } as const
        const redirect = { kind: 'redirect', url: 'https://example.test/pay' } as const
        expect(mayReachCardStep({ kind: 'handoff', source: 'membership', action: card })).toBe(true)
        expect(mayReachCardStep({ kind: 'handoff', source: 'membership', action: redirect })).toBe(
            false,
        )
    })
})
