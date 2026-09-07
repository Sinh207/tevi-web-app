/**
 * What `/mcn-partnership` is showing — the whole decision, as one pure function.
 *
 * ## Why the screen's state is a function and not a chain of ternaries
 *
 * Three independent sources answer at three different times: the session bootstrap, `my-channel/`
 * (which carries the network and the terms), and `v3/organization/leave/` (which carries the
 * countdown). Legacy reads all three inside one `useEffect` and collapses them into
 * `isLoading ? skeleton : !mcn || isOwner ? empty : content` — which is why its screen shows the
 * **empty state** for a beat on every cold load: `myChannel` has not arrived, so `mcn` is
 * `undefined`, so "you are not in an MCN" is what a creator who *is* in one reads first.
 *
 * Pulling it out here makes the precedence testable without a DOM, and it is precedence — not
 * booleans — that this screen gets wrong when it gets anything wrong. `mcn-partnership-state.test.ts`
 * pins the six orderings.
 *
 * ## The states, in the order they are checked
 *
 * | State | When |
 * |---|---|
 * | `bootstrapping` | the session is still resolving — a returning creator is indistinguishable from a guest |
 * | `signed-out` | no real account. The app always holds an *anonymous* one, so this is not `!currentUser` |
 * | `loading` | signed in, and `my-channel/` has not answered yet |
 * | `error` | `my-channel/` failed **and there is no cached body** — a failed refetch keeps the screen |
 * | `none` | answered: no network, or this creator *runs* it (`is_owner`) |
 * | `ready` | answered: this creator is managed by a network |
 *
 * `error` sitting *after* `loading` and being conditioned on having no data is the rule this app
 * states in `features/permission`: a failure is not an answer, and grants (here, terms) already in
 * hand outrank a failed refetch. A creator reading their revenue split must not lose it because a
 * background refresh 502'd.
 */
export type McnPartnershipState =
    | 'bootstrapping'
    | 'signed-out'
    | 'loading'
    | 'error'
    | 'none'
    | 'ready'

/**
 * Only what the decision needs. `mcn` is `undefined` while `my-channel/` is unknown and `null` when
 * the account is in no network — the same three-way the provider hands out, and collapsing it to a
 * boolean is exactly the bug described above.
 */
export interface McnPartnershipInput {
    isBootstrapping: boolean
    isAuthenticated: boolean
    /** `undefined` = not answered yet, `null` = answered, no network. */
    mcn: { is_owner: boolean } | null | undefined
    isMyChannelError: boolean
}

export function mcnPartnershipState({
    isBootstrapping,
    isAuthenticated,
    mcn,
    isMyChannelError,
}: McnPartnershipInput): McnPartnershipState {
    if (isBootstrapping) return 'bootstrapping'
    if (!isAuthenticated) return 'signed-out'
    if (mcn === undefined) return isMyChannelError ? 'error' : 'loading'
    /*
     * `is_owner` means this creator *runs* the network, and legacy shows them the empty state too
     * (`!mcn || isOwner`). It is not a mistake to correct: the split on this screen is the one a
     * managed creator is paid under, which the operator does not negotiate with themselves, and the
     * one action here — leaving — is not something an owner can do to their own organization.
     */
    if (mcn === null || mcn.is_owner) return 'none'
    return 'ready'
}

/**
 * Whether **Leave this MCN** may be offered at all.
 *
 * Two conditions, and the second is the one that matters: `leave` must be *known* to be `null`.
 * `undefined` means the departure query has not answered, and offering the action then lets a
 * creator schedule a departure that is already scheduled — a second `POST` against a state machine
 * with one slot. Legacy hides the kebab on `!leaveDetails`, which is `undefined` and `null` alike,
 * so its menu is offered during the very window in which the answer is unknown.
 *
 * ## "In flight" is deliberately **not** one of the conditions
 *
 * The mutation is not optimistic (see `useMcnLeave`), so between pressing Confirm and the server
 * answering, `leave` is still `null` and this still says yes. That is on purpose: the control opens
 * a dialog, and a dialog returns focus to its trigger when it closes — so unmounting the trigger at
 * exactly that moment drops focus to the document and sends a keyboard reader to the top of the
 * page by their own confirmation. The caller keeps the control mounted and marks it `aria-disabled`
 * instead, which is the distinction this repo draws everywhere a control raises a dialog.
 *
 * Nothing slips through: reopening the menu mid-flight reaches a dialog whose Confirm is disabled
 * while the request is pending.
 */
export function canRequestLeave({
    state,
    leave,
}: {
    state: McnPartnershipState
    leave: unknown | null | undefined
}): boolean {
    return state === 'ready' && leave === null
}
