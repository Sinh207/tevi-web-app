'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { type AccountUser, getActiveAccountId } from '@shared/lib/api/token'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { authApi, authKeys } from '../api/auth-api'
import { foldAccountUser } from '../lib/account-fold'

/**
 * Change a field on the signed-in account's profile.
 *
 * ## Why this is a mutation and not a provider method
 *
 * Legacy puts `updateUser` on `AuthContext` and has it `setCurrentUser(res.data.data)`
 * (`providers/authentication/index.js`), which means the profile is written by two
 * unrelated paths — the `/me` fetch and this — into a `useState` that neither can
 * invalidate. Here `/me` is server state under `authKeys.me(accountId)`, so a write is a
 * mutation against that same cache entry and every reader updates as a consequence. See
 * the three communication primitives in `CLAUDE.md`.
 *
 * ## The optimistic flip is the point
 *
 * A settings toggle that waits for a round trip before moving reads as broken — you press
 * it, nothing happens, and half a second later it agrees. So the cache is patched first,
 * the server's answer replaces it, and a failure rolls the switch back and says so. That
 * rollback is why `onMutate` snapshots rather than trusting a refetch: the previous value
 * is the only thing that can undo an optimistic write, and it stops existing the moment
 * something else touches the key.
 *
 * ## The account is pinned in the variables, not read from a closure
 *
 * `getActiveAccountId()` is called once, in `update`, and carried through. Reading it
 * inside the callbacks instead would take whatever is active *when the response lands*:
 * `useMutation` re-registers its options every render, so the callbacks that run are the
 * latest ones, and an account switch mid-flight would file one user's new setting under
 * the other user's query key. The request itself is pinned the same way (`updateMe`).
 *
 * ## One in-flight write at a time
 *
 * `isPending` is shared by every control the caller wires to one instance of this hook,
 * as legacy's single `isLoadingAction` flag was. Deliberate: the endpoint answers with
 * the *whole* user, so two overlapping writes race to overwrite each other's field with a
 * body that predates it. Serialising at the UI is cheaper than reconciling that.
 */

type ProfilePatch = Record<string, unknown>

export function useUpdateMe() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const mutation = useMutation({
        // The backend's own message never reaches the screen — same rule as sign-in
        // (`lib/auth-error.ts`). What failed is a setting, and that is all worth saying.
        meta: { showErrorToast: t('settings_update_failed') },
        mutationFn: ({ patch, accountId }: { patch: ProfilePatch; accountId: string | null }) =>
            authApi.updateMe(patch, accountId).then(user => user as AccountUser),
        onMutate: async ({ patch, accountId }) => {
            const key = authKeys.me(accountId)
            // An in-flight `/me` refetch would land after the optimistic write and undo
            // it, so it is cancelled rather than raced.
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<AccountUser>(key)
            // Shallow, which is what the endpoint takes: a caller changing a nested
            // object (`nsfw_settings`) sends the whole object, as legacy does.
            if (previous) queryClient.setQueryData<AccountUser>(key, { ...previous, ...patch })
            return { key, previous }
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) queryClient.setQueryData(context.key, context.previous)
        },
        /*
         * The response *is* the new profile, so it replaces the optimistic guess rather
         * than triggering a refetch to go and ask again — and it goes through the same
         * fold as a fetch, so the token store's snapshot (what the account switcher
         * reads) does not drift from what is on screen.
         *
         * **Unless it isn't.** The DTO is not modelled (`docs/BACKEND_QUESTIONS.md`) and
         * nothing enforces the contract, so a 200 with an empty body — or an
         * acknowledgement rather than a profile — would fold `{}` over the cached user and
         * blank the signed-in account's name, avatar and `id` from one settings toggle.
         * Legacy guards this too, and only assigns when `res?.data?.data` is there
         * (`providers/authentication/index.js`). Here the guard falls back to asking: the
         * optimistic value stays on screen and `/me` is refetched for the truth.
         */
        onSuccess: (user, { accountId }) => {
            if (!user || typeof user !== 'object' || user.id === undefined) {
                void queryClient.invalidateQueries({ queryKey: authKeys.me(accountId) })
                return
            }
            queryClient.setQueryData(authKeys.me(accountId), foldAccountUser(accountId, user))
        },
    })

    const { mutate, isPending } = mutation

    const update = useCallback(
        (patch: ProfilePatch) => mutate({ patch, accountId: getActiveAccountId() }),
        [mutate],
    )

    return { update, isPending }
}
