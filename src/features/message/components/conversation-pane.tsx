'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState, useMyChannel } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { NotificationBadge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { SearchBar } from '@shared/ui/search-bar'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import dynamic from 'next/dynamic'
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
import { ConversationList } from './conversation-list'
import { ConversationSkeleton } from './conversation-skeleton'

/* Opened rarely — its chunk (and the membership read it makes) waits for the gear. */
const MessageSettingsDialog = dynamic(() =>
    import('./message-settings-dialog').then(module => module.MessageSettingsDialog),
)

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

/**
 * The conversation list: a fixed header (title, search, folders) over a scroller that holds the
 * rows and nothing else. The scroller is also the `root` the rows' pagination sentinel observes
 * against, so the next page is asked for a screen early *within the pane*.
 */
export function ConversationPane({
    selectedSlug,
    className,
    variant = 'page',
    expanded = true,
    headerActions,
    onHeaderPress,
    onSelect,
    footer,
}: {
    selectedSlug?: string
    className?: string
    /**
     * `page` is `/messages`' pane; `popup` is the floating window's — its title is an `h2` (the
     * page it floats over has its own `h1`), its bar is the window's 64px bar, and it takes no
     * rounding of its own (the window has it).
     */
    variant?: 'page' | 'popup'
    /** The floating window is open — what its bar's `aria-expanded` says. */
    expanded?: boolean
    /** Controls at the end of the title bar — the window's open-in-full and collapse. */
    headerActions?: ReactNode
    /** Pressing the title bar itself — the window collapses, as legacy's does. */
    onHeaderPress?: () => void
    /** Open a row in place rather than on its route. */
    onSelect?: (slug: string) => void
    /** Pinned under the list — the window's "See all in Chats". */
    footer?: ReactNode
}) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping, isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const router = useRouter()

    const [tab, setTab] = useState<ConversationFilter>(CONVERSATION_FILTER.all)
    const search = useConversationSearch()
    const unreadCount = useUnreadConversations()
    const chatActions = useChatActions()
    const { deletingId, remove, markSeen } = useConversationActions()
    useConversationLive()
    const now = useMinuteClock()
    /** The scroller as state, not a ref: the sentinel's observer must re-attach once it exists. */
    const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)

    /** The conversation a Delete is being confirmed for. */
    const [confirming, setConfirming] = useState<Conversation | null>(null)

    const { hasChannel } = useMyChannel()
    const [settingsOpen, setSettingsOpen] = useState(false)
    /* Mounted from the first open on, so closing it can animate and its Share sheet can outlive it. */
    const [settingsUsed, setSettingsUsed] = useState(false)
    const popup = variant === 'popup'
    const Title = popup ? 'h2' : 'h1'

    const shared = {
        onSelect,
        chatActions,
        deletingId,
        locale: currentLanguage,
        now,
        onOpen: markSeen,
        onDelete: setConfirming,
        selectedSlug,
        scrollRoot,
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
        <section
            aria-label={t('message_title')}
            className={cn(
                PANE,
                'flex min-h-0 min-w-0 flex-1 flex-col',
                !popup && 'md:w-[390px] md:flex-none md:rounded-s-[var(--radius-xl)]',
                className,
            )}
        >
            {/* Fixed: outside the scroller, so it can never scroll away. */}
            <div className="flex flex-none flex-col">
                <div className={cn('flex items-center gap-1 ps-4 pe-2', popup ? 'h-16' : 'h-14')}>
                    {onHeaderPress ? (
                        /* The bar is the window's handle (legacy's whole-bar click), as a real
                           button so a keyboard can collapse it too. */
                        <Title className="min-w-0 flex-1 type-title-t1-bold text-(--text-title)">
                            <button
                                type="button"
                                data-testid="message-popup-bar"
                                aria-expanded={expanded}
                                onClick={onHeaderPress}
                                className="w-full rounded-(--radius-md) text-start outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                            >
                                {t('message_title')}
                            </button>
                        </Title>
                    ) : (
                        <Title className="min-w-0 flex-1 type-title-t1-bold text-(--text-title)">
                            {t('message_title')}
                        </Title>
                    )}
                    {/* Legacy's gear — who may start a conversation with the reader. A space's
                        setting, so an account without a space has nothing to set. */}
                    {isAuthenticated && hasChannel && (
                        <Button
                            data-testid="message-settings-trigger"
                            variant="ghost"
                            size="large"
                            iconOnly
                            aria-label={t('message_settings_title')}
                            onClick={() => {
                                setSettingsUsed(true)
                                setSettingsOpen(true)
                            }}
                            className="size-10 flex-none"
                        >
                            <Icon name="gear" size={24} className="size-6" />
                        </Button>
                    )}
                    {headerActions}
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

            {/* The pane's only scroller. `min-h-full` inside lets an empty state centre itself. */}
            <div
                ref={setScrollRoot}
                data-testid="message-list-scroller"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
            >
                <div className="flex min-h-full flex-col pb-5">{body}</div>
            </div>
            {isAuthenticated && footer}
            {settingsUsed && (
                <MessageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
        </section>
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
