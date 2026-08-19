'use client'

import { ApiError } from '@shared/lib/api/errors'
import { useQuery } from '@tanstack/react-query'
import { authApi, authKeys, type UserLogin } from '../api/auth-api'
import { useAuth } from '../providers/auth-provider'

/**
 * Which sign-in credentials the active account has — i.e. **whether it has a password**.
 *
 * Server state, so TanStack Query owns it rather than the auth provider, which is where
 * legacy keeps it (`userLogin` on `AuthContext`, fetched alongside `/me`). Two things fall
 * out of that: the drawer row and the password screen read one cache entry instead of
 * racing two fetches, and setting a password announces itself by invalidating a key rather
 * than by calling back into a provider.
 *
 * **Not `/me`.** A Google account has an email on its profile and no password at all, so
 * `currentUser.email` answers a different question — see `authApi.getUserLogin`.
 *
 * **Not fetched for a guest.** The app always holds a session, including an anonymous one,
 * so `isAuthenticated` is the right gate (it is already false for anonymous). Asking an
 * anonymous account for its credentials is a guaranteed rejection.
 *
 * **`enabled` is a second gate, for callers that are mounted before they are looked at.**
 * `/settings/password` is a route and needs the answer on arrival, so it takes the default.
 * The drawer's Privacy and Security screen does not: it is parked mounted on every page
 * (see `menu-drawer.tsx`), and without the gate this request went out at bootstrap for
 * every signed-in visitor, including the ones who never open the menu.
 */
export function useUserLogin({ enabled = true }: { enabled?: boolean } = {}): {
    /** `undefined` until the answer is known — never guess from it. */
    userLogin: UserLogin | undefined
    /** The address this account signs in with, if it has one. */
    email: string | undefined
    /** True only once the answer is in and it is negative. */
    hasCredentials: boolean
    isLoading: boolean
    isError: boolean
    refetch: () => void
} {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()

    const query = useQuery({
        queryKey: authKeys.userLogin(activeId),
        queryFn: () =>
            authApi.getUserLogin().catch(error => {
                /*
                 * A 404 is an answer, not a failure: "this account has no login record" is
                 * exactly the state the create-password flow exists for, and surfacing it as
                 * an error would put a retry button in front of someone whose only problem is
                 * that they have never set a password. Every other status still throws.
                 *
                 * Whether the backend actually answers 404 here rather than 200 with an empty
                 * body is unconfirmed (B7, `docs/BACKEND_QUESTIONS.md`) — this handles both.
                 */
                if (error instanceof ApiError && error.status === 404) return {} as UserLogin
                throw error
            }),
        enabled: isAuthenticated && enabled,
        /*
         * Five minutes, not the client's 60s default. The answer changes only when this user
         * sets a password — at which point the key is invalidated outright, which is what
         * makes the row update immediately. It is also what makes the drawer's gate free to
         * flip: opening Privacy and Security twice, or opening it and then walking to
         * `/settings/password`, is one request rather than three.
         */
        staleTime: 5 * 60_000,
    })

    return {
        userLogin: query.data,
        email: query.data?.email,
        hasCredentials: Boolean(query.data?.email || query.data?.phone),
        /*
         * `isLoading`, not `isPending`: a disabled query is pending forever, and a skeleton
         * that never resolves is what a signed-out visitor would have seen. `isBootstrapping`
         * folds in because the query cannot start before the session is known and reports
         * `isLoading: false` while disabled — without it, an account that *has* a password
         * renders the create-password screen for the length of the bootstrap.
         */
        isLoading:
            isAuthenticated && enabled ? query.isLoading || isBootstrapping : isBootstrapping,
        isError: query.isError,
        refetch: query.refetch,
    }
}
