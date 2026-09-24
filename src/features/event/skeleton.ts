/**
 * The **skeleton door** — what the event route's `loading.tsx` may import, and nothing else.
 *
 * ⚠ Import from `@features/event/skeleton`, never from `@features/event`. Through the main barrel a
 * loading boundary becomes its own client entry chunk and this app's strict CSP refuses to load it:
 * the skeleton then never paints, with a console line as the only symptom. `features/channel`,
 * `features/star-transfer` and `features/analytics` all carry the same door — read any of their
 * notes for the post-mortem.
 *
 * So: no hooks, no providers, no components that reach back into the feature. `EventSkeleton` is a
 * server component built out of tokens and `Skeleton`, which is what makes that possible.
 *
 * Both layout constants, because this page is the **multi-block** branch of
 * `docs/DESIGN_SYSTEM.md` §6: `loading.tsx` has to paint the same full-bleed surface below `md` that
 * the screen does, or the plane changes colour the moment the view hydrates.
 */
export { EventReportSkeleton } from './components/event-report-skeleton'
export { EventSkeleton } from './components/event-skeleton'
export { EVENT_CONTAINER, EVENT_LIST_CONTAINER, EVENT_SCREEN } from './lib/container'
