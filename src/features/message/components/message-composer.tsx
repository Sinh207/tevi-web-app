'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react'
import type { UseComposerResult } from '../hooks/use-composer'
import { messageText } from '../lib/message-thread'

/** Four lines of `type-body-default` (16 × 1.5) plus the field's padding — legacy's `maxRows: 4`. */
const MAX_FIELD_PX = 4 * 24 + 16

/**
 * The foot of a conversation: what is being replied to or edited, the field, and Send.
 *
 * No ground of its own — it sits on the room's pattern, as legacy's footer does; the field and the
 * reply banner carry their own fills.
 *
 * Legacy's field sits in a grey tail-shaped box with an attachment button whose sheet this port does
 * not have yet (photos are the next step), so the paperclip is not drawn — a control that opens
 * nothing is worse than none.
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
        <div className="flex flex-none flex-col gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {context && (
                <div className="flex items-center gap-2 rounded-(--radius-md) border-s-2 border-solid border-(--text-link) bg-(--background-subtle) py-2 ps-3 pe-1">
                    <Icon
                        name={editing ? 'pen-line' : 'reply'}
                        size={20}
                        className="flex-none text-(--text-link)"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate type-caption-label-strong text-(--text-link)">
                            {editing
                                ? t('message_editing')
                                : t('message_replying_to', {
                                      name: context.sender?.name ?? t('message_inactive_user'),
                                  })}
                        </span>
                        <span className="truncate type-caption-meta text-(--text-body)">
                            {messageText(context) ?? t('message_preview_photo')}
                        </span>
                    </span>
                    <Button
                        data-testid="message-composer-cancel"
                        variant="ghost"
                        size="small"
                        iconOnly
                        aria-label={t(editing ? 'message_cancel_edit' : 'message_cancel_reply')}
                        onClick={cancel}
                    >
                        <Icon name="xmark" size={20} className="size-5" />
                    </Button>
                </div>
            )}

            <div className="flex items-end gap-2">
                <div
                    className={cn(
                        'flex min-w-0 flex-1 flex-col rounded-[20px] bg-(--background-segment) px-4 py-2',
                        overLimit && 'ring-1 ring-(--text-error)',
                    )}
                >
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
                        className="block max-h-[112px] w-full resize-none overflow-y-auto bg-transparent type-body-default text-(--text-title) outline-none [field-sizing:content] placeholder:text-(--text-placeholder)"
                    />
                    {/* The counter appears in the last 10% and past the limit — never as clutter
                        on a two-word message. */}
                    {length > limit * 0.9 && (
                        <span
                            id="message-composer-limit"
                            role={overLimit ? 'alert' : undefined}
                            className={cn(
                                'self-end type-caption-meta',
                                overLimit ? 'text-(--text-error)' : 'text-(--text-placeholder)',
                            )}
                        >
                            {overLimit
                                ? t('message_limit_exceeded', { limit })
                                : `${length}/${limit}`}
                        </span>
                    )}
                </div>
                <Button
                    data-testid="message-composer-submit"
                    variant="primary"
                    size="large"
                    iconOnly
                    disabled={!canSend}
                    aria-label={t(editing ? 'message_save_edit' : 'message_send')}
                    onClick={submit}
                    className="flex-none rounded-(--radius-fill)"
                >
                    <Icon name={editing ? 'check' : 'send'} size={20} />
                </Button>
            </div>
        </div>
    )
}
