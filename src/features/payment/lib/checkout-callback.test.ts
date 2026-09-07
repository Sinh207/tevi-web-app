import { describe, expect, it } from 'vitest'
import {
    hasCheckoutCallback,
    parseCheckoutCallback,
    stripCallbackParams,
    stripHandledParams,
} from './checkout-callback'

describe('parseCheckoutCallback', () => {
    it('reads a returning PaymentIntent, with the redirect status as a hint', () => {
        expect(
            parseCheckoutCallback(
                'payment_intent=pi_1&payment_intent_client_secret=pi_1_secret&redirect_status=succeeded',
            ),
        ).toEqual({ kind: 'payment', clientSecret: 'pi_1_secret', redirectStatus: 'succeeded' })
    })

    it('tells a saved card apart from a charge', () => {
        expect(
            parseCheckoutCallback(
                'setup_intent_client_secret=seti_1_secret&redirect_status=succeeded',
            ),
        ).toEqual({
            kind: 'card-setup',
            clientSecret: 'seti_1_secret',
            redirectStatus: 'succeeded',
        })
    })

    it('forwards a gateway round-trip whole, as legacy does', () => {
        expect(parseCheckoutCallback('gateway=coda&TxnId=txn_9&extra=1')).toEqual({
            kind: 'gateway',
            params: { gateway: 'coda', TxnId: 'txn_9', extra: '1' },
        })
    })

    it('ignores a bare `?gateway=`, which names a provider and identifies no payment', () => {
        expect(parseCheckoutCallback('gateway=coda')).toBeNull()
        expect(hasCheckoutCallback('gateway=coda')).toBe(false)
        // Blanks do not count as company, for the same reason they do not count anywhere else here.
        expect(parseCheckoutCallback('gateway=coda&noise=%20')).toBeNull()
    })

    it("does not let our own parameters stand in as the gateway's reference", () => {
        // Stripe's hint and our own bookkeeping. Neither identifies a payment to `redirect-callback/`,
        // and settling on them would answer `rejected` for a payment nobody made.
        expect(parseCheckoutCallback('gateway=coda&redirect_status=succeeded')).toBeNull()
        expect(parseCheckoutCallback('gateway=coda&payment_intent=pi_1')).toBeNull()
    })

    it('accepts `gateway` once something else is on the URL with it', () => {
        expect(parseCheckoutCallback('gateway=coda&status=1')).toEqual({
            kind: 'gateway',
            params: { gateway: 'coda', status: '1' },
        })
    })

    it('accepts `TxnId` alone — it names the transaction', () => {
        expect(parseCheckoutCallback('TxnId=txn_9')).toEqual({
            kind: 'gateway',
            params: { TxnId: 'txn_9' },
        })
    })

    it('prefers the payment intent when a URL carries both', () => {
        expect(
            parseCheckoutCallback('gateway=stripe&payment_intent_client_secret=pi_2')?.kind,
        ).toBe('payment')
    })

    it('is null for an ordinary page load, and for blank parameters', () => {
        expect(parseCheckoutCallback('')).toBeNull()
        expect(parseCheckoutCallback('tab=posts')).toBeNull()
        expect(parseCheckoutCallback('payment_intent_client_secret=%20')).toBeNull()
        expect(hasCheckoutCallback('tab=posts')).toBe(false)
    })

    it('accepts a URLSearchParams as well as a string', () => {
        const params = new URLSearchParams({ payment_intent_client_secret: 'pi_3' })
        expect(parseCheckoutCallback(params)).toMatchObject({ clientSecret: 'pi_3' })
    })
})

describe('stripCallbackParams', () => {
    it('removes only the callback parameters', () => {
        expect(
            stripCallbackParams(
                'tab=posts&payment_intent=pi_1&payment_intent_client_secret=s&redirect_status=succeeded',
            ),
        ).toBe('tab=posts')
    })

    it('keeps `gift_token`, which belongs to the screen and not to the callback', () => {
        expect(stripCallbackParams('gift_token=tok_1&payment_intent_client_secret=s')).toBe(
            'gift_token=tok_1',
        )
    })

    it('is empty when the callback was all there was', () => {
        expect(stripCallbackParams('payment_intent_client_secret=s&redirect_status=failed')).toBe(
            '',
        )
    })
})

describe('stripHandledParams', () => {
    const gateway = (search: string) => {
        const intent = parseCheckoutCallback(search)
        if (intent?.kind !== 'gateway') throw new Error(`not a gateway callback: ${search}`)
        return stripHandledParams(search, intent)
    }

    it('clears a gateway’s own parameters, which are spent the moment they are forwarded', () => {
        expect(gateway('TxnId=tx-1&gateway=coda&status=1&signature=abc')).toBe('')
    })

    it('keeps the screen’s parameters and nothing else', () => {
        expect(
            gateway('tab=posts&gift_token=tok_1&utm_campaign=tet&TxnId=tx-1&vnp_SecureHash=x'),
        ).toBe('tab=posts&gift_token=tok_1&utm_campaign=tet')
    })

    it('leaves nothing a later return URL could shadow the fresh reference with', () => {
        // The failure this prevents: `status=1` survives, `checkoutReturnUrl` keeps it, the next
        // gateway appends its own `status`, and `URLSearchParams.get` answers with the stale one.
        const remaining = gateway('gateway=coda&status=1')
        expect(new URLSearchParams(remaining).get('status')).toBeNull()
    })

    it('falls back to the name list for a Stripe return, where every name is known', () => {
        const search = 'tab=about&payment_intent=pi_1&payment_intent_client_secret=s'
        const intent = parseCheckoutCallback(search)
        expect(intent?.kind).toBe('payment')
        expect(stripHandledParams(search, intent!)).toBe(stripCallbackParams(search))
        expect(stripHandledParams(search, intent!)).toBe('tab=about')
    })
})
