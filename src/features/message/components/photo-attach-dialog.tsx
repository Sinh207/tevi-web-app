'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { UseComposerResult } from '../hooks/use-composer'
import { DISC } from '../lib/disc'
import { PHOTO_ACCEPT, PHOTO_MAX, type PhotoPickError, pickPhotos } from '../lib/photo-files'
import { FIELD_SCROLLBAR } from '../lib/room-ground'

/**
 * The photo sheet — legacy's `common/chat/attachment`: pick or drop up to ten photos, write a
 * caption, send them as one message.
 *
 * It is a **screen** in a popup (a title band, the dismiss at the leading edge where legacy puts its
 * Cancel), 512px wide from `sm` and the whole viewport below it, where legacy slides in a
 * full-width drawer.
 *
 * ## What it fixes on the way
 *
 * - **Enter sends.** Legacy passes `onKeyDown` to a field that reads `handleKeyDown`, so its
 *   caption field never sends; here it behaves like the composer's, IME included.
 * - **The caption is the draft.** Both apps carry what was typed into the sheet; legacy starts
 *   blank and the typed text is left behind in the composer, to be sent as a second message.
 * - **Errors are words the reader's language has** — legacy's five are hard-coded English.
 *
 * While it is open the other side sees "sending a photo" (`setAttaching`), as legacy's
 * `UPLOADING_PHOTO` on mount.
 */
export function PhotoAttachDialog({
    open,
    onOpenChange,
    composer,
    initialFiles,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    composer: UseComposerResult
    /** Photos the reader pasted into the composer — the sheet opens with them already in. */
    initialFiles?: File[]
}) {
    const { t } = useTranslation()
    const input = useRef<HTMLInputElement>(null)
    const [files, setFiles] = useState<File[]>([])
    const [caption, setCaption] = useState('')
    const [error, setError] = useState<PhotoPickError | null>(null)
    const [dragging, setDragging] = useState(false)
    const { setAttaching, sendPhotos, limit, text, setText } = composer

    /* Opening takes the draft and any pasted photos; closing hands nothing back — a sent caption is
       gone, and a cancelled one is still in the composer, untouched. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: seeded once per opening, not on every keystroke of the draft behind it.
    useEffect(() => {
        if (!open) return
        const seeded = pickPhotos(0, initialFiles ?? [])
        setFiles(seeded.accepted)
        setError(seeded.error)
        setCaption(text)
        setAttaching(true)
        return () => setAttaching(false)
    }, [open, initialFiles, setAttaching])

    const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files])
    useEffect(
        () => () => {
            for (const url of previews) URL.revokeObjectURL(url)
        },
        [previews],
    )

    const add = (picked: readonly File[]) => {
        const next = pickPhotos(files.length, picked)
        setError(next.error)
        if (next.accepted.length > 0) setFiles(list => [...list, ...next.accepted])
    }

    const remove = (index: number) => {
        setError(null)
        setFiles(list => list.filter((_, position) => position !== index))
    }

    const trimmed = caption.trim()
    const overLimit = trimmed.length > limit
    const canSend = files.length > 0 && !overLimit

    const send = () => {
        if (!canSend) return
        sendPhotos(files, trimmed)
        setText('')
        onOpenChange(false)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        send()
    }

    const onDrop = (event: DragEvent<HTMLElement>) => {
        event.preventDefault()
        setDragging(false)
        add([...event.dataTransfer.files])
    }

    const full = files.length >= PHOTO_MAX

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="message-photos"
                className={cn(
                    'gap-0 p-0 sm:w-[512px]',
                    'max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-0 max-sm:rounded-none max-sm:rtl:translate-0',
                )}
            >
                <div className="flex h-14 flex-none items-center gap-2 border-b border-solid border-(--separator-default) px-2">
                    <DialogCloseButton data-testid="message-photos-close" />
                    <DialogTitle className="min-w-0 flex-1 truncate type-subheading-strong text-(--text-title)">
                        {t('message_photos_title', { count: files.length, max: PHOTO_MAX })}
                    </DialogTitle>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                    {error && (
                        <p
                            role="alert"
                            className="rounded-(--radius-md) bg-(--accents-error-bg-active) px-3 py-2 type-dense-default text-(--text-error)"
                        >
                            {t(
                                error === 'type'
                                    ? 'message_photos_error_type'
                                    : 'message_photos_error_count',
                                {
                                    max: PHOTO_MAX,
                                },
                            )}
                        </p>
                    )}

                    <input
                        ref={input}
                        type="file"
                        accept={PHOTO_ACCEPT}
                        multiple
                        hidden
                        onChange={event => {
                            add([...(event.target.files ?? [])])
                            // The same photo picked again after removing it must fire `change`.
                            event.target.value = ''
                        }}
                    />

                    <div className="flex flex-wrap gap-[5px]">
                        {previews.map((url, index) => (
                            <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: two picks of one file share every other identity, and the order is what the upload numbers.
                                key={`${index}-${url}`}
                                className="relative size-[120px] flex-none overflow-hidden rounded-(--radius-md)"
                            >
                                <Image src={url} alt="" fill unoptimized className="object-cover" />
                                <Button
                                    data-testid="message-photos-remove"
                                    variant="ghost"
                                    size="small"
                                    iconOnly
                                    aria-label={t('message_photos_remove', { index: index + 1 })}
                                    onClick={() => remove(index)}
                                    className="absolute end-1 top-1 size-6 rounded-(--radius-fill) bg-(--opacity-black-50) text-(--white) hover:not-disabled:bg-(--opacity-black-50)"
                                >
                                    <Icon name="xmark" size={16} className="size-4" />
                                </Button>
                            </span>
                        ))}

                        {/* Legacy's dropzone: the whole sheet while it is empty, one more tile after,
                            and gone at ten. A button, so a keyboard can open the picker too. */}
                        {!full && (
                            <button
                                type="button"
                                data-testid="message-photos-pick"
                                onClick={() => input.current?.click()}
                                onDragOver={event => {
                                    event.preventDefault()
                                    setDragging(true)
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-2 rounded-(--radius-lg) border border-dashed border-(--text-link) p-4 text-center outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
                                    dragging
                                        ? 'bg-(--background-bubble-quote-other)'
                                        : 'bg-(--background-surface) hover:bg-(--background-bubble-quote-other)',
                                    files.length === 0
                                        ? 'h-[390px] max-h-[50dvh] w-full'
                                        : 'size-[120px]',
                                )}
                            >
                                <Icon
                                    name="image"
                                    size={24}
                                    className="size-6 text-(--text-link)"
                                />
                                <span className="type-dense-strong text-(--text-link)">
                                    {t(
                                        files.length === 0
                                            ? 'message_photos_drop'
                                            : 'message_photos_drop_more',
                                    )}
                                </span>
                                {files.length === 0 && (
                                    <span className="type-caption-meta text-(--text-body)">
                                        {t('message_photos_limit', { max: PHOTO_MAX })}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Legacy's footer: the caption field on grey, a send disc beside it. */}
                <div className="flex flex-none items-end gap-2 border-t border-solid border-(--separator-default) bg-(--background-subtle) p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <span className="flex min-w-0 flex-1 flex-col">
                        {/* The pill carries the fill and the inset, so a long caption scrolls
                            inside it rather than into its rounded edge. */}
                        <span className="flex rounded-[25px] bg-(--background-surface) py-2 ps-4 pe-2">
                            <textarea
                                data-testid="message-photos-caption"
                                rows={1}
                                value={caption}
                                onChange={event => setCaption(event.target.value)}
                                onKeyDown={onKeyDown}
                                placeholder={t('message_photos_caption')}
                                aria-label={t('message_photos_caption')}
                                aria-invalid={overLimit || undefined}
                                className={cn(
                                    'block max-h-24 w-full resize-none overflow-y-auto bg-transparent type-body-default text-(--text-title) outline-none [field-sizing:content] placeholder:text-(--text-placeholder)',
                                    FIELD_SCROLLBAR,
                                )}
                            />
                        </span>
                        {overLimit && (
                            <span
                                role="alert"
                                className="px-4 pt-1 type-caption-meta text-(--text-error)"
                            >
                                {t('message_limit_exceeded', { limit })}
                            </span>
                        )}
                    </span>
                    <Button
                        data-testid="message-photos-submit"
                        variant="ghost"
                        size="large"
                        iconOnly
                        disabled={!canSend}
                        aria-label={t('message_send')}
                        onClick={send}
                        className={cn(DISC, 'size-10 flex-none shadow-none')}
                    >
                        <Icon
                            name="send"
                            weight="filled"
                            size={24}
                            className="size-6 rtl:-scale-x-100"
                        />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
