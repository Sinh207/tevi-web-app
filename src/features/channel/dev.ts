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
/**
 * `/invitation/verify`'s five presentational blocks, for `/dev/mcn-invitation`.
 *
 * The screen is **unreachable without a network emailing you a token**, which is the strongest case
 * for a harness in this feature — stronger than `/dev/blocked-accounts`, where you can at least block
 * a stranger. Three of the five hold something that cannot be seen any other way: the hero's frosted
 * strip is pinned to `.theme-light` over fixed-colour art (the only surface in the app doing that),
 * the rates block withholds *both* figures when the rate is unreadable, and the footer's countdown
 * cannot be watched at `00:59:12` without waiting 71 hours.
 *
 * **`McnInvitationView` itself is deliberately not here.** It owns a query, and
 * `/dev/blocked-accounts` already wrote down why that matters: *"a version of it that did not would
 * be a second implementation of the screen with its own drift."* The states the view adds — the two
 * walls and the skeleton — are `ChannelEmptyState` and `McnInvitationSkeleton`, both already
 * exported, and both reachable by signing out or throttling the network.
 *
 * They carry the `McnInvitation` prefix because this feature now holds **two** invitation screens
 * (the manager one is `McnUserInvitationView`), so a bare `InvitationHero` on a shared barrel would
 * be ambiguous the day that screen grows blocks of its own.
 */
export {
    McnInvitationFooter,
    McnInvitationHero,
    McnInvitationLetter,
    McnInvitationNetworkChip,
    McnInvitationRates,
} from './components/mcn-invitation-view'
/**
 * `/mcn-user-invitation/verify`'s four presentational blocks, for `/dev/mcn-user-invitation`.
 *
 * The **manager** invitation, and unreachable for the same reason its sibling above is — a network
 * has to email you a token — with one difference that makes the harness the only way to check it:
 * this screen's tinted strip is the **inverse** case of the creator hero's. That one pins itself to
 * `.theme-light` because its ground is fixed-colour art; this one's ground is a token pair that
 * *does* flip (`--accents-success-bg-active`, `dark:…-bg-focus`) under semantic ink, so the thing to
 * verify is that it follows the theme — which needs both themes looked at, on a screen no URL
 * reaches.
 *
 * There is **no countdown block** here, and that absence is deliberate rather than missing: legacy
 * states the 72 hours as a flat sentence, so nothing on this screen reads the clock (B101).
 *
 * `McnUserInvitationView` is deliberately not here, for the reason its sibling's note gives: it owns
 * a query, and a version that did not would be a second implementation of the screen with its own
 * drift.
 */
export {
    McnUserInvitationFooter,
    McnUserInvitationLetter,
    McnUserInvitationSenderStrip,
    McnUserInvitationSupportLink,
} from './components/mcn-user-invitation-view'
export { LIVE_EVENTS_ART, MCN_INVITATION_ART } from './lib/illustrations'
