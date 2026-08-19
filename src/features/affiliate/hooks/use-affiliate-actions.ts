'use client'

import { useAuth } from '@features/auth'
import { campaignKeys } from '@features/campaign'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { affiliateApi, affiliateKeys } from '../api/affiliate-api'
import type { JoinResult, Program } from '../api/types'

/**
 * Joining and leaving a program.
 *
 * ## Neither is optimistic
 *
 * Joining puts a promotional banner on the creator's public space and starts attributing other
 * people's spending to them; leaving takes it down. Flipping the UI first and rolling back would be
 * telling a creator something about their space and their earnings that never happened — the same
 * reasoning `use-cancel-event.ts` gives for a write that other people can see. So both write, then
 * invalidate, and the screens show a pending state while they do.
 *
 * ## What gets invalidated, and why it is two roots
 *
 * `affiliateKeys.all` — because one join changes the current campaign, the stats, *and* which row
 * the list marks as promoted. Naming those three would be three chances to forget one.
 *
 * `campaignKeys.list` — because the **banner outside this dialog** reads `user_joined` from the
 * `dapp-campaign` list, and that is a different service. Without this the card still says "Join
 * now" after a join until its five-minute `staleTime` lapses. `features/campaign` exports
 * `campaignKeys` for exactly this, in place of legacy's `updateCampaignAffiliate` hand-patch.
 *
 * ## The account is pinned in the variables
 *
 * `activeId` is captured when the button is pressed and carried through, not read inside the
 * callbacks. `useMutation` re-registers its options every render, so the callbacks that run are the
 * latest ones — reading the active account there would file one creator's join under another's key
 * if they switched mid-flight. Same rule as `use-update-me.ts`.
 */
export interface AffiliateActions {
    /** Join, or switch: pass the program the user pressed. */
    join: (program: Program) => void
    leave: () => void
    isJoining: boolean
    isLeaving: boolean
}

export function useAffiliateActions({
    promotingId,
    onJoined,
    onLeft,
}: {
    /** The program currently promoted, if any — a join against a different one is a switch. */
    promotingId: string | null
    onJoined: (result: JoinResult) => void
    onLeft: () => void
}): AffiliateActions {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const invalidate = (accountId: string | null) => {
        void queryClient.invalidateQueries({ queryKey: affiliateKeys.all })
        void queryClient.invalidateQueries({ queryKey: campaignKeys.list(accountId) })
    }

    const joinMutation = useMutation({
        // A resolved message, not a key: the toast is raised outside React by `query-client.ts`.
        meta: { showErrorToast: t('affiliate_join_failed') },
        mutationFn: async ({
            program,
            accountId,
            switchingFrom,
        }: {
            program: Program
            accountId: string | null
            switchingFrom: string | null
        }) => {
            /*
             * A switch is a leave and then a join, in that order, because the service allows one
             * promotion at a time. Sequential and not parallel: if the leave fails the join must
             * not happen, or the creator ends up promoting neither.
             *
             * The leave is only issued when something else is actually being promoted — joining
             * the program you already promote is not reachable from the UI (the list hides that
             * row), but a stale `promotingId` should not turn a re-join into leave-then-join.
             */
            if (switchingFrom && switchingFrom !== program.id) {
                await affiliateApi.leaveProgram({ accountId })
            }
            const answer = await affiliateApi.joinProgram(program.id, { accountId })
            /*
             * The program the user pressed wins over the one the response echoed. The success
             * screen is identified by what was chosen, and the write has been seen answering
             * without a `program` at all — legacy folds the same way.
             */
            return { program: answer.program ?? program, referralUrl: answer.referralUrl }
        },
        onSuccess: (result, { accountId }) => {
            invalidate(accountId)
            onJoined(result)
        },
    })

    const leaveMutation = useMutation({
        meta: { showErrorToast: t('affiliate_leave_failed') },
        mutationFn: ({ accountId }: { accountId: string | null }) =>
            affiliateApi.leaveProgram({ accountId }),
        onSuccess: (_void, { accountId }) => {
            invalidate(accountId)
            onLeft()
        },
    })

    return {
        join: (program: Program) =>
            joinMutation.mutate({ program, accountId: activeId, switchingFrom: promotingId }),
        leave: () => leaveMutation.mutate({ accountId: activeId }),
        isJoining: joinMutation.isPending,
        isLeaving: leaveMutation.isPending,
    }
}
