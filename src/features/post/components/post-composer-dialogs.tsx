'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import type { ReactNode } from 'react'
import type { PostDraft } from '../lib/post-draft'
import { PostCollectionPicker } from './post-collection-picker'
import {
    PostAudienceScreen,
    PostReplyAudienceScreen,
    PostSettingsScreen,
} from './post-settings-panel'

/**
 * The composer's four settings dialogs — **separate popups over it**, as legacy has them.
 *
 * ## They were screens inside the composer, and that was wrong
 *
 * The first pass folded all four into the composer's own frame and swapped its header for a back
 * arrow, on the stated grounds that "this app's dialog draws one layer". That was an assumption, not
 * a rule: nothing in `shared/ui/dialog.tsx` says it, base-ui stacks dialogs and manages the focus
 * trap and backdrop for each, and the app has no precedent either way.
 *
 * Legacy opens `Select collection`, `Select your audience`, `Reply settings` and `Post settings` as
 * their own modals over the composer, and that is the right shape for what they are: the composer
 * keeps its draft on screen behind them, so closing one returns to the words rather than
 * re-entering them. A back arrow in place of the composer's close button also takes away the way out
 * — the reader has to notice the arrow changed meaning.
 *
 * ## One shell, four bodies
 *
 * Each is a titled dialog with a close control and nothing else; the bodies already exist as
 * components. `SettingsDialog` is that shell, so the four differ only by title and contents rather
 * than by four near-identical copies of the same markup.
 */

/** Which settings dialog is open, if any. */
export type ComposerDialog = 'audience' | 'reply' | 'settings' | 'collections' | null

export function PostComposerDialogs({
    open,
    onClose,
    draft,
    onChange,
    minPrice,
    tiers,
    disabled = false,
    testId,
}: {
    open: ComposerDialog
    onClose: () => void
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    minPrice: number
    tiers: { id: string; name: string }[]
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <>
            <SettingsDialog
                open={open === 'audience'}
                onClose={onClose}
                title={t('post_audience_title')}
                testId={subTestId(testId, 'group')}
            >
                <PostAudienceScreen
                    draft={draft}
                    onChange={onChange}
                    minPrice={minPrice}
                    tiers={tiers}
                    disabled={disabled}
                    testId={subTestId(testId, 'group')}
                />
            </SettingsDialog>

            <SettingsDialog
                open={open === 'reply'}
                onClose={onClose}
                title={t('who_can_reply_title')}
                testId={subTestId(testId, 'list')}
            >
                <PostReplyAudienceScreen
                    draft={draft}
                    onChange={onChange}
                    disabled={disabled}
                    testId={subTestId(testId, 'list')}
                />
            </SettingsDialog>

            <SettingsDialog
                open={open === 'settings'}
                onClose={onClose}
                title={t('post_settings_title')}
                testId={subTestId(testId, 'panel')}
            >
                <PostSettingsScreen
                    draft={draft}
                    onChange={onChange}
                    disabled={disabled}
                    testId={subTestId(testId, 'panel')}
                />
            </SettingsDialog>

            <SettingsDialog
                open={open === 'collections'}
                onClose={onClose}
                title={t('post_collection_title')}
                testId={subTestId(testId, 'row')}
            >
                <PostCollectionPicker
                    selected={draft.collectionIds}
                    onChange={ids => onChange({ collectionIds: ids })}
                    disabled={disabled}
                    testId={subTestId(testId, 'row')}
                />
            </SettingsDialog>
        </>
    )
}

/**
 * The shell the four share: a titled dialog with a close control, sitting over the composer.
 *
 * Narrower than the composer (512 against 612 — legacy's own `maxWidth` for these), so the frame
 * behind stays visible at the edges and the stack reads as a thing on top of the draft rather than
 * as a new screen replacing it.
 *
 * `onClose` rather than base-ui's own dismiss: the parent owns which of the four is open, and a
 * dialog that closed itself would leave that state saying otherwise.
 */
function SettingsDialog({
    open,
    onClose,
    title,
    children,
    testId,
}: {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
    testId?: string
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (!next) onClose()
            }}
        >
            <DialogContent
                className="flex max-h-[85dvh] w-full max-w-[512px] flex-col gap-0 p-0"
                data-testid={testId}
            >
                <DialogScreenHeader
                    title={title}
                    onClose={onClose}
                    testId={subTestId(testId, 'header')}
                />
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
            </DialogContent>
        </Dialog>
    )
}
