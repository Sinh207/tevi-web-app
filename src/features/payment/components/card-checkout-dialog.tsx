'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import type { StripeElements } from '@stripe/stripe-js'
import type { SavedCard } from '../api/types'
import type { CheckoutState } from '../lib/checkout-machine'
import { checkoutActionOf, checkoutOrder } from '../lib/checkout-machine'
import { PayWithCardPanel } from './pay-with-card-panel'
import { StripeElementsScope } from './stripe-elements-scope'

/**
 * Paying by card — for **every** order, not just a Star package.
 *
 * ## Why this is the provider's and not each surface's
 *
 * It was inside the Star sheet, which was fine while Star was the only thing anybody could buy by
 * card. The moment a donation or a membership tier produces a `STRIPE` action, that arrangement leaves
 * the machine sitting in `card` with **nothing on screen** — no form, no explanation, and
 * `isCheckoutBusy` true so every further press is dropped. Three surfaces would each have had to grow
 * their own card step, which is three copies of the confirm call and three ways to get it wrong: the
 * shape legacy has (`components/stripe/`, `membershipDetails/checkout/`, `getStar/`), and the reason
 * its Premium flow redirects while its Star flow does not.
 *
 * So the rule is: **a surface builds an order, the provider takes the money.** What the surface still
 * owns is the amount on the button — `order.amountLabel`, because only it knows the currency.
 *
 * ## It renders in `card` and in `confirming`
 *
 * `confirming` is `stripe.confirm*` in flight: the panel stays mounted (unmounting it mid-confirmation
 * orphans the confirmation — `add-card-dialog.tsx` documents the same trap) and goes quiet through
 * `isBusy`. Dismissal is refused for the same reason, exactly as `CheckoutStatusDialog` refuses it.
 *
 * The **status dialog** takes over from `settling` onwards, which is why there is no overlap: these
 * two states are not in its list and none of its states are in this one.
 */
export function CardCheckoutDialog({
    state,
    cards,
    isBusy,
    onClose,
    onPay,
}: {
    state: CheckoutState
    cards: SavedCard[]
    isBusy: boolean
    onClose: () => void
    onPay: (choice: { paymentMethodId?: string; elements?: StripeElements | null }) => void
}) {
    const { t } = useTranslation()

    const action = checkoutActionOf(state)
    const isCardStep = state.kind === 'card' || state.kind === 'confirming'
    const order = checkoutOrder(state)

    return (
        <Dialog
            open={isCardStep && action?.kind === 'card'}
            onOpenChange={open => {
                if (!open && !isBusy) onClose()
            }}
            disablePointerDismissal={isBusy}
        >
            <DialogContent className="max-h-[min(88vh,720px)] w-[400px] gap-0 overflow-hidden p-0">
                <div className="relative flex h-14 flex-none items-center justify-center border-(--separator-default) border-b px-2">
                    {/* Disabled rather than hidden while confirming: a control that vanishes mid-flow
                        reads as a bug, and the reader needs to see that it is *temporarily* off. */}
                    <DialogClose
                        data-testid="payment-card-checkout-close"
                        aria-label={t('common_close')}
                        disabled={isBusy}
                        className="absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Icon name="xmark" size={20} />
                    </DialogClose>
                    <DialogTitle className="truncate">{t('payment_checkout_title')}</DialogTitle>
                </div>

                {action?.kind === 'card' && (
                    <StripeElementsScope
                        clientSecret={action.clientSecret}
                        fallback={
                            <div className="flex min-h-[280px] items-center justify-center p-4">
                                <Loader label={t('common_loading')} />
                            </div>
                        }
                    >
                        <PayWithCardPanel
                            cards={cards}
                            /*
                             * `t('payment_pay')` when the order carried no label — a handoff from
                             * another feature may legitimately not have one, and a button reading
                             * "Pay undefined" is worse than one reading "Pay".
                             */
                            amountLabel={order?.amountLabel ?? ''}
                            isBusy={isBusy}
                            onPay={onPay}
                        />
                    </StripeElementsScope>
                )}
            </DialogContent>
        </Dialog>
    )
}
