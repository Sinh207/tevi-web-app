'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { type McnSpace, mcnSpaceApi, mcnSpaceKeys } from '../api/organization-api'
import {
    canRequestLeave,
    type McnPartnershipState,
    mcnPartnershipState,
} from '../lib/mcn-partnership-state'
import { useMyChannel } from '../providers/my-channel-provider'
import { useMcnLeave } from './use-mcn-leave'

/**
 * Everything `/mcn-partnership` renders, assembled from three sources that answer at three
 * different times — and **none of them blocks the others**.
 *
 * ## The screen resolves in layers, deliberately
 *
 * Legacy waits for both of its requests (`Promise.all`) and shows a skeleton until the slower one
 * lands, so a slow organization service holds up a revenue split that arrived with the page. Here:
 *
 * - `my-channel/` decides the **state** — the terms, the network's name, whether there is one at
 *   all. Nothing renders before it, because there is nothing to render.
 * - the **departure** query fills in the pending banner and, until it answers, withholds the leave
 *   action (`canRequestLeave` — an unknown answer must not let a creator schedule a second
 *   departure).
 * - the **organization record** fills in the logo, the slug behind the card's press and the contact
 *   link. It can fail outright without taking anything else down: `getSpace` answers `null` rather
 *   than rejecting, so the card simply keeps its initials and drops the link.
 *
 * Each of those is a different question with a different failure, and folding them into one
 * `isLoading` is what makes a screen that flickers through states it was never in.
 *
 * ## Nothing here is mirrored into a store
 *
 * All three are server state, so all three are TanStack Query — the rule this repo states once and
 * does not restate per hook. What *is* local is which dialog is open, and that stays in the view: a
 * hook returning `dialogs: { confirmLeave, cancelLeave }` plus four openers is legacy's shape and
 * four call sites for `useState`.
 */
export interface McnPartnership {
    state: McnPartnershipState
    /** The commercial terms, from `my-channel/`. `null` until the state is `ready`. */
    mcn: {
        name: string | null
        creatorRate: number | null
        mcnRate: number | null
        joinedAt: string | null
    } | null
    /** The network's public record — `undefined` while unknown, `null` when there is none to show. */
    space: McnSpace | null | undefined
    /** The scheduled departure — `undefined` while unknown, `null` when none is scheduled. */
    leave: ReturnType<typeof useMcnLeave>['leave']
    /** True only while a leave/cancel request is in flight. */
    isBusy: boolean
    /**
     * Whether **Leave this MCN** may be offered at all — see `canRequestLeave`. It stays `true`
     * while a request is in flight; the caller marks the control `aria-disabled` rather than
     * unmounting it, and that function's note says why.
     */
    canLeave: boolean
    confirmLeave: () => void
    cancelLeave: () => void
    /** Re-read `my-channel/`; what the error state's Retry presses. */
    refresh: () => Promise<void>
}

export function useMcnPartnership(): McnPartnership {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isError: isMyChannelError, refresh } = useMyChannel()

    const mcn = myChannel === undefined ? undefined : (myChannel?.mcn ?? null)
    const state = mcnPartnershipState({
        isBootstrapping,
        isAuthenticated,
        mcn,
        isMyChannelError,
    })
    const isMember = state === 'ready'

    /*
     * Both dependent queries are gated on `isMember` rather than on `Boolean(mcn)`: an *owner* has
     * an `mcn` block too, and neither a departure nor a logo means anything on a screen that is
     * showing them the empty state. Asking anyway would be two requests whose answers nothing reads.
     */
    const { leave, confirmLeave, cancelLeave, isConfirming, isCancelling } = useMcnLeave({
        enabled: isMember,
    })

    const spaceId = isMember ? (mcn?.identifier ?? null) : null
    const spaceQuery = useQuery({
        // Non-null inside the `enabled` gate; the key is only built when there is an id.
        queryKey: mcnSpaceKeys.detail(spaceId ?? ''),
        queryFn: () => mcnSpaceApi.getSpace(spaceId as string, activeId),
        enabled: spaceId !== null,
        /*
         * A company's logo, slug and contact address change on the order of never, and this screen
         * is reached from a menu row — so a creator opening it twice in a session should pay for it
         * once. Five minutes is `MyChannelProvider`'s own window, for the same reason.
         */
        staleTime: 5 * 60_000,
    })

    const isBusy = isConfirming || isCancelling

    return {
        state,
        mcn: isMember
            ? {
                  name: mcn?.name ?? null,
                  creatorRate: mcn?.creator_rate ?? null,
                  mcnRate: mcn?.mcn_revenue_rate ?? null,
                  joinedAt: mcn?.joined_at ?? null,
              }
            : null,
        /*
         * `undefined` while the request is in flight *and* while there is no id to ask with — in
         * both cases the answer is unknown, and a card that has decided there is no logo would
         * render a placeholder it may have to take back. `null` is reserved for "asked, nothing
         * there", which is what `getSpace` returns for a failure too.
         */
        space: spaceId === null ? undefined : spaceQuery.data,
        leave,
        isBusy,
        canLeave: canRequestLeave({ state, leave }),
        confirmLeave: () => confirmLeave(),
        cancelLeave: () => cancelLeave(),
        refresh,
    }
}
