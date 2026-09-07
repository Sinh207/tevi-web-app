// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CheckoutState } from '../lib/checkout-machine'
import type { CheckoutOrder } from '../lib/checkout-order'
import { CheckoutStatusDialog } from './checkout-status-dialog'

/**
 * Two rules that are easy to write and easy to lose, and one of them is the reason the dialog exists.
 *
 * - **`confirming` cannot be dismissed.** Not "has a disabled button" — there is no control, and the
 *   Escape key does nothing. Closing it would unmount the Elements instance completing a charge.
 * - **A failure prints the sentence it was given**, and its own key only when it was given none. The
 *   filtering (4xx bodies and card errors only) happened upstream; getting the *choice* wrong here
 *   would silently replace "Your card was declined" with a generic apology.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
// `next/link` wants App Router context, which a component test has no business standing up.
vi.mock('next/link', () => ({
    default: ({ children, ...props }: { children: React.ReactNode }) => (
        <a {...props}>{children}</a>
    ),
}))

const ORDER: CheckoutOrder = { kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 }

function show(state: Parameters<typeof CheckoutStatusDialog>[0]['state']) {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    render(<CheckoutStatusDialog state={state} onClose={onClose} onRetry={onRetry} />)
    return { onClose, onRetry }
}

describe('CheckoutStatusDialog', () => {
    it('offers nothing to press while a charge is confirming', () => {
        const { onClose } = show({
            kind: 'confirming',
            order: ORDER,
            clientSecret: 'pi_1_secret',
        })

        expect(screen.getByText('payment_status_confirming_title')).toBeTruthy()
        // No footer at all — not a disabled Close, which would read as "this will work in a moment".
        expect(screen.queryByRole('button')).toBeNull()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('lets a settling payment be dismissed — the money has already left', () => {
        show({ kind: 'settling', order: ORDER, settleRef: 'pi_1_secret', attempt: 2 })

        expect(screen.getByText('payment_status_settling_title')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'common_close' })).toBeTruthy()
    })

    it('draws slow as a state of its own, with somewhere to go', () => {
        show({ kind: 'slow', order: ORDER, settleRef: 'pi_1_secret' })

        // Not a failure: the money has left and nothing refused it.
        expect(screen.getByText('payment_status_slow_title')).toBeTruthy()
        expect(screen.getByText('payment_action_view_my_star')).toBeTruthy()
    })

    /**
     * ⚠ The regression this shipped with. `View My Star` is a real link — it navigates — but this
     * dialog is mounted by `PaymentProvider`, **above every route**, so a client-side navigation
     * unmounts nothing and `open` is still true. The reader landed on `/my-star` with the modal they
     * had just left still over it.
     *
     * Asserted as "it is a link **and** it closes", because either half alone is a way to break it:
     * closing without navigating, or navigating without closing.
     */
    it('closes when the reader follows it to My Star — this dialog outlives the route', () => {
        const { onClose } = show({ kind: 'slow', order: ORDER, settleRef: 'pi_1_secret' })

        const link = screen.getByRole('link', { name: 'payment_action_view_my_star' })
        expect(link.getAttribute('href')).toBe('/my-star')

        /*
         * The double is a plain `<a href>`, so without this jsdom tries to leave the document and
         * logs `Not implemented: navigation to another Document` into an otherwise clean run. The
         * real `next/link` prevents the default and routes itself; what is under test is the handler
         * beside it, not the browser's navigation.
         */
        link.addEventListener('click', event => event.preventDefault())
        fireEvent.click(link)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('prints the backend’s sentence when there is one, and the key when there is not', () => {
        const { unmount } = render(
            <CheckoutStatusDialog
                state={{
                    kind: 'failed',
                    order: ORDER,
                    messageKey: 'payment_error_generic',
                    text: 'Your card was declined.',
                }}
                onClose={vi.fn()}
                onRetry={vi.fn()}
            />,
        )
        expect(screen.getByText('Your card was declined.')).toBeTruthy()
        expect(screen.queryByText('payment_error_generic')).toBeNull()
        unmount()

        show({
            kind: 'failed',
            order: ORDER,
            messageKey: 'payment_error_unsupported_method',
            text: null,
        })
        expect(screen.getByText('payment_error_unsupported_method')).toBeTruthy()
    })

    it('announces the status region politely, so a screen reader hears the transitions', () => {
        const { container } = render(
            <CheckoutStatusDialog
                state={{ kind: 'succeeded', order: ORDER, purchaseType: 'star' }}
                onClose={vi.fn()}
                onRetry={vi.fn()}
            />,
        )

        // The dialog is portalled, so the region is looked for in the document rather than the tree.
        expect(container.ownerDocument.querySelector('[aria-live="polite"]')).toBeTruthy()
        // And it never auto-closes: the only way out is the button.
        expect(screen.getByRole('button', { name: 'payment_action_done' })).toBeTruthy()
    })

    it('draws nothing at all while idle', () => {
        const { container } = render(
            <CheckoutStatusDialog state={{ kind: 'idle' }} onClose={vi.fn()} onRetry={vi.fn()} />,
        )
        expect(container.ownerDocument.querySelector('[aria-live="polite"]')).toBeNull()
    })
})

describe('CheckoutStatusDialog — copy chosen by the settle response', () => {
    /**
     * The response's `type` is what the backend says was bought, and it is the only thing that knows.
     * One generic sentence used to cover all three, so a membership renewal and a donation both read
     * "Your purchase is complete".
     */
    function renderSucceeded(purchaseType: string | null, onBuyMore?: () => void) {
        return render(
            <CheckoutStatusDialog
                state={{ kind: 'succeeded', order: ORDER, purchaseType }}
                onClose={vi.fn()}
                onRetry={vi.fn()}
                onBuyMore={onBuyMore}
            />,
        )
    }

    it('says "you are a member" for a subscription, and offers nothing further', () => {
        renderSucceeded('subscription', vi.fn())
        expect(screen.getByText('payment_status_membership_title')).toBeTruthy()
        // "Become a member again" is not a next step — legacy hides the offer for this type too.
        expect(screen.queryByText('payment_action_buy_more')).toBeNull()
    })

    it('thanks the donor for either donation type', () => {
        const { unmount } = renderSucceeded('direct_donation', vi.fn())
        expect(screen.getByText('payment_status_donation_title')).toBeTruthy()
        expect(screen.queryByText('payment_action_buy_more')).toBeNull()
        unmount()

        renderSucceeded('crowdfunding_donation', vi.fn())
        expect(screen.getByText('payment_status_donation_title')).toBeTruthy()
    })

    it('offers more Star after a Star purchase, and after an unrecognised type', () => {
        const { unmount } = renderSucceeded('star_conversion', vi.fn())
        expect(screen.getByText('payment_status_succeeded_title')).toBeTruthy()
        expect(screen.getByText('payment_action_buy_more')).toBeTruthy()
        unmount()

        // Legacy's own default. See `purchaseKind` and B69.
        renderSucceeded(null, vi.fn())
        expect(screen.getByText('payment_action_buy_more')).toBeTruthy()
    })

    it('draws no offer where there is no sheet to open', () => {
        // A surface without a purchase sheet must not offer one — `onBuyMore` absent.
        renderSucceeded('star_conversion')
        expect(screen.getByText('payment_status_succeeded_title')).toBeTruthy()
        expect(screen.queryByText('payment_action_buy_more')).toBeNull()
    })
})

describe('CheckoutStatusDialog — retrying a failure', () => {
    function renderFailed(order: CheckoutOrder | null) {
        cleanup()
        const onRetry = vi.fn()
        render(
            <CheckoutStatusDialog
                state={{ kind: 'failed', order, messageKey: 'payment_error_generic', text: null }}
                onClose={vi.fn()}
                onRetry={onRetry}
            />,
        )
        return onRetry
    }

    it('offers Try again when there is an order to restart', () => {
        renderFailed(ORDER)
        expect(screen.getByRole('button', { name: 'common_retry' })).toBeTruthy()
    })

    it('does not offer it for a payment resumed from a URL, which has no order', () => {
        /*
         * A 3DS return is a fresh document: the machine takes the client secret off the URL and knows
         * nothing else, so `retry()` — `if (order) start(order)` — has nothing to start. The button
         * used to be rendered anyway and did nothing at all, on the one screen where that is least
         * affordable. Close is then the primary action.
         */
        renderFailed(null)
        expect(screen.queryByRole('button', { name: 'common_retry' })).toBeNull()
        expect(screen.getByRole('button', { name: 'common_close' })).toBeTruthy()
    })
})

describe('CheckoutStatusDialog — the artwork', () => {
    /**
     * The mapping, and the still that stands beside every animation.
     *
     * Worth pinning because both halves are silent when wrong: the two working states share one asset
     * and the two verdicts must not (a cross where a tick belongs is the worst bug this dialog has), and
     * a missing still is an animation that keeps playing for a reader who asked it not to.
     */
    function sources(state: CheckoutState) {
        // Each call is its own render: the DS dialog portals out of `container`, so these queries have
        // to reach the whole document, and two renders in one test would otherwise be counted together.
        cleanup()
        const { container } = render(
            <CheckoutStatusDialog state={state} onClose={vi.fn()} onRetry={vi.fn()} />,
        )
        const root = container.ownerDocument
        return {
            // No `<video>` anywhere: h264 cannot carry an alpha channel, which is the whole point of
            // this artwork. If one appears again, the white plate came back with it.
            videos: root.querySelectorAll('video').length,
            images: [...root.querySelectorAll('img')].map(img => img.getAttribute('src') ?? ''),
            /** The reduced-motion alternative, which must be a `<source>` and not a hidden `<img>`. */
            sources: [...root.querySelectorAll('source')].map(el => ({
                media: el.getAttribute('media') ?? '',
                srcset: el.getAttribute('srcset') ?? '',
            })),
        }
    }

    it('shows one looping asset while the payment is being taken', () => {
        for (const state of [
            { kind: 'confirming', order: ORDER, clientSecret: 'pi_1' },
            { kind: 'settling', order: ORDER, settleRef: 'pi_1', attempt: 1 },
        ] as CheckoutState[]) {
            const shown = sources(state)
            expect(shown.videos).toBe(0)
            expect(shown.images).toEqual(['/illustrations/payment/progress.webp'])
            /*
             * Exactly one `<img>`, and the still offered as a `<source>`. A hidden `<img>` is still
             * downloaded, so the earlier CSS swap made a reader who asked for *less* motion pay for the
             * animation as well — 64 KB of arrows to show none of them.
             */
            expect(shown.sources).toEqual([
                {
                    media: '(prefers-reduced-motion: reduce)',
                    srcset: '/illustrations/payment/progress-still.webp',
                },
            ])
        }
    })

    it('shows each verdict its own mark, with its own still', () => {
        const done = sources({ kind: 'succeeded', order: ORDER, purchaseType: 'star' })
        expect(done.images).toEqual(['/illustrations/payment/success.webp'])
        expect(done.sources[0]?.srcset).toBe('/illustrations/payment/success-still.webp')

        const failed = sources({
            kind: 'failed',
            order: ORDER,
            messageKey: 'payment_error_generic',
            text: null,
        })
        expect(failed.images).toEqual(['/illustrations/payment/failed.webp'])
        expect(failed.sources[0]?.srcset).toBe('/illustrations/payment/failed-still.webp')
    })

    it('serves the file itself, or it would arrive as its own first frame', () => {
        const shown = sources({ kind: 'succeeded', order: ORDER, purchaseType: 'star' })
        /*
         * The path as given, never `/_next/image?url=…`: the optimiser reduces an animated file to its
         * first frame, so a tick would arrive already drawn and the arrows would never turn. That is
         * why this is a plain `<img>` and not `next/image`.
         */
        expect(shown.images[0]).toBe('/illustrations/payment/success.webp')
    })

    it('leaves `slow` on its glyph — the set has no art for "we stopped watching"', () => {
        const slow = sources({ kind: 'slow', order: ORDER, settleRef: 'pi_1' })
        expect(slow.videos).toBe(0)
        expect(slow.images).toHaveLength(0)
    })
})
