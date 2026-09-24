/**
 * `features/post` — a post as its own entity, for the four surfaces that draw one.
 *
 * The barrel is deliberately narrow. What a consumer needs is the **type**, the **schema helpers**
 * that turn a list payload into rows, the **derivations** that decide what a card shows, and the
 * card itself. The model and its query keys are exported because the detail page will own a hook
 * over them; nothing else inside is public.
 *
 * **The dialogs and the menu are not exported**, on purpose. `PostMenu`, `PostReportDialog`,
 * `PostUnlockDialogs`, `PostNsfwGuard` and `PostMediaLightbox` are parts of the card, and a
 * consumer that could mount one of them separately could mount it *without* the state that drives
 * it — `PostUnlockDialogs` with no flow is a dialog that never opens, `PostMenu` with its own
 * `usePostActions` is a second optimistic pin state disagreeing with the header's. The same
 * reasoning `features/auth` gives for exporting `TwoStepVerificationDialog` as a component and
 * never its model.
 *
 * `shared/` may not import this, and neither may `features/channel` — the dependency runs
 * channel → post. Anything both need lives under `shared/lib/` already.
 */

export {
    INSUFFICIENT_STARS_CODE,
    type InteractionProduct,
    postApi,
    postKeys,
    REPLIES_PAGE_SIZE,
} from './api/post-api'
export { postReportApi, postReportKeys } from './api/post-report-api'
export {
    normalizePost,
    normalizePosts,
    type Post,
    type PostAuthor,
    type PostImage,
    type PostVideo,
    type QuotedPost,
    type UnlockDetail,
} from './api/types'
export type { PostMiniAppApp } from './components/post-attachments'
export { PostCard } from './components/post-card'
/**
 * The post composer, and the one boolean two shells and one renderer share.
 *
 * `PostComposerDialog` is exported because a **host** has to mount it — it needs `useMyChannel`,
 * which this feature may not read — and the store because the rail and the tab bar both open it.
 * The draft, the hook and the upload path stay internal.
 */
export { PostComposerDialog } from './components/post-composer-dialog'
/**
 * The post-detail **screen**, and nothing under it.
 *
 * The route composes this with a back bar and hands it the server-fetched body; the replies hook,
 * the detail hook and the reply row stay internal. Same rule the auth barrel states for its
 * settings screens: a consumer holding the pieces could assemble a version that skips the gates
 * the card applies, and the gates are the whole reason the card is reused here.
 */
export { PostDetailView } from './components/post-detail-view'
export type { PostActions } from './hooks/use-post-actions'
export { usePostActions } from './hooks/use-post-actions'
export { usePostBookmark } from './hooks/use-post-bookmark'
export { usePostReaction } from './hooks/use-post-reaction'
export type { PostUnlockFlow } from './hooks/use-post-unlock'
export { usePostUnlock } from './hooks/use-post-unlock'
export {
    canReply,
    hasReacted,
    isGated,
    isLocked,
    isNsfw,
    isPurchased,
    type PostDisplay,
    type PostGate,
    postActionVisibility,
    postDisplay,
    postGate,
    postMenuVisibility,
    replyCost,
    spaceTierBadge,
} from './lib/post-access'
export { formatPostTimestamp } from './lib/post-format'
export { type PostIntent, postIntent, postUnlockPrice } from './lib/post-intent'
export { postHref, postPath } from './lib/post-link'
export {
    detectAspectRatio,
    formatDuration,
    formatDurationPadded,
    GALLERY_HEIGHT,
    gallerySlideRatio,
    imageAspectRatio,
    lockCoverAspectRatio,
    lockedSummary,
    type PostMediaKind,
    postMediaKind,
    videoAspectRatio,
} from './lib/post-media'
/**
 * What a crawler and a link-preview scraper are told about a post.
 *
 * Pure, so it sits on the main barrel rather than on `./server.ts` — only the *fetch* is
 * server-only. `features/channel` splits the same way.
 */
export {
    buildPostDescription,
    buildPostHeadline,
    buildPostTitle,
    isCanonicalPath,
    mayRenderForCrawler,
    type PostFetchStatus,
    postCanonicalPath,
    postSnippet,
    resolvePostFetchStatus,
} from './lib/post-seo'
/**
 * The shape the route hands down for the composer's avatar.
 *
 * From `lib/`, **never** re-exported through `components/reply-composer` — that file is a client
 * component, and routing a type through it from this barrel put it in the server graph and turned
 * the post route into a 404. `lib/reply-author.ts` carries the whole account.
 */
export type { ReplyComposerAuthor } from './lib/reply-author'
export { openPostComposer, usePostComposerStore } from './store/composer-store'
