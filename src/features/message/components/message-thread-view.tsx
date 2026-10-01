'use client'

import type { Channel } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, InlineMenuItem } from '../api/types'
import { DISC } from '../lib/disc'
import { formatDayLabel, groupByDay, type PendingMessage } from '../lib/message-thread'
import { THREAD_SCROLLBAR } from '../lib/room-ground'
import { ChannelIntro } from './chat-walls'
import { MessageBubble } from './message-bubble'
import { MessagePhotoViewer } from './message-photo-viewer'

/** How far from the top the older page is asked for — legacy's `LOAD_MORE_THRESHOLD`. */
const LOAD_OLDER_PX = 200
/** How far from the bottom "jump to latest" appears — legacy shows it after 50px. */
const JUMP_PX = 160

/**
 * The scrolling thread: the space's intro once the beginning is loaded, the days, the messages still
 * being sent, and the way back to the latest.
 *
 * ## `flex-col-reverse`, and why the scroll position needs no code
 *
 * The scroller lays out **from the bottom** (legacy does the same), so it opens at the latest message
 * with no `scrollTo` after load, a new message at the bottom keeps a reader who is at the bottom at
 * the bottom, and an older page arriving at the top does not move what the reader is looking at —
 * the three behaviours a chat needs and the three a top-anchored list gets wrong, each needing a
 * measurement and an effect. `scrollTop` is then 0 at the bottom and negative going up, in every
 * engine this app supports.
 *
 * ## Jump to latest
 *
 * Shown once the reader is more than `JUMP_PX` above the bottom, with the number of the other side's
 * messages that arrived since. Legacy increments that number on **every** `new_message` frame for any
 * conversation, including the reader's own sends.
 */
export function MessageThreadView({
    channel,
    messages,
    pending,
    isOwn,
    hasOlder,
    isFetchingOlder,
    loadOlder,
    locale,
    footer,
    unreadFrom = null,
    onReply,
    onEdit,
    onDelete,
    onCopy,
    onInline,
    onRetry,
    onDiscard,
}: {
    channel: Channel | null
    messages: ChatMessage[]
    pending: PendingMessage[]
    isOwn: (message: ChatMessage) => boolean
    hasOlder: boolean
    isFetchingOlder: boolean
    loadOlder: () => void
    locale: string
    /** A wall or the Get started panel, drawn after the last message. */
    footer?: ReactNode
    /** The first message the reader had not read when the room opened — "Unread messages" goes above it. */
    unreadFrom?: string | null
    onReply: (message: ChatMessage) => void
    onEdit: (message: ChatMessage) => void
    onDelete: (message: ChatMessage, both: boolean) => void
    onCopy: (message: ChatMessage) => void
    onInline: (message: ChatMessage, item: InlineMenuItem) => void
    onRetry: (localId: string) => void
    onDiscard: (localId: string) => void
}) {
    const { t } = useTranslation()
    const scroller = useRef<HTMLDivElement | null>(null)
    /* The same node as state, for the cards that measure "near the screen" against it. */
    const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
    const attachScroller = useCallback((node: HTMLDivElement | null) => {
        scroller.current = node
        setScrollRoot(node)
    }, [])

    /*
     * Open at the divider rather than at the bottom — iOS's behaviour, and the point of having one:
     * a reader with thirty unread lands on the first of them. Once, and only if it is above the fold.
     */
    const divider = useRef<HTMLDivElement>(null)
    const scrolledToUnread = useRef(false)
    useEffect(() => {
        const node = divider.current
        const root = scroller.current
        if (!node || !root || scrolledToUnread.current) return
        scrolledToUnread.current = true
        if (node.getBoundingClientRect().top < root.getBoundingClientRect().top) {
            node.scrollIntoView({ block: 'start' })
        }
    })
    const [awayFromBottom, setAwayFromBottom] = useState(false)
    const [unseen, setUnseen] = useState(0)
    const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null)

    const days = useMemo(() => groupByDay(messages), [messages])
    const now = Date.now()

    const onScroll = useCallback(() => {
        const node = scroller.current
        if (!node) return
        const fromBottom = Math.abs(node.scrollTop)
        const away = fromBottom > JUMP_PX
        setAwayFromBottom(away)
        if (!away) setUnseen(0)
        if (fromBottom + node.clientHeight >= node.scrollHeight - LOAD_OLDER_PX) loadOlder()
    }, [loadOlder])

    /* A short thread never scrolls, so the older page is asked for from here too. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `messages.length` is the trigger — a new page changes the height the effect measures.
    useEffect(() => {
        const node = scroller.current
        if (!node || !hasOlder || isFetchingOlder) return
        if (node.scrollHeight <= node.clientHeight + LOAD_OLDER_PX) loadOlder()
    }, [hasOlder, isFetchingOlder, loadOlder, messages.length])

    /* Count the other side's arrivals while the reader is scrolled up. */
    const newest = messages[messages.length - 1]
    const previousNewest = useRef<string | null>(null)
    useEffect(() => {
        if (!newest) return
        const before = previousNewest.current
        previousNewest.current = newest.id
        if (before && before !== newest.id && awayFromBottom && !isOwn(newest)) {
            setUnseen(count => count + 1)
        }
    }, [newest, awayFromBottom, isOwn])

    const jump = () => {
        scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
        setUnseen(0)
    }

    const openImage = (message: ChatMessage, index: number) =>
        setViewer({
            index,
            urls: message.images.flatMap(image => (image.url ? [image.url] : [])),
        })

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div
                ref={attachScroller}
                data-testid="message-thread"
                onScroll={onScroll}
                className={cn(
                    'flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain',
                    THREAD_SCROLLBAR,
                )}
            >
                <div className="mx-auto flex w-full max-w-[640px] flex-col gap-1 px-3 py-3">
                    {isFetchingOlder && (
                        <div className="flex justify-center py-2">
                            <Loader label={t('common_loading')} />
                        </div>
                    )}
                    {!hasOlder && channel && <ChannelIntro channel={channel} />}

                    {/* Days are a list of lists; the chip is each list's heading. */}
                    {days.map(day => (
                        <section
                            key={day.key}
                            aria-label={formatDayLabel(day.day, locale, now)}
                            className="flex flex-col gap-1"
                        >
                            <h3 className="sticky top-2 z-10 my-2 self-center rounded-(--radius-fill) bg-(--opacity-black-25) px-3 py-0.5 type-caption-meta text-(--white) backdrop-blur-[2.5px]">
                                {formatDayLabel(day.day, locale, now)}
                            </h3>
                            {day.messages.map(message => {
                                const own = isOwn(message)
                                return (
                                    <Fragment key={message.id}>
                                        {message.id === unreadFrom && (
                                            <div
                                                ref={divider}
                                                data-testid="message-thread-unread"
                                                /* `scroll-mt-10`: the open lands it just under the sticky day chip,
                                                   not beneath it. */
                                                className="my-2 flex scroll-mt-10 items-center gap-2 type-caption-label text-(--white)"
                                            >
                                                <span className="h-px flex-1 bg-(--opacity-white-50)" />
                                                <span className="rounded-(--radius-fill) bg-(--opacity-black-25) px-3 py-0.5 backdrop-blur-[2.5px]">
                                                    {t('message_unread_divider')}
                                                </span>
                                                <span className="h-px flex-1 bg-(--opacity-white-50)" />
                                            </div>
                                        )}
                                        <MessageBubble
                                            message={message}
                                            own={own}
                                            locale={locale}
                                            onReply={() => onReply(message)}
                                            onCopy={() => onCopy(message)}
                                            onEdit={own ? () => onEdit(message) : undefined}
                                            onDelete={both => onDelete(message, both)}
                                            onInline={item => onInline(message, item)}
                                            onOpenImage={index => openImage(message, index)}
                                            embedRoot={scrollRoot}
                                        />
                                    </Fragment>
                                )
                            })}
                        </section>
                    ))}

                    {pending.map(item => (
                        <MessageBubble
                            key={item.localId}
                            own
                            locale={locale}
                            status={item.status}
                            message={{
                                id: item.localId,
                                text: item.text,
                                markdown_text: null,
                                images: item.previews.map(url => ({ url, w: 0, h: 0 })),
                                attachments: [],
                                created_at: item.createdAt,
                                edited_at: null,
                                seen_by: {},
                                reply_message: item.replyTo,
                            }}
                            onRetry={() => onRetry(item.localId)}
                            onDiscard={() => onDiscard(item.localId)}
                        />
                    ))}

                    {footer}
                </div>
            </div>

            {awayFromBottom && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-end px-4">
                    <span className="pointer-events-auto relative">
                        {/* Legacy's `btnJumpToLatest`: a 40px white disc, a dark chevron. */}
                        <Button
                            data-testid="message-thread-jump"
                            variant="ghost"
                            size="large"
                            iconOnly
                            aria-label={t('message_jump_to_latest')}
                            onClick={jump}
                            className={cn(DISC, 'size-10')}
                        >
                            <Icon name="angle-down" size={24} className="size-6" />
                        </Button>
                        {unseen > 0 && (
                            <span
                                aria-hidden="true"
                                className="absolute -top-2 start-1/2 min-w-5 -translate-x-1/2 rounded-(--radius-fill) bg-(--text-link) px-1 text-center type-caption-label text-(--text-on-accent) rtl:translate-x-1/2"
                            >
                                {unseen > 99 ? '99+' : unseen}
                            </span>
                        )}
                    </span>
                </div>
            )}

            {viewer && (
                <MessagePhotoViewer
                    urls={viewer.urls}
                    startIndex={viewer.index}
                    onClose={() => setViewer(null)}
                />
            )}
        </div>
    )
}
