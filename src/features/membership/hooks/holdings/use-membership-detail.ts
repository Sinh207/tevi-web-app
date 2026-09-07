'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { forgetMyMembershipsCache, membershipApi, membershipKeys } from '../../api/subscription-api'
import type { Membership, PaymentHistory } from '../../api/types'
import { type RenewalOffer, renewalOffer } from '../../lib/renewal'

/**
 * The detail dialog's whole state: one membership's charges, and the two writes that stop and restart
 * its renewal.
 *
 * ## Why the mutations are not optimistic
 *
 * `useUpdatePrivacy` is optimistic and says why that is safe there: the consequential directions have
 * already been through a confirm dialog, so the instant flip is the acknowledgement of an answer
 * already given. The same argument does **not** carry here, for a reason that is about the *subject*
 * rather than the interaction: this is a recurring charge. A row that flips to "Expiry date" and then
 * flips back because the request failed has told somebody their card will not be charged again, and
 * they will act on that. So the dialog waits — a spinner for a round trip, once, on a decision made
 * about once a year.
 *
 * ## Two writes, and neither of them spends money
 *
 * `cancel` and `renew` (`undo-cancel/`) are schedule changes: free, instant, and each other's
 * inverse. Both user-facing labels read "Renew", which is legacy's wording and the right one: from the
 * reader's side stopping and restarting a renewal is one intention, and which mechanism applies is our
 * problem, not theirs.
 *
 * **Buying an expired tier again is not here.** It used to be — a `subscribe/` mutation behind
 * `useRequireStars`, one currency, its own confirm naming a Star figure. It now goes through the join
 * flow (`hooks/join/use-join-membership` + `BecomeAMemberDialogs`), because that is one purchase with
 * one implementation: the currency choice, the fee arithmetic, the card handoff and the "needs a card"
 * dead end all already live there, and a second copy of them on this screen could only drift. Legacy
 * agrees — its list row opens the same `BecomeAMember`/`Checkout` pair the space page opens.
 *
 * What is left of it here is `renewalOffer`: the *question* "can this row be bought again, and with
 * what", which the dialog reads to decide whether to show the button at all.
 *
 * ## What is invalidated, and why it is the whole feature
 *
 * `membershipKeys.mine`, not the one list. Cancelling changes `canceled_at`, which changes the row's
 * date line; it may also move the membership between the Active and Expired tabs, and it changes the
 * **counts** in both tab labels. Those are four query keys — two statuses × the filters in play — and
 * a targeted invalidation would have to know which. Refetching the feature is one request per mounted
 * list and cannot leave a stale figure behind.
 *
 * The history is invalidated too: `cancel` is itself not a charge, but the server may record the
 * schedule change, and the dialog stays open on top of the list showing it.
 *
 * ## `accountId` is captured per call, not read at render
 *
 * Same rule `useUpdatePrivacy` states: `useMutation` re-registers its options every render, so a
 * callback that read the *current* active account would file one person's cancellation under another
 * person's key after a switch in another tab. The id is pinned into the request and into the keys it
 * invalidates.
 */

export interface UseMembershipDetailResult {
    history: PaymentHistory[]
    isHistoryLoading: boolean
    isHistoryError: boolean
    /** Settled with nothing — this membership has no recorded charge. */
    isHistoryEmpty: boolean
    refetchHistory: () => void
    /**
     * Which confirm dialog is up, if any. One field rather than a boolean per action: two booleans can
     * both be true, and there is no arrangement in which two confirms should be stacked.
     */
    confirm: ConfirmKind | null
    openConfirm: (kind: ConfirmKind) => void
    closeConfirm: () => void
    /** Stop the renewal. Raises no dialog of its own — `openConfirm('cancel')` is the gate. */
    cancel: () => void
    /** Put a cancelled renewal back. No confirm and no cost: it is the *un*-doing of one press. */
    renew: () => void
    /**
     * What buying this expired membership again would be — the space, the creator and the tier with
     * both its price lines. `null` when it cannot be bought here: a live row, a cash-only tier, or a
     * space that is gone. The dialog hands it to the join flow; nothing in this hook writes it.
     */
    renewalOffer: RenewalOffer | null
    /** Any write is in flight. The dialog disables every control on it. */
    isPending: boolean
}

/**
 * The one action consequential enough to ask about here. A union of one, deliberately: it is the
 * field's shape that stops two confirms from being stacked, and buying a tier again — the second
 * member this used to have — now asks inside the join flow's own confirm step.
 */
export type ConfirmKind = 'cancel'

export function useMembershipDetail(
    /** The open membership, or `null` when the dialog is closed. Gates the query. */
    membership: Membership | null,
): UseMembershipDetailResult {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [confirm, setConfirm] = useState<ConfirmKind | null>(null)

    const id = membership?.id ?? ''

    const query = useQuery({
        queryKey: membershipKeys.history(activeId, id),
        queryFn: ({ signal }) =>
            membershipApi.getPaymentHistories({ id, accountId: activeId, signal }),
        // Nothing to fetch until a row is open, which is also what stops the closed dialog from
        // holding a request for whichever row was open last.
        enabled: Boolean(id) && Boolean(activeId),
    })

    const invalidate = useCallback(
        async (accountId: string | null) => {
            /*
             * The stored ETag first, and awaited: `my-subscriptions/` has been observed answering
             * 304 after its content changed (**B72**), and a refetch that sends the old validator
             * gets the pre-cancellation row replayed at it. Cancelling is exactly that shape — the
             * write is to `…/cancel/`, the change shows up on a *different* URL's body.
             */
            await forgetMyMembershipsCache(accountId)
            /*
             * Everything this account holds — see the note above for why a targeted list key is not
             * enough. The prefix covers this membership's history too, so it is no longer asked
             * for by id — the second call was the same rows a second time.
             *
             * `mine` rather than the whole feature: neither write touches the space's price list,
             * and refetching it told us the same prices back.
             */
            queryClient.invalidateQueries({ queryKey: membershipKeys.mine })
        },
        [queryClient],
    )

    const offer = renewalOffer(membership)

    const cancelMutation = useMutation({
        mutationFn: (input: { id: string; accountId: string | null }) =>
            membershipApi.cancel({ id: input.id, accountId: input.accountId }),
        onSuccess: (_data, input) => {
            void invalidate(input.accountId)
            setConfirm(null)
            toast.success(t('my_membership_detail_cancelled'))
        },
        onError: () => {
            // The confirm dialog stays open on failure: the decision has not taken effect, so
            // dismissing it would leave the reader unsure whether it had.
            toast.error(t('my_membership_detail_cancel_failed'))
        },
    })

    const renewMutation = useMutation({
        mutationFn: (input: { id: string; accountId: string | null }) =>
            membershipApi.undoCancel({ id: input.id, accountId: input.accountId }),
        onSuccess: (_data, input) => {
            void invalidate(input.accountId)
            toast.success(t('my_membership_detail_renewed'))
        },
        onError: () => toast.error(t('my_membership_detail_renew_failed')),
    })

    const isPending = cancelMutation.isPending || renewMutation.isPending

    return {
        history: query.data ?? [],
        isHistoryLoading: query.isLoading,
        isHistoryError: query.isError,
        isHistoryEmpty: !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
        refetchHistory: () => {
            query.refetch()
        },
        confirm,
        openConfirm: setConfirm,
        closeConfirm: () => setConfirm(null),
        cancel: () => {
            // Guarded rather than trusted: the confirm button is disabled while pending, and this is
            // what makes a double-press impossible even if it were not.
            if (!id || isPending) return
            cancelMutation.mutate({ id, accountId: activeId })
        },
        renew: () => {
            if (!id || isPending) return
            renewMutation.mutate({ id, accountId: activeId })
        },
        renewalOffer: offer,
        isPending,
    }
}
