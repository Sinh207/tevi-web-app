'use client'

import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { ChatMessage, InlineMenuItem, ReplyMessage } from '../api/types'
import { DISC } from '../lib/disc'
import { formatMessageTime, isPremiumGift, messageText, splitLinks } from '../lib/message-thread'

/**
 * One message — legacy's `itemMessage/common/layout` with its text, image and reply parts.
 *
 * The DS draws no chat bubble (the Figma library has the conversation *list* and nothing inside a
 * conversation), so the geometry is legacy's — 80% max width, 12px radius, 8px padding, time at the
 * foot — on this app's surfaces: the other side's message is `--background-surface` on the
 * thread's `--background`, the reader's own takes `--accents-indigo-bg-active`. Legacy's
 * `#FDFFDD` / `#fafafa` on a purple photograph have no dark mode at all.
 *
 * ## What is rendered, and what is not yet
 *
 * Text (with links), photos, replies, bot buttons and the Premium gift line. Legacy additionally
 * resolves the first URL in a message into a post, space, live, collection or membership **card**
 * (`useMessageType`, one short-link request per message). Here such a message is its text with the
 * link clickable — correct, just not rich. The cards are a follow-up, and each reuses a feature's
 * own card rather than a DM-only copy.
 *
 * ## Nothing here is HTML
 *
 * Legacy renders `html_text` with `dangerouslySetInnerHTML`, i.e. the other person's markup as ours.
 * This renders `text` as text nodes and turns `http(s)` runs into links, each through
 * `safeExternalUrl`, opened in a new tab with `noopener noreferrer`.
 */
export function MessageBubble({
    message,
    own,
    locale,
    status = 'sent',
    onReply,
    onCopy,
    onEdit,
    onDelete,
    onInline,
    onRetry,
    onDiscard,
    onOpenImage,
}: {
    message: Pick<
        ChatMessage,
        'id' | 'text' | 'markdown_text' | 'images' | 'created_at' | 'edited_at' | 'seen_by'
    > & {
        reply_message?: ReplyMessage | null
        inline_menu?: ChatMessage['inline_menu']
    }
    own: boolean
    locale: string
    /** A server message is `sent`; a local one is `sending` or `failed`. */
    status?: 'sent' | 'sending' | 'failed'
    onReply?: () => void
    onCopy?: () => void
    onEdit?: () => void
    onDelete?: (both: boolean) => void
    onInline?: (item: InlineMenuItem) => void
    onRetry?: () => void
    onDiscard?: () => void
    /** The index of the photo pressed, for the viewer. */
    onOpenImage?: (index: number) => void
}) {
    const { t } = useTranslation()
    const text = messageText(message)
    const gift = isPremiumGift(message)
    const seen = Object.keys(message.seen_by ?? {}).length > 0
    const time = formatMessageTime(message.created_at, locale)
    const items = message.inline_menu?.items ?? []
    const actionable = status === 'sent' && (onReply || onDelete)

    return (
        <div
            data-testid="message-bubble"
            data-message-id={message.id}
            className={cn(
                'group/bubble relative flex w-full',
                own ? 'justify-end' : 'justify-start',
            )}
        >
            <div className="flex max-w-[80%] min-w-0 flex-col gap-1">
                <div
                    className={cn(
                        'relative flex min-w-0 flex-col overflow-hidden rounded-(--radius-lg)',
                        own ? 'bg-(--accents-indigo-bg-active)' : 'bg-(--background-surface)',
                        status === 'failed' && 'ring-1 ring-(--text-error)',
                    )}
                >
                    {message.reply_message && (
                        <ReplyQuote reply={message.reply_message} own={own} />
                    )}

                    {message.images.length > 0 && (
                        <div
                            className={cn(
                                'grid gap-0.5',
                                message.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                            )}
                        >
                            {message.images.slice(0, 4).map((image, index) =>
                                image.url ? (
                                    <button
                                        // biome-ignore lint/suspicious/noArrayIndexKey: two photos may share a URL, and a message's photos never reorder — the position is their identity.
                                        key={`${index}-${image.url}`}
                                        type="button"
                                        onClick={() => onOpenImage?.(index)}
                                        aria-label={t('message_open_photo')}
                                        className="relative block aspect-square w-full max-w-[280px] min-w-[120px] overflow-hidden outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
                                    >
                                        <Image
                                            src={image.url}
                                            alt=""
                                            fill
                                            sizes="280px"
                                            className="object-cover"
                                        />
                                    </button>
                                ) : null,
                            )}
                        </div>
                    )}

                    {gift ? (
                        <p className="flex items-center gap-2 px-2 pt-2 type-dense-strong text-(--text-title)">
                            <Icon name="premium" weight="filled" size={20} />
                            {t('message_premium_gift')}
                        </p>
                    ) : text ? (
                        <p className="px-2 pt-2 type-dense-default whitespace-pre-wrap break-words text-(--text-title) [overflow-wrap:anywhere]">
                            <LinkedText text={text} />
                        </p>
                    ) : null}

                    <div className="flex items-center justify-end gap-1 px-2 pt-1 pb-2">
                        {message.edited_at && (
                            <span className="type-caption-meta text-(--text-placeholder) italic">
                                {t('message_edited')}
                            </span>
                        )}
                        <time
                            dateTime={
                                message.created_at
                                    ? new Date(message.created_at).toISOString()
                                    : undefined
                            }
                            className={cn(
                                'type-caption-meta',
                                /* Legacy's colours: the reader's own time is green like its ticks,
                                   the other side's grey, a failed one red. */
                                status === 'failed'
                                    ? 'text-(--text-error)'
                                    : own
                                      ? 'text-(--text-success)'
                                      : 'text-(--text-placeholder)',
                            )}
                        >
                            {time}
                        </time>
                        {own && <DeliveryMark status={status} seen={seen} />}
                    </div>
                </div>

                {status === 'failed' && (
                    <div className={cn('flex gap-2', own ? 'justify-end' : 'justify-start')}>
                        <Button
                            data-testid="message-bubble-retry"
                            variant="ghost"
                            size="small"
                            onClick={onRetry}
                        >
                            {t('common_retry')}
                        </Button>
                        <Button
                            data-testid="message-bubble-remove"
                            variant="ghost"
                            size="small"
                            onClick={onDiscard}
                        >
                            {t('message_discard')}
                        </Button>
                    </div>
                )}

                {items.length > 0 && (
                    <div className="flex flex-col gap-1">
                        {items.map((row, rowIndex) => (
                            <div
                                // Rows have no identity of their own; the index is stable for a message.
                                // biome-ignore lint/suspicious/noArrayIndexKey: a row is positional
                                key={rowIndex}
                                className="grid gap-1"
                                style={{
                                    gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                                }}
                            >
                                {row.map(item => (
                                    /* Legacy's bot button: a dark translucent pill over the
                                       conversation's ground, white 14/600, 40px, 12px radius. */
                                    <Button
                                        key={`${item.label}-${item.target}`}
                                        data-testid="message-bubble-option"
                                        data-option-value={item.action ?? undefined}
                                        variant="ghost"
                                        size="medium"
                                        onClick={() => onInline?.(item)}
                                        className="h-10 min-w-0 rounded-(--radius-lg) bg-(--opacity-black-25) px-6 type-dense-strong text-(--white) shadow-md backdrop-blur-[16px] hover:not-disabled:bg-(--opacity-black-50)"
                                    >
                                        <span className="truncate">{item.label}</span>
                                    </Button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {actionable && (
                /*
                 * Legacy's hover actions — Reply and a kebab, beside the bubble on the side away from
                 * the edge. Also shown on keyboard focus and while the menu is open; legacy's appear
                 * under a mouse only, so a keyboard could never reach Delete.
                 */
                <div
                    className={cn(
                        'flex items-center gap-1 self-center px-1',
                        own ? 'order-first' : '',
                        'opacity-0 transition-opacity duration-[160ms] ease-out',
                        'group-hover/bubble:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100',
                        '[@media(hover:none)]:opacity-100',
                    )}
                >
                    {/* Legacy's two discs (`replyButton`, `menuButton`): 36px on a phone, 40 wider,
                        Reply's glyph grey and More's dark. */}
                    {onReply && (
                        <Button
                            data-testid="message-bubble-reply"
                            variant="ghost"
                            size="medium"
                            iconOnly
                            aria-label={t('message_reply')}
                            onClick={onReply}
                            className={cn(
                                DISC,
                                'size-9 text-(--icon-secondary) hover:text-(--icon-secondary) sm:size-10',
                            )}
                        >
                            <Icon name="reply" weight="filled" size={24} className="size-6" />
                        </Button>
                    )}
                    <ActionMenu>
                        <ActionMenuTrigger
                            data-testid="message-bubble-menu-trigger"
                            aria-label={t('message_actions')}
                            className={cn(DISC, 'size-9 sm:size-10')}
                        >
                            <Icon name="more-horizontal" size={24} className="size-6" />
                        </ActionMenuTrigger>
                        {/*
                         * Legacy's rows, in its order and with its marks: Copy and Reply in the link
                         * blue, the deletes red — 24px, trailing. Delete is offered on the reader's own
                         * messages only (legacy's `onDelete={isSender ? … : undefined}`).
                         */}
                        <ActionMenuContent align={own ? 'end' : 'start'} className="w-[250px]">
                            {text && onCopy && (
                                <ActionMenuItem data-testid="message-bubble-copy" onClick={onCopy}>
                                    {t('message_copy')}
                                    <Icon
                                        name="pages"
                                        weight="filled"
                                        size={24}
                                        className="size-6 flex-none text-(--text-link)"
                                    />
                                </ActionMenuItem>
                            )}
                            {onReply && (
                                <ActionMenuItem
                                    data-testid="message-bubble-menu-reply"
                                    onClick={onReply}
                                >
                                    {t('message_reply')}
                                    <Icon
                                        name="reply"
                                        weight="filled"
                                        size={24}
                                        className="size-6 flex-none text-(--text-link)"
                                    />
                                </ActionMenuItem>
                            )}
                            {own && text && !gift && onEdit && (
                                /* Not in legacy's menu (its edit state has no entry point); kept, in
                                   Copy and Reply's colour so it reads as one of them. */
                                <ActionMenuItem data-testid="message-bubble-edit" onClick={onEdit}>
                                    {t('message_edit')}
                                    <Icon
                                        name="pen-line"
                                        size={24}
                                        className="size-6 flex-none text-(--text-link)"
                                    />
                                </ActionMenuItem>
                            )}
                            {own && onDelete && (
                                <ActionMenuItem
                                    data-testid="message-bubble-delete"
                                    tone="destructive"
                                    onClick={() => onDelete(false)}
                                >
                                    {t('message_delete_for_me')}
                                    <Icon
                                        name="trash"
                                        weight="filled"
                                        size={24}
                                        className="size-6 flex-none"
                                    />
                                </ActionMenuItem>
                            )}
                            {own && onDelete && (
                                <ActionMenuItem
                                    data-testid="message-bubble-delete-all"
                                    tone="destructive"
                                    onClick={() => onDelete(true)}
                                >
                                    {t('message_delete_for_everyone')}
                                    <Icon
                                        name="trash"
                                        weight="filled"
                                        size={24}
                                        className="size-6 flex-none"
                                    />
                                </ActionMenuItem>
                            )}
                        </ActionMenuContent>
                    </ActionMenu>
                </div>
            )}
        </div>
    )
}

/**
 * Sending → a loader; failed → a warning; sent → one tick, seen → two. Own messages only.
 *
 * Legacy's marks (`layout/icons`): both ticks **green**, seen being the slanted double tick
 * (`check-all`, not `check-double`'s stacked pair), and a failure a red exclamation in a circle.
 */
function DeliveryMark({ status, seen }: { status: 'sent' | 'sending' | 'failed'; seen: boolean }) {
    const { t } = useTranslation()
    if (status === 'sending') return <Loader className="size-4" label={t('message_sending')} />
    if (status === 'failed') {
        return (
            <Icon
                name="exclamation-circle"
                size={16}
                title={t('message_failed')}
                className="text-(--text-error)"
            />
        )
    }
    return (
        <Icon
            name={seen ? 'check-all' : 'check'}
            size={16}
            title={t(seen ? 'message_seen' : 'message_sent')}
            className="text-(--text-success)"
        />
    )
}

/** The quoted message above a reply — whose it was and its first line (or "Photo"). */
function ReplyQuote({ reply, own }: { reply: ReplyMessage; own: boolean }) {
    const { t } = useTranslation()
    const quoted = messageText(reply)
    const thumb = reply.images[0]?.url ?? null
    return (
        <div
            className={cn(
                'mx-2 mt-2 flex min-w-[160px] items-center gap-2 rounded-(--radius-md) p-2',
                'border-s-2 border-solid',
                own
                    ? 'border-(--text-link) bg-(--background-surface)'
                    : 'border-(--text-link) bg-(--background-subtle)',
            )}
        >
            {thumb && (
                <Image
                    src={thumb}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 flex-none rounded-(--radius-sm) object-cover"
                />
            )}
            <span className="flex min-w-0 flex-col">
                <span className="truncate type-caption-label-strong text-(--text-link)">
                    {reply.sender?.name ?? t('message_inactive_user')}
                </span>
                <span className="truncate type-caption-meta text-(--text-body)">
                    {quoted ?? t('message_preview_photo')}
                </span>
            </span>
        </div>
    )
}

/** Text with its `http(s)` runs as links — the only markup a message ever gets. */
function LinkedText({ text }: { text: string }) {
    const parts: ReactNode[] = []
    splitLinks(text).forEach((part, index) => {
        const key = `${index}-${part.value.slice(0, 12)}`
        if (part.kind === 'text') {
            parts.push(<span key={key}>{part.value}</span>)
            return
        }
        const href = safeExternalUrl(part.href)
        parts.push(
            href ? (
                <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--text-link) underline [overflow-wrap:anywhere]"
                >
                    {part.value}
                </a>
            ) : (
                <span key={key}>{part.value}</span>
            ),
        )
    })
    return <>{parts}</>
}
