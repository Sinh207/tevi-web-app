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
    forgetInvitationCache,
    type McnInvitation,
    type McnInvitationAction,
    mcnInvitationApi,
    mcnInvitationKeys,
} from '../api/invitation-api'
import {
    canAnswerInvitation,
    type McnInvitationState,
    mcnInvitationState,
} from '../lib/invitation-state'

/**
 * Everything `/invitation/verify` renders and everything it can do — one read, one write, and the
 * state machine that decides between them.
 *
 * ## The token comes in as an argument, not out of `useSearchParams()`
 *
 * The screen cannot render *anything* without it, so it is needed during the first render rather
 * than inside an effect. `useSearchParams()` would opt the whole route into dynamic rendering (or
 * demand a Suspense boundary) and hand the value over a render later; `page.tsx` already receives
 * `searchParams` as a server prop, so the token is in the first paint with no hook at all. Same
 * reasoning as `card-management-view.tsx`'s note, arrived at from the other end: that one needs the
 * query string only in an effect and reads `window.location.search`.
 *
 * ## `invite_token`, and it is *not* the other invitation's parameter name
 *
 * Legacy has two invitation screens on two paths, and they disagree: `/invitation/verify` reads
 * **`invite_token`** and `/mcn-user-invitation/verify` reads **`token`**. Both spellings are baked
 * into mail the backend has already sent, so neither can be normalised here. This is the creator
 * one.
 */
export interface McnInvitationValue {
    state: McnInvitationState
    /** The invitation. `null` once it is known there is none; `undefined` while unknown. */
    invitation: McnInvitation | null | undefined
    /** True only while an accept/reject is in flight. */
    isBusy: boolean
    /** Which answer is in flight, for the button that should show the spinner. */
    pendingAction: McnInvitationAction | null
    /** Whether the two buttons may be pressed — see `canAnswerInvitation`. */
    canAnswer: boolean
    answer: (action: McnInvitationAction) => void
    /** Re-read the invitation; what the error state's Retry presses. */
    refresh: () => Promise<void>
}

export function useMcnInvitation(token: string | null): McnInvitationValue {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const { t } = useTranslation()
    const router = useRouter()
    const queryClient = useQueryClient()

    const trimmed = token?.trim() || null
    const enabled = isAuthenticated && !isBootstrapping && trimmed !== null

    const query = useQuery({
        // Non-null inside the `enabled` gate; the key is only read when there is a token.
        queryKey: mcnInvitationKeys.detail(trimmed ?? '', activeId),
        queryFn: () => mcnInvitationApi.getInvitation(trimmed as string, activeId),
        enabled,
        /*
         * **Sixty seconds, and `keepFor` so `gcTime` agrees.** A `staleTime` on its own is a claim
         * the default 5-minute `gcTime` overrules — see `keepFor`. Short rather than long because
         * the answer is *perishable* in a way a catalogue is not: the network can withdraw an
         * invitation, and the account can accept the same link on their phone while this tab is
         * open. Sixty is the app's own default and enough to stop a remount re-asking.
         */
        ...keepFor(60_000),
        /*
         * **No `persist`, and this is the case `interceptors/etag.ts` warns about.** The body names
         * an organization and the commercial terms it is offering one person; a copy on the disk of
         * a shared device is exactly **B72**. The memory tier is not opt-in and is fine — it dies
         * with the tab.
         */
    })

    const state = mcnInvitationState({
        isBootstrapping,
        isAuthenticated,
        token: trimmed,
        invitation: enabled ? query.data : undefined,
        isError: query.isError,
    })

    const answer = useMutation({
        mutationFn: (action: McnInvitationAction) =>
            mcnInvitationApi.confirmInvitation(trimmed as string, action, activeId),
        /**
         * ## Not optimistic, and it must not become so
         *
         * The same rule `useMcnLeave` states: the result of this write is a **relationship with
         * somebody else**. Accepting binds the creator to a revenue split for sixty days and tells
         * the network they have joined; moving the UI first and rolling back would be telling
         * somebody a contract exists that does not.
         *
         * ## The ETag is evicted before the invalidate, and that is not belt-and-braces
         *
         * An accepted invitation changes `v3/channel/my-channel/` — that body's `mcn` block is where
         * the terms live, and it is what `/mcn-partnership`, the About tab's MCN card and the account
         * drawer's row all read. `invalidateQueries` alone looks sufficient and is **B72**: the
         * refetch carries the `If-None-Match` this client still holds, and if the service's validator
         * has not moved it answers `304` and `apiClient` replays the body that says *no network*. So
         * `forgetMyChannelCache` first, awaited — `invalidateQueries` starts its request
         * synchronously, and evicting afterwards drops a record the request had already read.
         *
         * That helper's own docstring says it is aimed at the `premium_info` **event** rather than at
         * the endpoint, which is the right framing: this is a second event of the same class — a
         * write elsewhere that changes what this body says about the account — and not a licence to
         * make `my-channel/` unconditional for everybody.
         *
         * The invitation's own keys are **removed**, not invalidated: the token is spent either way,
         * so a refetch would only re-fill a cache nothing reads, and a body left in it lets Back
         * re-render a live-looking Agree button.
         *
         * A **reject** does all of this too. It does not change `my-channel/`, but it costs one
         * conditional GET on a screen that is navigating away regardless, and a branch here is a
         * branch that can be wrong the day the payload gains a field.
         */
        onSuccess: async (_data, action) => {
            /*
             * Both caches for the spent token, and **the ETag one is not optional** — see
             * `forgetInvitationCache`. `removeQueries` only reaches the query layer; the memory ETag
             * tier would still answer a re-read of this URL with the body that shows a live Agree
             * button.
             */
            queryClient.removeQueries({ queryKey: mcnInvitationKeys.all })
            if (trimmed) await forgetInvitationCache(trimmed, activeId)
            await forgetMyChannelCache(activeId)
            await queryClient.invalidateQueries({ queryKey: channelKeys.myChannel(activeId) })
            toast.success(
                action === 'accept' ? t('mcn_invitation_accepted') : t('mcn_invitation_rejected'),
            )
            /*
             * Legacy's destination, unchanged (`router.push('/')`). `/mcn-partnership` would be the
             * better landing for an *accept* and is deliberately not substituted: this is a port,
             * and sending somebody somewhere legacy never did is a product decision rather than a
             * parity one. `replace`, not `push` — the token is spent, so leaving it in history gives
             * Back a URL that can only render the expired wall.
             */
            router.replace('/')
        },
        /**
         * **The API's own sentence wins here, our key is the fallback** —
         * [`docs/API_ERRORS.md`](../../../../docs/API_ERRORS.md). This is the one screen where that
         * rule is not a nicety: the refusals are all things only the backend knows ("this invitation
         * was already answered", "you are already managed by a network", "your account cannot join
         * as a creator"), and legacy prints `e.response?.data?.message` for exactly that reason.
         *
         * `apiErrorText` rather than a sixth copy of the predicate — §5 of that doc names
         * `shared/lib/api/error-message.ts` as its home and warns against another copy. It is not
         * yet wired into `mutationCache.onError` (that changes ~34 unrelated toasts), so this hook
         * sets **no `meta`** and toasts here: a `meta.showErrorToast` today would print our generic
         * string *instead of* the backend's, which is the behaviour this rule reverses.
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
        canAnswer: canAnswerInvitation({ state, token: trimmed }),
        answer: action => {
            // Refused rather than gated by `disabled`: the buttons stay focusable while in flight.
            if (answer.isPending || !trimmed) return
            answer.mutate(action)
        },
        refresh: async () => {
            await query.refetch()
        },
    }
}
