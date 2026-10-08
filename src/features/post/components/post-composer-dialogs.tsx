'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { ResponsiveDialog } from '@shared/components/responsive-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { useRef } from 'react'
import type { Post } from '../api/types'
import type { PostDraft } from '../lib/post-draft'
import { PostCollectionPicker } from './post-collection-picker'
import { PostPreviewCard } from './post-preview-card'
import {
    PostAudienceScreen,
    PostReplyAudienceScreen,
    PostSettingsScreen,
} from './post-settings-panel'

/**
 * The composer's one popup over itself — audience, *Who can reply*, post settings, the collection
 * picker and *Your audience view* are **five screens of a single popup**, not five popups.
 *
 * ## Popups over the composer, not screens inside it
 *
 * The first pass folded the settings into the composer's own frame and swapped its header for a
 * back arrow. That was wrong: the composer keeps its draft on screen behind the popup, so leaving
 * one returns to the words rather than re-entering them, and the composer's close control keeps
 * meaning *close*. Legacy opens them over the composer too.
 *
 * ## One popup, not five
 *
 * They were five `ResponsiveDialog`s sharing a shell component — five portals, five backdrops and
 * five focus traps, with only one ever open. Every one is the same thing: a titled band with a back
 * arrow over a scrolling body. So the shell is mounted **once** and the screen picks the title and
 * the body; the preview, which used to carry a cross where its siblings carried an arrow, now
 * dismisses the same way they do.
 *
 * ## The shell and its body do not share an id
 *
 * Each body takes `…-panel` **under** its own part, not the shell's id. They shared it once, which
 * is `docs/TEST_IDS.md` §5's first-match failure: a driver asking for `post-composer-group` got the
 * popup *and* the audience form. The body's id is also what says which screen is up — the screen is
 * state, and state never goes into the shell's id.
 */

/** Which screen the composer's popup is showing, if it is open at all. */
export type ComposerScreen = 'audience' | 'reply' | 'settings' | 'collections' | 'preview' | null

export function PostComposerDialogs({
    screen,
    onClose,
    draft,
    onChange,
    preview,
    minPrice,
    tiers,
    disabled = false,
    testId,
}: {
    screen: ComposerScreen
    onClose: () => void
    draft: PostDraft
    onChange: (next: Partial<PostDraft>) => void
    /**
     * The audience's copy of the draft, from `buildPreviewPost` — built by the caller only while the
     * preview is the screen. `null` there is an ordinary answer (an empty draft, or a shape the
     * parser refused), and the popup stays shut rather than drawing an empty frame.
     */
    preview: Post | null
    minPrice: number
    tiers: { id: string; name: string }[]
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    const open = screen !== null && (screen !== 'preview' || preview !== null)

    /*
     * The last screen shown, held through the close. Base UI animates the popup out after `open`
     * goes false, and a body keyed on `screen` would blank to nothing for that whole exit — the
     * title vanishing a frame before the sheet starts to slide.
     */
    const shown = useRef<{ screen: Exclude<ComposerScreen, null>; preview: Post | null }>({
        screen: 'settings',
        preview: null,
    })
    if (open && screen) shown.current = { screen, preview }
    const current = shown.current

    const title =
        current.screen === 'audience'
            ? t('post_audience_title')
            : current.screen === 'reply'
              ? t('who_can_reply_title')
              : current.screen === 'collections'
                ? t('post_collection_title')
                : current.screen === 'preview'
                  ? t('post_preview_title')
                  : t('post_settings_title')

    const shellId = subTestId(testId, 'group')

    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={next => {
                if (!next) onClose()
            }}
            /* Opened over the composer — see `DialogContent`'s `nested` for what it buys. */
            nested
            /*
             * Up from the bottom and only as tall as its contents, like the composer it opens over.
             * Most screens are "pick one thing" — a few rows, a short list — and a sheet that fills
             * the screen to hold three switches is a screen pretending to be a sheet. The 90dvh cap
             * in `SheetContent` is what a long list or a long post meets; the body below scrolls.
             */
            side="bottom"
            /*
             * `overflow-hidden` is **load-bearing**. `DialogContent` carries `overflow-y-auto` of
             * its own; a call site that scrolls its own body has to turn that off, or the inner
             * scroller never gets a bounded height and the whole popup scrolls instead — header and
             * the collection picker's sticky *Create new collection* with it. The pattern is written
             * down in `shared/ui/dialog.tsx`.
             *
             * Narrower than the composer (512 against 612 — legacy's own `maxWidth` for these), so
             * the frame behind stays visible at the edges and the stack reads as a thing on top of
             * the draft. A sheet takes none of these: `ResponsiveDialog` hands them to the dialog.
             */
            className="flex max-h-[85dvh] w-full max-w-[512px] flex-col gap-0 overflow-hidden p-0"
            data-testid={shellId}
        >
            {/*
             * A **back arrow**, not a cross, on every screen: the composer is still behind this
             * popup, so the press returns to the draft rather than closing anything the reader was
             * working on. `angle-left` is the mark this band uses everywhere (`DESIGN_SYSTEM.md` §7).
             * The composer's own header keeps its cross — that one is the way *out*.
             */}
            <DialogScreenHeader
                title={title}
                onBack={onClose}
                testId={subTestId(shellId, 'header')}
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {current.screen === 'audience' ? (
                    <PostAudienceScreen
                        draft={draft}
                        onChange={onChange}
                        minPrice={minPrice}
                        tiers={tiers}
                        disabled={disabled}
                        testId={subTestId(subTestId(testId, 'group'), 'panel')}
                    />
                ) : current.screen === 'reply' ? (
                    <PostReplyAudienceScreen
                        draft={draft}
                        onChange={onChange}
                        disabled={disabled}
                        testId={subTestId(subTestId(testId, 'list'), 'panel')}
                    />
                ) : current.screen === 'collections' ? (
                    <PostCollectionPicker
                        selected={draft.collectionIds}
                        onChange={ids => onChange({ collectionIds: ids })}
                        disabled={disabled}
                        testId={subTestId(subTestId(testId, 'row'), 'panel')}
                    />
                ) : current.screen === 'preview' ? (
                    current.preview ? (
                        /*
                         * Its own scope, `post-preview` — a surface of its own rather than a part
                         * of the composer (`PostPreviewCard`'s prop doc has the collision).
                         */
                        <PostPreviewCard post={current.preview} testId="post-preview" />
                    ) : null
                ) : (
                    <PostSettingsScreen
                        draft={draft}
                        onChange={onChange}
                        disabled={disabled}
                        /*
                         * `tab`, not `panel`: the composing body owns `panel`, and two surfaces
                         * under one scope is a first-match lookup waiting to go wrong.
                         */
                        testId={subTestId(subTestId(testId, 'tab'), 'panel')}
                    />
                )}
            </div>
        </ResponsiveDialog>
    )
}
