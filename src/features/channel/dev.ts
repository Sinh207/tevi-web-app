/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * `index.ts` is the feature's real surface and stays small on purpose — four things `app/` actually
 * composes. But the states worth previewing are the ones no URL can reach: every screen behind an
 * owner session, or behind a fetch that has to fail. Those are internals by definition, and routing
 * them through the public barrel would widen it permanently for a page that 404s in production.
 *
 * So: a second, explicitly-scoped barrel. Anything here is fair game for `app/dev/**` and off-limits
 * everywhere else — the name is the enforcement, which is weak, but the alternative is either a
 * public barrel full of preview-only exports or `/dev` pages reaching past the boundary by path.
 */
export type { ChannelEvent } from './api/events-api'
export { ChannelEmptyState } from './components/channel-empty-state'
export { ChannelError } from './components/channel-error'
export { ChannelEventCard } from './components/channel-event-card'
export { ChannelLiveTab } from './components/channel-live-tab'
export { CreateChannelGate } from './components/create-channel-gate'
export { LIVE_EVENTS_ART } from './lib/illustrations'
