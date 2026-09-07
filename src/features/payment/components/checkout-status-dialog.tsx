'use client'

import { MY_STAR_PATH } from '@features/my-star/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'

import Link from 'next/link'
import { useRef } from 'react'
import { type CheckoutState, canDismissCheckout } from '../lib/checkout-machine'
import { offersMore, type PurchaseKind, purchaseKind } from '../lib/purchase-kind'
import {
    type CheckoutStatusKind,
    CheckoutStatusTile,
    checkoutStatusKind,
} from './checkout-status-tile'

/**
 * **One** dialog, five states — the fix for bug #6 in `docs/PAYMENT.md`, at the surface.
 *
 * Legacy holds the outcome as three independent booleans (`processing` / `success` / `failed`), each
 * with its own dialog, so two of them can be open at once and every transition has to remember to
 * close the other two — one branch forgets. Here the state *is* the dialog: it takes one
 * `CheckoutState` and there is no arrangement of props that can show two answers.
 *
 * ## The five, and why each is its own sentence
 *
 * | state | what it means | can be closed |
 * |---|---|---|
 * | `confirming` | `stripe.confirm*` is in flight | **no** |
 * | `settling` | the bank has it; we are asking whether it landed | yes |
 * | `slow` | the schedule ran out and it is *still* pending | yes |
 * | `succeeded` | it landed | yes, and only by pressing |
 * | `failed` | refused, terminally | yes |
 *
 * `slow` is **not** a failure and is not drawn like one: the money has left, so it gets a clock and a
 * way to watch the balance rather than a red mark. Legacy has no such state — it polls forever and
 * the reader watches a spinner until they give up, with no idea whether they have been charged.
 *
 * ## Dismissal is read, not re-derived
 *
 * `canDismissCheckout` is the machine's own answer and it is asked rather than restated, because the
 * rule behind it is not obvious from here: closing `confirming` would unmount the Elements instance
 * that is *completing a charge*. `disablePointerDismissal` stops the scrim press, `onOpenChange`
 * refuses the Escape key, and neither is a `disabled` prop on a button — there is no close control
 * rendered in that state at all.
 *
 * ## `succeeded` never auto-closes
 *
 * Deliberately no timer. Somebody who has just paid is owed a confirmation they can actually read,
 * and a dialog that dismisses itself after three seconds is one a reader on a slow connection, or one
 * who looked away, never sees. It closes when they press Done.
 *
 * ## The failure copy comes from the machine, and its narrow rule holds here
 *
 * `state.text` when the backend or Stripe wrote a sentence for the person paying, else
 * `t(state.messageKey)`. The filtering happened upstream (4xx bodies and card errors only — never
 * `error.message`, which is axios's own wording); this only chooses which of the two to print.
 *
 * ## The artwork
 *
 * Four of the five states show the design team's own animation, keyed to real transparency and cut down
 * by `scripts/build-payment-art.mjs`; `slow` keeps a glyph tile because the set has no art for it.
 * `components/checkout-status-tile.tsx` owns all of that — it moved there when the app's webview
 * checkout needed the same marks, so a verdict cannot come to look like two different things.
 */

export function CheckoutStatusDialog({
    state,
    onClose,
    onRetry,
    onBuyMore,
}: {
    state: CheckoutState
    onClose: () => void
    /** Start the same order again. The dialog does not know what the order was. */
    onRetry: () => void
    /**
     * Offer another Star purchase — shown **only** after a Star one (`offersMore`).
     *
     * Legacy pushes `/get-star`, and this app has that route — but the provider passes the **sheet's**
     * opener instead, because this dialog is layered over whatever the reader was paying from and
     * navigating away from it would lose them that screen. Absent, the button is not drawn — a surface
     * without a sheet must not offer one.
     */
    onBuyMore?: () => void
}) {
    const { t } = useTranslation()

    const kind = checkoutStatusKind(state)
    /*
     * The last state that had a dialog, kept for exactly one render.
     *
     * Closing sets the machine to `idle`, which has nothing to draw — so without this the popup would
     * vanish instead of animating out, and the DS dialog's 200ms fade would never be seen. Held in a
     * ref rather than state: it is not something to re-render for, it is the frame on the way out.
     */
    const lastRef = useRef<{
        kind: CheckoutStatusKind
        text: string | null
        messageKey: string
        purchase: PurchaseKind
        canRetry: boolean
    } | null>(null)
    if (kind) {
        lastRef.current = {
            kind,
            text: state.kind === 'failed' ? state.text : null,
            messageKey: state.kind === 'failed' ? state.messageKey : '',
            /*
             * Read from the state that *has* it and then remembered, like the rest of this frame: by
             * the time the dialog animates out the machine is `idle` and `purchaseType` is gone with
             * it, and the copy must not change on the way off screen.
             */
            purchase: purchaseKind(state.kind === 'succeeded' ? state.purchaseType : null),
            /*
             * Whether there is anything to retry, which is **not** always true of a failure.
             *
             * A payment resumed from a URL after a 3DS redirect has no order: the page was reloaded
             * and everything the reader chose went with it (`checkout-machine.ts` says so in the
             * type). `retry()` is `if (order) start(order)`, so on that path the Try-again button was
             * rendered and did *nothing* — the one dialog where a dead button is least affordable.
             * Offer it only when it can work; a failure with nothing to restart gets Close alone, and
             * the reader starts the purchase from the screen they are standing on.
             */
            canRetry: state.kind === 'failed' && state.order !== null,
        }
    }
    const shown = lastRef.current
    // Nothing has ever been shown, so there is nothing to animate out either.
    if (!shown) return null

    const dismissible = canDismissCheckout(state)
    const copy = statusCopy(t, shown)

    return (
        <Dialog
            open={kind !== null}
            /*
             * Escape is refused the same way the scrim press is: the handler simply does not act. The
             * machine's `CLOSE` event has the same guard, so even a caller that wires this wrongly
             * cannot take the dialog away mid-confirm.
             */
            onOpenChange={open => {
                if (!open && dismissible) onClose()
            }}
            disablePointerDismissal={!dismissible}
        >
            <DialogContent>
                {/*
                 * The status region. `aria-live="polite"` so a screen reader hears
                 * confirming → settling → succeeded instead of being told once, at open, and then
                 * left on a dialog whose meaning has changed twice. `aria-atomic` because the tile,
                 * the title and the sentence are one message — read the region, not the diff.
                 */}
                <div aria-live="polite" aria-atomic="true">
                    <DialogHeader>
                        <CheckoutStatusTile kind={shown.kind} />
                        <DialogTitle>{copy.title}</DialogTitle>
                        <DialogDescription>{copy.body}</DialogDescription>
                    </DialogHeader>
                </div>

                {/*
                 * `confirming` gets no footer at all — not a disabled button. There is nothing to
                 * press and nothing to cancel: the charge is in Stripe's hands, and a greyed-out
                 * Close reads as "this will work in a moment", which it will not.
                 */}
                {shown.kind === 'settling' && (
                    <DialogFooter>
                        <Button
                            data-testid="payment-checkout-close"
                            variant="secondary"
                            size="large"
                            onClick={onClose}
                        >
                            {t('common_close')}
                        </Button>
                    </DialogFooter>
                )}

                {shown.kind === 'slow' && (
                    <DialogFooter>
                        {/*
                         * Where the balance will change, so the reader has somewhere to go rather
                         * than a dialog to stare at. `MY_STAR_PATH` comes from `my-star/routes` — the
                         * import-free module that exists so linking to a screen does not pull its
                         * feature in, the same way `navigation/lib/menu-rows.ts` links to it.
                         *
                         * ⚠ **`onClose` as well as the navigation, and this dialog is the one place
                         * that needs both.** `open` is derived from the machine's state, and this
                         * dialog is mounted by `PaymentProvider` — *above every route*, which is the
                         * whole reason a payment survives a 3DS hop. So a client-side navigation
                         * unmounts nothing: the reader arrived on `/my-star` with this same modal
                         * still over it, and had to press Close on a dialog about a payment they had
                         * just been sent away from.
                         *
                         * `redeem-result-dialog.tsx` has the identical construction and is correct
                         * without this, which is exactly how this got missed: that dialog is rendered
                         * by its *page*, so navigating away unmounts it. The rule is not "links in
                         * dialogs close them" — it is that a dialog outliving the route it was opened
                         * from has to close itself.
                         *
                         * Closing costs nothing here: `slow` means the settle schedule has already
                         * run out, and dismissing has never cancelled a settle (see `onClose`).
                         */}
                        <Button
                            data-testid="payment-checkout-view-star"
                            variant="accent"
                            size="large"
                            onClick={onClose}
                            render={<Link href={MY_STAR_PATH} />}
                        >
                            {t('payment_action_view_my_star')}
                        </Button>
                        <Button
                            data-testid="payment-checkout-done"
                            variant="secondary"
                            size="large"
                            onClick={onClose}
                        >
                            {t('common_close')}
                        </Button>
                    </DialogFooter>
                )}

                {shown.kind === 'succeeded' && (
                    <DialogFooter>
                        {/*
                         * "Get more" only after Star, per `offersMore`: after a membership or a
                         * donation it would offer to do the thing they just did. Legacy hides it for
                         * exactly those two.
                         */}
                        {offersMore(shown.purchase) && onBuyMore && (
                            <Button
                                data-testid="payment-checkout-buy-more"
                                variant="accent"
                                size="large"
                                onClick={() => {
                                    onClose()
                                    onBuyMore()
                                }}
                            >
                                {t('payment_action_buy_more')}
                            </Button>
                        )}
                        <Button
                            data-testid="payment-checkout-dismiss"
                            variant={
                                offersMore(shown.purchase) && onBuyMore ? 'secondary' : 'accent'
                            }
                            size="large"
                            onClick={onClose}
                        >
                            {t('payment_action_done')}
                        </Button>
                    </DialogFooter>
                )}

                {shown.kind === 'failed' && (
                    <DialogFooter>
                        {/*
                         * Retrying restarts the **same order** — the machine keeps it through the
                         * terminal states for this. Legacy's failure dialog discards everything and
                         * drops the reader back on the page, so paying again means reassembling the
                         * purchase from scratch.
                         *
                         * `canRetry` because a resumed payment has no order to restart — see above.
                         */}
                        {shown.canRetry && (
                            <Button
                                data-testid="payment-checkout-retry"
                                variant="accent"
                                size="large"
                                onClick={onRetry}
                            >
                                {t('common_retry')}
                            </Button>
                        )}
                        <Button
                            data-testid="payment-checkout-failure-close"
                            /* The only button left is the primary one. */
                            variant={shown.canRetry ? 'secondary' : 'accent'}
                            size="large"
                            onClick={onClose}
                        >
                            {t('common_close')}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}

/**
 * The two lines each state says.
 *
 * A `switch` with **literal** `t()` calls rather than a `Record<CheckoutStatusKind, string>` of key names,
 * and that is not a style choice: `shared/i18n/keys.test.ts` finds keys by scanning source for
 * `t('…')`, so a key assembled from a lookup table is invisible to the one guard the repo has against
 * a missing translation. A table would have shipped ten keys nothing verifies.
 *
 * `failed` is the exception the machine's type forces: `messageKey` is a *value*, so its two possible
 * keys (`CHECKOUT_ERROR_KEYS`) are covered by being present in every locale rather than by the scan.
 */
function statusCopy(
    t: (key: string) => string,
    shown: {
        kind: CheckoutStatusKind
        text: string | null
        messageKey: string
        purchase: PurchaseKind
    },
): { title: string; body: string } {
    switch (shown.kind) {
        case 'confirming':
            return {
                title: t('payment_status_confirming_title'),
                body: t('payment_status_confirming_body'),
            }
        case 'settling':
            return {
                title: t('payment_status_settling_title'),
                body: t('payment_status_settling_body'),
            }
        case 'slow':
            return {
                title: t('payment_status_slow_title'),
                body: t('payment_status_slow_body'),
            }
        case 'succeeded':
            /*
             * The copy the settle response asked for. `type` → `PurchaseKind` happens in
             * `lib/purchase-kind.ts`, so the wire strings are declared once; what is left here is
             * three pairs of literal keys, which is what `keys.test.ts` can see.
             *
             * The **unknown** case deliberately lands on the Star copy rather than on a fourth,
             * vaguer one — legacy's own default, and the reasoning is on `purchaseKind` (B69).
             */
            switch (shown.purchase) {
                case 'membership':
                    return {
                        title: t('payment_status_membership_title'),
                        body: t('payment_status_membership_body'),
                    }
                case 'donation':
                    return {
                        title: t('payment_status_donation_title'),
                        body: t('payment_status_donation_body'),
                    }
                default:
                    return {
                        title: t('payment_status_succeeded_title'),
                        body: t('payment_status_succeeded_body'),
                    }
            }
        case 'failed':
            return {
                title: t('payment_status_failed_title'),
                // The sentence the backend or Stripe wrote for the person paying, else our own key.
                body: shown.text ?? t(shown.messageKey),
            }
    }
}
