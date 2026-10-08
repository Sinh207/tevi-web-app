'use client'

import { useAuth } from '@features/auth'
import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { ResponsiveDialog } from '@shared/components/responsive-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { useInfiniteQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { useEffect, useId, useMemo, useState } from 'react'
import { collectionPostsOptions } from '../hooks/use-collection-posts'
import { COLLECTION_ART } from '../lib/illustrations'
import { CollectionPostRow, CollectionPostRowSkeleton } from './collection-add-posts-dialog'
import { COLLECTION_NAME_MAX } from './collection-name-dialog'

/**
 * *Edit collection* — legacy's `editCollection`: the name, and the posts in the collection with a
 * *Remove* on each, applied together on *Done*.
 *
 * ## Mark, then *Done*
 *
 * A row's *Remove* marks the post and turns into *Add* (legacy's `type='edit'`, which inverts the
 * labels *Add posts* uses); nothing is sent until *Done*, which takes the marked posts out in one
 * `remove-posts/` and renames if the name changed — legacy's `handleEditCollection(id, name,
 * deletePostIds)`. *Done* is off while there is nothing to apply, as legacy's is.
 *
 * The list is the collection screen's own query (`collectionPostsOptions`), so opening this over
 * the screen costs no request, and a removal lands on both at once.
 *
 * The name keeps legacy's 25-character cap and the `n/25` counter inside the field. The cap is
 * `maxLength` here rather than an error state — `collection-name-dialog.tsx` says why.
 */
export function CollectionEditDialog({
    open,
    onOpenChange,
    collectionId,
    name,
    onApply,
    pending,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    collectionId: string
    /** The current name, which the field starts from. */
    name: string
    /** *Done*: the new name (or `null` when unchanged) and the posts to take out. */
    onApply: (change: { name: string | null; removePostIds: string[] }) => void
    pending: boolean
    testId?: string
}) {
    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={next => {
                if (!next && pending) return
                onOpenChange(next)
            }}
            /* The list scrolls itself — `post-composer-dialog.tsx` on two scrollers and a footer. */
            className="flex h-[720px] max-h-[90dvh] w-full max-w-[512px] flex-col gap-0 overflow-hidden p-0"
            data-testid={testId}
        >
            {/* Mounted per opening, so the name and the marks start fresh each time. */}
            {open ? (
                <EditBody
                    collectionId={collectionId}
                    name={name}
                    onApply={onApply}
                    pending={pending}
                    onClose={() => onOpenChange(false)}
                    testId={testId}
                />
            ) : null}
        </ResponsiveDialog>
    )
}

function EditBody({
    collectionId,
    name,
    onApply,
    pending,
    onClose,
    testId,
}: {
    collectionId: string
    name: string
    onApply: (change: { name: string | null; removePostIds: string[] }) => void
    pending: boolean
    onClose: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const { activeId, isAuthenticated } = useAuth()
    const inputId = useId()
    const [draft, setDraft] = useState(name.slice(0, COLLECTION_NAME_MAX))
    const [marked, setMarked] = useState<string[]>([])

    const query = useInfiniteQuery({
        // The slug only addresses the visitor's half; the owner's key does not carry it.
        ...collectionPostsOptions({ collectionId, slug: '', isOwner: true, accountId: activeId }),
        enabled: isAuthenticated,
    })
    const posts = useMemo(() => query.data?.pages.flatMap(page => page.results) ?? [], [query.data])

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: query.hasNextPage && !query.isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView && query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage()
        }
    }, [sentinelInView, query])

    const trimmed = draft.trim()
    const renamed = trimmed !== name.trim()
    const canApply = trimmed !== '' && (renamed || marked.length > 0) && !pending

    function toggle(postId: string) {
        setMarked(current =>
            current.includes(postId) ? current.filter(id => id !== postId) : [...current, postId],
        )
    }

    return (
        <>
            <DialogScreenHeader
                title={t('collection_edit')}
                onBack={onClose}
                disabled={pending}
                testId={subTestId(testId, 'header')}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-3 px-2 pt-3">
                <div className="flex flex-col gap-3">
                    <label htmlFor={inputId} className="type-dense-strong text-(--text-title)">
                        {t('post_collection_name_label')}
                    </label>
                    {/* Legacy's field: a 2px brand ring, 12px corners, the counter inside the end. */}
                    <div className="flex items-center gap-2 rounded-(--radius-lg) border-2 border-(--text-brand) bg-(--background-surface) px-3">
                        <input
                            id={inputId}
                            value={draft}
                            maxLength={COLLECTION_NAME_MAX}
                            disabled={pending}
                            placeholder={t('post_collection_name_placeholder')}
                            data-testid={subTestId(testId, 'input')}
                            onChange={event => setDraft(event.target.value)}
                            className="type-dense-default min-w-0 flex-1 bg-transparent py-3 text-(--text-title) outline-none placeholder:text-(--text-placeholder)"
                        />
                        <span
                            data-testid={subTestId(testId, 'count')}
                            className="type-dense-default flex-none text-(--text-title)"
                        >
                            {t('collection_name_count', {
                                length: draft.length,
                                max: COLLECTION_NAME_MAX,
                            })}
                        </span>
                    </div>
                </div>

                <p className="type-dense-strong text-(--text-title)">
                    {t('collection_edit_posts')}
                </p>

                <div
                    data-testid={subTestId(testId, 'list')}
                    aria-busy={query.isLoading || undefined}
                    className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3"
                >
                    {query.isLoading ? (
                        <CollectionPostRowSkeleton rows={4} />
                    ) : posts.length === 0 ? (
                        <div
                            data-testid={subTestId(testId, 'empty')}
                            className="flex flex-1 flex-col items-center justify-center gap-3"
                        >
                            <Image
                                src={COLLECTION_ART.noPosts.src}
                                alt=""
                                width={COLLECTION_ART.noPosts.width}
                                height={COLLECTION_ART.noPosts.height}
                            />
                            <p className="type-dense-default text-(--text-subtitle)">
                                {t('collection_edit_empty')}
                            </p>
                        </div>
                    ) : (
                        <>
                            {posts.map(post => {
                                const isMarked = marked.includes(post.id)
                                return (
                                    <CollectionPostRow
                                        key={post.id}
                                        post={post}
                                        picked={isMarked}
                                        label={
                                            isMarked
                                                ? t('post_collection_add')
                                                : t('post_collection_remove')
                                        }
                                        onToggle={() => toggle(post.id)}
                                        disabled={pending}
                                        testId={testId ?? 'post-collection-edit'}
                                    />
                                )
                            })}
                            <div ref={sentinelRef} aria-hidden="true" className="h-px flex-none" />
                            {query.isFetchingNextPage ? (
                                <CollectionPostRowSkeleton rows={1} />
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-none justify-end p-3">
                <Button
                    variant="primary"
                    size="small"
                    disabled={!canApply}
                    onClick={() =>
                        onApply({ name: renamed ? trimmed : null, removePostIds: marked })
                    }
                    data-testid={subTestId(testId, 'submit')}
                >
                    {t('collection_add_done')}
                </Button>
            </div>
        </>
    )
}
