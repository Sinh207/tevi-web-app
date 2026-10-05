/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * `index.ts` is the feature's real surface and stays small on purpose — one screen and two layout
 * constants. But almost every state on the event page is one **no URL can reach**: a paid stream
 * needs a paid stream to exist, a members-only one needs a tier, the age gate needs a creator to
 * have flagged a broadcast, and the off-air trio needs a stream that has already happened. Six of
 * them are also mutually exclusive, so no single real event can show more than one.
 *
 * Those are internals by definition, and routing them through the public barrel would widen it
 * permanently for a page that 404s in production.
 *
 * So: a second, explicitly-scoped barrel. Anything here is fair game for `app/dev/**` and off-limits
 * everywhere else — the name is the enforcement, which is weak, but the alternative is either a
 * public barrel full of preview-only exports or `/dev` pages reaching past the boundary by path.
 */

/**
 * **The gift surfaces**, and the harness is the only place two of them can be seen at all.
 *
 * The tray and the catalogue need a live broadcast whose creator has a gift catalogue *and* a
 * balance to spend from; the float banners need somebody else in that room to send something while
 * you are watching. Driving them from fixtures is the difference between looking at them and
 * hoping. `normalizeGiftPackages` is exported alongside so the harness parses its fixtures through
 * the same schema the wire goes through — a fixture that would not survive the parser is a state
 * nobody will ever see.
 */
export { normalizeGiftPackages } from './api/gift-types'
// ── The host's revenue report ───────────────────────────────────────────────────────────────────
/**
 * The report cards, each separately, plus the two dialogs and the fixtures' schema.
 *
 * Every one of these is behind an **owner session on an event that has already aired**, which is a
 * state no URL can reach and no test account can conjure — a bill needs somebody to have bought a
 * ticket. `/dev/event` drives them from parsed fixtures instead, which is the only way the *No data*
 * branches and the MCN-commission row have ever been seen at all.
 */
export {
    eventBillSchema,
    eventOrderSchema,
    eventSummarySchema,
    normalizeBill,
} from './api/report-types'
export { eventDetailSchema, normalizeEvent } from './api/types'
export { EventAgeGate } from './components/event-age-gate'
export {
    EventLiveAnalyticsCard,
    EventMaintenanceFeeCard,
    EventNewMembersCard,
    EventTotalRevenueCard,
} from './components/event-analytics-cards'
export { EventCardState } from './components/event-card-state'
export { EventDescriptionCard } from './components/event-description-card'
export { EventDetailsCard } from './components/event-details-card'
export { EventEndedRail } from './components/event-ended-rail'
export {
    EventExclusivePaywall,
    EventPreviewCountdown,
} from './components/event-exclusive-overlay'
export { EventGiftFloat } from './components/event-gift-float'
export { EventGiftPanel } from './components/event-gift-panel'
export { EventGiftTray } from './components/event-gift-tray'
export { EventHostCard } from './components/event-host-card'
export { EventHostInfoCard } from './components/event-host-info-card'
export {
    EventInfoDialog,
    MAINTENANCE_FEE_INFO,
    SUSTAINED_VIEWERS_INFO,
} from './components/event-info-dialog'
export { EventInvitationDialog } from './components/event-invitation-dialog'
export { EventMobileLiveNotice } from './components/event-mobile-live-notice'
export { EventNotEnoughStarsDialog } from './components/event-not-enough-stars-dialog'
export { EventOrderRow } from './components/event-order-row'
/**
 * The report's list, against the **real** endpoint. It needs an owner session to answer, so in the
 * harness it lands on its own empty state — which is worth seeing. Intercept
 * `v1/ecom/event-orders/` to drive it with rows.
 */
export { EventOrdersPanel } from './components/event-orders-panel'
export { EventOutOfStarDialog } from './components/event-out-of-star-dialog'
export { EventPremiumNudge } from './components/event-premium-nudge'
export { EventReportCard } from './components/event-report-card'
export { EventRevenueAccordion, RevenueRow } from './components/event-revenue-accordion'
export { EventRevenueSummary } from './components/event-revenue-summary'
export { EventSeatCard } from './components/event-seat-card'
export { EventSkeleton } from './components/event-skeleton'
export {
    EventBannedState,
    EventErrorState,
    EventNotFoundState,
} from './components/event-state-screens'
/**
 * **Live studio**, the viewer's second screen.
 *
 * The harness is the only place its refusal states can be seen side by side: on the real page the
 * stage is `fixed inset-0`, so exactly one of them is on screen at a time and each needs a payload
 * *and* a viewport over 900px to reach. `/dev/event` contains it in a `transform`ed wrapper — see
 * the note there — which is what lets all three be inspected in one scroll.
 */
/**
 * The chat column, and it is the piece the harness matters most for.
 *
 * Eight states, and seeing them on the real page needs a broadcast that is **live right now**
 * plus a host willing to pin a message, mute somebody and receive a gift while you watch. The
 * one live verification this port got ended mid-audit and took the only way of looking at them
 * with it.
 */
export { EventStudioChat, EventStudioChatStrip } from './components/event-studio-chat'
export { EventStudioCompact } from './components/event-studio-compact'
export { EventStudioScreen } from './components/event-studio-screen'
/**
 * The seat grid, and the table behind it.
 *
 * The harness is the **only** way to see the eighteen arrangements: on a real page the layout code
 * comes from a room that has to actually exist with that many co-hosts on camera, so `L8` has
 * probably never been looked at. Rendered with placeholder publishers and no SDK, which is enough
 * — what is being checked is the geometry and the seat chrome, not the video.
 */
export { EventStudioSeats } from './components/event-studio-seats'
/** The studio before anything has arrived — `/dev/event` frames it in a box. */
export { EventStudioSkeleton } from './components/event-studio-skeleton'
export { EventTopBar } from './components/event-top-bar'
/**
 * The watch panel, which is the whole point of the harness: it renders one of six states and
 * `lib/watch-state.ts` picks which from the payload, so driving it is a matter of handing it six
 * fixtures rather than mocking anything.
 */
export {
    EventAccountBannedPanel,
    EventBlockedPanel,
    EventGeoRestrictedPanel,
    EventKickedOutPanel,
    EventWatchPanel,
} from './components/event-watch-panel'
/** The block a single-panel screen becomes from `md` — so the harness frames the list as `/report` does. */
export { EVENT_CARD, EVENT_PANEL } from './lib/container'
export { billTotal, interactiveBill, liveBill } from './lib/event-revenue'
export { mergeGiftBurst } from './lib/gift-burst'
export { SEAT_LAYOUT_CODES, seatArrangement, seatBoxAspect, seatBoxStyle } from './lib/seat-layout'
export { isStudioEligible } from './lib/studio'
export { watchState } from './lib/watch-state'
