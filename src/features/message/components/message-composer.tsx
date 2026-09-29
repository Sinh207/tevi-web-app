'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react'
import type { UseComposerResult } from '../hooks/use-composer'
import { DISC } from '../lib/disc'
import { messageText } from '../lib/message-thread'

/** Four lines of `type-body-default` (16 × 1.5) plus the field's padding — legacy's `maxRows: 4`. */
const MAX_FIELD_PX = 4 * 24 + 16

/**
 * The foot of a conversation: what is being replied to or edited, the field, and Send.
 *
 * No ground of its own — it sits on the room's pattern, as legacy's footer does; the field and the
 * reply banner carry their own fills.
 *
 * Legacy's grey tail-shaped box and white Send disc, as drawn. Its attachment button is not drawn:
 * the sheet it opens is not built yet (photos are the next step), and a control that opens nothing
 * is worse than none — nor is there a paperclip in the icon library to draw it with.
 *
 * ## Enter sends — except while an IME is composing
 *
 * `Enter` sends and `Shift+Enter` is a new line, as in legacy. The part legacy misses is
 * `isComposing`: Vietnamese Telex, Pinyin and Hangul input all use Enter to *commit a candidate*, so
 * without the check the half-typed word is sent. Nine locales ship; three of them type this way.
 *
 * ## The limit is shown, not enforced by truncation
 *
 * Legacy puts `maxLength` on the field, so a pasted paragraph is cut silently at 500. Here the text
 * stays, the counter turns red past the limit, and Send is disabled — the reader decides what to cut.
 */
export function MessageComposer({
    composer,
    onFocusRequest,
}: {
    composer: UseComposerResult
    /** Called with the field so the room can focus it after Reply / Edit. */
    onFocusRequest?: (field: HTMLTextAreaElement | null) => void
}) {
    const { t } = useTranslation()
    const field = useRef<HTMLTextAreaElement>(null)
    const { text, setText, limit, overLimit, canSend, replyTo, editing, cancel, submit } = composer
    const length = text.trim().length

    /* Grow with the text up to four lines. `field-sizing: content` does this natively where it
       exists; the measurement is for Safari, which has not shipped it. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `text` is the trigger — the effect measures the DOM the new text produced.
    useLayoutEffect(() => {
        const node = field.current
        if (!node) return
        node.style.height = 'auto'
        node.style.height = `${Math.min(node.scrollHeight, MAX_FIELD_PX)}px`
    }, [text])

    // Reply and Edit both move the reader's attention to the field.
    const target = replyTo?.id ?? editing?.id ?? null
    useEffect(() => {
        if (!target) return
        field.current?.focus()
        onFocusRequest?.(field.current)
    }, [target, onFocusRequest])

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape' && (replyTo || editing)) {
            event.preventDefault()
            cancel()
            return
        }
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        submit()
    }

    const context = editing ?? replyTo

    return (
        <div className="flex flex-none items-end gap-2 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
            {/*
             * Legacy's box (`footerChat`): one `#F4F4F4` block holding the reply / edit card and the
             * field, square at the bottom-end corner where a curved tail joins it — a speech bubble
             * pointing at Send. The tail is the same concave triangle legacy clips, mirrored under
             * `rtl` so it still points at Send.
             */}
            <div
                className={cn(
                    'relative flex min-w-0 flex-1 flex-col gap-2 bg-(--background-subtle) px-2',
                    'rounded-ss-(--radius-lg) rounded-se-(--radius-lg) rounded-es-(--radius-lg) rounded-ee-none',
                    "after:absolute after:-end-4 after:bottom-0 after:size-4 after:bg-(--background-subtle) after:content-['']",
                    "after:[clip-path:path('M16,18_Q0,15_0,-1_L0,16_Z')] rtl:after:-scale-x-100",
                    overLimit && 'ring-1 ring-(--text-error)',
                )}
            >
                {context && (
                    <div className="mt-2 flex items-center gap-1 rounded-(--radius-lg) border-s-2 border-solid border-(--text-link) bg-(--background-surface) p-2">
                        {context.images[0]?.url && !editing && (
                            <Image
                                src={context.images[0].url}
                                alt=""
                                width={44}
                                height={44}
                                className="size-11 flex-none rounded-(--radius-md) object-cover"
                            />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate type-dense-default text-(--text-link)">
                                {editing
                                    ? t('message_editing')
                                    : t('message_replying_to', {
                                          name: context.sender?.name ?? t('message_inactive_user'),
                                      })}
                            </span>
                            <span className="truncate type-dense-default text-(--text-body)">
                                {messageText(context) ?? t('message_preview_photo')}
                            </span>
                        </span>
                        {/* Legacy's 30px grey disc with an × (`replyMess`, `editMess`). */}
                        <Button
                            data-testid="message-composer-cancel"
                            variant="ghost"
                            size="small"
                            iconOnly
                            aria-label={t(editing ? 'message_cancel_edit' : 'message_cancel_reply')}
                            onClick={cancel}
                            className="size-[30px] flex-none rounded-(--radius-fill) bg-(--background-subtle) text-(--icon-default) hover:not-disabled:bg-(--background-segment)"
                        >
                            <Icon name="xmark" size={24} className="size-6" />
                        </Button>
                    </div>
                )}

                <textarea
                    ref={field}
                    data-testid="message-composer-input"
                    rows={1}
                    value={text}
                    onChange={event => setText(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('message_composer_placeholder')}
                    aria-label={t('message_composer_placeholder')}
                    aria-invalid={overLimit || undefined}
                    aria-describedby={overLimit ? 'message-composer-limit' : undefined}
                    className="block max-h-[112px] w-full resize-none overflow-y-auto bg-transparent py-2 ps-1 type-body-default text-(--text-title) outline-none [field-sizing:content] placeholder:text-(--text-placeholder)"
                />
                {/* The counter appears in the last 10% and past the limit — never as clutter
                    on a two-word message. */}
                {length > limit * 0.9 && (
                    <span
                        id="message-composer-limit"
                        role={overLimit ? 'alert' : undefined}
                        className={cn(
                            '-mt-2 self-end pb-1 type-caption-meta',
                            overLimit ? 'text-(--text-error)' : 'text-(--text-placeholder)',
                        )}
                    >
                        {overLimit ? t('message_limit_exceeded', { limit }) : `${length}/${limit}`}
                    </span>
                )}
            </div>

            {/* Legacy's Send: a 40px white disc with a dark filled plane, the same for an edit.
                `ms-4` clears the box's tail. */}
            <Button
                data-testid="message-composer-submit"
                variant="ghost"
                size="large"
                iconOnly
                disabled={!canSend}
                aria-label={t(editing ? 'message_save_edit' : 'message_send')}
                onClick={submit}
                className={cn(DISC, 'ms-3 size-10 flex-none shadow-none')}
            >
                <Icon name="send" weight="filled" size={24} className="size-6 rtl:-scale-x-100" />
            </Button>
        </div>
    )
}
