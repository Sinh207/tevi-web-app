'use client'

import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { usePostDetail } from '../hooks/use-post-detail'
import { usePostReplies } from '../hooks/use-post-replies'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { PostCard } from './post-card'
import { ReplyComposer } from './reply-composer'
import { ReplyRow } from './reply-row'

/**
 * `/@{slug}/post/{code}` — one post and its replies.
 *
 * ## The card is the same `PostCard` the feed draws, with its navigation switched off
 *
 * `postHref`'s `disabled` option exists for exactly this caller — legacy calls it
 * `disablePostDetail` and passes it from four places. Without it the post would be a link to the
 * page it is already on, and the whole-card click would push a duplicate history entry.
 *
 * Reusing the card rather than writing a detail-specific one is what keeps the paywall, the NSFW
 * guard, the menu and the four gates identical between a feed row and the page it opens. Legacy
 * has two implementations and its detail view is where the unlock flow drifted.
 *
 * ## Replies are `ReplyRow`, and they used to be `PostCard` — which was wrong, not merely dense
 *
 * The belief was that a reply carries a post's DTO. It does not: `api/reply-types.ts` has the
 * measured payload and the table of differences, the headline being that a reply's author is
 * `owner_channel` and a card reads `channel`, so **every reply rendered with no author**. Its
 * reaction button pointed at a post endpoint with a reply's id, and its menu offered a *Block* row
 * that had nothing to block. `ReplyRow` draws the fields that exist and calls the endpoints that
 * serve them.
 *
 * ## The composer sits **between** the post and its replies
 *
 * Legacy pins it to the bottom of the viewport. Here it is in the flow, directly under the post it
 * replies to and above the list it adds to, which is where the reader is already looking after
 * pressing *Comment* — and a fixed bar would have to negotiate with the mobile tab bar, the
 * keyboard's own inset and the mini-app player for the same strip of screen.
 *
 * When the reader may not reply it draws the *Who can reply?* panel in the box's place — legacy's
 * own substitution — and nothing at all when the payload names no reason for the refusal.
 *
 * ## The reader comes from the route, and has to
 *
 * Premium readers are exempt from paid interaction, and that fact lives in `features/channel`
 * (`useMyChannel().isPremium`) — which imports this feature, so neither this screen nor the card
 * below it may read it. The same goes for `author`, the reader's own space, which the composer
 * draws as an avatar and an identity line. The feed and the space page fill the Premium prop
 * themselves; here both are filled by `app/…/post/[code]/post-detail-screen.tsx`, a client boundary
 * that exists for exactly these two facts. Left unpassed, `isPremiumReader` defaults to `false` and
 * quotes a Premium reader a price they do not owe — so a new caller of this screen has to supply
 * it.
 */
export function PostDetailView({
    identifier,
    serverPost,
    author = null,
    isPremiumReader = false,
    testId = 'post-detail',
}: {
    /** The id or code from the URL — either addresses the same post. */
    identifier: string
    /** The anonymous body fetched during the render; see `usePostDetail` for why it is not cached. */
    serverPost: Post | null
    /** The reader's own space, for the composer's avatar and identity line. From the route too. */
    author?: ReplyComposerAuthor | null
    /** Premium readers are exempt from paid interaction. The route supplies it — see the note above. */
    isPremiumReader?: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const { post, isLoading, isError, refetch, isMissing } = usePostDetail(identifier, serverPost)

    const replies = usePostReplies(post && !post.deleted ? post.id : null)

    /** One sheet for the page, holding whichever post or reply raised it — the feed's arrangement. */
    const [sharing, setSharing] = useState<Post | null>(null)

    const keys = useMemo(() => replies.replies.map(reply => reply.id), [replies.replies])
    const { observe, heightFor } = useRenderWindow(keys)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: replies.hasNextPage && !replies.isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && replies.hasNextPage && !replies.isFetchingNextPage) {
            replies.fetchNextPage()
        }
    }, [sentinelInView, replies.hasNextPage, replies.isFetchingNextPage, replies.fetchNextPage])

    if (isLoading) return <DetailSkeleton />

    /*
     * Missing and failed are different sentences and must stay different. A post deleted since the
     * link was shared is an answer — `getPost` swallows the 404 to make it one — and telling that
     * reader to retry sends them round a loop that cannot succeed.
     */
    if (isMissing) {
        return (
            <DetailNotice
                icon="comment-slash"
                title={t('post_detail_missing_title')}
                body={t('post_detail_missing_body')}
                testId={testId}
            />
        )
    }

    if (isError || !post) {
        return (
            <DetailNotice
                icon="exclamation-circle"
                title={t('post_detail_error_title')}
                body={t('post_detail_error_body')}
                onRetry={() => refetch()}
                testId={testId}
            />
        )
    }

    return (
        /*
         * One rounded shell around the post, the composer and the replies — legacy's own geometry
         * (`borderRadius: { xs: '0 0 16px 16px', md: '16px' }`, `overflow: hidden`). The corners are
         * on the **stack**, not on each block, which is what makes the hairline gaps between them
         * read as one card rather than three: `overflow-hidden` is what clips the first and last
         * block's own square corners to the shell's.
         *
         * Below `md` only the bottom corners are rounded, because the stack runs to both edges of
         * the screen there — rounding the top would leave two notches under a sticky bar that is
         * flush with them.
         */
        <div
            data-testid={testId}
            /*
             * `flex-1`, so the stack takes the height the route's `<main>` has left it and the
             * replies block can fill it. The chain it completes starts at `(main)/layout.tsx`'s
             * `min-h-[var(--window-height)]`, runs through `TabBarShell` and `<main flex-1>`, and
             * ends here — a break anywhere in it and the block below collapses to its content.
             */
            className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-b-2xl md:rounded-2xl"
        >
            <div className="bg-(--background-surface)">
                <PostCard
                    post={post}
                    isPremiumReader={isPremiumReader}
                    disableDetail
                    onShare={() => setSharing(post)}
                    onChanged={() => refetch()}
                    testId={subTestId(testId, 'item')}
                />
            </div>

            <ReplyComposer
                post={post}
                author={author}
                isPremiumReader={isPremiumReader}
                /*
                 * Both, and neither is redundant: the list gains a row and the post's `reply_count`
                 * — drawn by the card above — goes up. The hook has already invalidated this
                 * feature's keys; these are the two queries whose *rendered* copies must not be
                 * left waiting for a stale time to expire.
                 */
                onReplied={() => {
                    void refetch()
                    void replies.refetch()
                }}
                testId={subTestId(testId, 'panel')}
            />

            <RepliesSection
                replies={replies}
                isPremiumReader={isPremiumReader}
                observe={observe}
                heightFor={heightFor}
                sentinelRef={sentinelRef}
                testId={testId}
            />

            {sharing && (
                <ShareDialog
                    open
                    onOpenChange={open => {
                        if (!open) setSharing(null)
                    }}
                    url={sharing.shareable_url ?? ''}
                    title={sharing.text}
                    image={sharing.cover_image?.uri ?? sharing.images?.[0]?.uri ?? null}
                    context={postShareContext(sharing, 'post-detail')}
                />
            )}
        </div>
    )
}

function RepliesSection({
    replies,
    isPremiumReader,
    observe,
    heightFor,
    sentinelRef,
    testId,
}: {
    replies: ReturnType<typeof usePostReplies>
    isPremiumReader: boolean
    observe: ReturnType<typeof useRenderWindow>['observe']
    heightFor: ReturnType<typeof useRenderWindow>['heightFor']
    sentinelRef: ReturnType<typeof useInView<HTMLDivElement>>[0]
    testId: string
}) {
    const { t } = useTranslation()

    return (
        <section
            data-testid={subTestId(testId, 'group')}
            /*
             * `grow`, so a post with few replies — or none — still paints its surface to the bottom
             * of the window instead of stopping under the last row and letting the page colour
             * show through. It is the **replies** block that grows rather than the post above it:
             * the post is a fixed piece of content, and stretching it would put its actions
             * somewhere different on every post.
             *
             * `grow` and not a `min-height`: the height wanted is "whatever is left", which only
             * the flex chain knows — `DESIGN_SYSTEM.md` §6 states the rule, and a `min-h-screen`
             * here would be too tall by exactly the height of the bar and the post.
             *
             * ⚠ This is **not** legacy's geometry. It puts `minHeight: 100vh` on the page container
             * and `marginBottom: 150px` under the stack, so its card stops at its content and the
             * page is tall underneath it. Growing the block is the deliberate change: below `md`
             * the surface is full-bleed, so legacy's arrangement reads as the card being cut off
             * mid-screen.
             */
            className="mt-px flex min-w-0 grow flex-col bg-(--background-surface)"
        >
            {replies.isLoading ? (
                <ReplySkeleton />
            ) : replies.isError ? (
                // `grow` + centred: the block is now as tall as the window has room for, and a
                // notice pinned to its top edge reads as a row rather than as the state of a list.
                <div className="flex grow flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                    <p className="type-dense-default text-(--text-subtitle)">
                        {t('post_detail_replies_error')}
                    </p>
                    <Button
                        variant="secondary"
                        size="medium"
                        onClick={() => replies.refetch()}
                        data-testid={subTestId(testId, 'retry')}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            ) : replies.isEmpty ? (
                <p
                    data-testid={subTestId(testId, 'message')}
                    className="type-dense-default flex grow items-center justify-center px-3 py-10 text-center text-(--text-placeholder) md:px-6"
                >
                    {t('post_detail_replies_empty')}
                </p>
            ) : (
                /*
                 * `divide-y`, not `gap-px`.
                 *
                 * The feed separates its cards with a 1px gap and lets the **page colour** show
                 * through, which works there because nothing is painted behind them. Here the block
                 * itself is painted — it has to be, or a short list leaves the bottom of the window
                 * the wrong colour — so a gap over that surface is a hairline of surface on
                 * surface: invisible. Every row ran into the next one, which is what this looked
                 * like before the block started filling its space.
                 *
                 * A real border draws regardless of what is behind it, and `divide-y` puts it
                 * between rows only, so the last row still meets the empty space below it cleanly.
                 */
                <div className="flex min-w-0 flex-col divide-y divide-(--separator-default)">
                    {replies.replies.map(reply => {
                        const height = heightFor(reply.id)
                        return (
                            <div
                                key={reply.id}
                                ref={observe}
                                {...windowKeyProps(reply.id)}
                                className="min-w-0"
                                style={height === null ? undefined : { height }}
                            >
                                {height === null ? (
                                    <ReplyRow
                                        reply={reply}
                                        isPremiumReader={isPremiumReader}
                                        onChanged={() => replies.refetch()}
                                        testId={subTestId(testId, 'row')}
                                    />
                                ) : null}
                            </div>
                        )
                    })}

                    {/* Zero-height, so it never adds space to a list that has stopped growing. */}
                    {replies.hasNextPage && (
                        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
                    )}
                    {replies.isFetchingNextPage && <ReplySkeleton rows={1} />}
                </div>
            )}
        </section>
    )
}

/**
 * Matches the card's own shape, so nothing jumps at the moment the post lands.
 *
 * `flex-1` for the same reason the replies block has it: a loading state that is only as tall as
 * its own placeholder makes the page grow under the reader the instant the post arrives.
 */
function DetailSkeleton() {
    return (
        <div className="flex flex-1 flex-col gap-3 bg-(--background-surface) px-3 py-3 md:px-6 md:py-5">
            <div className="flex items-center gap-2">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-col gap-1">
                    <Skeleton h={14} className="w-[120px] rounded-(--radius-sm)" />
                    <Skeleton h={12} className="w-[80px] rounded-(--radius-sm)" />
                </div>
            </div>
            <Skeleton h={14} className="w-full rounded-(--radius-sm)" />
            <Skeleton className="aspect-video w-full rounded-[8px]" />
            <Skeleton h={32} className="w-[180px] rounded-full" />
        </div>
    )
}

function ReplySkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-px" aria-busy="true">
            {Array.from({ length: rows }, (_, index) => (
                <div
                    // A placeholder's only identity is its position, and this list is replaced
                    // wholesale by the real rows rather than reordered.
                    // biome-ignore lint/suspicious/noArrayIndexKey: position is the only identity a placeholder has.
                    key={index}
                    className="flex gap-2 px-3 py-3 md:px-6"
                >
                    <Skeleton className="size-9 flex-none rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Skeleton h={12} className="w-[100px] rounded-(--radius-sm)" />
                        <Skeleton h={14} className="w-full rounded-(--radius-sm)" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function DetailNotice({
    icon,
    title,
    body,
    onRetry,
    testId,
}: {
    icon: 'comment-slash' | 'exclamation-circle'
    title: string
    body: string
    onRetry?: () => void
    testId: string
}) {
    const { t } = useTranslation()
    return (
        <div
            data-testid={subTestId(testId, 'message')}
            className="flex flex-1 flex-col items-center justify-center gap-3 bg-(--background-surface) px-4 py-16 text-center"
        >
            <span className="flex size-12 items-center justify-center rounded-full bg-(--background-segment) text-(--icon-secondary)">
                <Icon name={icon} size={24} />
            </span>
            <p className="type-title-t3-semibold text-(--text-title)">{title}</p>
            <p className="type-dense-default max-w-[400px] text-(--text-subtitle)">{body}</p>
            {onRetry ? (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={onRetry}
                    data-testid={subTestId(testId, 'retry')}
                >
                    {t('common_retry')}
                </Button>
            ) : null}
        </div>
    )
}
