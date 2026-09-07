/**
 * Should entering a space open its mini app by itself?
 *
 * A pure decision with its own test, because the interesting case is one **legacy gets wrong** and
 * it is invisible until you walk from one mini-app space to another.
 *
 * Legacy guards its auto-open with a boolean ref plus a second effect that resets it when the
 * channel id changes (`containers/channel/.../content/index.js`). React runs effects in declaration
 * order, so on a navigation from space A to space B both run in the same commit and in that order:
 * the open effect sees the ref still `true` from A and returns early, *then* the reset sets it
 * `false` — and nothing re-triggers the open. **B never opens.** The app appears on the first
 * mini-app space of a session and on no other, which reads as flakiness rather than as a rule.
 *
 * The fix is to remember *which* app was opened rather than *that* one was. Then there is one
 * effect, no ordering to get wrong, and the answer is derivable at any moment.
 */

export type AutoOpenDecision = 'open' | 'skip'

export function autoOpenDecision({
    key,
    isAuthenticated,
    alreadyOpenedFor,
}: {
    /**
     * The app's identity — `miniAppDedupKey` of its URL — or `null` when the space has no usable
     * mini app, which is nearly every space.
     */
    key: string | null
    /**
     * A real account, not the anonymous session every visitor carries.
     *
     * **The reason this is a condition and not a gate.** Everywhere else in the app a mini app is
     * opened through `useMiniApp().open`, which composes `useRequireAuth` and raises the sign-in
     * dialog for a guest — right for a press, wrong for a page load: nobody navigates to a space
     * and asks to be shown a login dialog. So a guest is *skipped*, and the space's Open button is
     * still there to ask properly. Legacy gates on the same flag for the same reason.
     */
    isAuthenticated: boolean
    /** The app this surface has already auto-opened, if any. */
    alreadyOpenedFor: string | null
}): AutoOpenDecision {
    if (!key) return 'skip'
    if (!isAuthenticated) return 'skip'
    /*
     * Already done for this app. Which also answers the case nobody thinks of: the reader **closed**
     * the player and is still on the space. Reopening it there would make the space impossible to
     * read, and the close button impossible to mean anything.
     */
    if (alreadyOpenedFor === key) return 'skip'
    return 'open'
}
