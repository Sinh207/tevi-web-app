import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { settledFrom, settleOutcomeFromError } from './settle-outcome'

describe('settledFrom', () => {
    it('reads `type` off a real settle body', () => {
        /*
         * A live 2xx from `payment/v3/stripe/callback/`, exactly as it comes off the wire: **flat**,
         * and carrying a `data` key of its own beside `type`. That collision is what broke a real
         * donation — the client unwraps `{ data }` by origin, so this body became its own `data`
         * field, `null`, and the success dialog printed the Star copy. The endpoint now opts out
         * (`enveloped: false`); this test is the shape that must keep working.
         */
        const body = {
            code: '5767679921',
            payment: {
                id: '01a025a7-f40d-77ba-968a-87e79fb66a62',
                gateway: 'gw.stripe',
                amount: '1.38',
                amount_currency: 'USD',
                charge_status: 'CHARGED',
            },
            type: 'direct_donation',
            data: null,
        }
        expect(settledFrom(body)).toEqual({ status: 'settled', purchaseType: 'direct_donation' })
    })

    it('also reads it through one envelope, in case the endpoint is ever brought in line', () => {
        // Top level wins when a body somehow carries both, so this can never read the wrong one.
        expect(settledFrom({ data: { type: 'subscription' } })).toEqual({
            status: 'settled',
            purchaseType: 'subscription',
        })
        expect(settledFrom({ type: 'star', data: { type: 'subscription' } })).toEqual({
            status: 'settled',
            purchaseType: 'star',
        })
    })

    it('keeps the purchase type when there is one', () => {
        expect(settledFrom({ type: 'star' })).toEqual({ status: 'settled', purchaseType: 'star' })
        expect(settledFrom({ type: '  ' })).toEqual({ status: 'settled', purchaseType: null })
        expect(settledFrom(null)).toEqual({ status: 'settled', purchaseType: null })
    })
})

describe('settleOutcomeFromError', () => {
    it('reads PM0003 as pending, not as a failure', () => {
        const error = new ApiError({ message: 'processing', status: 400, code: 'PM0003' })
        expect(settleOutcomeFromError(error)).toEqual({ status: 'pending' })
    })

    it('reads another 4xx as a terminal refusal, with the backend sentence', () => {
        const error = new ApiError({
            message: 'axios wording',
            status: 402,
            code: 'PM0007',
            data: { message: 'Your card was declined.' },
        })
        expect(settleOutcomeFromError(error)).toEqual({
            status: 'rejected',
            text: 'Your card was declined.',
            code: 'PM0007',
        })
    })

    it('never lets axios wording reach the screen', () => {
        const error = new ApiError({ message: 'Request failed with status code 400', status: 400 })
        expect(settleOutcomeFromError(error)).toEqual({
            status: 'rejected',
            text: null,
            code: null,
        })
    })

    it('rethrows an expired session rather than calling the payment declined', () => {
        /*
         * The settle window is ~54s, long enough for a token to expire mid-poll. Reported as a
         * refusal, the reader whose money had left was told it failed and offered a Retry that would
         * charge again. 403/404/408 are the same kind of answer: we could not ask, so we do not know.
         */
        for (const status of [401, 403, 404, 408]) {
            const error = new ApiError({
                message: 'nope',
                status,
                data: { message: 'Unauthorized' },
            })
            expect(() => settleOutcomeFromError(error)).toThrow()
        }
    })

    it('still calls a genuine gateway refusal terminal', () => {
        // 400 / 402 / 422 are the gateway answering. Treating these as unknowable would leave a
        // declined card in "still processing" forever.
        for (const status of [400, 402, 422]) {
            expect(
                settleOutcomeFromError(new ApiError({ message: 'declined', status })),
            ).toMatchObject({ status: 'rejected' })
        }
    })

    it('rethrows what is about the request rather than the payment', () => {
        for (const error of [
            new ApiError({ message: 'offline', isNetwork: true }),
            new ApiError({ message: 'boom', status: 502 }),
            new ApiError({ message: 'slow down', status: 429 }),
            new ApiError({ message: 'aborted', isCanceled: true }),
            new Error('not an ApiError'),
        ]) {
            expect(() => settleOutcomeFromError(error)).toThrow()
        }
    })
})
