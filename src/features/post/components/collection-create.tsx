'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useCollections } from '../hooks/use-collections'
import { COLLECTIONS_MAX } from '../lib/collection-page'
import { DISC } from './collection-card'
import { CollectionNameDialog } from './collection-name-dialog'

/**
 * *Create new collection* — the name dialog wired to `useCollections().create`.
 *
 * Closed only once the write lands, so a refused name (the API's own sentence, as a toast) leaves
 * the creator's typing in the field to correct. The list below refetches through the same key the
 * create invalidates, so the new row simply appears.
 */
export function CollectionCreateDialog({
    open,
    onOpenChange,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    testId?: string
}) {
    const { t } = useTranslation()
    const { create, isCreating } = useCollections({ enabled: false })

    return (
        <CollectionNameDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('post_collection_create_new')}
            submitLabel={t('post_collection_create')}
            pending={isCreating}
            onSubmit={name => {
                create(name)
                    .then(() => onOpenChange(false))
                    // The toast is the query client's (`meta.showErrorToast`); the dialog stays up.
                    .catch(() => {})
            }}
            testId={testId}
        />
    )
}

/**
 * The `+` in the collections screen's bar — legacy's `BtnAddCollection`: the same floating disc as
 * the back control, drawn only while `collections.length < 10`.
 *
 * It reads the list's own query (`enabled: true` is the same key the list below is already
 * fetching, so this adds no request) and stands down at the limit. The host decides whether the
 * reader is the owner at all; this does not know.
 */
export function CollectionCreateButton({
    testId = 'post-collections-create',
}: {
    testId?: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const { collections, hasMore, isLoading, isError } = useCollections({ enabled: true })

    if (isLoading || isError || hasMore || collections.length >= COLLECTIONS_MAX) return null

    return (
        <>
            <button
                type="button"
                aria-label={t('post_collection_create_new')}
                onClick={() => setOpen(true)}
                data-testid={subTestId(testId, 'trigger')}
                className={cn(DISC, 'size-10')}
            >
                <Icon name="plus" size={20} />
            </button>
            <CollectionCreateDialog
                open={open}
                onOpenChange={setOpen}
                testId={subTestId(testId, 'panel')}
            />
        </>
    )
}
