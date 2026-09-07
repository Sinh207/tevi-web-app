'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys, useBalance, useRequireStars } from '@features/balance'
import { usePaymentOptional } from '@features/payment'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { forgetMyMembershipsCache, membershipApi, membershipKeys } from '../../api/subscription-api'
import type { JoinOffer } from '../../lib/join-offer'
import { membershipChargedTotal } from '../../lib/membership-fee'

/** Details → Confirm → Success, and the state where none of them is on screen. */
export type JoinStep = 'closed' | 'details' | 'confirm' | 'success'

/** How the tier can be paid for. Legacy's radio group offers both. */
export type JoinCurrency = 'star' | 'cash'

/**
 * Whether a **card** membership can be completed here.
 *
 * No longer a constant. It was `CASH_ENABLED = false` while `features/payment` had no card panel —
 * `subscribe/` answers a Stripe `clientSecret` for a `USD` price id and nothing could finish one.
 * Passes 4–5 shipped it (`docs/PAYMENT.md` §8), so the answer is now read rather than asserted, and
 * three things are needed:
 *
 * - a **cash price id** on the tier, which is what the call is sent (`lib/join-offer.ts`),
 * - a **`PaymentProvider` above this hook**, which `(web)/layout.tsx` mounts and a `/app/*` webview
 *   deliberately does not — card payment is hidden there because the native app must use IAP,
 * - a **slug**, since the endpoint is `channel/{slug}/packages/{id}/subscribe/`.
 *
 * Same shape, and the same reasoning, as `canPayByCard` in `features/donation`.
 */
function canPayByCard(offer: JoinOffer | null, slug: string, hasPaymentProvider: boolean): boolean {
    return hasPaymentProvider && Boolean(slug) && Boolean(offer?.cashPriceId)
}

/**
 * Joining a space's membership — the offer, the two guards and the write.
 *
 * Deliberately the same shape as `features/donation`'s `useDonateFlow`, because it is the same
 * transaction wearing a different noun: a priced action on somebody else's space, gated by auth and
 * then by balance, confirmed before it spends, invalidating what it moved. Where the two differ, the
 * difference is real and is named below.
 *
 * ## No amount, and that is the whole difference in the form
 *
 * A donation is a figure the reader chooses; a membership is a **tier at a price the creator set**.
 * So there is no quantity, no amount field and no arithmetic — `JoinOffer` carries the price and this
 * hook never computes one. That is also why there is no currency picker: `joinOffer` only ever
 * resolves a `TVS` line (`lib/join-offer.ts`), so the one thing a picker could offer is the option
 * that cannot be completed.
 *
 * ## Where each guard sits
 *
 * - **Auth gates `open`.** A signed-out visitor pressing the button gets the login dialog rather than
 *   filling in a screen that ends in one. Same call, and the same reasoning, as the donate flow.
 * - **Star gates the final press**, through `useRequireStars`, because that is where the price is
 *   spent. It composes `useRequireAuth` again, which is a no-op by then.
 *
 * A shortfall raises a toast **over** the open confirm dialog rather than closing it: nothing about
 * the reader's choice has changed, and when the top-up flow lands they come back to it.
 *
 * ## The success that is not one, and what happens to it now
 *
 * `subscribe/` answers `200` with a `{ action, action_data }` envelope when the backend wants a **card**
 * payment. That is not a membership yet, so it is never reported as one — reporting "you are a member"
 * over an unpaid intent is the outcome worth this much care.
 *
 * What changed with `features/payment`: the action is **handed to the checkout**
 * (`usePayment().checkout({ kind: 'handoff', … })`) instead of being reported as an impossibility. The
 * `needsCard` state survives for the one case that is still a dead end — no `PaymentProvider` above
 * this dialog, i.e. a `/app/*` webview, where card payment is deliberately absent.
 *
 * ## Not optimistic, and it invalidates three things
 *
 * The write moves money and creates a subscription: the **balance** (Star spent), the **space's
 * membership state** (the button becomes "Activated"), and the `/my-membership` **list** (a new row).
 * Legacy patches its local copy of the first two and leaves the third stale until a reload.
 *
 * Not the space's **tiers**, though — `membershipKeys.mine`, not `.all`. Buying a tier does not
 * change what the creator charges for it.
 */
export function useJoinMembership({
    slug,
    channelId,
    offer,
}: {
    slug: string
    channelId: string | null | undefined
    offer: JoinOffer | null
}) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const requireStars = useRequireStars()
    /*
     * `usePaymentOptional`, not `usePayment`: a `/app/*` webview mounts no `PaymentProvider` — the
     * native app must use IAP — and this dialog is reachable there. `null` simply means no cash tab.
     */
    const payment = usePaymentOptional()
    const { refresh: refreshBalance } = useBalance()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<JoinStep>('closed')
    const [currency, setCurrency] = useState<JoinCurrency>('star')
    const isCashAvailable = canPayByCard(offer, slug, payment !== null)
    /** Set only for the one failure that is not a failure — see the note above. */
    const [needsCard, setNeedsCard] = useState(false)

    const open = requireAuth(() => {
        // Star every time, not the last choice: it is the one that can be completed, and a dialog
        // that reopens on a tab the reader cannot pay from is a worse default than a forgotten one.
        setCurrency('star')
        setNeedsCard(false)
        setStep('details')
    })

    const close = useCallback(() => setStep('closed'), [])

    const join = useMutation({
        mutationFn: (priceId: string) => {
            if (!offer) throw new Error('no offer')
            return membershipApi.subscribe({
                slug,
                packageId: offer.packageId,
                /*
                 * **The price line decides the currency**, and it is the mutation's argument rather
                 * than read from `offer` here: one endpoint buys the tier either way, so a second
                 * mutation for cash would be the same call twice with the same success handling —
                 * and the two would drift the first time one of them learned something.
                 */
                priceId,
                /*
                 * The account that was active when the button was pressed, threaded through rather
                 * than read as the request is built — an account switch mid-flight must not put the
                 * membership on the wrong account. Same rule as every other write in this app.
                 */
                accountId: activeId,
            })
        },
        onSuccess: result => {
            /*
             * An action means the backend wants a card, so **nothing has been bought yet**: no
             * invalidation, no success screen. Either the checkout takes over, or — with no provider
             * above this dialog — the reader is told this tier needs a card and this app cannot take
             * one here.
             */
            if (result) {
                if (!payment) {
                    setNeedsCard(true)
                    return
                }
                payment.checkout({
                    kind: 'handoff',
                    source: 'membership',
                    action: result.action,
                    /*
                     * What the Pay button says: **the total, fee included** — which is what the
                     * card is actually charged.
                     *
                     * Deliberately the opposite call from `features/donation`, and the difference is
                     * real. There the amount is one the reader **typed**, so a button naming a
                     * bigger figure reads as a bait-and-switch. Here they chose a *tier*, the fee is
                     * broken out on the confirm screen right above the button, and the number that
                     * leaves the account is the total — naming the pre-fee price would be the
                     * surprise instead.
                     */
                    amountLabel:
                        offer?.usd == null
                            ? undefined
                            : `$${membershipChargedTotal(offer.usd).toFixed(2)}`,
                })
                /*
                 * **No invalidation here.** It used to refetch on the way out, which was waste
                 * dressed as caution: at handoff the payment has not settled, so the list cannot
                 * have changed and the answer comes back identical. What actually keeps the surface
                 * honest is `useMembershipPaymentSync`, which re-reads when the provider announces
                 * the settle — possibly a minute later, on a page this dialog no longer exists on.
                 */
                setStep('closed')
                return
            }
            refreshBalance()
            /*
             * The Star path buys the membership here, so the list this account holds has just
             * changed — and `my-subscriptions/` has been observed answering 304 to the refetch that
             * follows (**B72**). Dropping the stored validator first is what makes the invalidation
             * below fetch a body instead of replaying the pre-purchase one.
             */
            void forgetMyMembershipsCache(activeId).then(() => {
                queryClient.invalidateQueries({ queryKey: membershipKeys.mine })
            })
            queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            setStep('success')
        },
        /*
         * A real failure only. The card case is no longer an error at all — it is a second step — so
         * the generic toast is exactly right for what is left.
         */
        meta: { showErrorToast: t('membership_join_error') },
    })

    const submitStars = requireStars(offer?.stars ?? 0, () => {
        if (!offer || join.isPending || currency !== 'star') return
        setNeedsCard(false)
        join.mutate(offer.priceId)
    })

    /**
     * `useRequireStars` guards the **Star** press only. Wrapping the cash one would weigh a dollar
     * figure against a Star balance and refuse a card payment for being short of Star — the kind of
     * unit mix-up that reads as a permissions bug from the outside.
     *
     * The cash press sends the tier's `USD` price line; `subscribe/` answers the checkout envelope
     * and `onSuccess` hands the action to `features/payment`. That boundary is
     * `checkout-order.ts`'s `handoff`: this feature owns `subscribe/`, so it makes the call, and the
     * payments feature completes what comes back rather than importing another feature's API.
     */
    const confirm = () => {
        if (currency === 'star') {
            submitStars()
            return
        }
        if (!offer?.cashPriceId || !isCashAvailable || !payment || join.isPending) return
        setNeedsCard(false)
        join.mutate(offer.cashPriceId)
    }

    return {
        offer,
        step,
        /** True when the backend asked for a card. Shown in place of the confirm's normal copy. */
        needsCard,
        isJoining: join.isPending,
        currency,
        changeCurrency: setCurrency,
        /** Whether the creator priced the tier in cash at all — decides if the tab is offered. */
        offersCash: offer?.usd != null,
        /** Whether the cash tab can actually be completed here — see `canPayByCard`. */
        isCashAvailable,
        /**
         * Nothing to buy, so nothing to press — **and cash cannot be pressed at all**. The dialog
         * disables its CTA on this rather than re-deriving the rule, so there is one answer to
         * "can this be bought right now" and both screens read it.
         */
        canJoin:
            Boolean(offer && channelId !== undefined) && (currency === 'star' || isCashAvailable),
        open,
        close,
        review: useCallback(() => setStep('confirm'), []),
        back: useCallback(() => setStep('details'), []),
        confirm,
    }
}

export type JoinMembershipFlow = ReturnType<typeof useJoinMembership>
