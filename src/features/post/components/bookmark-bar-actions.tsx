'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useBookmarks } from '../hooks/use-bookmarks'

/**
 * *Clear all* — the only thing legacy's bookmark top bar offers, and the only thing this one does.
 *
 * ## A button, not a menu of one
 *
 * Legacy draws a kebab whose menu holds a single item. A menu is how you fit several actions into
 * one slot; with one action it is a press that reveals a press. The bar gets the action directly
 * and the confirmation carries the weight — which it must, because `bookmark/all/` cannot be
 * undone and takes no ids, so there is nothing to put back.
 *
 * ## It is a second reader of the same query, on purpose
 *
 * `useBookmarks()` runs here *and* in `BookmarkList`. TanStack serves both from one cache entry, so
 * this costs a subscription and no request — and it is what lets the bar be composed by the route,
 * on the server, rather than the list having to render its own header. `NotificationBarActions`
 * does the same for the same reason.
 *
 * Absent while the list is empty or still loading: a destructive control for nothing is a control
 * that can only be pressed by mistake.
 */
export function BookmarkBarActions({ testId = 'post-bookmarks-header' }: { testId?: string }) {
    const { t } = useTranslation()
    const { posts, isEmpty, isLoading, isSignedOut, clearAll, isClearing } = useBookmarks()
    const [confirming, setConfirming] = useState(false)

    if (isSignedOut || isLoading || isEmpty || posts.length === 0) return null

    return (
        <>
            <button
                type="button"
                aria-label={t('bookmarks_clear')}
                disabled={isClearing}
                onClick={() => setConfirming(true)}
                data-testid={subTestId(testId, 'clear')}
                className="flex size-10 items-center justify-center rounded-full text-(--icon-default) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
            >
                <Icon name="trash" size={20} />
            </button>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t('bookmarks_clear_title')}
                description={t('bookmarks_clear_body')}
                confirmLabel={t('bookmarks_clear')}
                onConfirm={() => {
                    clearAll()
                    setConfirming(false)
                }}
                pending={isClearing}
                destructive
                testId={subTestId(testId, 'confirm')}
            />
        </>
    )
}
