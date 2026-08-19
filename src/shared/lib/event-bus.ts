import mitt, { type Emitter } from 'mitt'

/**
 * Small typed event bus for IMPERATIVE cross-module UI signals only.
 *
 * Do NOT use this to sync server state — that is TanStack Query's job
 * (`queryClient.invalidateQueries` / optimistic mutations). Reserve the bus for
 * signals that don't fit the query model (scroll-to-top, replay-after-challenge…).
 *
 * Every event declared here is emitted by something. An event nobody fires is worse
 * than no event: it reads as a working integration point and silently is not one. Add
 * one when the thing that emits it exists, not in anticipation.
 */
export type AppEvents = {
    /** The Turnstile widget produced a token — the pending sign-in can be replayed. */
    'auth:turnstile-passed': undefined
    /** A real sign-in completed (not the anonymous session every visitor carries). */
    'auth:signed-in': { userId: string }
    /** The user signed themselves out. A session that *died* is `auth:session-expired`. */
    'auth:signed-out': undefined
    /**
     * The account being used was rejected — its refresh token is dead — and it has
     * been dropped. Not a sign-out and never a redirect: the app always keeps a
     * session, so `AuthProvider` cleans up after the old identity and establishes an
     * anonymous one in place. Screens that need a real account ask for one themselves
     * (`useRequireAuth` on the action that needs it), so nobody is thrown off the page
     * they were reading.
     *
     * `wasAnonymous` separates "a guest token aged out", which nobody needs to be told
     * about, from a real session ending, which needs saying out loud.
     *
     * Emitted by the axios 401 handler, consumed by `AuthProvider`.
     */
    'auth:session-expired': { wasAnonymous: boolean }
    /**
     * **Another tab** changed the token store (signed in or out, switched or
     * removed an account) and this tab has re-read it. Not emitted for this tab's
     * own writes — those already ran through whoever made them. Consumed by
     * `AuthProvider` to bring the rendered session back in line.
     */
    'auth:accounts-synced': undefined
    /**
     * The account's **Star balance moved by this much** — negative for a spend, positive for a top-up.
     *
     * ## Why this is on the bus and not in a provider's value
     *
     * It is not the balance. The balance is a query, and the socket frame it comes from is deliberately
     * thrown away by `BalanceProvider` (`features/realtime`'s barrel says why: a frame has no ordering
     * guarantee against the HTTP responses beside it, so trusting one can move a figure backwards).
     *
     * What is left over is the **size of the change**, and that is the one thing a refetch genuinely
     * cannot tell you — by the time the new figure arrives the old one is gone. It is also purely
     * presentational: a `-120 ★` that floats up the Star pill and is never read again. A signal that
     * fits no query, consumed for a flash — which is what this bus is for.
     *
     * Putting it in `BalanceValue` instead would mean a piece of state whose whole life is one
     * animation, plus a timer to clear it, plus a decision about what a remount should replay. On the
     * bus it has no life at all: it is delivered, drawn, and gone.
     *
     * ## Not a source of truth, and not a running total
     *
     * A listener must not accumulate these into a balance. Frames can be missed (the socket is only
     * open while the tab is), so the sum of the deltas is not the balance and never was. The figure
     * comes from `useBalance()`.
     *
     * Emitted by `BalanceProvider`'s `balance_change` handler; consumed by `StarChangeFlash`.
     */
    'balance:star-changed': { delta: number }
}

export const eventBus: Emitter<AppEvents> = mitt<AppEvents>()
