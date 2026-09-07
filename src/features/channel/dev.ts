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
export { channelEventSchema } from './api/events-api'
export type { Channel } from './api/types'
export { normalizeChannel } from './api/types'
/**
 * The follow prompt. Its **countdown** cannot be previewed here — that needs a signed-in account
 * with `auto_follow` on, which a harness cannot fake without mocking the auth provider — so this
 * export is for the layout, the theme and the direction. The clock itself is pinned by
 * `hooks/use-auto-follow.test.tsx`, where fake timers can state things a browser cannot.
 */
export { ChannelAutoFollow } from './components/channel-auto-follow'
export { ChannelEmptyState } from './components/channel-empty-state'
export { ChannelError } from './components/channel-error'
export { ChannelEventCard } from './components/channel-event-card'
export { ChannelHeader } from './components/channel-header'
/**
 * The filter, on its own. `ChannelLiveTab` renders one too, but only in whatever state its own
 * `useState` is in — and the state worth looking at is **applied**, where the trigger has to keep
 * its fill through hover and through the panel being open. Three specificity fights that a
 * screenshot settles and reading cannot.
 */
export { ChannelLiveFilter } from './components/channel-live-filter'
export { ChannelLiveTab } from './components/channel-live-tab'
export { ChannelNsfwGate } from './components/channel-nsfw-gate'
export { CreateChannelGate } from './components/create-channel-gate'
export { LIVE_EVENTS_ART } from './lib/illustrations'
