'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { NotificationBadge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { SearchBar } from '@shared/ui/search-bar'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import { useRouter } from 'next/navigation'
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { CONVERSATION_FILTER, type Conversation, type ConversationFilter } from '../api/types'
import { useChatActions } from '../hooks/use-chat-actions'
import { useConversationActions } from '../hooks/use-conversation-actions'
import { useConversationLive } from '../hooks/use-conversation-live'
import { useConversationSearch } from '../hooks/use-conversation-search'
import { useConversations } from '../hooks/use-conversations'
import { useUnreadConversations } from '../hooks/use-unread-conversations'
import { MESSAGE_ART } from '../lib/illustrations'
import { MESSAGES_PATH } from '../routes'
import { ChatRoom } from './chat-room'
import { ConversationList } from './conversation-list'
import { ConversationSkeleton } from './conversation-skeleton'

/**
 * `/messages` — the conversation list, and on a wide screen the empty chat pane beside it.
 *
 * ## Layout: legacy's, on this app's surfaces
 *
 * Legacy draws two white panes, 390px and the rest, 2px apart inside a 12px inset, capped at
 * 1504px and exactly one window tall — each pane scrolls on its own, which is what a chat client
 * needs (the list must not scroll away under an open conversation). That is kept from `md` up.
 * Below `md` there is one pane and the **page** scrolls: legacy's phone layout is a fixed-height box
 * too, which costs the browser's own momentum and address-bar collapse for nothing. The header
 * (title, search, tabs) is sticky in both — to the viewport on a phone, to the pane on a desktop.
 *
 * Surfaces follow DESIGN_SYSTEM §6: `--background-surface` full-bleed below `md`, cards from `md`.
 * The two cards share one rounded outline — the list takes the start corners and the chat pane the
 * end ones, so the 2px gap between them reads as a split rather than as two floating cards.
 *
 * ## Two routes, one screen
 *
 * `/messages` renders this with nothing selected; `/@{slug}/messages` with `selectedSlug`, and the
 * pane beside the list becomes that conversation (`ChatRoom`). One component rather than two pages
 * sharing a layout, because the list must **not remount** when the reader moves between
 * conversations — its scroll position, search and folder are the reader's place in the inbox.
 * Below `md` a selected conversation replaces the list instead of sitting beside it.
 *
 * Not here yet: legacy's settings sheet ("who can message me" and the share-your-inbox link), which
 * needs `messaging_settings` on the channel write first.
 */
const PANE = 'bg-(--background-surface)'

const TABS: { id: ConversationFilter; label: string }[] = [
    { id: CONVERSATION_FILTER.all, label: 'message_tab_all' },
    { id: CONVERSATION_FILTER.unread, label: 'message_tab_unread' },
]

/** One clock for the list, ticking each minute so "5 min. ago" does not stay 5 forever. */
function useMinuteClock(): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])
    return now
}

export function MessagesView({ selectedSlug }: { selectedSlug?: string } = {}) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping, isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const router = useRouter()
    /** A conversation is open beside (or, on a phone, instead of) the list. */
    const open = !!selectedSlug

    const [tab, setTab] = useState<ConversationFilter>(CONVERSATION_FILTER.all)
    const search = useConversationSearch()
    const unreadCount = useUnreadConversations()
    const chatActions = useChatActions()
    const { deletingId, remove, markSeen } = useConversationActions()
    useConversationLive()
    const now = useMinuteClock()

    /** The conversation a Delete is being confirmed for. */
    const [confirming, setConfirming] = useState<Conversation | null>(null)

    const shared = {
        chatActions,
        deletingId,
        locale: currentLanguage,
        now,
        onOpen: markSeen,
        onDelete: setConfirming,
        selectedSlug,
    }

    const errorState = (retry: () => void) => (
        <ChannelEmptyState
            testId="message-error"
            className={cn('flex-1 py-12', RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('message_error_title')}
            body={t('message_error_body')}
            action={
                <Button
                    data-testid="message-retry"
                    variant="secondary"
                    size="large"
                    onClick={retry}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    )

    const body = isBootstrapping ? (
        <ConversationSkeleton />
    ) : !isAuthenticated ? (
        <ChannelEmptyState
            testId="message-signed-out"
            className={cn('flex-1 py-12', RISE)}
            icon="comment-dots"
            title={t('message_signed_out_title')}
            body={t('message_signed_out_body')}
            action={
                /* The button *is* the gate: `useRequireAuth` raises the dialog, and once there is
                   an account this branch stops rendering on its own. */
                <Button
                    data-testid="message-sign-in"
                    variant="primary"
                    size="large"
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    ) : !search.isIdle ? (
        <ConversationList
            {...shared}
            testId="message-search-list"
            conversations={search.results}
            isLoading={search.isLoading}
            isError={search.isError}
            isEmpty={search.isEmpty}
            error={errorState(search.retry)}
            empty={
                <ChannelEmptyState
                    testId="message-search-empty"
                    className={cn('flex-1 py-12', RISE)}
                    art={MESSAGE_ART.noResults}
                    title={t('message_search_empty_title')}
                    body={t('message_search_empty_body')}
                />
            }
        />
    ) : (
        TABS.map(item =>
            item.id === tab ? (
                <div
                    key={item.id}
                    role="tabpanel"
                    id={`message-panel-${item.id}`}
                    aria-labelledby={`message-tab-${item.id}`}
                    className="flex flex-1 flex-col"
                >
                    <FolderPanel filter={item.id} errorState={errorState} {...shared} />
                </div>
            ) : null,
        )
    )

    return (
        <div
            className={cn(
                'mx-auto flex w-full flex-1 md:h-[var(--window-height)] md:max-w-[1504px] md:gap-0.5 md:p-3',
                /* A conversation is one window tall on a phone too: the thread scrolls inside it and
                   the composer stays on the bottom edge, as in every chat app. */
                open && 'h-[var(--window-height)]',
            )}
        >
            <section
                aria-label={t('message_title')}
                className={cn(
                    PANE,
                    'flex min-w-0 flex-1 flex-col md:w-[390px] md:flex-none md:overflow-y-auto md:overscroll-contain',
                    open && 'hidden md:flex',
                    'md:rounded-s-[var(--radius-xl)] md:[scrollbar-width:thin]',
                )}
            >
                <div className={cn(PANE, 'sticky top-0 z-20 flex flex-col')}>
                    <div className="flex h-14 items-center px-4">
                        <h1 className="type-title-t1-bold text-(--text-title)">
                            {t('message_title')}
                        </h1>
                    </div>
                    {isAuthenticated && (
                        <>
                            <div className="px-4 pb-2">
                                <SearchBar
                                    data-testid="message-search-input"
                                    value={search.search}
                                    onValueChange={search.setSearch}
                                    label={t('message_search_label')}
                                    clearLabel={t('message_search_clear')}
                                    placeholder={t('message_search_label')}
                                />
                            </div>
                            {search.isIdle && (
                                <SegmentedControl
                                    role="tablist"
                                    aria-label={t('message_tabs_label')}
                                    variant="underline"
                                >
                                    {TABS.map(item => (
                                        <SegmentedControlItem
                                            key={item.id}
                                            data-testid="message-tab"
                                            data-tab-id={item.id}
                                            id={`message-tab-${item.id}`}
                                            aria-controls={`message-panel-${item.id}`}
                                            variant="underline"
                                            selected={item.id === tab}
                                            onClick={() => setTab(item.id)}
                                            className="justify-center gap-1"
                                        >
                                            <SegmentedControlItemLabel className="flex-none">
                                                {t(item.label)}
                                            </SegmentedControlItemLabel>
                                            {item.id === CONVERSATION_FILTER.unread &&
                                                unreadCount !== null &&
                                                unreadCount > 0 && (
                                                    <NotificationBadge
                                                        type="count"
                                                        size="small"
                                                        className="bg-(--text-placeholder)"
                                                    >
                                                        <span aria-hidden="true">
                                                            {unreadCount > 99 ? '99+' : unreadCount}
                                                        </span>
                                                        <span className="sr-only">
                                                            {t('message_unread_count', {
                                                                count: unreadCount,
                                                            })}
                                                        </span>
                                                    </NotificationBadge>
                                                )}
                                        </SegmentedControlItem>
                                    ))}
                                </SegmentedControl>
                            )}
                        </>
                    )}
                </div>
                <div className="flex flex-1 flex-col pb-5">{body}</div>
            </section>

            {open && selectedSlug ? (
                <section
                    aria-label={t('message_conversation_label')}
                    className={cn(
                        PANE,
                        'flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-e-[var(--radius-xl)]',
                    )}
                >
                    {/* Keyed on the slug: moving to another conversation is a new room — its
                        draft, reply and pending sends belong to the one being left. */}
                    <ChatRoom key={selectedSlug.toLowerCase()} slug={selectedSlug} />
                </section>
            ) : (
                <section
                    aria-label={t('message_no_chat_title')}
                    className={cn(
                        PANE,
                        'hidden min-w-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center md:flex',
                        'md:rounded-e-[var(--radius-xl)]',
                    )}
                >
                    <h2 className="type-heading-h1-bold text-(--text-title)">
                        {t('message_no_chat_title')}
                    </h2>
                    <p className="max-w-[400px] type-body-default text-(--text-body)">
                        {t('message_no_chat_body')}
                    </p>
                </section>
            )}

            {/*
             * Delete is confirmed: the conversation goes from this account's list and its history
             * with it, and nothing in this client can bring it back. `destructive`, and
             * `ConfirmDialog` puts focus on Cancel.
             */}
            <ConfirmDialog
                testId="message-delete-confirm"
                open={confirming !== null}
                onOpenChange={open => {
                    if (!open) setConfirming(null)
                }}
                title={t('message_confirm_delete_title')}
                description={t('message_confirm_delete_body')}
                confirmLabel={t('message_delete')}
                destructive
                pending={deletingId !== null}
                onConfirm={() => {
                    if (confirming) {
                        remove(confirming)
                        // Deleting the conversation that is open leaves nothing to show beside the list.
                        const slug = confirming.recipient?.channel_slug
                        if (
                            slug &&
                            selectedSlug &&
                            slug.toLowerCase() === selectedSlug.toLowerCase()
                        ) {
                            router.push(MESSAGES_PATH)
                        }
                    }
                    // Closed on press: the mutation's toast reports the outcome.
                    setConfirming(null)
                }}
            />
        </div>
    )
}

/**
 * One folder, mounted only while its tab is selected — so only the folder on screen fetches, and
 * switching back is served from the query cache.
 */
function FolderPanel({
    filter,
    errorState,
    ...shared
}: {
    filter: ConversationFilter
    errorState: (retry: () => void) => ReactNode
} & Omit<
    ComponentProps<typeof ConversationList>,
    | 'conversations'
    | 'isLoading'
    | 'isError'
    | 'isEmpty'
    | 'error'
    | 'empty'
    | 'testId'
    | 'hasNextPage'
    | 'isFetchingNextPage'
    | 'loadMore'
>) {
    const { t } = useTranslation()
    const folder = useConversations(filter)
    const unread = filter === CONVERSATION_FILTER.unread

    return (
        <ConversationList
            {...shared}
            testId={unread ? 'message-unread-list' : 'message-all-list'}
            conversations={folder.conversations}
            isLoading={folder.isLoading}
            isError={folder.isError}
            isEmpty={folder.isEmpty}
            hasNextPage={folder.hasNextPage}
            isFetchingNextPage={folder.isFetchingNextPage}
            loadMore={folder.loadMore}
            error={errorState(folder.refetch)}
            empty={
                <ChannelEmptyState
                    testId={unread ? 'message-unread-empty' : 'message-empty'}
                    className={cn('flex-1 py-12', RISE)}
                    art={MESSAGE_ART.empty}
                    title={t(unread ? 'message_unread_empty_title' : 'message_empty_title')}
                    body={t(unread ? 'message_unread_empty_body' : 'message_empty_body')}
                />
            }
        />
    )
}
