/**
 * Legacy's `AUTO_FOLLOW.duration_secs` (`constants/channel.js`).
 *
 * ## The client runs this timer, and the settings screen used to say otherwise
 *
 * `privacy-security-screen.tsx` carried a note reading *"the client does not decide this — the
 * backend runs the timer"*. That was written when nothing implemented it, and it is wrong: legacy's
 * `components/autoFollowChannel` counts down in a `setTimeout` chain and calls `followChannel`
 * itself when it reaches zero. There is no server-side timer at all.
 *
 * So the number lives **here**, next to the timer that obeys it, and the settings sentence imports
 * it. Two copies of a duration where one is prose and the other is behaviour is exactly the drift
 * this codebase keeps being bitten by.
 */
export const AUTO_FOLLOW_SECONDS = 10

/**
 * Whether the countdown should be ticking.
 *
 * Every clause is legacy's, and each one is a real state rather than a defensive check:
 *
 * - **`isAuthenticated`** — a guest has no account to follow *with*. The bar still shows them the
 *   prompt; pressing it opens the login dialog. It just does not act on its own.
 * - **`autoFollow`** — the account setting (`/me`'s `auto_follow`, the toggle in Privacy &
 *   security). Off is the default, and off means the bar is a plain invitation.
 * - **`!isFollowed`** — there is nothing to count towards.
 * - **`!skipped`** — the reader said no. Legacy keeps the bar and only stops the clock, which is
 *   the right reading of "Skip": it dismisses the *automatic* action, not the offer.
 * - **`isVisible`** — ⚠ **not** legacy's. See below.
 *
 * ## The tab has to be in front, and legacy does not check
 *
 * `setTimeout` keeps running in a background tab, so legacy will follow a space that was opened,
 * left in another window and never looked at again — while the setting's own sentence promises
 * "once you have **viewed** it for {{seconds}} seconds". Browsers throttle background timers rather
 * than stopping them, so the countdown finishes late instead of never. Pausing on
 * `document.hidden` is what makes the behaviour match the promise.
 */
export function shouldCountDown({
    isAuthenticated,
    autoFollow,
    isFollowed,
    skipped,
    isVisible,
}: {
    isAuthenticated: boolean
    autoFollow: boolean
    isFollowed: boolean
    skipped: boolean
    isVisible: boolean
}): boolean {
    return isAuthenticated && autoFollow && !isFollowed && !skipped && isVisible
}
