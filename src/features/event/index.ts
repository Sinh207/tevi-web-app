/**
 * The event feature — **one live broadcast, as a page.**
 *
 * ```
 * access.ts    is it gated, how does it say so, may the website play it   ← import-free, shared
 * routes.ts    /@{slug}/event/{code}                                       ← import-free
 * server.ts    the RSC read + the metadata builders                        ← server-only
 * skeleton.ts  what a loading.tsx may take
 * api/         v4/public/events/{code}/ · billy v1/ecom/purchase/
 * lib/         the status vocabulary, the watch-state gate, the formatters
 * hooks/       the query, the unlock flow, the age gate
 * components/  <EventScreen/>
 * ```
 *
 * ## What it owns
 *
 * The **viewer's** side of one event, addressed by its code: the details card, the host, the
 * description, the access gate, and the hand-off to wherever it can actually be watched. Plus the
 * one write that belongs to it — spending Star to unlock a paid broadcast.
 *
 * Both **pages behind this URL** are here: the viewer's, and the host's revenue report — live and
 * interactive revenue, the maintenance fee, peak CCU, new members, and the per-order lists.
 * `useEventOwnership` decides which, and `docs/EVENT.md` §1 has the two layouts.
 *
 * **The live room lives here too** — the studio (`EventStudioScreen`), its player, seats, chat,
 * gifts, the sustained fee, the preview, and the refusals only the room can raise (kicked out,
 * banned from the channel). This header used to list all of it as not owned and not built;
 * `docs/EVENT.md` §6 is the current map and its *Open items* what is still missing.
 *
 * ## What it does not own
 *
 * - **The creator's event list.** `v4/events/` answers for the bearer and takes no slug, so it is a
 *   *space owner's* view of their own broadcasts and it lives with the space —
 *   `features/channel`'s Live tab, `useChannelEvents`, `ChannelEventCard`.
 * - **Money.** `features/balance` owns the figure and the affordability rule, `features/payment`
 *   owns taking a card, `features/membership` owns selling a tier. This feature composes all three
 *   and writes none of them.
 *
 * ## Four barrels, and two of them are hard constraints rather than preferences
 *
 * `access.ts` is the sharp one. `features/channel` has three surfaces that draw a stream's access
 * badge — the Live tab card, the Live-now strip, the Following row — and the rule they share used to
 * live over there because the event page did not exist. Two copies of a predicate that decides
 * whether somebody is asked for money is the failure the move prevents, and the *reason* it is a
 * root module importing nothing is that `features/channel` must be able to read it without pulling
 * this barrel — which drags in `@features/membership`, `@features/balance` and
 * `@features/share`, and would close a cycle the day the event page needs anything of the channel's.
 *
 * `routes.ts` is the same argument for a string. See CLAUDE.md's four-barrel note.
 *
 * ## Deliberately **not** exported
 *
 * `eventApi`, `unlockApi`, `eventKeys`, `useEvent`, `useUnlockEvent`, `useAgeGate`, and everything
 * in `lib/`.
 *
 * The models because a component calling axios is what CLAUDE.md forbids and exporting one is the
 * invitation — the same line `features/balance` and `features/membership` draw. The hooks for a
 * narrower reason: `useUnlockEvent` without the confirmation around it is a charge with no
 * confirmation, and `useEvent` without `EventScreen`'s three-state branch is a page that renders
 * "not found" during an outage. `EventScreen` is the entry point; `access.ts` is the only piece
 * meant to be read from outside.
 */

/**
 * The report DTOs, exported for their **types only** — a caller that renders one of these figures
 * elsewhere (a future creator dashboard) needs the shape, and `eventReportApi` deliberately stays
 * inside. See the note at the foot of this file.
 */
export type { EventBill, EventOrder, EventSummary } from './api/report-types'
export type { EventChannel, EventDetail, EventStatus } from './api/types'
export { EventReportScreen } from './components/event-report-screen'
export { EventScreen } from './components/event-screen'
export { EventNotFoundState } from './components/event-state-screens'
/**
 * The event's own **not-found wall** and its **bar**, for `[code]/not-found.tsx`.
 *
 * That boundary is a route file and composes the page around the wall — the same bar, the same
 * column and the same block the screens render on the client path. One screen for "no such event",
 * whichever half of the app discovers it. Without the boundary, `notFound()` walked up to
 * `[slug]/not-found.tsx` and told the reader the *space* was missing.
 */
export { EventTopBar } from './components/event-top-bar'
export { EVENT_CONTAINER, EVENT_LIST_CONTAINER, EVENT_PANEL, EVENT_SCREEN } from './lib/container'
export { formatDuration } from './lib/event-analytics'
/**
 * The money and duration formatters, and the bill arithmetic.
 *
 * Exported because the figures on this report are the *only* place in the app that reads an event
 * bill, and the day a creator dashboard shows "revenue from your last live" it must show the same
 * number — `billTotal`'s doc records what legacy's four-branch ternary does to a payload with one
 * unparseable side (`NaN`, printed).
 */
export { billTotal, formatRevenue } from './lib/event-revenue'
/** Both addresses. Re-exported for the screens; `@features/event/routes` is the import-free door. */
export { eventPath, eventReportPath } from './routes'
