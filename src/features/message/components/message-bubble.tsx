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
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ChatMessage, InlineMenuItem, ReplyMessage } from '../api/types'
import { DISC } from '../lib/disc'
import { messageEmbed, teviPath } from '../lib/message-link'
import { formatMessageTime, messageText, splitLinks } from '../lib/message-thread'
import { PHOTO_SIZE, type PhotoTile, photoLayout } from '../lib/photo-layout'
import { MessageEmbed } from './message-embed'

/**
 * One message — legacy's `itemMessage/common/layout` with its text, image and reply parts.
 *
 * The DS draws no chat bubble (the Figma library has the conversation *list* and nothing inside a
 * conversation), so the geometry is legacy's — 80% max width, 12px radius, 8px padding, time at the
 * foot — on this app's surfaces: the other side's message is `--background-surface` on the
 * thread's ground takes legacy's own fills — `--background-bubble-own` (`#FDFFDD`) and
 * `--background-bubble-other` (`#FAFAFA`), named in `globals.css` with a dark pair legacy never had. Legacy's
 * `#FDFFDD` / `#fafafa` on a purple photograph have no dark mode at all.
 *
 * ## What is rendered, and what is not yet
 *
 * Text (with links), photos, replies, bot buttons, and a card for a Premium gift, a space (or its
 * mini app) or a post (`messageEmbed` decides, `MessageEmbed` draws). Legacy also cards collections,
 * events and external sites; those stay links — `message-link.ts` says why.
 *
 * ## Nothing here is HTML
 *
 * Legacy renders `html_text` with `dangerouslySetInnerHTML`, i.e. the other person's markup as ours.
 * This renders `text` as text nodes and turns `http(s)` runs into links: a Tevi link navigates in
 * this tab (`teviPath`), anything else goes through `safeExternalUrl` into a new tab with
 * `noopener noreferrer`.
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
    embedRoot,
}: {
    message: Pick<
        ChatMessage,
        | 'id'
        | 'text'
        | 'markdown_text'
        | 'images'
        | 'created_at'
        | 'edited_at'
        | 'seen_by'
        | 'attachments'
    > & {
        sender?: ChatMessage['sender']
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
    /** The thread's scroller, which a card waits to come near before it fetches. */
    embedRoot?: Element | null
}) {
    const { t } = useTranslation()
    const text = messageText(message)
    const embed = status === 'sent' ? messageEmbed(message) : null
    const gift = embed?.kind === 'gift'
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
                        // Legacy's fills: pale yellow for the reader's own, near-white for theirs.
                        own ? 'bg-(--background-bubble-own)' : 'bg-(--background-bubble-other)',
                        status === 'failed' && 'ring-1 ring-(--text-error)',
                    )}
                >
                    {message.reply_message && (
                        <ReplyQuote
                            reply={message.reply_message}
                            own={own}
                            self={sameSender(message.reply_message.sender, message.sender)}
                        />
                    )}

                    {/*
                     * Legacy's order inside an image message: the caption **above** the photos, as
                     * wide as they are — `w-0 min-w-full` lets the photos set the width and the text
                     * wrap to it instead of stretching the bubble.
                     */}
                    {/* A gift's text is its `tevi://` link, which says nothing to a reader — the card
                        says it instead. */}
                    {!gift && text ? (
                        <p
                            className={cn(
                                'px-2 pt-2 type-dense-default whitespace-pre-wrap break-words text-(--text-title) [overflow-wrap:anywhere]',
                                message.images.length > 0 && 'w-0 min-w-full',
                            )}
                        >
                            <LinkedText text={text} />
                        </p>
                    ) : null}

                    {embed && (
                        <MessageEmbed
                            embed={embed}
                            own={own}
                            senderSlug={
                                message.sender?.channel_slug ?? message.sender?.slug ?? null
                            }
                            root={embedRoot}
                        />
                    )}

                    {message.images.length > 0 && (
                        <MessagePhotos
                            urls={message.images.flatMap(image => (image.url ? [image.url] : []))}
                            label={t('message_open_photo')}
                            onOpen={index => onOpenImage?.(index)}
                            spaced={!!text || !!message.reply_message}
                        />
                    )}

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
                            {/* "For me" on either side, as both apps offer it (`isOwn` gates only the
                                second row): it hides a copy on this account, nothing more. */}
                            {onDelete && (
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

/** A tile's box, per `photoLayout`'s sizes — responsive tiles step up at `sm`, as legacy's do. */
const TILE_CLASS: Record<PhotoTile, string> = {
    large: 'size-[144px]',
    small: 'size-[95px]',
    responsive: 'size-[95px] sm:size-[144px]',
}

/**
 * A message's photos — legacy's `itemMessage/image`, tile for tile: a 290 × 323 portrait for one,
 * square 144 / 95px tiles 1px apart for more (`photoLayout`). The portrait keeps its proportions
 * rather than its width on a phone too narrow for it — legacy's fixed 290 is wider than the bubble
 * there and gets cropped.
 */
function MessagePhotos({
    urls,
    label,
    onOpen,
    spaced,
}: {
    urls: string[]
    label: string
    onOpen: (index: number) => void
    /** Something sits above the photos (a caption or a quote) — legacy's 4px gap. */
    spaced: boolean
}) {
    const layout = photoLayout(urls.length)
    const tile = (index: number, className: string, width: number) => (
        <button
            // two photos may share a URL, and a message's photos never reorder — the position is their identity.
            key={`${index}-${urls[index]}`}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={label}
            className={cn(
                'relative block flex-none overflow-hidden outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)',
                className,
            )}
        >
            {/* A photo still being sent is a `blob:` preview, which the optimiser cannot fetch. */}
            <Image
                src={urls[index]}
                alt=""
                fill
                sizes={`${width}px`}
                unoptimized={urls[index].startsWith('blob:')}
                className="object-cover"
            />
        </button>
    )

    return (
        <div className={cn('flex flex-col gap-px', spaced && 'mt-1')}>
            {layout.kind === 'single'
                ? tile(0, 'aspect-[290/323] w-[290px] max-w-full', PHOTO_SIZE.singleWidth)
                : layout.rows.map(row => (
                      <div key={row.indices.join('-')} className="flex gap-px">
                          {row.indices.map(index =>
                              tile(
                                  index,
                                  TILE_CLASS[row.tile],
                                  row.tile === 'small' ? PHOTO_SIZE.small : PHOTO_SIZE.large,
                              ),
                          )}
                      </div>
                  ))}
        </div>
    )
}

/** Whether two senders are one account — by alias where both have one, else by space slug. */
function sameSender(a: ReplyMessage['sender'] | undefined, b: ChatMessage['sender'] | undefined) {
    if (!a || !b) return false
    if (a.alias && b.alias) return a.alias === b.alias
    const slugA = a.channel_slug ?? a.slug
    const slugB = b.channel_slug ?? b.slug
    return !!slugA && slugA === slugB
}

/**
 * The quoted message above a reply — legacy's `itemMessage/reply`: tinted by the side it sits on
 * (green on the reader's own, blue on theirs, a 2px rule in the same colour at the start edge), the
 * quoted photo or else its sender's avatar at 44px, then whose it was — "Myself" when a message
 * quotes its own sender — and its first line, or "Photo".
 */
function ReplyQuote({ reply, own, self }: { reply: ReplyMessage; own: boolean; self: boolean }) {
    const { t } = useTranslation()
    const quoted = messageText(reply)
    const thumb = reply.images[0]?.url ?? reply.sender?.avatar?.thumb ?? null
    return (
        <div
            className={cn(
                'mx-2 mt-2 flex min-w-[155px] items-start gap-2 rounded-(--radius-lg) p-2',
                'border-s-2 border-solid',
                own
                    ? 'border-(--text-success) bg-(--background-bubble-quote-own)'
                    : 'border-(--text-link) bg-(--background-bubble-quote-other)',
            )}
        >
            {thumb && (
                <Image
                    src={thumb}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 flex-none rounded-[4px] object-cover"
                />
            )}
            <span className="flex min-w-0 flex-col gap-1">
                <span
                    className={cn(
                        'truncate type-dense-emphasis',
                        own ? 'text-(--text-success)' : 'text-(--text-link)',
                    )}
                >
                    {self
                        ? t('message_reply_myself')
                        : (reply.sender?.name ?? t('message_inactive_user'))}
                </span>
                <span className="w-[200px] max-w-full truncate type-dense-default text-(--text-title)">
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
        const inApp = teviPath(part.href)
        if (inApp) {
            parts.push(
                <Link
                    key={key}
                    href={inApp}
                    className="text-(--text-link) underline [overflow-wrap:anywhere]"
                >
                    {part.value}
                </Link>,
            )
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
