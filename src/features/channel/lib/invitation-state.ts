import { INVITATION_WINDOW_MS, type McnInvitation } from '../api/invitation-api'

/**
 * What `/invitation/verify` is showing, and what the two figures on it are — the whole decision as
 * pure functions, testable without a DOM or a clock.
 *
 * This is the same arrangement, and for the same reason, as `mcn-partnership-state.ts`: the screen
 * gets *precedence* wrong when it gets anything wrong, and precedence written as a chain of
 * ternaries inside a component cannot be pinned by a test.
 */

/**
 * ## The states, in the order they are checked
 *
 * | State | When |
 * |---|---|
 * | `bootstrapping` | the session is still resolving — a returning creator is indistinguishable from a guest |
 * | `signed-out` | no real account. The app always holds an *anonymous* one, so this is not `!currentUser` |
 * | `no-token` | the URL carries no `invite_token` at all |
 * | `loading` | signed in, with a token, and the request has not answered |
 * | `error` | the request failed **and there is nothing cached** — a failed refetch keeps the screen |
 * | `invalid` | answered: the token is expired, spent or unknown |
 * | `ready` | answered: here is the invitation |
 *
 * ## Three of those seven are things legacy cannot say
 *
 * Legacy has `isLoading ? skeleton : !userInvitation ? noData : content`, and `isLoading` starts
 * `true` and is only ever cleared by a request that actually fires. So:
 *
 * - **A signed-out visitor sees the skeleton forever.** `getUserInvitation` returns early on
 *   `!isAuthenticated` without touching `isLoading`, and this screen is reached from an *email* —
 *   which is the one entry point most likely to be opened in a browser with no session. There is no
 *   sign-in prompt on the whole screen.
 * - **A missing token does the same**, for the same reason.
 * - **A 500 is reported as an expired link.** The `catch` writes `null`, which is the same value a
 *   genuinely dead token produces, so a creator with a live invitation is told it has expired — and
 *   there is nothing to press, because nothing knows a request failed.
 *
 * `error` sits *after* `loading` and is conditioned on having no data, which is `features/permission`'s
 * rule: a failure is not an answer, and an invitation already in hand outranks a failed background
 * refetch. Nobody should lose the terms they are reading because a poll 502'd.
 */
export type McnInvitationState =
    | 'bootstrapping'
    | 'signed-out'
    | 'no-token'
    | 'loading'
    | 'error'
    | 'invalid'
    | 'ready'

export interface McnInvitationStateInput {
    isBootstrapping: boolean
    isAuthenticated: boolean
    /** The `invite_token` query parameter, trimmed. Empty or absent ⇒ `no-token`. */
    token: string | null
    /** `undefined` = not answered yet, `null` = answered, nothing there. */
    invitation: McnInvitation | null | undefined
    isError: boolean
}

export function mcnInvitationState({
    isBootstrapping,
    isAuthenticated,
    token,
    invitation,
    isError,
}: McnInvitationStateInput): McnInvitationState {
    if (isBootstrapping) return 'bootstrapping'
    if (!isAuthenticated) return 'signed-out'
    if (!token) return 'no-token'
    if (invitation === undefined) return isError ? 'error' : 'loading'
    return invitation === null ? 'invalid' : 'ready'
}

/**
 * The two percentages the screen prints side by side.
 *
 * `null` for both when the network's rate is unreadable, and that is the point of this function
 * existing rather than the arithmetic sitting in the view. Legacy computes
 * `mcnRate = parseFloat(rate) || 0` and `creatorRate = parseFloat(100 - mcnRate) || 0`, which for a
 * payload missing `mcn_revenue_rate` renders **Creator Rate 100% · MCN Rate 0%** — a commercial term
 * nobody agreed, printed as fact, on the screen where a creator presses Agree. Worse, `|| 0` also
 * swallows a genuine `0`: `parseFloat(100 - 100) || 0` is `0`, which happens to be right, but
 * `creatorRate` of `0` is indistinguishable from "we could not read this".
 *
 * So the two figures are known together or not at all, and the caller withholds the whole block.
 */
export interface InvitationRates {
    creator: number | null
    mcn: number | null
}

export function invitationRates(mcnRate: number | null | undefined): InvitationRates {
    if (typeof mcnRate !== 'number' || !Number.isFinite(mcnRate)) {
        return { creator: null, mcn: null }
    }
    if (mcnRate < 0 || mcnRate > 100) return { creator: null, mcn: null }
    /*
     * Rounded to one decimal on both halves. The rate arrives as a string in legacy, so `47.5` is
     * reachable, and `100 - 47.5` is exactly `52.5` — but `100 - 0.1` is `99.9` only after rounding,
     * because binary floating point makes it `99.89999999999999`. Printing that on a contract is the
     * kind of defect that survives review because the input that triggers it is uncommon.
     */
    const round = (n: number) => Math.round(n * 10) / 10
    return { creator: round(100 - mcnRate), mcn: round(mcnRate) }
}

/**
 * How long is left on the link, in milliseconds — clamped at `0`, and `null` when it cannot be told.
 *
 * `null` rather than `0` for an unreadable `created_at`, because the two mean opposite things to the
 * caller: `0` is "expired, stop offering Agree", `null` is "we do not know when this expires, so say
 * nothing about it". Legacy's `getCountdownToHHMMSS` collapses both to `'00:00:00'`, so an
 * invitation whose timestamp failed to parse displays **Agree [00:00:00]** — a live invitation
 * labelled as dead, next to a button that still works.
 *
 * `now` is a parameter and must stay one. Two reasons, the first a correctness rule: this reads the
 * clock, so a server render and the browser's first render disagree and React reports a hydration
 * mismatch — the caller must not paint a countdown until after mount. The second is that a default
 * of `Date.now()` makes every test need fake timers.
 */
export function invitationRemainingMs(
    createdAt: string | null | undefined,
    now: number,
    windowMs: number = INVITATION_WINDOW_MS,
): number | null {
    if (!createdAt) return null
    const start = new Date(createdAt).getTime()
    if (Number.isNaN(start)) return null
    return Math.max(0, start + windowMs - now)
}

/**
 * `71:59:03` — hours:minutes:seconds, zero-padded, exactly legacy's `formatRemainingHHMMSS`.
 *
 * **Hours are not wrapped at 24.** A fresh invitation reads `71:59:59`, not `2 days 23:59:59`, which
 * is what legacy prints and what the button copy is sized for. It is also the honest shape for a
 * timer somebody is deciding against: "71:12:04" says *plenty of time* at a glance in a way that
 * "02:23:12:04" does not.
 *
 * Not localised, and deliberately: it is a duration in digits, `Intl.DurationFormat` is not in the
 * baseline this app targets, and every locale's numerals are the Latin ones everywhere else in this
 * app already (`Intl.NumberFormat('ar')` would give `٧١` and disagree with every other figure on the
 * screen). `null` in, `null` out — the caller drops the label rather than printing a zeroed clock.
 */
export function formatRemaining(ms: number | null): string | null {
    if (ms === null) return null
    const total = Math.floor(ms / 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/**
 * Whether **Agree** and **Reject** may be pressed at all.
 *
 * `ready` plus a token, and **not** conditioned on the countdown. That last part is deliberate:
 * `INVITATION_WINDOW_MS` is the *client's* guess at the window (B100), so disabling the only two
 * controls on the screen when it reaches zero would let a wrong constant lock a creator out of an
 * invitation the server would still accept. The server is the authority on expiry; a spent link
 * comes back as a 4xx whose own message reaches the reader (`docs/API_ERRORS.md`).
 *
 * The countdown's job is to inform, not to gate. What *does* gate is the request in flight, and the
 * caller handles that with `aria-disabled` rather than by unmounting — the distinction this repo
 * draws wherever a control can lose focus mid-interaction.
 */
export function canAnswerInvitation({
    state,
    token,
}: {
    state: McnInvitationState
    token: string | null
}): boolean {
    return state === 'ready' && Boolean(token)
}
