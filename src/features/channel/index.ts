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
 */

export { channelKeys } from './api/channel-api'
export type {
    BlockedAccount,
    BlockedUser,
    Channel,
    ChannelBadge,
    ChannelCategory,
    ChannelPrivacy,
    ChannelSocialLink,
    ChannelStats,
    ChannelThread,
    Paginated,
} from './api/types'
/**
 * Exported for `/dev/blocked-accounts` — the list, its exit animation and its loading shape
 * are otherwise unreachable without a signed-in account that has actually blocked someone.
 * Same reason `features/identification` exports `IdentityOutcome`.
 */
export { BlockedAccountRow } from './components/blocked-account-row'
export { BlockedAccountsSkeleton } from './components/blocked-accounts-skeleton'
export { BlockedAccountsView } from './components/blocked-accounts-view'
export { ChannelEmptyState } from './components/channel-empty-state'
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
export { MySpaceRedirect } from './components/my-space-redirect'
/**
 * Exported for `/dev/space-visibility` — the card's selected, saving and locked states need a
 * signed-in account with a space *and* an in-flight write to reach, and the last of those lasts
 * about 200ms. Same reason as `BlockedAccountRow` above.
 */
export { SpaceVisibilityOption } from './components/space-visibility-option'
export { SpaceVisibilityView } from './components/space-visibility-view'
export type { ChannelOwnership, ChannelVisibility } from './lib/channel-flags'
export {
    buildChannelDescription,
    buildChannelTitle,
    channelProfileJsonLd,
    isIndexableChannel,
    serializeJsonLd,
} from './lib/channel-seo'
export { canonicalChannelRedirect, parseChannelSlug, toChannelPath } from './lib/channel-slug'
export { CHANNEL_SETTINGS_CONTAINER } from './lib/container'
export { BLOCKED_ACCOUNTS_ART } from './lib/illustrations'
/**
 * The routes the account drawer's "Space visibility" and "Blocked accounts" rows point at.
 *
 * Exported as constants rather than typed into the drawer, because two features have to
 * agree on them: `features/navigation` links here and `features/channel` owns the pages. A
 * literal in the drawer is the version that keeps working after a page moves and stops
 * working silently.
 */
export { BLOCKED_ACCOUNTS_PATH, CUSTOM_PROFILE_PATH, SPACE_VISIBILITY_PATH } from './lib/routes'
export { SPACE_VISIBILITY_OPTIONS } from './lib/space-visibility'
export { MyChannelProvider, useMyChannel } from './providers/my-channel-provider'

/**
 * Deliberately **not** exported, so `app/` cannot reach past the feature's own composition:
 * `channelApi`, `channelStatsApi`, `useChannel`, `useChannelStats`, `useChannelOwnership`,
 * `channelVisibility`, `paramsFromNextUrl`, and every formatting helper. A component calling
 * `channelApi` directly is exactly what CLAUDE.md's "never call axios from components" forbids,
 * and exporting it is the invitation.
 */
