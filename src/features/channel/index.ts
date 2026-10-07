/**
 * The channel ("space") feature — client-safe surface.
 *
 * Nothing outside this feature imports `api/`, `components/`, `hooks/` or `lib/` directly.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `api/channel-server-api.ts` imports `shared/lib/api/server-client.ts`, which imports
 * `'server-only'`. If that reached this file, **any client component importing the feature would
 * fail the build** with an error that names the marker package and not the real cause. So the
 * server surface lives in `./server` and this file must never re-export from it.
 *
 * This is the repo's first `createServerApiModel` usage, so nothing had hit that wall before.
 *
 * ## What lives in here, and the test for it
 *
 * Three account-scoped list screens sit beside the channel page itself — `/following`,
 * `/follow-requests`, `/settings/blocked-accounts`. They are here rather than in features of their
 * own for one reason, and it is not size:
 *
 * > **If a third feature would also need it, it does not belong to the second one.**
 *
 * Nothing but `/following` needs the follow list, and the rows *are* channels: the endpoints are
 * under `v3/channel/`, every action is `channels/{slug}/follow|unfollow|pin|unpin`, and the gating
 * rules (`liveAccess`) are shared with the channel page's own live card — one edit fixed both the
 * day that rule changed. Splitting `/following` out would mean widening this barrel by **nine**
 * symbols that are deliberately private, `channelApi` among them, which the note at the foot of this
 * file argues against in writing. That is paying with the boundary to buy a directory.
 *
 * **`features/post` was the opposite case and has landed.** A post is its own entity, four surfaces
 * will render one (channel, home, search, notifications), and the dependency runs *channel → post*,
 * not the other way — modelling it here would make home and search reach through this feature to
 * draw a post card. The `ChannelThread` stub and its placeholder card are gone; `getThreads` parses
 * its rows with `normalizePosts` and `ChannelThreadList` renders `PostCard`.
 *
 * The prediction in the paragraph above came true as well: **`features/home`** is the second surface
 * that needed this cluster. What it took was two symbols (`useFollowedLives`, `FollowingLiveRow`),
 * not the nine-symbol widening this note argues against — see their export below.
 *
 * **When to revisit this one:** the day a second surface needs the follow list — a home feed filtered
 * to followed spaces is the likely one. The seam then is the whole cluster (following +
 * follow-requests + blocked accounts), not `/following` alone: those three are the same shape of
 * screen and share the same paging and cache-surgery helpers, so splitting one of them is dividing by
 * screen instead of by domain.
 */

export { channelKeys } from './api/channel-api'
export type { ChannelEvent } from './api/events-api'
export type {
    BlockedAccount,
    Channel,
    ChannelBadge,
    ChannelCategory,
    ChannelPrivacy,
    ChannelSocialLink,
    ChannelStats,
    FollowedChannel,
    FollowedLive,
    FollowedOrdering,
    FollowRequest,
    ListUser,
    MessagingSender,
    Paginated,
} from './api/types'
/**
 * The two orderings `/following` offers, as their wire values.
 *
 * Exported for `/dev/following`, which previews the ordering control — the real one is only drawn
 * over a non-empty follow list, so it is unreachable without an account that follows somebody. The
 * constant rather than the labels: the labels are translation keys and belong to the view.
 */
export { FOLLOWED_ORDERINGS } from './api/types'
/**
 * Exported for `/dev/blocked-accounts` — the list, its exit animation and its loading shape
 * are otherwise unreachable without a signed-in account that has actually blocked someone.
 * Same reason `features/identification` exports `IdentityOutcome`.
 */
/**
 * The instruction screen behind `/@ada?startapp&addToHomeScreen`, rendered by
 * `app/add-home-screen/[slug]` — a route outside `(web)` and therefore outside the shell, which is
 * why the screen is a component here rather than markup in the page.
 */
export { AddHomeScreenGuide } from './components/add-home-screen-guide'
export { BlockedAccountRow } from './components/blocked-account-row'
export { BlockedAccountsSkeleton } from './components/blocked-accounts-skeleton'
export { BlockedAccountsView } from './components/blocked-accounts-view'
/**
 * The follow prompt that acts after a dwell — exported for the Live studio and Live details, which
 * legacy mounts the same component into (`placement="stage"` for the studio's overlay).
 */
export { ChannelAutoFollow } from './components/channel-auto-follow'
export { ChannelEmptyState } from './components/channel-empty-state'
/** The LIVE flag, for a card outside this feature that shows a stream — the ended screen's rail. */
export { ChannelLiveBadge } from './components/channel-live-badge'
/**
 * The space's manifest link, which has to be put in `<head>` by hand — Next streams metadata into
 * the body and Chromium only reads a manifest that is a child of the head. The component's
 * docblock carries the measurement.
 */
export { ChannelManifestLink } from './components/channel-manifest-link'
/**
 * A protected space's wall for a **content** refusal (`422 CHN0009`) — exported for the live's
 * details, which is where a non-follower meets it. `protectedChannelOf` reads the space out of
 * the refusal; the wall sends the follow request with the space page's own actions.
 */
export { ChannelProtectedNotice } from './components/channel-protected-notice'
/**
 * The follower / member / post counts and the owner's `income_usd`, for a slug.
 *
 * Exported for **`features/monetization`**, whose hub is legacy's `useChannelStats(myChannel.slug)`
 * verbatim — the headline figure on `/monetization` is this endpoint's `income_usd` and nothing else.
 *
 * It sits above the "deliberately not exported" list below rather than in it, and the distinction is
 * the one that list is really about: what is withheld is `channelStatsApi`, so nobody calls axios
 * from a component. A sibling feature reaching for the **hook** gets the query key too, which is the
 * whole point — `/monetization` and a creator's own space then share one cache entry instead of
 * asking the same microservice twice under two keys, which is the disagreement the socket note in
 * `CLAUDE.md` warns about in the other direction.
 *
 * `app/` still may not use it: a page mounts a feature's view, and every view that needs these
 * numbers is inside one.
 */
/**
 * The space itself, its two viewer-relative mutations, and the report form — for
 * **`features/event`'s Live studio**, whose channel plate carries Follow and the ⋯ menu
 * (`event-studio-channel-actions.tsx`).
 *
 * Exported as hooks rather than as a ready-made bar because the studio composes them into a plate
 * this feature does not draw and should not know the geometry of: a 40px capsule floating on a
 * video, beside a balance and a back disc. What the rule at the foot of this file forbids is
 * exporting `channelApi` — a component reaching for the model — and these are the query and the
 * mutations that exist so it does not have to.
 *
 * `ChannelReportDialog` goes with them for the reason `CLAUDE.md` gives for the two-step
 * verification dialog: a report is nine reasons, a description and a *Report and Block* path, and a
 * consumer given only the endpoint would assemble a shabbier one.
 *
 * ⚠ `useChannel` is a **second request** on the studio, and that is the price of the event payload
 * not carrying `is_followed`. If it ever does, this export loses its only consumer.
 */
export { ChannelReportDialog } from './components/channel-report-dialog'
/**
 * Exported for the account drawer's profile card, which writes the signed-in account's own
 * name and has to put the same mark after it as the channel header does. The rule it encodes
 * (an image, or nothing at all) is the part that must not be re-derived per call site.
 */
export { ChannelVerifiedMark } from './components/channel-verified-mark'
export { ChannelSkeleton, ChannelView } from './components/channel-view'
export {
    EditProfileSkeleton,
    EditProfileView,
} from './components/edit-profile/edit-profile-view'
/**
 * Exported for `/dev/image-crop` — the cropper needs a signed-in account with a space *and* a
 * picked file to reach, which is why its own measuring bug (an empty grey frame, every time)
 * survived a review. Same reason as `BlockedAccountRow` and `SpaceVisibilityOption`.
 */
export { ImageCropDialog } from './components/edit-profile/image-crop-dialog'
/**
 * Exported for `/dev/follow-requests` — the queue needs a signed-in account with a *protected*
 * space that strangers have actually asked to follow, which is not a state a developer can
 * arrange. Same reason as `BlockedAccountRow` above.
 */
export { FollowRequestRow } from './components/follow-request-row'
export { FollowRequestsSkeleton } from './components/follow-requests-skeleton'
export { FollowRequestsView } from './components/follow-requests-view'
/**
 * Exported for `/dev/following` — the row's pinned, muted and exiting states, the Live now strip
 * and the two loading shapes all need a signed-in account that actually follows somebody (and, for
 * the strip, somebody who is live right now), which is not a state a developer can arrange. Same
 * reason as `BlockedAccountRow` and `FollowRequestRow` above.
 */
/**
 * The home page's Lives card — `features/home` draws the list, this feature owns what a stream row
 * says about access and where it links, exactly as it does for `FollowingLiveRow`.
 */
export { FollowedLiveCard, FollowedLiveTile } from './components/followed-live-card'
export { FollowingChannelRow } from './components/following-channel-row'
export { FollowingLimitNotice } from './components/following-limit-notice'
export { FollowingLiveRow } from './components/following-live-row'
export { FollowingSkeleton } from './components/following-skeleton'
export { FollowingView } from './components/following-view'
/**
 * `/invitation/verify`'s screen. The skeleton is deliberately **not** here — a `loading.tsx` takes
 * it from `./skeleton`, and that file says why.
 */
export { McnInvitationView } from './components/mcn-invitation-view'
export { McnPartnershipSkeleton } from './components/mcn-partnership-skeleton'
export { McnPartnershipView } from './components/mcn-partnership-view'
/**
 * `/mcn-user-invitation/verify`'s screen — the **manager** invitation, a different endpoint and a
 * different query parameter from `McnInvitationView` above. Its skeleton is deliberately **not**
 * here: a `loading.tsx` takes it from `./skeleton`, and that file says why.
 */
export { McnUserInvitationView } from './components/mcn-user-invitation-view'
export { MySpaceRedirect } from './components/my-space-redirect'
/**
 * Exported for `/dev/space-visibility` — the card's selected, saving and locked states need a
 * signed-in account with a space *and* an in-flight write to reach, and the last of those lasts
 * about 200ms. Same reason as `BlockedAccountRow` above.
 */
export { SpaceVisibilityOption } from './components/space-visibility-option'
export { SpaceVisibilityView } from './components/space-visibility-view'
/**
 * Exported for **`features/message`**, whose conversation is addressed by the other side's space
 * (`/@{slug}/messages`): it needs that space's owner id, its privacy and whether this account
 * follows it — and the follow wall's button is this feature's Follow, not a second copy of it.
 * Same cache, same key: following from the chat updates the space page and the other way round.
 *
 * `app/` still may not use either — for the reason the note at the foot of this file gives.
 */
export { useChannel } from './hooks/use-channel'
export { useChannelActions } from './hooks/use-channel-actions'
/**
 * The follower / member / post counts and the owner's `income_usd`, for a slug.
 *
 * Exported for **`features/monetization`**, whose hub is legacy's `useChannelStats(myChannel.slug)`
 * verbatim — the headline figure on `/monetization` is this endpoint's `income_usd` and nothing else.
 *
 * It sits above the "deliberately not exported" list below rather than in it, and the distinction is
 * the one that list is really about: what is withheld is `channelStatsApi`, so nobody calls axios
 * from a component. A sibling feature reaching for the **hook** gets the query key too, which is the
 * whole point — `/monetization` and a creator's own space then share one cache entry instead of
 * asking the same microservice twice under two keys, which is the disagreement the socket note in
 * `CLAUDE.md` warns about in the other direction.
 *
 * `app/` still may not use it: a page mounts a feature's view, and every view that needs these
 * numbers is inside one.
 */
export { useChannelStats } from './hooks/use-channel-stats'
/**
 * Shared with `features/navigation`, whose Privacy & security screen prints the number in a
 * sentence. One constant, because a duration that is prose in one place and behaviour in another is
 * the drift this codebase keeps paying for — see the note on the constant itself.
 */
/**
 * Shared with `features/navigation`, whose drawer paints the pending number on the Follow
 * requests row. The hook and not the query key, so the drawer cannot accidentally fetch the
 * *list* to count it — see the hook for why the badge has its own key and its own `enabled` gate.
 */
export { useFollowRequestsCount } from './hooks/use-follow-requests-count'
/** The reader's followed channels that are live now — `/following` and the studio's ended rail. */
/*
 * The home page's Lives tab is the second consumer of this pair, and it is the case the barrel note
 * above anticipates — "the day a second surface needs the follow list". What moved is **two
 * symbols**, not the nine-symbol widening that note argues against: the rows are `FollowedLive`,
 * this feature already fetches and renders them, and home re-implementing either half would be a
 * second copy of `followed-channels/lives/` and of a live card with its own access rules
 * (`liveAccess`) that changed once already and had to change in one place.
 *
 * `channelApi` itself stays private, which is the line that matters.
 */
export type { UseFollowedLivesResult } from './hooks/use-followed-lives'
export { useFollowedLives } from './hooks/use-followed-lives'
/**
 * Who may start a conversation with the reader — the write behind `features/message`'s settings
 * dialog. The field and the endpoint are this feature's; the dialog is that one's.
 */
export { useMessagingSettings } from './hooks/use-messaging-settings'
export { AUTO_FOLLOW_SECONDS } from './lib/auto-follow'
export type { ChannelOwnership, ChannelVisibility } from './lib/channel-flags'
export {
    buildChannelDescription,
    buildChannelTitle,
    channelProfileJsonLd,
    isIndexableChannel,
    serializeJsonLd,
} from './lib/channel-seo'
export { canonicalChannelRedirect, parseChannelSlug, toChannelPath } from './lib/channel-slug'
export {
    CHANNEL_SETTINGS_CONTAINER,
    MCN_PARTNERSHIP_CONTAINER,
    PROFILE_SCREEN,
} from './lib/container'
/**
 * Exported for `/dev/following`, which holds a plain array rather than an `InfiniteData` and would
 * otherwise re-implement the pin reorder — a preview that drifts from the screen it previews. The
 * rule itself is stated on `movePinnedFollowedChannel`.
 */
export { movePinnedRow } from './lib/following-page'
export {
    BLOCKED_ACCOUNTS_ART,
    /** The space-not-found wall's picture — read by `(rail)/[slug]/not-found.tsx`. */
    CHANNEL_NOT_FOUND_ART,
    FOLLOW_REQUESTS_ART,
    FOLLOWING_ART,
} from './lib/illustrations'
export { protectedChannelOf } from './lib/protected-channel'
/**
 * The routes the account drawer's "Space visibility", "Blocked accounts" and "Follow requests"
 * rows point at.
 *
 * Exported as constants rather than typed into the drawer, because two features have to
 * agree on them: `features/navigation` links here and `features/channel` owns the pages. A
 * literal in the drawer is the version that keeps working after a page moves and stops
 * working silently.
 */
export {
    BLOCKED_ACCOUNTS_PATH,
    CUSTOM_PROFILE_PATH,
    FOLLOW_REQUESTS_PATH,
    FOLLOWING_PATH,
    MCN_PARTNERSHIP_PATH,
    SPACE_VISIBILITY_PATH,
} from './lib/routes'
export { SPACE_VISIBILITY_OPTIONS } from './lib/space-visibility'
export { MyChannelProvider, useMyChannel } from './providers/my-channel-provider'

/**
 * Deliberately **not** exported, so `app/` cannot reach past the feature's own composition:
 * `channelApi`, `channelStatsApi`, `useChannelOwnership`,
 * `channelVisibility`, `paramsFromNextUrl`, and every formatting helper. A component calling
 * `channelApi` directly is exactly what CLAUDE.md's "never call axios from components" forbids,
 * and exporting it is the invitation.
 */
