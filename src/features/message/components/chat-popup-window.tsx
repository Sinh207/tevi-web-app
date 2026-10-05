'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { conversationPath, MESSAGES_PATH } from '../routes'
import { useChatPopupStore } from '../store/chat-popup-store'
import { ChatRoom } from './chat-room'
import { ConversationPane } from './conversation-pane'

/**
 * The window itself: 390px wide in the bottom-end corner, 640 tall open and one 64px bar closed,
 * legacy's geometry and its 300ms height transition. The list fills it; a conversation opens
 * **over** the list, as legacy's persistent drawer does, and Back returns to it.
 *
 * ## What stays mounted when it closes
 *
 * Closing only shortens the window, so the room — its draft, its scroll position, the photos being
 * uploaded — is still there when it opens again, which is legacy's behaviour. What is *not* mounted
 * is anything before the first open: a closed window is its title bar and nothing else, so a page
 * view that never opens it costs no conversation list and no socket subscriptions.
 *
 * ## Layering
 *
 * `z-30`: over the page and the end rail, under the mini-app player (`z-40`) and every dialog
 * (`z-50`) — a dialog raised from inside the window has to cover it.
 */
export function ChatPopupWindow() {
    const { activeId } = useAuth()
    const { expanded, slug, setExpanded, openRoom, closeRoom, setHosted, reset } =
        useChatPopupStore()
    const [everOpened, setEverOpened] = useState(expanded)
    useEffect(() => {
        if (expanded) setEverOpened(true)
    }, [expanded])

    // The openers read this: while it holds, a Send message opens here instead of navigating.
    useEffect(() => {
        setHosted(true)
        return () => setHosted(false)
    }, [setHosted])

    /* Another account is another inbox — the window closes on its list rather than keep showing a
       conversation the new account may not be in. */
    const account = useRef(activeId)
    useEffect(() => {
        if (account.current === activeId) return
        account.current = activeId
        reset()
        setEverOpened(false)
    }, [activeId, reset])

    const controls = (
        <WindowControls
            expanded={expanded}
            fullPath={slug ? conversationPath(slug) : MESSAGES_PATH}
            onToggle={() => setExpanded(!expanded)}
            onLeave={reset}
        />
    )

    return (
        <div
            data-testid="message-popup"
            data-open={expanded || undefined}
            className={cn(
                'fixed end-4 bottom-2.5 z-30 flex w-[390px] flex-col overflow-hidden',
                'rounded-(--radius-xl) bg-(--background-surface) shadow-lg',
                'transition-[height] duration-300 ease-in-out motion-reduce:transition-none',
                expanded ? 'h-[min(640px,calc(100dvh-20px))]' : 'h-16',
            )}
        >
            {!everOpened ? (
                <ClosedBar controls={controls} onOpen={() => setExpanded(true)} />
            ) : slug ? (
                <ChatRoom
                    key={slug.toLowerCase()}
                    slug={slug}
                    onBack={closeRoom}
                    headerExtra={controls}
                />
            ) : (
                <ConversationPane
                    variant="popup"
                    expanded={expanded}
                    onHeaderPress={() => setExpanded(!expanded)}
                    headerActions={controls}
                    onSelect={openRoom}
                    footer={<SeeAll onPress={reset} />}
                />
            )}
        </div>
    )
}

/** The window before it has ever opened — its title bar, and no list behind it. */
function ClosedBar({ controls, onOpen }: { controls: ReactNode; onOpen: () => void }) {
    const { t } = useTranslation()
    return (
        <div className="flex h-16 flex-none items-center gap-1 ps-4 pe-2">
            <h2 className="min-w-0 flex-1 type-title-t1-bold text-(--text-title)">
                <button
                    type="button"
                    data-testid="message-popup-bar"
                    aria-expanded={false}
                    onClick={onOpen}
                    className="w-full rounded-(--radius-md) text-start outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                >
                    {t('message_title')}
                </button>
            </h2>
            {controls}
        </div>
    )
}

/**
 * Legacy's two header buttons: open in full (the Messages screen, or this conversation's own
 * route), and open / close — a double chevron that points down while open and up while closed.
 */
function WindowControls({
    expanded,
    fullPath,
    onToggle,
    onLeave,
}: {
    expanded: boolean
    fullPath: string
    onToggle: () => void
    /** Leaving for the full screen closes the window, so it is not waiting when the reader returns. */
    onLeave: () => void
}) {
    const { t } = useTranslation()
    return (
        <span className="flex flex-none items-center">
            <Button
                data-testid="message-popup-full"
                variant="ghost"
                size="large"
                iconOnly
                aria-label={t('message_popup_open_full')}
                render={<Link href={fullPath} />}
                nativeButton={false}
                onClick={onLeave}
                className="size-10"
            >
                <Icon name="arrows-out" size={24} className="size-6" />
            </Button>
            <Button
                data-testid="message-popup-toggle"
                variant="ghost"
                size="large"
                iconOnly
                aria-label={t(expanded ? 'message_popup_close' : 'message_popup_open')}
                aria-expanded={expanded}
                onClick={onToggle}
                className="size-10"
            >
                <Icon
                    name="angles-down"
                    size={24}
                    className={cn(
                        'size-6 transition-transform duration-300 motion-reduce:transition-none',
                        !expanded && 'rotate-180',
                    )}
                />
            </Button>
        </span>
    )
}

/** Legacy's "See all in Chats": a 50px bar pinned under the list, in the link blue. */
function SeeAll({ onPress }: { onPress: () => void }) {
    const { t } = useTranslation()
    return (
        <Link
            data-testid="message-popup-see-all"
            href={MESSAGES_PATH}
            onClick={onPress}
            className="flex h-[50px] flex-none items-center justify-center bg-(--background-surface) type-body-strong text-(--text-link) no-underline shadow-[0_-2px_10px_0_var(--opacity-black-10)] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
            {t('message_popup_see_all')}
        </Link>
    )
}
