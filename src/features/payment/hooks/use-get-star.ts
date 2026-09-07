'use client'

import { useRequireAuth } from '@features/auth'
import { eventBus } from '@shared/lib/event-bus'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCharge } from '../lib/gateway-fee'
import { offersMore, purchaseKind } from '../lib/purchase-kind'
import { usePayment } from '../providers/payment-provider'
import { type StarCatalogue, useStarCatalogue } from './use-star-catalogue'

/**
 * `?need=` — how much Star a screen elsewhere was short of, carried on the URL.
 *
 * The **sheet** is the normal answer to a shortfall (`useRequireStars`), and it stays that way: it
 * keeps the reader where they were. This parameter exists for the cases that cannot open a sheet and
 * so have to send somebody here instead — a link out of a webview, a notification, a `/app/*` screen
 * where `PaymentProvider` is deliberately absent. Without it the page opens on the recommended tile
 * and the reader has to work out for themselves which one closes their gap.
 */
export const SHORTFALL_PARAM = 'need'

export interface GetStarFlow extends StarCatalogue {
    /** Star the reader was short of, from `?need=`. `0` when they came here deliberately. */
    shortfall: number
    /** The machine is working — a second press must not start a second checkout. */
    isCheckoutBusy: boolean
    /**
     * The browser is being handed to the gateway's own page and is about to leave.
     *
     * Its own flag rather than a state object, because the page needs exactly one thing from the
     * machine and handing it the whole union would invite a second `switch` over states this screen
     * does not own.
     */
    isLeaving: boolean
    /** Everything needed to charge is chosen, accepted and free to run. */
    canPay: boolean
    /** The total, ready to print — `$10.29`, `250000 VND`, or `—`. */
    amountLabel: string
    /** Hand the order to the checkout machine, behind the sign-in gate. */
    pay: () => void
}

/**
 * `/get-star` — the page's own state, over the selection every Star surface shares.
 *
 * ## Why a page **and** a sheet, and which is which
 *
 * They answer two different questions and the difference is *who asked*:
 *
 * - The **sheet** is the purchase reached by being stopped — a gift pressed with too little Star.
 *   `docs/DEFINITION_OF_DONE.md` §3: gate the action, never the route. The livestream stays behind it.
 * - The **page** is the purchase reached deliberately — the `+` in the top bar, the *Get Star* row on
 *   `/my-star`, the `+` on the transfer card, a bookmark, legacy's own `/get-star` address. Those
 *   presses *are* a navigation; answering them with a modal over the screen somebody just left would
 *   be the odd move.
 *
 * Both hold one `useStarCatalogue`, so which package a shortfall lands on, what the total is and which
 * gateways will take it are decided once. The parts that genuinely differ are the parts each owns: the
 * sheet its three steps, this its auth gate and its sticky total.
 *
 * ## Four things gate the press, and they are checked in one place
 *
 * Sign-in (`useRequireAuth`, which opens the login dialog rather than redirecting), a package **and** a
 * gateway chosen, the gateway's declared band accepting that price, and the machine not already
 * working. `canPay` is that answer, and both the button's `disabled` and the sentence explaining it
 * read the same value — the alternative is two derivations that eventually disagree.
 *
 * **Sign-in is not one of `canPay`'s terms**, deliberately. A guest sees an enabled button and pressing
 * it opens the login dialog; disabling it would leave them with a dead control and nothing saying why.
 * That is the same shape `MyStarView` and `EarningsReportView` use.
 *
 * ## The page owns no part of the payment itself
 *
 * `checkout()` hands the order to `PaymentProvider`, and from there the card form, the redirect, the
 * settle poll and the verdict are the provider's — mounted above every route, so all four survive this
 * page being navigated away from or reloaded by a 3DS hop. Nothing here polls, and nothing here knows
 * what a `clientSecret` is.
 */
export function useGetStar(): GetStarFlow {
    const requireAuth = useRequireAuth()
    const router = useRouter()
    const pathname = usePathname()
    const { checkout, isBusy, state } = usePayment()

    const [shortfall, setShortfall] = useState(0)

    /*
     * Read after mount rather than during render, and from `window.location` rather than through
     * `useSearchParams()`.
     *
     * Two separate reasons, both already recorded in this feature. `useSearchParams()` opts the whole
     * route into dynamic rendering (or demands a Suspense boundary) — `card-management-view.tsx` says
     * so — and this page is otherwise statically renderable down to the client boundary. And reading it
     * *during* render would make the server's HTML (which has no `?need=`) disagree with the client's
     * first paint, i.e. a hydration mismatch, for a value the seed does not need until the catalogue
     * has arrived a network round-trip later.
     *
     * Then the parameter is swept, the way `useCheckoutCallback` sweeps its own: it has been consumed,
     * and a reload after a successful purchase must not re-apply a gap that no longer exists.
     *
     * ⚠ **The ref is what makes "once" true**, and it is not belt-and-braces. `router` is a dependency,
     * its identity is the router's business, and the sweep below is a `replace` that does not
     * necessarily change `window.location.search` synchronously — so a re-run re-reads the parameter
     * and **puts the gap back**, including the one just cleared by a settled purchase. Found by the
     * test for that clearing, which is the only place the two effects meet.
     */
    const readShortfall = useRef(false)

    useEffect(() => {
        if (readShortfall.current) return
        readShortfall.current = true

        const params = new URLSearchParams(window.location.search)
        const raw = Number(params.get(SHORTFALL_PARAM))
        if (!Number.isFinite(raw) || raw <= 0) return
        setShortfall(Math.floor(raw))
        params.delete(SHORTFALL_PARAM)
        const rest = params.toString()
        router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
    }, [pathname, router])

    /*
     * The gap is closed, so stop naming it.
     *
     * Somebody arrives on `?need=1000`, buys 1,000, presses Done — and without this the page they
     * land back on still reads *"You need 1,000 more Star."* over a balance that now covers it. The
     * hint is only there to explain the pre-selected tile, and after a purchase it explains nothing.
     *
     * The bus rather than watching `state.kind`, for the reason the provider emits at all: a settle
     * can land while the reader has the dialog closed, and the machine is `idle` by then — there is
     * no `succeeded` render to observe. `purchaseKind` + `offersMore` is the "was this Star" test the
     * success dialog already uses — including its fallback, since the backend never enumerates a type
     * for Star. A membership renewal settling in the background must not clear a Star gap.
     */
    useEffect(() => {
        const onSucceeded = ({ purchaseType }: { purchaseType: string | null }) => {
            if (offersMore(purchaseKind(purchaseType))) setShortfall(0)
        }
        eventBus.on('payment:succeeded', onSucceeded)
        return () => eventBus.off('payment:succeeded', onSucceeded)
    }, [])

    /*
     * Always enabled — the catalogue *is* the page, so there is no state in which it should not be
     * asked for. The sheet's `enabled` is what makes a reader who never opens it pay for neither
     * request; here they asked for exactly this.
     */
    const catalogue = useStarCatalogue({ enabled: true, shortfall })

    const canPay = Boolean(
        catalogue.selected && catalogue.gateway && catalogue.isAccepted && !isBusy,
    )

    return {
        ...catalogue,
        shortfall,
        isCheckoutBusy: isBusy,
        isLeaving: state.kind === 'leaving',
        canPay,
        amountLabel: formatCharge(catalogue.charge),
        /*
         * `requireAuth` wraps the whole press, so a guest gets the login dialog and no order is built
         * — it does not run the callback afterwards, so signing in leaves them on the page with the
         * same selection, to press again.
         *
         * The guards are repeated inside rather than trusted from `canPay`, because `canPay` is a
         * boolean and the request is built from the **pair**: a nullable package and a nullable
         * gateway cannot be narrowed by something else being true, and a guard that agreed with
         * `canPay` by construction is the one that stops agreeing when a term is added to it.
         */
        pay: useCallback(
            () =>
                requireAuth(() => {
                    if (!canPay || !catalogue.selected || !catalogue.gateway) return
                    /*
                     * `quantity` is the **Star count**, and it is `amount` rather than `packageStars`:
                     * the bonus is the backend's to add, and sending the bonused figure is asking to be
                     * charged for it (B63). The package id is never sent.
                     */
                    checkout({
                        kind: 'stars',
                        gatewayId: catalogue.gateway.id,
                        quantity: catalogue.selected.amount,
                    })
                })(),
            [requireAuth, canPay, catalogue.selected, catalogue.gateway, checkout],
        ),
    }
}
