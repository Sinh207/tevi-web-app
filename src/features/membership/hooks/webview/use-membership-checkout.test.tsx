// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MembershipPackage } from '../../api/types'
import { useMembershipCheckout } from './use-membership-checkout'

/**
 * What this hook promises, none of which a comment can pin:
 *
 * - it asks the **host** for the intent, once per screen, with the whole price row — and asks for
 *   **nothing** on a page that came back carrying a payment callback, where a second intent is a
 *   second charge;
 * - without a host it does not fetch, does not ask, and says so;
 * - `PM0003` from the bridge is *not yet*, a bridge failure is *not* a decline, and a live checkout
 *   outranks every other reason the screen might have to draw something else;
 * - the card list failing does not stop the checkout — the new-method form can still complete it.
 */

const getChannelPackage = vi.hoisted(() => vi.fn())
const getCreator = vi.hoisted(() => vi.fn())

vi.mock('../../api/creator-api', () => ({ creatorApi: { getCreator } }))

vi.mock('../../api/subscription-api', async () => {
    const actual = await vi.importActual<typeof import('../../api/subscription-api')>(
        '../../api/subscription-api',
    )
    return { ...actual, membershipApi: { ...actual.membershipApi, getChannelPackage } }
})

const membershipCheckout = vi.hoisted(() => vi.fn())
const getPaymentMethods = vi.hoisted(() => vi.fn())
const stripeCallback = vi.hoisted(() => vi.fn())
const hasBridge = vi.hoisted(() => ({ value: true }))

vi.mock('@shared/lib/native-bridge', async () => {
    const actual = await vi.importActual<typeof import('@shared/lib/native-bridge')>(
        '@shared/lib/native-bridge',
    )
    return {
        ...actual,
        hasNativeBridge: () => hasBridge.value,
        nativeBridge: {
            ...actual.nativeBridge,
            membershipCheckout,
            getPaymentMethods,
            stripeCallback,
        },
    }
})

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

/** A tier priced in both currencies — the ordinary case this screen is opened on. */
const BOTH: MembershipPackage = {
    id: 'pkg_1',
    name: 'Gold',
    description: null,
    channel: null,
    prices: [
        { id: 'price_tvs', amount: 500, amount_currency: 'TVS' },
        { id: 'price_usd', amount: 5, amount_currency: 'USD' },
    ],
}

const STAR_ONLY: MembershipPackage = {
    ...BOTH,
    prices: [{ id: 'price_tvs', amount: 500, amount_currency: 'TVS' }],
}

/**
 * The host's answer to `membershipCheckout`, in the shape a **live** response has: the action beside a
 * `payment` block whose `amount` is what the gateway will take.
 *
 * `"1.38"` on a `$1.00` tier is not arbitrary — it is `1.00 + round((0.059 + 0.30) / 0.941)`, i.e. the
 * backend applying the same formula `membershipFee` hard-codes (B71).
 */
const INTENT_REPLY = {
    success: true,
    code: null,
    message: null,
    data: {
        action: 'STRIPE',
        action_data: { clientSecret: 'pi_1_secret' },
        payment: { amount: '1.38', amount_currency: 'USD', charge_status: 'PENDING' },
    },
}

function at(search = '') {
    window.history.replaceState(null, '', `/app/ada/membership/pkg_1${search}`)
}

function renderCheckout({ strict = false } = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api!: ReturnType<typeof useMembershipCheckout>
    function Probe() {
        api = useMembershipCheckout({ slug: 'ada', packageId: 'pkg_1' })
        return null
    }
    const tree = (
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>
    )
    const utils = render(strict ? <StrictMode>{tree}</StrictMode> : tree)
    return { read: () => api, ...utils }
}

beforeEach(() => {
    vi.clearAllMocks()
    hasBridge.value = true
    at()
    getChannelPackage.mockResolvedValue(BOTH)
    getCreator.mockResolvedValue(null)
    membershipCheckout.mockResolvedValue(INTENT_REPLY)
    getPaymentMethods.mockResolvedValue({ success: true, code: null, message: null, data: [] })
    stripeCallback.mockResolvedValue({ success: true, code: null, message: null, data: {} })
})

describe('useMembershipCheckout', () => {
    it('asks the host for the intent once, with the whole USD price row', async () => {
        renderCheckout()
        await waitFor(() => expect(membershipCheckout).toHaveBeenCalledTimes(1))
        expect(membershipCheckout).toHaveBeenCalledWith({
            packageId: 'pkg_1',
            priceInfo: { id: 'price_usd', amount: 5, amount_currency: 'USD' },
        })
    })

    it('enters the card step on the host’s envelope', async () => {
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('paying'))
        expect(read().state).toMatchObject({ kind: 'card', clientSecret: 'pi_1_secret' })
    })

    /**
     * ⚠ The figure on the button and in the summary is the **backend's**, not this client's.
     *
     * The tier is `$5.00`, so `cashOffer` computes `$5.63`; the (deliberately different) reply says
     * `1.38`. The reply wins, and the fee is the difference — which is what makes a future change to
     * the platform's rate show through instead of leaving every confirm screen quietly wrong (B71).
     */
    it('prints the backend’s own total, with the fee derived from it', async () => {
        const { read } = renderCheckout()
        await waitFor(() => expect(read().amountLabel).toBe('$1.38'))
        expect(read().charge).toEqual({ price: 5, fee: 0, total: 1.38 })
    })

    /** Until the intent exists there is nothing authoritative, so the computed total stands. */
    it('falls back to its own arithmetic when the reply carries no payment block', async () => {
        membershipCheckout.mockResolvedValue({
            success: true,
            code: null,
            message: null,
            data: { action: 'STRIPE', action_data: { clientSecret: 'pi_1_secret' } },
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('paying'))
        /* `5.00 + membershipFee(5)` = `5.63`, through the app's own formatter. */
        expect(read().amountLabel).toBe('$5.63')
        expect(read().charge).toEqual({ price: 5, fee: 0.63, total: 5.63 })
    })

    /** A total in another currency is somebody else's number; printing it with a `$` would be a lie. */
    it('ignores an authoritative total in a currency it does not display', async () => {
        membershipCheckout.mockResolvedValue({
            ...INTENT_REPLY,
            data: {
                ...INTENT_REPLY.data,
                payment: { amount: '32000', amount_currency: 'VND' },
            },
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('paying'))
        expect(read().amountLabel).toBe('$5.63')
    })

    /**
     * The header of a checkout names who is about to be paid, so it is fetched rather than inferred.
     * Whether the tier payload also carries it is **B85** — unanswered, and not worth a guess here.
     */
    it('fetches the creator’s public profile beside the tier', async () => {
        getCreator.mockResolvedValue({
            id: 'ch_1',
            name: 'Ada Lovelace',
            slug: 'ada',
            images: { thumb: 'https://cdn/ada.jpg', avatar_video: null },
            verified_tick_badge: { image: null },
            is_premium: false,
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().channel?.name).toBe('Ada Lovelace'))
        expect(getCreator).toHaveBeenCalledWith(expect.objectContaining({ slug: 'ada' }))
    })

    /** When the tier already carries the space, that copy wins and no second identity is invented. */
    it('prefers the tier payload’s channel over the fetched profile', async () => {
        getChannelPackage.mockResolvedValue({
            ...BOTH,
            channel: {
                id: 'ch_1',
                name: 'From the tier',
                slug: 'ada',
                images: null,
                verified_tick_badge: null,
                is_premium: false,
            },
        })
        getCreator.mockResolvedValue({
            id: 'ch_1',
            name: 'From core',
            slug: 'ada',
            images: null,
            verified_tick_badge: null,
            is_premium: false,
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().channel?.name).toBe('From the tier'))
    })

    /** A creator that will not load costs a picture and a name, never the checkout. */
    it('still reaches the card step when the profile cannot be read', async () => {
        getCreator.mockRejectedValue(new Error('nope'))
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('paying'))
        expect(read().channel).toBeNull()
    })

    it('reads the saved cards from the host, not from the API', async () => {
        getPaymentMethods.mockResolvedValue({
            success: true,
            code: null,
            message: null,
            data: [{ id: 'pm_1', default: true, card: { brand: 'visa', last4: '4242' } }],
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().cards).toHaveLength(1))
        expect(read().cards[0]).toMatchObject({ id: 'pm_1' })
    })

    /**
     * The card list is a convenience, not a gate: with none, `PayWithCardPanel` opens on its
     * new-method form, which can complete the payment on its own. Legacy blocks the whole checkout
     * behind this call returning.
     */
    it('still reaches the card step when the host cannot list cards', async () => {
        getPaymentMethods.mockRejectedValue(new Error('no host'))
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('paying'))
        expect(read().cards).toEqual([])
    })

    /**
     * The expensive one. A page back from 3DS already has a payment; asking for a second charges
     * twice. The flag is read on the **first render**, before the effect strips the parameters.
     */
    it('asks for no intent on a page entered with a payment callback, and settles instead', async () => {
        at('?payment_intent_client_secret=pi_9_secret&redirect_status=succeeded')
        const { read } = renderCheckout()
        await waitFor(() =>
            expect(stripeCallback).toHaveBeenCalledWith({ clientSecret: 'pi_9_secret' }),
        )
        expect(membershipCheckout).not.toHaveBeenCalled()
        await waitFor(() => expect(read().state.kind).toBe('succeeded'))
    })

    /** The secret is a bearer of the payment; it must not stay in the address bar to be reloaded. */
    it('strips the callback parameters once it has acted on them', async () => {
        at('?payment_intent_client_secret=pi_9_secret&keep=1')
        renderCheckout()
        await waitFor(() => expect(window.location.search).toBe('?keep=1'))
    })

    it('does nothing at all without a native host', async () => {
        hasBridge.value = false
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('unsupported'))
        expect(getChannelPackage).not.toHaveBeenCalled()
        expect(getCreator).not.toHaveBeenCalled()
        expect(membershipCheckout).not.toHaveBeenCalled()
        expect(getPaymentMethods).not.toHaveBeenCalled()
    })

    it('offers nothing for a Star-only tier', async () => {
        getChannelPackage.mockResolvedValue(STAR_ONLY)
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('unavailable'))
        expect(membershipCheckout).not.toHaveBeenCalled()
    })

    it('shows the host’s own sentence when it refuses the checkout', async () => {
        membershipCheckout.mockResolvedValue({
            success: false,
            code: 'B0001',
            message: 'This tier is closed',
            data: null,
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('status'))
        expect(read().state).toMatchObject({ kind: 'failed', text: 'This tier is closed' })
    })

    /** `PM0003` is "the bank has not decided" — not an error, and not a reason to stop asking. */
    it('keeps polling on PM0003 and succeeds when the host changes its answer', async () => {
        at('?payment_intent_client_secret=pi_9_secret')
        stripeCallback
            .mockResolvedValueOnce({ success: false, code: 'PM0003', message: null, data: null })
            .mockResolvedValue({
                success: true,
                code: null,
                message: null,
                data: { type: 'membership' },
            })

        const { read } = renderCheckout()
        await waitFor(() => expect(read().state.kind).toBe('succeeded'), { timeout: 8000 })
        expect(stripeCallback.mock.calls.length).toBeGreaterThan(1)
    }, 15_000)

    /**
     * ⚠ The regression this exists for, found in a browser and not by any of the tests above.
     *
     * React's development double-mount runs the effects, tears them down — which aborts the settle —
     * and runs them again. With a plain once-flag the second pass declined to restart, so the screen
     * sat on *Processing your payment* with **no request in flight**, for ever. `StrictMode` here is
     * what reproduces that teardown; the guard is now "already resumed *and* still polling".
     */
    it('picks the settle back up when its flow is torn down and remounted', async () => {
        at('?payment_intent_client_secret=pi_9_secret')
        const { read } = renderCheckout({ strict: true })
        await waitFor(() =>
            expect(stripeCallback).toHaveBeenCalledWith({ clientSecret: 'pi_9_secret' }),
        )
        await waitFor(() => expect(read().state.kind).toBe('succeeded'))
    })

    /**
     * A live checkout outranks everything below it. Without the ordering, a tier refetch that fails
     * while the money is settling replaces the outcome with "this tier could not be loaded" — the
     * shape legacy's provider has, which tests `errorMsg` first.
     */
    it('keeps the verdict on screen when the tier query fails underneath it', async () => {
        at('?payment_intent_client_secret=pi_9_secret')
        getChannelPackage.mockRejectedValue(new Error('nope'))
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('status'))
    })

    it('re-reads the tier when that is what failed, rather than asking for an intent', async () => {
        getChannelPackage.mockRejectedValueOnce(new Error('nope')).mockResolvedValue(BOTH)
        const { read } = renderCheckout()
        await waitFor(() => expect(read().step).toBe('error'))
        expect(membershipCheckout).not.toHaveBeenCalled()

        act(() => read().retry())
        await waitFor(() => expect(read().step).toBe('paying'))
        expect(membershipCheckout).toHaveBeenCalledTimes(1)
    })

    /** Retry is a **new** intent: the old one has been confirmed and refused. */
    it('asks for a fresh intent on retry after a refusal', async () => {
        membershipCheckout.mockResolvedValueOnce({
            success: false,
            code: null,
            message: 'Declined',
            data: null,
        })
        const { read } = renderCheckout()
        await waitFor(() => expect(read().state.kind).toBe('failed'))

        act(() => read().retry())
        await waitFor(() => expect(membershipCheckout).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(read().step).toBe('paying'))
    })
})
