import { ApiError } from '@shared/lib/api/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get, post, del: vi.fn(), put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const { checkoutApi, NoCheckoutRequestError } = await import('./checkout-api')

const CONTEXT = {
    successUrl: 'https://tevi.dev/my-star',
    failUrl: 'https://tevi.dev/my-star',
    timezone: 'Asia/Ho_Chi_Minh',
}

beforeEach(() => {
    get.mockReset()
    post.mockReset()
})

describe('checkoutApi.create', () => {
    it('posts the order and answers a parsed action, not a body', async () => {
        post.mockResolvedValue({ action: 'STRIPE', action_data: { clientSecret: 'pi_1_secret' } })

        const action = await checkoutApi.create({
            order: { kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 },
            context: CONTEXT,
            accountId: 'acc-1',
        })

        expect(action).toEqual({ kind: 'card', clientSecret: 'pi_1_secret' })
        const [path, body, config] = post.mock.calls[0]
        expect(path).toBe('checkout/v3/checkout/')
        expect(body).toMatchObject({ payment_method: 'gw.stripe', quantity: 1000 })
        // The account that was active when the button was pressed, not when the request left.
        expect(config).toMatchObject({ accountId: 'acc-1' })
    })

    it('fails closed on an action this client cannot complete', async () => {
        post.mockResolvedValue({ action: 'MOMO', action_data: { deeplink: 'momo://pay' } })
        await expect(
            checkoutApi.create({
                order: { kind: 'stars', gatewayId: 'gw.momo', quantity: 100 },
                context: CONTEXT,
            }),
        ).resolves.toEqual({ kind: 'unsupported', action: 'MOMO' })
    })

    it('refuses a handoff — that endpoint belongs to another feature', async () => {
        await expect(
            checkoutApi.create({
                order: {
                    kind: 'handoff',
                    source: 'membership',
                    action: { kind: 'card', clientSecret: 'pi' },
                },
                context: CONTEXT,
            }),
        ).rejects.toBeInstanceOf(NoCheckoutRequestError)
        expect(post).not.toHaveBeenCalled()
    })
})

describe('checkoutApi.settle', () => {
    it('reads a 2xx as settled, keeping the type for the copy', async () => {
        post.mockResolvedValue({ type: 'star' })
        await expect(checkoutApi.settle({ clientSecret: 'pi_1' })).resolves.toEqual({
            status: 'settled',
            purchaseType: 'star',
        })
        expect(post).toHaveBeenCalledWith(
            'payment/v3/stripe/callback/',
            { clientSecret: 'pi_1' },
            /*
             * `enveloped: false`, asserted rather than waved through with `expect.anything()` — which
             * is exactly how the bug shipped. This endpoint answers a flat body carrying its own
             * `data` key, so the client's origin-wide unwrap handed the parser `null`: a settled
             * donation with no `type`, printed as the Star copy. See `checkout-api.ts`.
             */
            expect.objectContaining({ enveloped: false }),
        )
    })

    it('reads PM0003 as pending rather than as a failure', async () => {
        post.mockRejectedValue(new ApiError({ message: 'processing', status: 400, code: 'PM0003' }))
        await expect(checkoutApi.settle({ clientSecret: 'pi_1' })).resolves.toEqual({
            status: 'pending',
        })
    })

    it('reads another 4xx as a refusal with the backend own sentence', async () => {
        post.mockRejectedValue(
            new ApiError({
                message: 'axios wording',
                status: 402,
                code: 'PM0007',
                data: { message: 'Your card was declined.' },
            }),
        )
        await expect(checkoutApi.settle({ clientSecret: 'pi_1' })).resolves.toEqual({
            status: 'rejected',
            text: 'Your card was declined.',
            code: 'PM0007',
        })
    })

    it('lets a 5xx through — it says nothing about the payment', async () => {
        post.mockRejectedValue(new ApiError({ message: 'boom', status: 502 }))
        await expect(checkoutApi.settle({ clientSecret: 'pi_1' })).rejects.toBeInstanceOf(ApiError)
    })
})

describe('checkoutApi.settleGateway', () => {
    it('forwards the gateway query whole', async () => {
        post.mockResolvedValue({ type: 'star' })
        await checkoutApi.settleGateway({ params: { gateway: 'coda', TxnId: 'txn_9' } })
        expect(post).toHaveBeenCalledWith(
            'payment/v3/redirect-callback/',
            { gateway: 'coda', TxnId: 'txn_9' },
            // Flat body here too — legacy reads `res.data.type` for both callbacks.
            expect.objectContaining({ enveloped: false }),
        )
    })
})

/**
 * ⚠ **This describe used to pin a guess.** The body was mocked as `{ url }` because the parser read
 * `url`, and both were wrong: the service answers **`redirect_url`** (captured, and what legacy
 * reads). A parser and a test written from the same assumption agree with each other and with
 * nothing else — the only thing that broke the tie was a real response.
 *
 * So the happy case below is the captured body, verbatim down to the `?secret=`.
 */
describe('checkoutApi.getBillingPortal', () => {
    const PORTAL =
        'https://billing.stripe.com/p/session?secret=test_YWNjdF8xUzBJblhCZmlSelQzMExLLF9WQmJWWFpMbXI4VkwzZnZ2QVBrMjJORDdaTlQ1eEZi0100kkg8Hg62'

    it('answers the redirect_url the service sends', async () => {
        get.mockResolvedValue({ redirect_url: PORTAL })

        await expect(
            checkoutApi.getBillingPortal({ successUrl: 'https://tevi.dev/premium' }),
        ).resolves.toBe(PORTAL)

        const [path, params] = get.mock.calls[0]
        expect(path).toBe('payment/v3/stripe/portal/')
        // Stripe returns the reader here; the URL is this app's own origin (`checkoutReturnUrl`).
        expect(params).toEqual({ success_url: 'https://tevi.dev/premium' })
    })

    it('trims it, as it does every text field off this service', async () => {
        get.mockResolvedValue({ redirect_url: ' https://billing.stripe.com/p/session ' })
        await expect(
            checkoutApi.getBillingPortal({ successUrl: 'https://tevi.dev/premium' }),
        ).resolves.toBe('https://billing.stripe.com/p/session')
    })

    /**
     * `null` is the honest answer for an account with no Stripe customer behind it — a subscription
     * bought through an app store, or granted by a code. The caller draws no button rather than one
     * that opens `about:blank`.
     */
    it.each([{}, { redirect_url: '' }, { redirect_url: null }, { url: 'https://wrong.field' }])(
        'answers null for %j rather than a button that opens nothing',
        async body => {
            get.mockResolvedValue(body)
            await expect(
                checkoutApi.getBillingPortal({ successUrl: 'https://tevi.dev/premium' }),
            ).resolves.toBeNull()
        },
    )
})
