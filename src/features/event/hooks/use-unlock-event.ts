'use client'

import { useAuth } from '@features/auth'
import { balanceKeys, useBalance, useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { eventApi, eventKeys } from '../api/event-api'
import type { EventDetail } from '../api/types'
import { unlockErrorText } from '../lib/unlock-error-text'
import { canUnlockWithStars } from '../lib/watch-state'

/**
 * **Buying access to one live event with Star** — the press, the confirmation and the write.
 *
 * ```tsx
 * const unlock = useUnlockEvent(event)
 * <Button onClick={unlock.request}>Purchase access</Button>
 * <ConfirmDialog open={unlock.isConfirming} onConfirm={unlock.confirm} … />
 * ```
 *
 * ## Three preconditions, and only one of them is this hook's
 *
 * **Signed in** and **can afford it** both come from `useRequireStars`, which composes
 * `useRequireAuth` — so a guest gets the sign-in dialog and somebody short of Star gets the top-up
 * sheet with the gap already computed, and neither of those is re-implemented here. That is the
 * app's idiom for a priced action and the reason every price in it goes through that hook.
 *
 * The third is **the stream must be on air**, and it is the one that belongs here.
 *
 * ## The status is re-read *inside* the confirmation, and this is not belt-and-braces
 *
 * Legacy does the same thing — refetch, then charge only if `status === 'LIVE'` — and the reason is
 * a real window: a paid event's page can sit open for minutes while the reader decides, and a
 * broadcast that ended in the meantime would take their Star for something they can never watch.
 * The refetch is the last thing before the charge, so the window shrinks to one round trip.
 *
 * ⚠ Legacy's version **fails silently**: if the status is no longer `LIVE` the dialog just closes
 * and nothing happens, which reads as a broken button. Here that path says what it found, and the
 * page re-renders off the refetched event — so the panel the reader is looking at changes to
 * "the broadcast has ended" in the same beat.
 *
 * ## The response is not evidence of anything
 *
 * `purchased` is established by **refetching the event**, never by trusting the purchase response —
 * see `unlockApi`. A body that says "ok" is a different claim from the event's own record of
 * entitlement, and only one of them decides whether the reader gets in.
 *
 * The balance is invalidated on the same beat: `balanceKeys.all` covers the figure in the app bar
 * **and** both ledgers, because the two wallet screens nest their keys under it. That agreement is
 * stated on `balanceKeys` and is what makes one invalidation enough.
 */
export interface UnlockEventFlow {
    /** The control may be drawn at all — a product id and a price above zero. Fails closed. */
    canUnlock: boolean
    /** The Star figure the button prints. `0` when there is nothing to charge. */
    price: number
    /** The confirmation is open. */
    isConfirming: boolean
    /** Press the button. Diverts to sign-in or top-up when either precondition is unmet. */
    request: () => void
    /** Confirm the charge. Re-reads the status first — see above. */
    confirm: () => void
    /** Dismiss the confirmation. */
    cancel: () => void
    /** The charge, or the status re-read before it, is in flight. */
    isPending: boolean
}

export function useUnlockEvent(event: EventDetail | null): UnlockEventFlow {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const { refresh } = useBalance()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()
    const [isConfirming, setConfirming] = useState(false)

    const rawPrice = event?.price === null || event?.price === undefined ? 0 : Number(event.price)
    const price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0
    const canUnlock = event !== null && canUnlockWithStars(event)

    /*
     * **No `meta.showErrorToast`**, and that is deliberate rather than an omission.
     *
     * `query-client.ts`'s handler prints the string it is given, unconditionally — it does not read
     * the response body. This write has two failures that must read differently: the backend's own
     * refusal (whose sentence has to win, `docs/API_ERRORS.md`) and "the stream stopped while you
     * were deciding", which is not a failure to buy at all because nothing was attempted. A single
     * `meta` string would print the same line for both, and alongside a second toast for the
     * off-air case it would print two at once.
     */
    const purchase = useMutation({
        mutationFn: async ({ code, productId }: { code: string; productId: string }) => {
            /*
             * The last read before the charge. `fetchQuery` and not `refetch`, so the answer lands
             * in the same cache entry the page is rendering from: the panel updates off this fetch
             * whether the charge goes ahead or not.
             */
            const fresh = await queryClient.fetchQuery({
                queryKey: eventKeys.detail(code, activeId),
                queryFn: ({ signal }) => eventApi.getEvent({ code, accountId: activeId, signal }),
                staleTime: 0,
            })
            if (fresh?.status !== 'LIVE') {
                // Not an error the toast should phrase as a failure to buy — nothing was attempted.
                throw new OffAirError()
            }
            // Imported lazily so the billy model is not in the page's initial chunk: this path is
            // reached by a press, and most readers of an event page never make one.
            const { unlockApi } = await import('../api/unlock-api')
            await unlockApi.purchase({ productId, accountId: activeId })
        },
        onSuccess: async () => {
            setConfirming(false)
            /*
             * The event first and awaited, because it is what the screen is about: the reader should
             * see the panel change before the balance in the bar does. `invalidateQueries` on the
             * balance is fire-and-forget for the same reason — nothing on this page reads it.
             */
            await queryClient.invalidateQueries({ queryKey: eventKeys.all })
            void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            void refresh()
            toast.success(t('event_unlock_succeeded'))
        },
        onError: error => {
            setConfirming(false)
            /*
             * Nothing was charged and nothing was refused — the stream simply is not on air any
             * more. The panel behind the dialog has already re-rendered off the refetch, so this
             * only has to name what happened.
             */
            if (error instanceof OffAirError) {
                toast.error(t('event_unlock_off_air'))
                return
            }
            // The backend's sentence first, ours as the fallback. See `unlockErrorText`.
            toast.error(unlockErrorText(error) ?? t('event_unlock_failed'))
        },
    })

    const request = requireStars(price, () => setConfirming(true))

    const confirm = useCallback(() => {
        if (!event?.code || !event.product_id) return
        purchase.mutate({ code: event.code, productId: event.product_id })
    }, [event?.code, event?.product_id, purchase])

    return {
        canUnlock,
        price,
        isConfirming,
        request,
        confirm,
        cancel: () => setConfirming(false),
        isPending: purchase.isPending,
    }
}

/**
 * The stream stopped between the page loading and the reader confirming.
 *
 * Its own error type rather than a boolean return, because it has to travel out of `mutationFn`
 * without being reported as "the purchase failed" — nothing was purchased, and nothing was charged.
 */
class OffAirError extends Error {
    constructor() {
        super('event is no longer live')
        this.name = 'OffAirError'
    }
}
