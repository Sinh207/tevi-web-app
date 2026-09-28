'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { NotificationBadge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemHandle,
    ListUserItemMute,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CHAT_ACTION, type ChatAction } from '../api/types'
import { formatConversationTime } from '../lib/conversation-time'
import type { ConversationView } from '../lib/conversation-view'
import { conversationPath } from '../routes'
import { ConversationRowMenu } from './conversation-row-menu'

/**
 * One conversation — the DS's **`Conversation List/Item`** (Figma `100:22097`), ported onto the
 * `List/User Item` parts it shares its geometry with.
 *
 * ## What the sixteen variants say, and where each one lands
 *
 * The component is four boolean axes — Muted, Pinned, Blocked, Readed — and they place marks in
 * three slots rather than restyling the row:
 *
 * | Axis    | Where                                                        |
 * |---------|--------------------------------------------------------------|
 * | unread  | the preview goes 16/600 Title; a count pill under the time   |
 * | muted   | `volume-off-slash` after the name; the pill goes grey        |
 * | pinned  | the row takes `--background-subtle`; `thumbtack-slanted` under the time |
 * | blocked | `ban` under the time                                         |
 *
 * `Readed=No` is **this account has unread messages in it**, not "the other side read mine" — the
 * variant's only differences are the preview weight and the pill. The sent / seen ticks legacy draws
 * beside the time are not in the comp; they are kept, before the time, because they are the only
 * place a sender learns their message was read.
 *
 * ## Deliberate differences from the comp
 *
 * - **64px avatar in an 80px row**, as drawn — so the avatar column is `items-center`, which Figma
 *   is too (`Row` centres its child). `ListUserItemAvatar`'s `items-start` is for the 48px person
 *   row.
 * - **The handle is `leading-none`.** Figma sets it in `Body/Dense/Single Line` (14px on a 14px
 *   line), a style this app has no utility for; at `type-dense-default`'s 21px line the three-line
 *   stack is 73px in a 64px box. The size and weight stay the utility's.
 * - **Pinned in Dark is not visible as a tint**: `--background-subtle` and `--background-surface`
 *   are both `#18181b` there (`blocked-account-row.tsx` notes the same collision). The thumbtack
 *   still says it, which is why it is the mark and the tint is the extra.
 *
 * ## The press target
 *
 * The whole band opens the conversation, the way `NotificationRow` does it: the link wraps the text
 * column and stretches over the row with an `after:` box that reaches back over the avatar
 * (`-start-[88px]` = 16 + 64 + 8), while the kebab sits above it. One element carries the name,
 * nothing is nested inside a link.
 *
 * An **inactive** account has no space and so no conversation URL; its row is not a link. Legacy
 * opens the chat anyway and falls back to `/messages` in the address bar, i.e. a conversation that
 * cannot be linked to or reloaded. That is a chat-room question and is left for the chat room.
 */
/**
 * Legacy's stand-in handle for an inactive account — an identifier, not a sentence, so it is not a
 * translation key.
 */
const INACTIVE_HANDLE = 'tevi-user'

export function ConversationRow({
    view,
    rule,
    chatAction,
    active = false,
    busy = false,
    locale,
    now,
    onOpen,
    onDelete,
    testId,
    conversationId,
}: {
    view: ConversationView
    /** A hairline above this row — every row but the first. */
    rule: boolean
    /** Someone is typing or uploading in this conversation, from the socket. */
    chatAction?: ChatAction
    /** The conversation open beside the list (desktop). */
    active?: boolean
    /** A delete is in flight somewhere in the list — the kebab holds. */
    busy?: boolean
    locale: string
    /** One clock for the whole list, so two rows cannot disagree about "now". */
    now: number
    onOpen: () => void
    onDelete: () => void
    testId?: string
    conversationId: string
}) {
    const { t } = useTranslation()

    const name = view.name ?? t('message_inactive_user')
    const handle = view.slug ?? INACTIVE_HANDLE
    const time = formatConversationTime(view.time, locale, now)
    const unread = view.unread > 0
    const count = view.unread > 99 ? '99+' : String(view.unread)

    const pressClass = cn(
        'flex w-full min-w-0 flex-col items-start gap-0.5 text-start no-underline',
        'after:absolute after:inset-y-0 after:-start-[88px] after:end-0 after:content-[""]',
        'outline-none focus-visible:outline-none',
        'focus-visible:after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-(--focus-ring)',
    )

    /* The accessible name: who, then whether there is anything new — the pill is `aria-hidden`
       because "3" on its own says nothing. */
    const label = [name, unread ? t('message_row_unread', { count: view.unread }) : null]
        .filter(Boolean)
        .join(', ')

    const text: ReactNode = (
        <>
            <ListUserItemNameRow className="w-full">
                <ListUserItemName premium={view.premium}>{name}</ListUserItemName>
                <VerifiedBadge image={view.verifiedImage} size={18} />
                {view.premium && <PremiumBadge size={18} className="flex-none" />}
                {view.tierImage && (
                    <Image
                        src={view.tierImage}
                        alt={t('message_space_tier', { tier: view.tier ?? 0 })}
                        width={18}
                        height={18}
                        className="h-[18px] w-auto flex-none"
                    />
                )}
                {view.muted && (
                    <ListUserItemMute>
                        <Icon name="volume-off-slash" size={18} title={t('message_muted')} />
                    </ListUserItemMute>
                )}
            </ListUserItemNameRow>
            <ListUserItemHandle className="leading-none">@{handle}</ListUserItemHandle>
            <PreviewLine view={view} chatAction={chatAction} unread={unread} />
        </>
    )

    return (
        <li data-testid={testId} data-conversation-id={conversationId} className="group relative">
            <ListUserItem
                pinned={view.pinned}
                muted={view.muted}
                aria-current={active ? 'true' : undefined}
                className={cn(
                    // The Surface override every list inside a card has to make — see the warning on
                    // `ListUserItem`. Pinned keeps the comp's own fill.
                    view.pinned ? 'bg-(--background-subtle)' : 'bg-(--background-surface)',
                    active && 'bg-(--background-segment)',
                    'transition-colors duration-[160ms] ease-out hover:bg-(--background-segment)',
                )}
            >
                <ListUserItemAvatar className="items-center">
                    <span className="relative flex">
                        <AnimatedAvatar
                            size="xl"
                            thumb={view.thumb}
                            avatarVideo={view.avatarVideo}
                            isPremium={view.premium}
                            alt=""
                            initials={view.name ? view.name.slice(0, 2).toUpperCase() : undefined}
                        />
                        {view.online && (
                            /* `Avatar/Status Indicator` at XL: 16px, a 2px cut-out ring. The ring
                               is the surface rather than Figma's canvas, because that is what the
                               row actually sits on here. */
                            <span
                                data-testid="message-row-online"
                                className="absolute top-0 end-0 size-4 rounded-(--radius-fill) border-2 border-solid border-(--background-surface) bg-(--accents-success-active)"
                            >
                                <span className="sr-only">{t('message_online')}</span>
                            </span>
                        )}
                    </span>
                </ListUserItemAvatar>

                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    <ListUserItemPreview className="items-stretch">
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                            {view.slug ? (
                                <Link
                                    data-testid="message-row-link"
                                    href={conversationPath(view.slug)}
                                    aria-label={label}
                                    onClick={onOpen}
                                    className={pressClass}
                                >
                                    {text}
                                </Link>
                            ) : (
                                <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
                                    {text}
                                </div>
                            )}
                        </div>

                        {/* `Notification` — time on top, the marks below, pinned to the end. */}
                        <div className="flex flex-none flex-col items-end justify-between">
                            <span className="flex items-center gap-1">
                                {view.sentByMe && (
                                    <Icon
                                        name={view.seen ? 'check-double' : 'check'}
                                        size={16}
                                        title={t(view.seen ? 'message_seen' : 'message_sent')}
                                        className={
                                            view.seen
                                                ? 'text-(--text-link)'
                                                : 'text-(--text-placeholder)'
                                        }
                                    />
                                )}
                                {time && (
                                    <time
                                        dateTime={
                                            view.time
                                                ? new Date(view.time).toISOString()
                                                : undefined
                                        }
                                        className="type-dense-default whitespace-nowrap text-(--text-placeholder)"
                                    >
                                        {time}
                                    </time>
                                )}
                            </span>
                            <span className="flex flex-1 items-center gap-[10px]">
                                {view.pinned && (
                                    <Icon
                                        name="thumbtack-slanted"
                                        size={20}
                                        title={t('message_pinned')}
                                        className="text-(--icon-secondary)"
                                    />
                                )}
                                {view.blocked && (
                                    <Icon
                                        name="ban"
                                        size={20}
                                        title={t('message_blocked')}
                                        className="text-(--icon-secondary)"
                                    />
                                )}
                                {unread && (
                                    <NotificationBadge
                                        type="count"
                                        aria-hidden="true"
                                        className={cn(view.muted && 'bg-(--text-placeholder)')}
                                    >
                                        {count}
                                    </NotificationBadge>
                                )}
                            </span>
                        </div>
                    </ListUserItemPreview>
                </ListUserItemContent>
            </ListUserItem>

            {/*
             * Legacy's hover kebab: a disc at the end of the row, over the time column, shown on
             * hover. Also shown on keyboard focus and while its menu is open — legacy's only
             * appears under a mouse, so neither a keyboard nor a screen reader can reach Delete.
             * Above the stretched link (`z-10`), outside it in the DOM.
             */}
            <div
                className={cn(
                    'absolute end-3 top-1/2 z-10 -translate-y-1/2',
                    'opacity-0 transition-opacity duration-[160ms] ease-out',
                    'group-hover:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100',
                )}
            >
                <span className="flex rounded-(--radius-fill) bg-(--background-surface) shadow-xs">
                    <ConversationRowMenu
                        name={name}
                        slug={view.slug}
                        disabled={busy}
                        onDelete={onDelete}
                    />
                </span>
            </div>
        </li>
    )
}

/** The second line: who is typing, a photo, or the message text. */
function PreviewLine({
    view,
    chatAction,
    unread,
}: {
    view: ConversationView
    chatAction?: ChatAction
    unread: boolean
}) {
    const { t } = useTranslation()
    const tone = unread
        ? 'type-body-strong text-(--text-title)'
        : 'type-body-default text-(--text-body)'

    if (chatAction === CHAT_ACTION.typing || chatAction === CHAT_ACTION.uploadingPhoto) {
        return (
            <span className="flex w-full min-w-0 items-center gap-1 type-body-default text-(--text-link)">
                <Loader className="size-4" />
                <span className="truncate">
                    {t(
                        chatAction === CHAT_ACTION.typing
                            ? 'message_typing'
                            : 'message_uploading_photo',
                    )}
                </span>
            </span>
        )
    }

    if (view.preview.kind === 'photo') {
        return (
            <span className={cn('flex w-full min-w-0 items-center gap-1', tone)}>
                <Image
                    src={view.preview.thumb}
                    alt=""
                    width={20}
                    height={20}
                    className="size-5 flex-none rounded-(--radius-sm) object-cover"
                />
                <span className="truncate">{t('message_preview_photo')}</span>
            </span>
        )
    }

    return (
        <span className={cn('block w-full min-w-0 truncate', tone)}>
            {view.preview.kind === 'text' ? view.preview.text : ' '}
        </span>
    )
}
