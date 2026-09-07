/**
 * What `/mcn-user-invitation/verify` is showing — the whole decision as one pure function, testable
 * without a DOM.
 *
 * Same arrangement, and the same reason, as `invitation-state.ts` and `mcn-partnership-state.ts`:
 * this screen gets *precedence* wrong when it gets anything wrong, and precedence written as a chain
 * of ternaries inside a component cannot be pinned by a test.
 *
 * ## Why it is not `mcnInvitationState` with a wider parameter
 *
 * The seven states and their order are the same as the creator invitation's, and the argument for
 * each of them is written once, next door — read `invitation-state.ts` for it, including the three
 * states legacy cannot express at all. What differs is the **input**: that function is typed to the
 * creator payload (which carries a revenue rate), and widening it so this screen could pass a
 * manager payload would make the creator screen's own contract structural — any object at all would
 * satisfy it, including the wrong invitation.
 *
 * So the shape here is generic over "an invitation, or the knowledge that there is none", which is
 * all the precedence actually depends on. If the two payloads ever converge, this is the file that
 * disappears — not the typed one.
 */

/**
 * ## The states, in the order they are checked
 *
 * | State | When |
 * |---|---|
 * | `bootstrapping` | the session is still resolving — a returning manager is indistinguishable from a guest |
 * | `signed-out` | no real account. The app always holds an *anonymous* one, so this is not `!currentUser` |
 * | `no-token` | the URL carries no `token` at all |
 * | `loading` | signed in, with a token, and the request has not answered |
 * | `error` | the request failed **and there is nothing cached** — a failed refetch keeps the screen |
 * | `invalid` | answered: the token is expired, spent or unknown |
 * | `ready` | answered: here is the invitation |
 *
 * `error` sits *after* `loading` and is conditioned on having no data, which is
 * `features/permission`'s rule: a failure is not an answer, and an invitation already in hand
 * outranks a failed background refetch.
 *
 * Legacy renders three of these — `isLoading ? skeleton : !userInvitation ? noData : content` — and
 * `isLoading` starts `true` and is only ever cleared by a request that actually fires. So a
 * **signed-out visitor sits on the skeleton forever** (`getUserInvitation` returns early on
 * `!isAuthenticated` without touching it), a **missing token** does the same, and a **500 is
 * reported as an expired link**. This screen is reached from an *email*, which is the entry point
 * most likely to be opened in a browser with no session, so the first of those is not an edge case.
 */
export type McnUserInvitationState =
    | 'bootstrapping'
    | 'signed-out'
    | 'no-token'
    | 'loading'
    | 'error'
    | 'invalid'
    | 'ready'

export interface McnUserInvitationStateInput {
    isBootstrapping: boolean
    isAuthenticated: boolean
    /** The `token` query parameter, trimmed. Empty or absent ⇒ `no-token`. */
    token: string | null
    /**
     * `undefined` = not answered yet, `null` = answered and there is nothing there.
     *
     * Typed as "some object" rather than as the payload: the precedence depends only on which of
     * those three cases holds, and naming the DTO here would tie the decision table to a schema it
     * never reads a field of.
     */
    invitation: object | null | undefined
    isError: boolean
}

export function mcnUserInvitationState({
    isBootstrapping,
    isAuthenticated,
    token,
    invitation,
    isError,
}: McnUserInvitationStateInput): McnUserInvitationState {
    if (isBootstrapping) return 'bootstrapping'
    if (!isAuthenticated) return 'signed-out'
    if (!token) return 'no-token'
    if (invitation === undefined) return isError ? 'error' : 'loading'
    return invitation === null ? 'invalid' : 'ready'
}

/**
 * Whether **Accept** and **Reject** may be pressed at all.
 *
 * `ready` plus a token, and **nothing about the 72-hour window** — which is the client's own guess
 * (`USER_INVITATION_WINDOW_HOURS`, B101), so gating the only two controls on it would let a wrong
 * constant lock somebody out of an invitation the server would still accept. The server is the
 * authority on expiry; a spent link comes back as a 4xx whose own message reaches the reader
 * (`docs/API_ERRORS.md`).
 *
 * What *does* gate is the request in flight, and the caller handles that separately — the two are
 * kept apart so "there is nothing to answer" and "we are answering" can never be confused for one
 * another.
 */
export function canAnswerUserInvitation({
    state,
    token,
}: {
    state: McnUserInvitationState
    token: string | null
}): boolean {
    return state === 'ready' && Boolean(token)
}
