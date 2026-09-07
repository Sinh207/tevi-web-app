'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { apiErrorText } from '@shared/lib/api/error-message'
import { keepFor } from '@shared/lib/api/query-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { channelKeys, forgetMyChannelCache } from '../api/channel-api'
import {
    forgetUserInvitationCache,
    type McnUserInvitation,
    type McnUserInvitationAction,
    mcnUserInvitationApi,
    mcnUserInvitationKeys,
} from '../api/user-invitation-api'
import {
    canAnswerUserInvitation,
    type McnUserInvitationState,
    mcnUserInvitationState,
} from '../lib/user-invitation-state'

/**
 * Everything `/mcn-user-invitation/verify` renders and everything it can do — one read, one write,
 * and the state machine that decides between them.
 *
 * ## The token comes in as an argument, not out of `useSearchParams()`
 *
 * The screen cannot render *anything* without it, so it is needed during the first render rather
 * than inside an effect. `useSearchParams()` would opt the whole route into dynamic rendering (or
 * demand a Suspense boundary) and hand the value over a render later; `page.tsx` already receives
 * `searchParams` as a server prop, so the token is in the first paint with no hook at all.
 *
 * ## `token`, and it is *not* the other invitation's parameter name
 *
 * Legacy's two invitation screens disagree: `/invitation/verify` reads **`invite_token`** and this
 * one reads **`token`**. Both spellings are baked into mail the backend has already sent, so neither
 * can be normalised. This is the manager one.
 */
export interface McnUserInvitationValue {
    state: McnUserInvitationState
    /** The invitation. `null` once it is known there is none; `undefined` while unknown. */
    invitation: McnUserInvitation | null | undefined
    /** True only while an accept/reject is in flight. */
    isBusy: boolean
    /** Which answer is in flight, for the button that should show the spinner. */
    pendingAction: McnUserInvitationAction | null
    /** Whether the two buttons may be pressed — see `canAnswerUserInvitation`. */
    canAnswer: boolean
    answer: (action: McnUserInvitationAction) => void
    /** Re-read the invitation; what the error state's Retry presses. */
    refresh: () => Promise<void>
}

export function useMcnUserInvitation(token: string | null): McnUserInvitationValue {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const { t } = useTranslation()
    const router = useRouter()
    const queryClient = useQueryClient()

    const trimmed = token?.trim() || null
    const enabled = isAuthenticated && !isBootstrapping && trimmed !== null

    const query = useQuery({
        // Non-null inside the `enabled` gate; the key is only read when there is a token.
        queryKey: mcnUserInvitationKeys.detail(trimmed ?? '', activeId),
        queryFn: () => mcnUserInvitationApi.getInvitation(trimmed as string, activeId),
        enabled,
        /*
         * **Sixty seconds, and `keepFor` so `gcTime` agrees.** A `staleTime` on its own is a claim
         * the default 5-minute `gcTime` overrules — see `keepFor`. Short rather than long because
         * the answer is *perishable* in a way a catalogue is not: the network can withdraw the
         * invitation, and the account can accept the same link on their phone while this tab is
         * open. Sixty is the app's own default and enough to stop a remount re-asking.
         */
        ...keepFor(60_000),
        /*
         * **No `persist`, and this is the case `interceptors/etag.ts` warns about.** The body names
         * an organization and the role it is offering one person; a copy on the disk of a shared
         * device is exactly **B72**. The memory tier is not opt-in and is fine — it dies with the
         * tab, and `forgetUserInvitationCache` is what clears it once the token is spent.
         */
    })

    const state = mcnUserInvitationState({
        isBootstrapping,
        isAuthenticated,
        token: trimmed,
        invitation: enabled ? query.data : undefined,
        isError: query.isError,
    })

    const answer = useMutation({
        mutationFn: (action: McnUserInvitationAction) =>
            mcnUserInvitationApi.confirmInvitation(trimmed as string, action, activeId),
        /**
         * ## Not optimistic, and it must not become so
         *
         * The rule `useMcnLeave` and the creator invitation both state: the result of this write is
         * a **relationship with somebody else**. Accepting makes the reader staff of that network
         * and tells the network they have joined; moving the UI first and rolling back would be
         * telling somebody a role exists that does not.
         *
         * ## Both caches are dropped, and the ETag one first
         *
         * The invitation's own query keys are **removed**, not invalidated: the token is spent either
         * way, so a refetch would only re-fill a cache nothing reads, and a body left in it lets Back
         * re-render a live-looking Accept button. `forgetUserInvitationCache` is the other half of
         * that — its docstring has the argument, and the short version is that `removeQueries` does
         * not reach the ETag layer, whose memory tier is not opt-in, so a `304` would replay the old
         * body **as a 200**.
         *
         * `my-channel/` is evicted too, and that is a **deliberate over-reach rather than a claim**.
         * What accepting changes for this account is stated only in the letter — *cannot join
         * another MCN as a creator* — and whether that surfaces in `my-channel/`'s `mcn` block is
         * B101's open half. So the cheap, correct-either-way move is taken: one conditional GET on a
         * screen that is navigating away regardless. `forgetMyChannelCache` is awaited **before**
         * `invalidateQueries`, because that starts its request synchronously and evicting afterwards
         * drops a record the request had already read.
         *
         * A **reject** does all of this too. It changes nothing server-side for this account, and a
         * branch here is a branch that can be wrong the day the payload gains a field.
         */
        onSuccess: async (_data, action) => {
            queryClient.removeQueries({ queryKey: mcnUserInvitationKeys.all })
            if (trimmed) await forgetUserInvitationCache(trimmed, activeId)
            await forgetMyChannelCache(activeId)
            await queryClient.invalidateQueries({ queryKey: channelKeys.myChannel(activeId) })
            /*
             * The creator invitation's keys, deliberately. "Invitation accepted" / "Invitation
             * rejected" says the whole of what happened and is true of both screens, so a second
             * pair would be two more strings in nine locales that must never diverge — the argument
             * `mcn-user-invitation-view.tsx` makes at length about the thirteen shared keys.
             *
             * Legacy's own toasts here read "User has accepted the invitation", which is the
             * backoffice's sentence about somebody else printed to the person who just pressed the
             * button. Not ported.
             */
            toast.success(
                action === 'accept' ? t('mcn_invitation_accepted') : t('mcn_invitation_rejected'),
            )
            /*
             * Legacy's destination, unchanged (`router.push('/')`). `replace`, not `push` — the token
             * is spent, so leaving it in history gives Back a URL that can only render the
             * expired-link wall.
             */
            router.replace('/')
        },
        /**
         * **The API's own sentence wins here, our key is the fallback** —
         * [`docs/API_ERRORS.md`](../../../../docs/API_ERRORS.md). The refusals are all things only
         * the backend knows ("this invitation was already answered", "you are managed by another
         * network", "your account cannot be a manager"), and legacy prints
         * `e.response?.data?.message` for exactly that reason.
         *
         * `apiErrorText` rather than another copy of the predicate — §5 of that doc names
         * `shared/lib/api/error-message.ts` as its home and warns against one. It is not yet wired
         * into `mutationCache.onError`, so this hook sets **no `meta`** and toasts here: a
         * `meta.showErrorToast` today would print our generic string *instead of* the backend's,
         * which is the behaviour that rule reverses.
         */
        onError: error => {
            toast.error(apiErrorText(error) ?? t('mcn_invitation_action_failed'))
        },
    })

    return {
        state,
        invitation: enabled ? query.data : undefined,
        isBusy: answer.isPending,
        pendingAction: answer.isPending ? (answer.variables ?? null) : null,
        canAnswer: canAnswerUserInvitation({ state, token: trimmed }),
        answer: action => {
            /*
             * A guard in the hook, **as well as** the view's `disabled` — and not a replacement for
             * it. `Button` styles only the real `:disabled` pseudo-class, so `aria-disabled` would
             * leave both controls looking pressable for the whole write; the visible state has to be
             * `disabled`, which is what `docs/DEFINITION_OF_DONE.md` §2 asks for anyway.
             *
             * What this adds is that the *hook* is safe for a caller that forgets: no token means no
             * request rather than a `POST` to `…/undefined/`, and a second answer while one is in
             * flight is dropped rather than sent. It does not defend against two clicks inside one
             * frame — `isPending` is a rendered value, so both would read `false` — and nothing here
             * can: TanStack does not deduplicate `mutate`. That window is one render long and ends
             * in a navigation, which is why it is left alone rather than papered over with a ref.
             */
            if (answer.isPending || !trimmed) return
            answer.mutate(action)
        },
        refresh: async () => {
            await query.refetch()
        },
    }
}
