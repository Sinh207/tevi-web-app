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
import { usePathname, useRouter } from 'next/navigation'
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { CONVERSATION_FILTER, type Conversation, type ConversationFilter } from '../api/types'
import { useChatActions } from '../hooks/use-chat-actions'
import { useConversationActions } from '../hooks/use-conversation-actions'
import { useConversationLive } from '../hooks/use-conversation-live'
import { useConversationSearch } from '../hooks/use-conversation-search'
import { useConversations } from '../hooks/use-conversations'
import { useUnreadConversations } from '../hooks/use-unread-conversations'
import { MESSAGE_ART } from '../lib/illustrations'
import { MESSAGES_PATH, slugFromMessagesPath } from '../routes'
import { ConversationList } from './conversation-list'
import { ConversationSkeleton } from './conversation-skeleton'

/**
 * Direct messages' frame — mounted by `app/(web)/(main)/(dm)/layout.tsx` around both
 * `/messages` and `/@{slug}/messages`.
 *
 * ## Two panes, each its own scroller, and the page never scrolls
 *
 * ```
 * ┌ frame: exactly one window tall (less the tab bar on /messages, phone only)
 * │ ┌ ConversationPane ──────┐ ┌ children: the room pane ─────────────────┐
 * │ │ title · search · tabs  │ │ ChatRoom: header                         │
 * │ │ ┌ scroller ──────────┐ │ │           ┌ thread scroller ───────────┐ │
 * │ │ │ conversation rows  │ │ │           │ messages                   │ │
 * │ │ └────────────────────┘ │ │           └────────────────────────────┘ │
 * │ └────────────────────────┘ │           composer                       │
 * │                            └──────────────────────────────────────────┘
 * ```
 *
 * Every box on the way down is `min-h-0` inside a flex column, which is what lets the *inner*
 * scroller shrink to the space left rather than growing the pane — miss it on one level and that
 * level overflows, and the page scrolls instead (the bug this layout replaced: the list's header
 * scrolled away with the page on a phone, and the whole list pane scrolled on a desktop).
 *
 * ## Why it is a layout and not part of each page
 *
 * A layout survives navigation between its pages, so moving from one conversation to the next — or
 * back to `/messages` — keeps the list **mounted**: its scroll position, search and folder are the
 * reader's place in the inbox. As two pages that each rendered the list, every row press remounted
 * it at the top.
 *
 * Below `md` there is one pane: the list on `/messages`, the room on a conversation. From `md` both
 * are shown, legacy's 390px list beside the room, 2px apart in a 12px inset, capped at 1504px.
 * Surfaces follow DESIGN_SYSTEM §6: `--background-surface` full-bleed on a phone, two cards sharing
 * one rounded outline from `md`.
 */
const PANE = 'bg-(--background-surface)'

export function MessagesShell({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const pathname = usePathname()
    const selectedSlug = slugFromMessagesPath(pathname) ?? undefined
    const open = selectedSlug !== undefined

    return (
        <div
            className={cn(
                'mx-auto flex w-full overflow-hidden md:h-[var(--window-height)] md:max-w-[1504px] md:gap-0.5 md:p-3',
                /*
                 * `84px` is the phone tab bar's reserve — `TabBarShell`'s `pb-[84px]`. `/messages`
                 * is a tab destination, so its frame is the window less the bar; a conversation is
                 * not, so it is the whole window. The two numbers must agree or the page scrolls by
                 * the difference. Written out rather than interpolated: Tailwind only generates
                 * classes it can read as a literal.
                 */
                open ? 'h-[var(--window-height)]' : 'h-[calc(var(--window-height)-84px)]',
            )}
        >
            <ConversationPane
                selectedSlug={selectedSlug}
                className={cn(open && 'hidden md:flex')}
            />
            <section
                aria-label={t(open ? 'message_conversation_label' : 'message_no_chat_title')}
                className={cn(
                    PANE,
                    'min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:rounded-e-[var(--radius-xl)]',
                    open ? 'flex' : 'hidden md:flex',
                )}
            >
                {children}
            </section>
        </div>
    )
}

/** `/messages`' room pane: nothing is open. Only drawn from `md` — below it the list is the screen. */
export function NoChatSelected() {
    const { t } = useTranslation()
    return (
        <div
            data-testid="message-no-chat"
            className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center"
        >
            <h2 className="type-heading-h1-bold text-(--text-title)">
                {t('message_no_chat_title')}
            </h2>
            <p className="max-w-[400px] type-body-default text-(--text-body)">
                {t('message_no_chat_body')}
            </p>
        </div>
    )
}

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
function ConversationPane({
    selectedSlug,
    className,
}: {
    selectedSlug?: string
    className?: string
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

    const shared = {
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
                'flex min-h-0 min-w-0 flex-1 flex-col md:w-[390px] md:flex-none md:rounded-s-[var(--radius-xl)]',
                className,
            )}
        >
            {/* Fixed: outside the scroller, so it can never scroll away. */}
            <div className="flex flex-none flex-col">
                <div className="flex h-14 items-center px-4">
                    <h1 className="type-title-t1-bold text-(--text-title)">{t('message_title')}</h1>
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
