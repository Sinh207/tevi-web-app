'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import type { Reply } from '../api/reply-types'
import type { Post } from '../api/types'
import { useChildReplies } from '../hooks/use-child-replies'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { mayReply } from '../lib/who-can-reply'
import { ReplyComposer } from './reply-composer'
import { ReplyRow } from './reply-row'

/**
 * One top-level reply, its answer box, and the thread under it.
 *
 * ## Why the row does not do this itself
 *
 * A thread is a second list with its own cursor, its own loading and error states and its own
 * composer. `ReplyRow` stays a row and takes two callbacks; everything stateful is here. It is the
 * same split `PostDetailView` makes with `RepliesSection`, one level down.
 *
 * ## Both controls are lazy, and that is the point
 *
 * `useChildReplies` is mounted with `open: false`, so a post with thirty replies fires **no**
 * requests for threads nobody has opened — thirty of them on arrival is what a non-lazy version
 * costs, and legacy loads them behind an expand control for the same reason. The composer is
 * mounted only once *Reply* is pressed, which keeps its draft state and its object URLs out of
 * every row on the page.
 *
 * ## Two levels, and the second one is flat
 *
 * A child row gets neither callback, so it offers no *Reply* and cannot open a thread of its own.
 * The wire allows deeper nesting — a child carries its own `reply_count` — but neither legacy nor
 * the mobile apps draw it, and a third level has nowhere to go at 612px.
 *
 * ## Answering the thread answers **the reply**, not the child row
 *
 * The composer's `replyTo` is this reply even when the reader is reading answers below it, so
 * every answer lands as a sibling. Legacy does the same: its child rows have no reply control at
 * all, so there is no way to address one, and the endpoint (`child-replies/` under *this* reply's
 * id) has no notion of answering one of its own rows.
 */
export function ReplyThread({
    post,
    reply,
    author = null,
    isPremiumReader = false,
    onChanged,
    testId,
}: {
    /** The parent post — every rule the composer obeys is its, not the reply's. */
    post: Post
    reply: Reply
    author?: ReplyComposerAuthor | null
    isPremiumReader?: boolean
    /** A write landed anywhere in this thread; the owning list refetches. */
    onChanged?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [answering, setAnswering] = useState(false)
    const [open, setOpen] = useState(false)

    const children = useChildReplies(reply.id, { open })

    /*
     * The same gate the post's own composer uses. A reader who may not reply to the post may not
     * answer its comments either — `can_reply` is the backend's answer about the *post*, and legacy
     * passes precisely that down to every comment row.
     */
    const canAnswer = mayReply(post)

    return (
        <div data-testid={testId} className="flex min-w-0 flex-col">
            <ReplyRow
                reply={reply}
                isPremiumReader={isPremiumReader}
                onReply={canAnswer ? () => setAnswering(current => !current) : undefined}
                onToggleAnswers={
                    reply.reply_count > 0 ? () => setOpen(current => !current) : undefined
                }
                answersOpen={open}
                onChanged={onChanged}
                testId={subTestId(testId, 'row')}
            />

            {/*
             * Indented to sit under the row's words rather than under its avatar — the same 48px
             * the row itself uses below `sm`, so the box and the answers line up with the text they
             * belong to.
             */}
            {answering ? (
                <div className="sm:ps-12">
                    <ReplyComposer
                        post={post}
                        replyTo={reply}
                        author={author}
                        isPremiumReader={isPremiumReader}
                        autoFocus
                        onReplied={() => {
                            setAnswering(false)
                            /*
                             * Open the thread the answer just landed in. Without it the reply is
                             * written, the count goes up and nothing appears — which reads as a
                             * failure. If it was already open, `useChildReplies` refetches on the
                             * invalidation `useCreateReply` fires.
                             */
                            setOpen(true)
                            onChanged?.()
                        }}
                        testId={subTestId(testId, 'panel')}
                    />
                </div>
            ) : null}

            {open ? (
                <div className="flex min-w-0 flex-col sm:ps-12">
                    {children.isLoading ? (
                        <ChildSkeleton />
                    ) : children.isError ? (
                        <div className="flex items-center gap-3 px-3 py-3 md:px-6">
                            <p className="type-dense-default text-(--text-subtitle)">
                                {t('reply_answers_error')}
                            </p>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => children.refetch()}
                                data-testid={subTestId(testId, 'retry')}
                            >
                                {t('common_retry')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex min-w-0 flex-col divide-y divide-(--separator-default)">
                            {children.replies.map(child => (
                                <ReplyRow
                                    key={child.id}
                                    reply={child}
                                    isPremiumReader={isPremiumReader}
                                    onChanged={() => children.refetch()}
                                    testId={subTestId(testId, 'item')}
                                />
                            ))}
                        </div>
                    )}

                    {/*
                     * A button rather than a scroll sentinel. A thread is inside a list that is
                     * itself paging on scroll, and two observers competing for the same scroll
                     * position is how a page ends up loading both lists at once.
                     */}
                    {children.hasNextPage ? (
                        <div className="px-3 py-2 md:px-6">
                            <Button
                                variant="ghost"
                                size="small"
                                disabled={children.isFetchingNextPage}
                                onClick={() => children.fetchNextPage()}
                                data-testid={subTestId(testId, 'next')}
                            >
                                {t('reply_answers_more')}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

/** One placeholder line, at the child row's own density. */
function ChildSkeleton() {
    return (
        <div className="flex gap-2 px-3 py-2 md:px-6" aria-busy="true">
            <Skeleton className="size-10 flex-none rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton h={12} className="w-[100px] rounded-(--radius-sm)" />
                <Skeleton h={14} className="w-full rounded-(--radius-sm)" />
            </div>
        </div>
    )
}
