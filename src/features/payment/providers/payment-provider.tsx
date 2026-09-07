'use client'

import { balanceKeys } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { eventBus } from '@shared/lib/event-bus'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { CardCheckoutDialog } from '../components/card-checkout-dialog'
import { CheckoutStatusDialog } from '../components/checkout-status-dialog'
import { StarPurchaseDialog } from '../components/star-purchase-dialog'
import type { CheckoutSubmission } from '../hooks/use-checkout'
import { useCheckout } from '../hooks/use-checkout'
import { useCheckoutCallback } from '../hooks/use-checkout-callback'
import { useSavedCards } from '../hooks/use-saved-cards'
import { useStarPurchase } from '../hooks/use-star-purchase'
import { type CheckoutState, checkoutActionOf } from '../lib/checkout-machine'
import { type CheckoutOrder, mayReachCardStep } from '../lib/checkout-order'
import { GET_STAR_PATH } from '../routes'

/**
 * The one live checkout in the app, and the two things that watch it.
 *
 * It holds the machine (`useCheckout`), mounts the URL watcher (`useCheckoutCallback`) and mounts the
 * status dialog. Everything else about paying — which package, which gateway, which card — belongs to
 * the surface that starts the order; this owns the *act*, from the press to the verdict.
 *
 * ## Why a provider rather than a hook per surface
 *
 * Because a payment outlives the thing that started it. A 3DS hop leaves the page and comes back to a
 * fresh document; a settle can run for the better part of a minute after the reader has closed the
 * dialog and navigated on. A hook inside the Star sheet would be unmounted for both, which is exactly
 * how legacy loses track — its poll lives in three components, and each of them stops mattering the
 * moment its screen does. One instance above the routes is what makes "the payment finished while you
 * were somewhere else" a case that can be handled at all.
 *
 * It is also the only state here that is genuinely a *session*: one checkout at a time, dying with the
 * dialog. That is `useReducer` territory, not Zustand and not a query — `docs/PAYMENT.md` §2.4 lists
 * it that way for that reason.
 *
 * ## Where it is mounted, and why exactly there
 *
 * Inside `BalanceProvider`, outside `MyChannelProvider` (`app/session-providers.tsx`). It reads
 * `balanceKeys` to invalidate after a settle, and the create-space gate must not stand between a
 * price and the wallet paying it. It is **not** in the base providers: card payment is hidden in a
 * `/app/*` webview (the native app must use IAP), and a webview has no session anyway.
 *
 * ## A settle that nobody is watching is a toast, not a dialog
 *
 * `settling` can be dismissed — the money has left and closing the dialog does not cancel anything —
 * so a payment can land with the reader three screens away. Re-opening a modal on top of whatever
 * they are doing to announce something they already chose to stop watching is the wrong answer, and
 * the machine already refuses to do it (a `SETTLED` arriving from `idle` is ignored, on purpose). So
 * the decision of what to do *instead* lives here: refresh the money and say so in a toast.
 *
 * The invalidation happens in **both** cases. It is not a consolation prize for the dismissed path —
 * the balance is stale either way, and a success dialog over a stale figure is the bug that makes
 * people reload the page to check whether they were charged.
 */
export interface PaymentValue {
    /** The live checkout. One value, never a set of booleans — see `lib/checkout-machine.ts`. */
    state: CheckoutState
    /** Start paying for something. Ignored while another checkout is mid-flight. */
    checkout: (order: CheckoutOrder) => void
    /**
     * The reader pressed Pay. Takes the mounted `Elements` instance or a saved `pm_…`; the card panel
     * that owns the form is the only thing that has either, which is why this is passed in rather
     * than read here.
     */
    submit: (submission: CheckoutSubmission) => void
    /** Start the same order again after a failure. */
    retry: () => void
    /** Dismiss the status dialog. Refused while confirming; never cancels a settle. */
    close: () => void
    /** Work is in flight — do not offer a second press. */
    isBusy: boolean
    /**
     * Open the Star purchase sheet, pre-selected to close `shortfall` if one is given.
     *
     * Exposed for a surface that offers Star deliberately (a drawer row, the wallet). The common path
     * does **not** call this — `useRequireStars` announces a shortfall on the event bus and this
     * provider listens, which is what keeps `features/balance` from importing `features/payment`.
     */
    buyStars: (shortfall?: number) => void
}

const PaymentContext = createContext<PaymentValue | null>(null)

export function PaymentProvider({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const onSettled = useCallback(
        ({ purchaseType, dismissed }: { purchaseType: string | null; dismissed: boolean }) => {
            /*
             * `balanceKeys.all`, not the balance alone. Star was added or spent, so the **ledgers
             * explain it too** — `features/balance`'s `balance-api.ts` states the agreement the three
             * wallet features share, and narrowing it here would leave a reader on `/my-star` with a
             * new total and a history that does not mention why.
             */
            void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            eventBus.emit('payment:succeeded', { purchaseType })
            /*
             * Only when the dialog is gone. With it still open the success screen *is* the
             * announcement, and a toast over it is the same news twice.
             */
            if (dismissed) toast.success(t('payment_settled_toast'))
        },
        [queryClient, t],
    )

    const checkout = useCheckout({ onSettled })
    /*
     * The sheet reads the machine's state so it can step aside once the machine has moved past the
     * steps the sheet drives — see `useStarPurchase`'s own effect. It is one-directional: the sheet
     * knows about the machine, the machine knows nothing about the sheet.
     */
    const purchase = useStarPurchase(checkout.state)
    /*
     * Saved cards, **only while a card step is live** — the list has exactly one reader, the
     * `CardCheckoutDialog` below, which renders only in `card`.
     *
     * `creating` is included so the list is already in hand when the panel opens a moment later; that
     * is the whole prefetch window and it is free, because `creating` means a checkout was pressed.
     * Ungated, this provider — which sits above every route — turned every page load into a card-list
     * request for every signed-in reader.
     */
    /*
     * ⚠ `creating` is included **only for an order that can reach a card step**. `mayReachCardStep`
     * carries the reasoning; short version: Premium and gift Premium are documented `REDIRECT`
     * (Stripe's hosted page), so for them this prefetch was a request per purchase whose answer was
     * thrown away, on a flow that leaves the page a moment later.
     */
    const state = checkout.state
    const cardStep =
        state.kind === 'card' || (state.kind === 'creating' && mayReachCardStep(state.order))
    const { cards } = useSavedCards({ enabled: cardStep })

    /*
     * Whether the reader is already standing on the purchase page. One reader only — the success
     * dialog's *Get more*, whose prop explains it.
     */
    const isOnGetStarPage = usePathname() === GET_STAR_PATH

    /**
     * `useRequireStars` pressed a price the balance could not cover.
     *
     * `ack()` before opening: the emitter falls back to a toast when nothing is listening, which is the
     * case on a `/app/*` webview where this provider is deliberately absent (see the event's doc).
     */
    useEffect(() => {
        const onRequested = ({ shortfall, ack }: { shortfall: number; ack: () => void }) => {
            ack()
            purchase.open(shortfall)
        }
        eventBus.on('payment:star-purchase-requested', onRequested)
        return () => eventBus.off('payment:star-purchase-requested', onRequested)
    }, [purchase])
    /*
     * The URL watcher hands its intent straight to the machine's `resume`. It parses and sweeps the
     * parameters; the settle loop it feeds is the same one the in-page confirm path uses — one loop,
     * where legacy has three.
     */
    useCheckoutCallback({ onIntent: checkout.resume })

    const value = useMemo<PaymentValue>(
        () => ({
            state: checkout.state,
            checkout: checkout.start,
            submit: checkout.submit,
            retry: checkout.retry,
            close: checkout.close,
            isBusy: checkout.isBusy,
            buyStars: purchase.open,
        }),
        [
            checkout.state,
            checkout.start,
            checkout.submit,
            checkout.retry,
            checkout.close,
            checkout.isBusy,
            purchase.open,
        ],
    )

    return (
        <PaymentContext.Provider value={value}>
            {children}
            {/*
             * A sibling of `children`, not a wrapper: the dialog is portalled and covers the app, it
             * does not stand in for it. Whatever the reader was paying from stays mounted behind it —
             * which is the whole reason a checkout is a dialog and not a route
             * (`docs/DEFINITION_OF_DONE.md` §3: gate the action, never the route).
             */}
            {/*
             * Sheet first, status dialog second, and they are never both on screen: the sheet closes
             * itself the moment the machine leaves the states it drives (`useStarPurchase`), which is
             * exactly when the status dialog has something to say.
             */}
            <StarPurchaseDialog
                flow={purchase}
                action={checkoutActionOf(checkout.state)}
                isCheckoutBusy={checkout.isBusy}
                onPay={() => {
                    if (!purchase.selected || !purchase.gateway) return
                    /*
                     * `quantity` is the **Star count**, which is what the backend prices — the package
                     * id is never sent (B63). `packageStars` is deliberately *not* used here: the bonus
                     * is the backend's to add, and sending the bonused figure would ask to be charged
                     * for it.
                     */
                    checkout.start({
                        kind: 'stars',
                        gatewayId: purchase.gateway.id,
                        quantity: purchase.selected.amount,
                    })
                    purchase.pay()
                }}
            />

            {/*
             * The card form, for **every** order kind — a Star package, a donation, a membership tier.
             * See its own note for why it is here and not inside the sheet that happened to need it
             * first.
             */}
            <CardCheckoutDialog
                state={checkout.state}
                cards={cards}
                isBusy={checkout.isBusy}
                onClose={checkout.close}
                onPay={({ paymentMethodId, elements }) => {
                    checkout.submit(paymentMethodId ? { paymentMethodId } : { elements })
                }}
            />

            <CheckoutStatusDialog
                state={checkout.state}
                onClose={checkout.close}
                onRetry={checkout.retry}
                /*
                 * Legacy's "Get more" pushes `/get-star`, and this app has that route now — but the
                 * sheet is still the right answer **here**. The status dialog is layered over whatever
                 * the reader was doing when they paid; navigating them away from it to buy again would
                 * charge them for the top-up and then lose them the screen they bought it for.
                 *
                 * Opened with no shortfall — they are topping up deliberately, not closing a gap — so
                 * the sheet starts on the recommended tile.
                 *
                 * ## Except on `/get-star`, where the press is only "close"
                 *
                 * There the catalogue is already on screen behind the dialog — the reader bought from
                 * it a second ago, it is still mounted, and its balance is one the settle has just
                 * invalidated. Opening the sheet would stack a 400px copy of that page on top of the
                 * page, same grid and same gateway list, and dismissing it would reveal the original
                 * underneath.
                 *
                 * The button is still **drawn**: an absent `onBuyMore` means "this surface cannot
                 * offer more Star", and this one offers it more directly than the sheet does. So the
                 * dialog closes — which it already did, before this runs — and this adds nothing.
                 */
                onBuyMore={() => {
                    if (isOnGetStarPage) return
                    purchase.open()
                }}
            />
        </PaymentContext.Provider>
    )
}

/**
 * The live checkout.
 *
 * Throws outside the provider rather than answering with a plausible idle state, for the same reason
 * `useBalance` does: it is mounted above every route on the website, so being outside it means a
 * component was rendered somewhere it cannot work — a `/app/*` webview, most likely, where card
 * payment is deliberately absent. A silent no-op there would surface as a Pay button that does
 * nothing rather than as the real mistake.
 */
export function usePayment(): PaymentValue {
    const value = useContext(PaymentContext)
    if (!value) {
        throw new Error(
            'usePayment must be used inside PaymentProvider (see app/session-providers.tsx)',
        )
    }
    return value
}

/**
 * The same value, or `null` outside the provider — for a surface that is **allowed** not to have one.
 *
 * There is exactly one legitimate case and it is a product decision rather than an oversight: a
 * `/app/*` webview mounts no session and no payment provider, because the native app must take money
 * through IAP. A donation dialog rendered there still works — Star is a ledger move — and its cash tab
 * simply is not offered. `usePayment` throwing is right for a Pay button that cannot function without
 * one; this is for a feature deciding *whether to offer* a card path at all.
 *
 * Not a way to make `usePayment` optional everywhere. If a component needs the checkout to do its job,
 * it should throw where it is mounted wrongly rather than degrade silently.
 */
export function usePaymentOptional(): PaymentValue | null {
    return useContext(PaymentContext)
}
