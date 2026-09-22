/**
 * `features/home` — the signed-in landing page: the posts of the spaces you follow, and which of
 * them are on air.
 *
 * ## Why this is its own feature and not part of `features/channel`
 *
 * Its one endpoint (`v3/channel/followed-channels/threads/`) sits under `v3/channel/` beside three
 * that `features/channel` already owns, so the case for folding it in is real. What decided against
 * it is that **the rows are posts**: everything this module does after the request — grouping
 * consecutive posts by author within five minutes, collapsing a run of four into one card with a
 * *See more*, keeping a blocked space off the screen until the next refetch — is feed presentation,
 * and none of it is `features/channel`'s subject. `api/home-api.ts` weighs the trade in full.
 *
 * The **lives** half is the opposite case and is *not* duplicated: those rows are channels, so this
 * feature imports `useFollowedLives` and `FollowingLiveRow` rather than re-fetching and re-drawing
 * them. Legacy has two implementations of that list and had to fix its access rules in both.
 *
 * ## Dependencies run one way
 *
 * `home → post`, `home → channel`, `home → share`. Nothing imports `home`, which is what a leaf
 * surface should look like — and is why this barrel exports a **view**, not its parts. A consumer
 * that could mount `HomePostFeed` without `HomeView` would be mounting a panel whose tab row
 * decides whether it is fetched at all.
 */

export { FEED_PAGE_SIZE, homeApi, homeKeys } from './api/home-api'
export { HomeView } from './components/home-view'
export { useHomeFeed } from './hooks/use-home-feed'
export {
    COLLAPSE_ABOVE,
    GROUP_WINDOW_MS,
    groupKey,
    groupPosts,
    isCollapsible,
    type PostGroup,
    visibleCount,
    visiblePosts,
    withoutChannel,
} from './lib/post-groups'
