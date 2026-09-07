// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCheckoutCallback } from './use-checkout-callback'

/**
 * The three ways this can go wrong are all invisible from the call site, and two of them cost money:
 *
 * 1. **Running twice.** Legacy leaves `?payment_intent_client_secret=` on the URL on some branches
 *    and re-runs its effect on a boolean dependency, so a refresh re-settles the payment and a
 *    re-render can start a second poll beside the first (bugs #15 and #5 in `docs/PAYMENT.md`).
 * 2. **Running for the wrong session.** Every visitor carries an anonymous account, so acting before
 *    the bootstrap resolves attributes somebody's payment to nobody in particular.
 * 3. **Sweeping up too much.** The callback parameters go; the screen's own do not.
 */

const auth = vi.hoisted(() => ({ isAuthenticated: true, isBootstrapping: false }))
const replace = vi.hoisted(() => vi.fn())
/** Mutable, so a test can be on the page a real return URL comes back to. */
const nav = vi.hoisted(() => ({ pathname: '/live/ada' }))

vi.mock('@features/auth', () => ({ useAuth: () => auth }))
vi.mock('next/navigation', () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ replace }),
}))

function at(search: string) {
    window.history.replaceState({}, '', `${nav.pathname}${search}`)
}

function renderWatcher() {
    const onIntent = vi.fn()
    function Probe() {
        useCheckoutCallback({ onIntent })
        return null
    }
    const utils = render(<Probe />)
    return { ...utils, onIntent, rerender: () => utils.rerender(<Probe />) }
}

beforeEach(() => {
    auth.isAuthenticated = true
    auth.isBootstrapping = false
    nav.pathname = '/live/ada'
    replace.mockReset()
    at('')
})

describe('useCheckoutCallback', () => {
    it('hands a payment intent over once and takes the parameters off the URL', () => {
        at(
            '?payment_intent_client_secret=pi_1_secret&payment_intent=pi_1&redirect_status=succeeded',
        )
        const { onIntent, rerender } = renderWatcher()

        expect(onIntent).toHaveBeenCalledTimes(1)
        expect(onIntent).toHaveBeenCalledWith({
            kind: 'payment',
            clientSecret: 'pi_1_secret',
            redirectStatus: 'succeeded',
        })
        // Nothing left, so the pathname alone. A client secret is a bearer of the payment: it must
        // not sit in the address bar, in history, or in the next support ticket.
        expect(replace).toHaveBeenCalledWith('/live/ada', { scroll: false })

        /*
         * The guard. The effect is allowed to run as often as React likes — a parent re-render, a
         * `pathname` identity change — and the settle must still have happened once. This is the
         * assertion legacy fails.
         */
        act(() => {
            rerender()
        })
        expect(onIntent).toHaveBeenCalledTimes(1)
    })

    it('finishes a 3DS return to a channel page — the real URL Stripe sends back', () => {
        /*
         * Copied from a live redirect, `@` slug and all: 3DS returns to whatever page started the
         * payment, which for a donation is the creator's About tab. Pinned because every part of it is
         * a place this can break — the slug is a dynamic segment carrying an `@`, `tab=about` belongs
         * to the screen and not to us, and the secret must not survive the sweep.
         */
        nav.pathname = '/@xuanhung99'
        at(
            '?tab=about&payment_intent=pi_3U7bTLBfiRzT30LK1Dyjo40q' +
                '&payment_intent_client_secret=pi_3U7bTLBfiRzT30LK1Dyjo40q_secret_Y79oyW6CbaYbwL8ZY8sphmdHw' +
                '&redirect_status=succeeded',
        )
        const { onIntent } = renderWatcher()

        expect(onIntent).toHaveBeenCalledWith({
            kind: 'payment',
            clientSecret: 'pi_3U7bTLBfiRzT30LK1Dyjo40q_secret_Y79oyW6CbaYbwL8ZY8sphmdHw',
            redirectStatus: 'succeeded',
        })
        expect(replace).toHaveBeenCalledWith('/@xuanhung99?tab=about', { scroll: false })
    })

    it('keeps the screen’s own parameters and drops only the callback’s', () => {
        at('?tab=posts&TxnId=tx-1&gateway=coda')
        const { onIntent } = renderWatcher()

        expect(onIntent).toHaveBeenCalledWith({
            kind: 'gateway',
            params: { tab: 'posts', TxnId: 'tx-1', gateway: 'coda' },
        })
        /*
         * `tab=posts` survives: the reader came back to a screen they were on, and legacy replaces
         * the whole URL with its pathname — which is why `gift_token` is deliberately absent from
         * `CALLBACK_PARAMS`. The gateway's own parameters are forwarded whole and *then* swept.
         */
        expect(replace).toHaveBeenCalledWith('/live/ada?tab=posts', { scroll: false })
    })

    it('clears the gateway’s own parameters — they are forwarded, then spent', () => {
        at('?tab=posts&TxnId=tx-1&gateway=coda&status=1&vnp_SecureHash=deadbeef')
        const { onIntent } = renderWatcher()

        // Forwarded whole: the client cannot know which of these the provider signs its result with.
        expect(onIntent).toHaveBeenCalledWith({
            kind: 'gateway',
            params: {
                tab: 'posts',
                TxnId: 'tx-1',
                gateway: 'coda',
                status: '1',
                vnp_SecureHash: 'deadbeef',
            },
        })
        /*
         * And then swept — including `status` and `vnp_SecureHash`, which are in no list of ours. The
         * poll holds them; leaving them would nest a stale reference into the next return URL.
         */
        expect(replace).toHaveBeenCalledWith('/live/ada?tab=posts', { scroll: false })
    })

    it('ignores a card setup, and leaves it on the URL for the flow that owns it', () => {
        at('?setup_intent_client_secret=seti_1_secret&redirect_status=succeeded')
        const { onIntent } = renderWatcher()

        // A SetupIntent is a card being saved, not money moving.
        expect(onIntent).not.toHaveBeenCalled()
        // And it is not swept: the add-card dialog is what comes back to this URL.
        expect(replace).not.toHaveBeenCalled()
    })

    it('does nothing at all on an ordinary page load', () => {
        at('?tab=posts')
        const { onIntent } = renderWatcher()

        expect(onIntent).not.toHaveBeenCalled()
        expect(replace).not.toHaveBeenCalled()
    })

    it('waits for a real account rather than settling as the anonymous one', () => {
        auth.isAuthenticated = false
        at('?payment_intent_client_secret=pi_1_secret')
        const { onIntent, rerender } = renderWatcher()

        expect(onIntent).not.toHaveBeenCalled()
        /*
         * And the parameters are **left alone**. They are the only record that a payment is waiting;
         * erasing them to keep the URL tidy would lose it. If the reader signs in on this page, the
         * effect runs then — which is what the second half of this test states.
         */
        expect(replace).not.toHaveBeenCalled()

        auth.isAuthenticated = true
        act(() => {
            rerender()
        })
        expect(onIntent).toHaveBeenCalledTimes(1)
    })

    it('waits for the session bootstrap to finish', () => {
        auth.isBootstrapping = true
        at('?payment_intent_client_secret=pi_1_secret')
        const { onIntent, rerender } = renderWatcher()

        expect(onIntent).not.toHaveBeenCalled()

        auth.isBootstrapping = false
        act(() => {
            rerender()
        })
        expect(onIntent).toHaveBeenCalledTimes(1)
    })
})
