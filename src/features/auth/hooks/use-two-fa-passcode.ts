'use client'

import { ApiError } from '@shared/lib/api/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { authKeys } from '../api/auth-api'
import { type TwoFaPasscodeRecord, twoFaApi, twoFaKeys } from '../api/two-fa-api'
import { accountTwoFaPasscode } from '../lib/account-profile'
import { useAuth } from '../providers/auth-provider'

/**
 * The account's two-step-verification state, for the settings screen.
 *
 * **Two sources, and which one answers which question is the whole design.**
 *
 * - **Is it on?** `/me`'s `two_fa_passcode`, read through `accountTwoFaPasscode`. That body is
 *   already in the query cache before this screen mounts, so the right branch — set it up, or manage
 *   it — renders on the **first paint**, with no skeleton and no flash of the opposite screen. It is
 *   also the same flag the withdrawal path gates on, so the two surfaces can never disagree about
 *   whether the account has a passcode.
 * - **What is the hint?** `GET v1/two-fa/passcode/`. Detail, and it is allowed to be missing: the
 *   shape is unverified (B92) and nothing on the screen is load-bearing on it. The hint is what the
 *   management menu prints under its rows, for a reader who has just proved the passcode and may be
 *   about to change it.
 *
 * Inverting that — branching on the fetch and treating `/me` as detail — is the version this
 * deliberately is not. It would put a spinner in front of a fact the client already holds, and it
 * would hand the **wrong branch** to anyone whose 404 (or 502, or blocked request) this client
 * mis-read: offering "Set up two-step verification" to an account that has it on is an invitation to
 * create a second passcode, and offering "Turn it off" to an account that has none is a dead button.
 *
 * ## The fetch is gated on the flag
 *
 * An account with no passcode has no record to read, so the request is not made — that is one fewer
 * guaranteed 404 in everybody's network log, and it means the setup flow costs exactly nothing on
 * arrival.
 *
 * **No loading flag is exported**, deliberately. Nothing branches on this call: the screen renders
 * from `/me` and the hint appears when it appears. A flag would only invite a skeleton in front of a
 * line the screen is correct without — and one shown for an account whose fetch is going to fail.
 *
 * `recoveryEmail` is returned because *Change recovery email* now exists and needs two things from
 * it: the address to open its field on, and — after the write — the value that says whether the write
 * actually landed. See `useTwoFaRecoveryEmail`, which is the whole reason that screen is safe to ship
 * against a `recovery_email` field the API team has not confirmed.
 */
export function useTwoFaPasscode(): {
    /** From `/me`. Known synchronously — never `undefined`. */
    isEnabled: boolean
    /** The hint the account wrote, or `null` (skipped it, unreadable, or not fetched). */
    hint: string | null
    /** Where a recovery code would be mailed, or `null` when the body did not say. */
    recoveryEmail: string | null
    /** Re-read both sources — what a completed setup, change or disable calls. */
    refresh: () => void
} {
    const { currentUser, activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const isEnabled = accountTwoFaPasscode(currentUser)

    const query = useQuery<TwoFaPasscodeRecord>({
        queryKey: twoFaKeys.passcode(activeId),
        queryFn: () =>
            twoFaApi.getPasscode(activeId).catch(error => {
                /*
                 * "No record" is an answer, not a failure — `useUserLogin`'s reasoning: surfacing it
                 * would put a retry in front of somebody whose only problem is that they have nothing
                 * to retry. It should not happen at all here (the query is gated on `/me`'s flag), but
                 * a flag that has just gone stale is precisely when it would.
                 *
                 * **Two shapes mean it.** The auth contract answers `422 AU002` for an account with no
                 * passcode; a 404 is the shape this client assumed before the contract was read, and
                 * is kept because it costs one condition and covers a gateway that rewrites the body.
                 */
                const noRecord =
                    error instanceof ApiError &&
                    (error.status === 404 || (error.status === 422 && error.code === 'AU002'))
                if (noRecord) return { hint: null, recoveryEmail: null }
                throw error
            }),
        enabled: isAuthenticated && isEnabled,
        /*
         * Five minutes, `useUserLogin`'s number and its reasoning: the answer changes only when this
         * account changes it, and every one of those paths invalidates the key outright.
         */
        staleTime: 5 * 60_000,
    })

    const refresh = useCallback(() => {
        /*
         * **Both keys, and `/me` is the one that matters.** It carries the on/off flag every surface
         * in the app branches on — the settings screen, the withdrawal gate — so a change that
         * invalidated only the record would leave the drawer and the payout path believing the old
         * state until something else happened to refetch the profile.
         */
        void queryClient.invalidateQueries({ queryKey: authKeys.me(activeId) })
        void queryClient.invalidateQueries({ queryKey: twoFaKeys.passcode(activeId) })
    }, [activeId, queryClient])

    return {
        isEnabled,
        hint: query.data?.hint ?? null,
        recoveryEmail: query.data?.recoveryEmail ?? null,
        refresh,
    }
}

/**
 * Turn two-step verification off — `DELETE v1/two-fa/passcode/`.
 *
 * A mutation and not a bare call, for the rule in `CLAUDE.md`: components go through a model and a
 * query hook, never axios. What that buys concretely here is the invalidation — the flag on `/me` is
 * what the withdrawal path reads, and a delete that did not refetch it would leave a passcode prompt
 * standing in front of a withdrawal for an account that no longer has one, with nothing to type.
 *
 * **The endpoint enforces the re-auth itself** — `DELETE` takes `{ passcode }` (see
 * `deletePasscode`), which is better than the client-side guarantee this hook was written against.
 * The screen still gates the *button* behind the passcode, because that is where the passcode comes
 * from; the difference is that a caller who skipped it would now be refused rather than obeyed.
 *
 * No `meta.showErrorToast`. The screen owns the failure line, next to the row that was pressed —
 * a toast for a refused security write is the one place a message is easiest to miss.
 */
export function useDisableTwoFa(): {
    /** Takes the passcode the gate proved — `DELETE` carries it as a body field. */
    disable: (passcode: string) => Promise<void>
    isPending: boolean
} {
    const { activeId } = useAuth()
    /*
     * The two keys directly, rather than borrowing `useTwoFaPasscode().refresh`. Composing the hooks
     * would read better and would mount a **second** subscription to the same query on the one screen
     * that uses both — TanStack deduplicates the request, not the subscriber, so it is a second
     * re-render path for a value this hook never looks at.
     */
    const queryClient = useQueryClient()
    const refresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: authKeys.me(activeId) })
        void queryClient.invalidateQueries({ queryKey: twoFaKeys.passcode(activeId) })
    }, [activeId, queryClient])

    const mutation = useMutation({
        mutationFn: (passcode: string) => twoFaApi.deletePasscode(passcode, activeId),
        /*
         * `onSettled`, not `onSuccess`. DELETE is on `client.ts`'s retry list, so a 5xx that reaches
         * here may well have landed on one of the attempts — asserting "still on" would be a claim
         * this client cannot make. Re-reading `/me` is the only honest answer, and it costs one
         * request on a path that has just failed.
         */
        onSettled: () => refresh(),
    })

    return {
        disable: async (passcode: string) => {
            await mutation.mutateAsync(passcode)
        },
        isPending: mutation.isPending,
    }
}
