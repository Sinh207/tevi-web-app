/**
 * The realtime feature — **CLAUDE.md's third primitive, and nothing more.**
 *
 * It owns one websocket (the *user room*: this account's balance and Premium state) and answers two
 * questions: when is it open, and who is listening.
 *
 * ```
 * RealtimeProvider        app/session-providers.tsx, inside Auth and above Balance / MyChannel
 * useSocketEvent(name, h) subscribe for the life of a component
 * ```
 *
 * ## A socket event is a signal, never a source
 *
 * This is the rule that keeps the third primitive from quietly becoming the first. `balance_change`
 * arrives carrying balances; `premium_info` arrives carrying a Premium state. **Do not write either
 * into the cache.** Invalidate the query that owns that data and let it refetch.
 *
 * The reason is not tidiness. A payload is one server's view at one instant, delivered over a channel
 * with no ordering guarantee relative to the HTTP responses in flight beside it — so writing it can
 * move the cache *backwards*, and a figure that goes down and then up again is worse than one that is
 * a second late. `features/balance`'s barrel states the same rule for the same event, and it predates
 * this feature.
 *
 * The exception, if one ever appears, is a payload used for **presentation only** — the Star spend
 * animation needs the size of a change, which is not something a refetch can tell you. Read it for
 * that, and still invalidate for the truth.
 *
 * ## Real accounts only
 *
 * Every visitor carries an anonymous session, so the gate is not a detail: without it the app would
 * hold a websocket open for every guest to be told nothing. `RealtimeProvider` has the reasoning.
 *
 * ## Deliberately not exported
 *
 * The transport (`shared/lib/socket/`). Nothing outside this feature should connect, disconnect or
 * name the wire — a second caller of `connectUserRoom` is a second lifecycle, and they will disagree.
 * The connection status is not exported either: no screen shows it, and an unread status indicator is
 * an integration point that is not one.
 */

export { useSocketEvent } from './hooks/use-socket-event'
export { RealtimeProvider } from './providers/realtime-provider'
