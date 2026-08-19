'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { identificationApi, identificationKeys } from '../api/identification-api'
import { type IdentityState, toIdentityState, toSubmissions } from '../lib/identity-state'

/**
 * Whether this account has verified its identity.
 *
 * Server state, so TanStack Query owns it — not the auth provider, which is where legacy
 * kept it (`submissions` in `providers/authentication`, fetched alongside `/me` on every
 * bootstrap and refetched by hand after Sumsub finished). Two consequences worth having:
 * the drawer row and the page read one cache entry instead of racing two fetches, and the
 * Sumsub flow can announce success by invalidating a key rather than by calling back into
 * a provider.
 *
 * **Not fetched for a guest.** The app always holds a session, including an anonymous one,
 * so `isAuthenticated` alone is true for someone who has never signed in — and asking for
 * an anonymous account's KYC submissions is a guaranteed rejection. It stays disabled, and
 * the state folds to `unverified`, which is the honest answer for an account that cannot
 * have submitted anything.
 *
 * **`enabled` is a second gate, for callers that are mounted before they are looked at.**
 * `/identification` is a route and needs the answer on arrival, so it takes the default. The
 * menu drawer does not: it is mounted in the shell on every page, and ungated this request
 * went out at bootstrap for every signed-in visitor, including the ones who never open the
 * menu. See `useUserLogin` in `features/auth`, which carries the same gate for the same
 * reason.
 *
 * **`state` alone cannot tell you "not yet known".** It folds `undefined` to `unverified`,
 * which is right for the page (the intro is the screen that offers a way forward) and wrong
 * for a row that reports a value — "None" about someone who is verified is a claim, not a
 * placeholder. A caller that *prints* the state must gate on `isKnown`; `isLoading` is the
 * flag for one that swaps in a skeleton, and the two are not the same question.
 */
export function useIdentityStatus({ enabled: callerEnabled = true }: { enabled?: boolean } = {}): {
    state: IdentityState
    /** Whether `state` is an answer rather than its default — see `isKnown` below. */
    isKnown: boolean
    isLoading: boolean
    isError: boolean
    refetch: () => void
} {
    const { activeId, isAuthenticated, isAnonymous, isBootstrapping } = useAuth()
    /** Whether this session is one that *can* have submissions to report. */
    const isSubject = isAuthenticated && !isAnonymous
    const enabled = isSubject && callerEnabled

    const query = useQuery({
        queryKey: identificationKeys.submissions(activeId),
        queryFn: () => identificationApi.getSubmissions(activeId).then(toSubmissions),
        enabled,
        /*
         * Five minutes, not the client's 60s default. **The menu drawer reads this hook**, and
         * the drawer is mounted in the shell on every page — so the default would spend a
         * request per navigation on an answer that changes when a human at Sumsub reviews a
         * document, i.e. minutes to hours after the fact. Nothing waits on the staleness
         * either: finishing a verification invalidates the key outright
         * (`identification-view.tsx`), which is what makes the row update the moment it
         * becomes true.
         */
        staleTime: 5 * 60_000,
    })

    /*
     * Whether `state` means anything yet.
     *
     * `toIdentityState` folds `undefined` to `unverified`, so `state` alone cannot say
     * "unverified" apart from "not asked yet" — and a row that prints the difference needs
     * to. Three ways to be known, and the first is the one that is easy to miss: for a guest
     * or an anonymous session the query never runs *and the answer is still correct*, because
     * an account that cannot submit anything cannot be verified. An error counts as known
     * too — `unverified` is the safe fold (see `toIdentityState`) and the page has `isError`
     * for the retry; leaving this false would hang a caller on a skeleton for ever.
     *
     * False throughout the bootstrap, where `isAuthenticated` is not yet meaningful: without
     * that clause every visitor would count as a settled guest for a moment and the row would
     * print "None" before the session that contradicts it exists.
     */
    const isKnown = !isBootstrapping && (!isSubject || query.data !== undefined || query.isError)

    return {
        state: toIdentityState(query.data),
        isKnown,
        /*
         * `isLoading` rather than `isPending`: a disabled query is pending forever, and a
         * skeleton that never resolves is what a signed-out visitor would have seen.
         *
         * `isBootstrapping` is folded in because the query cannot even start until the session
         * is known, and it reports `isLoading: false` while disabled. Without it, an account
         * that is already verified renders the *intro* for the length of the bootstrap — a
         * screen offering to start a verification it has finished — and then replaces it. A
         * skeleton is the honest thing to show while the answer is genuinely unknown.
         *
         * The cost, stated plainly: `isBootstrapping` starts `true`, so the **server render is
         * the skeleton** rather than the intro copy, and a visitor with no session waits out
         * the anonymous-session bootstrap before reading anything. That is the right way round
         * for this page — it sits behind an auth-gated drawer row, so almost everyone who
         * reaches it is signed in, and for them the wait is unavoidable either way: the answer
         * does not exist until the session does. Better a skeleton than the wrong screen.
         */
        isLoading: query.isLoading || isBootstrapping,
        isError: query.isError,
        refetch: query.refetch,
    }
}
