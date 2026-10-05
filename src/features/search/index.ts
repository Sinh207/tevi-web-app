/**
 * The search feature — `/search`, the one screen for finding a creator's space.
 *
 * Nothing outside this feature imports `api/`, `components/`, `hooks/` or `lib/` directly.
 *
 * One barrel, unlike `features/channel`'s two: nothing here touches `server-only`. Global search
 * is a **client** screen by construction — there is no SSR bearer in this app
 * (`shared/lib/api/token.ts`), and the Following grid is per-account — so there is no server
 * model to keep out of a client bundle.
 */

export type { SearchChannel } from './api/types'
/**
 * "Which creator?" — everything below `/gift-star`'s back bar, and the *Gift Star* row on `/my-star`
 * is what links there.
 *
 * A real export rather than a `/dev/*` one: the question is this feature's, and what the answer is for
 * is the route's. See the component for why it is here and not in `features/my-star`, and for why it
 * is a page rather than the dialog it started as.
 */
export { CreatorPickerView } from './components/creator-picker-view'
/**
 * Exported for `/dev/search` — the results list, the Following grid and the loading shape are
 * otherwise reachable only with a live search service and a signed-in account that follows
 * somebody whose name matches what you type. Same reason `features/channel` exports
 * `BlockedAccountRow` and `FollowRequestRow`.
 */
export { SearchChannelRow } from './components/search-channel-row'
export { SearchFollowingStrip } from './components/search-following-strip'
export { SearchRecentsList } from './components/search-recents-list'
export { SearchFollowingSkeleton, SearchSkeleton } from './components/search-skeleton'
export { SearchView } from './components/search-view'
export { SEARCH_CONTAINER, SEARCH_SCREEN } from './lib/container'
/** Exported for `/dev/search`, so the no-results state can be seen with its art in place. */
export { SEARCH_ART } from './lib/illustrations'
/**
 * The URL the left rail and the mobile top bar point at. A constant rather than a literal in
 * `features/navigation`, because two features have to agree on it — see `lib/routes.ts`.
 */
export { SEARCH_PATH } from './lib/routes'

/**
 * Deliberately **not** exported, so `app/` cannot reach past the feature's own composition:
 * `searchApi`, `searchKeys`, `useChannelSearch`, `useSearchRecents`, `searchChannelSchema` and the
 * paging constants. A component calling `searchApi` directly is exactly what CLAUDE.md's "never
 * call axios from components" forbids, and exporting it is the invitation.
 */
