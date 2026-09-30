'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { slugFromMessagesPath } from '../routes'
import { ConversationPane } from './conversation-pane'

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
