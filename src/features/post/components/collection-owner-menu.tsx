'use client'

import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useCollectionWrites } from '../hooks/use-collection-writes'
import { openPostComposer } from '../store/composer-store'
import { CollectionAddPostsDialog } from './collection-add-posts-dialog'
import { CollectionNameDialog } from './collection-name-dialog'

/**
 * The owner's four things to do with a collection — legacy's `CollectionItem` `BtnMenu`: *Edit*,
 * *Create post*, *Add posts*, *Delete*, in that order.
 *
 * ## One component for both places legacy draws it
 *
 * The same menu sits on each row of the list and at the top of the collection's own screen, so it
 * owns everything behind its items — the name dialog, the delete confirmation, *Add posts* — rather
 * than asking two hosts to wire four dialogs each. The writes are `useCollectionWrites`, which
 * reaches the list's key from either place.
 *
 * *Create post* opens the session's one composer with this collection already picked
 * (`openPostComposer`'s preset), which is legacy's `PostForm collectionId`. The new post then shows
 * up here because creating one invalidates this feature's whole prefix.
 *
 * Legacy also declares a *Share* item and never renders it; not ported.
 */
export function CollectionOwnerMenu({
    collectionId,
    name,
    channelId,
    onDeleted,
    testId,
}: {
    collectionId: string
    /** The current name — what *Edit* starts from. */
    name: string
    /** The owner's own channel, which *Add posts* searches. */
    channelId: string | null
    /** The collection is gone; a screen showing it navigates away. A list row need not pass one. */
    onDeleted?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [editing, setEditing] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [adding, setAdding] = useState(false)
    const { rename, isRenaming, remove, isRemoving } = useCollectionWrites(collectionId, {
        onDeleted: () => {
            setDeleting(false)
            onDeleted?.()
        },
    })

    return (
        <>
            <ActionMenu>
                <ActionMenuTrigger
                    aria-label={t('collection_menu_label')}
                    data-testid={subTestId(testId, 'trigger')}
                    data-card-id={collectionId}
                    className="flex-none"
                >
                    {/* `size-5` as well as `size={20}` — `post-menu.tsx` says why the prop alone loses. */}
                    <Icon name="more-vertical" size={20} className="size-5" />
                </ActionMenuTrigger>
                <ActionMenuContent>
                    <ActionMenuItem
                        data-testid={subTestId(testId, 'apply')}
                        onClick={() => setEditing(true)}
                    >
                        {t('collection_menu_edit')}
                        <Icon name="pen-line" size={20} className="flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid={subTestId(testId, 'start')}
                        onClick={() => openPostComposer({ collectionIds: [collectionId] })}
                    >
                        {t('collection_create_post')}
                        <Icon name="plus-square" size={20} className="flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid={subTestId(testId, 'option')}
                        onClick={() => setAdding(true)}
                    >
                        {t('collection_add_posts')}
                        <Icon name="image-gallery" size={20} className="flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid={subTestId(testId, 'remove')}
                        tone="destructive"
                        disabled={isRemoving}
                        onClick={() => setDeleting(true)}
                    >
                        {t('collection_menu_delete')}
                        <Icon name="trash" size={20} className="flex-none" />
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            <CollectionNameDialog
                open={editing}
                onOpenChange={setEditing}
                title={t('collection_edit')}
                submitLabel={t('common_save')}
                initialName={name}
                pending={isRenaming}
                onSubmit={next => {
                    rename(next)
                    setEditing(false)
                }}
                testId={subTestId(testId, 'panel')}
            />

            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title={t('collection_delete_title')}
                /* Says what is *not* lost, because that is the part a reader cannot check first. */
                description={t('collection_delete_body')}
                confirmLabel={t('collection_delete')}
                onConfirm={remove}
                pending={isRemoving}
                destructive
                testId={subTestId(testId, 'confirm')}
            />

            <CollectionAddPostsDialog
                open={adding}
                onOpenChange={setAdding}
                collectionId={collectionId}
                channelId={channelId}
            />
        </>
    )
}
