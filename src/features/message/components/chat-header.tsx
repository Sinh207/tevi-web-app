'use client'

import { type Channel, toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { CHAT_ACTION, type ChatAction } from '../api/types'
import { MESSAGES_PATH } from '../routes'

/**
 * The bar over a conversation: back (phones only), who it is with, and what they are doing.
 *
 * Legacy's `headerChat`. The second line says, in order of precedence: typing / uploading a photo
 * (from the socket), **Online** (seen within five minutes), or the handle. The whole identity block
 * links to the space — legacy makes it a `div` with `onClick={router.push}`, which no keyboard can
 * reach and no middle-click opens.
 *
 * Back is a link to `/messages` rather than `history.back()`: a conversation reached from a push
 * notification or a pasted URL has nothing behind it, and "back" leaving the app is the wrong answer.
 * From `md` the list is beside the conversation, so there is nothing to go back to and no button.
 */
export function ChatHeader({
    channel,
    slug: urlSlug,
    online,
    chatAction,
}: {
    channel: Channel | null
    /** The slug from the URL — what the bar says while the space is unknown (loading, missing). */
    slug?: string
    online: boolean
    chatAction?: ChatAction
}) {
    const { t } = useTranslation()
    /* Only a space the service *says* is suspended is anonymised. One this client has not loaded —
       or that does not exist — is named by its URL, as the reader typed or followed it. */
    const suspended = channel?.is_suspended ?? false
    const active = !!channel && !suspended
    const name = suspended
        ? t('message_inactive_user')
        : (channel?.name ?? `@${channel?.slug ?? urlSlug ?? ''}`)
    const slug = active ? (channel?.slug ?? null) : null

    const activity =
        chatAction === CHAT_ACTION.typing
            ? t('message_typing')
            : chatAction === CHAT_ACTION.uploadingPhoto
              ? t('message_uploading_photo')
              : null

    const identity = (
        <>
            <AnimatedAvatar
                size="medium"
                thumb={active ? channel?.images.thumb : null}
                avatarVideo={active ? channel?.images.avatar_video : null}
                isPremium={active && (channel?.is_premium ?? false)}
                alt=""
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1">
                    <span
                        className={cn(
                            'min-w-0 truncate type-body-strong',
                            active && channel?.is_premium
                                ? '[background-image:var(--gradient-premium-name)] bg-clip-text text-transparent'
                                : 'text-(--text-title)',
                        )}
                    >
                        {name}
                    </span>
                    {active && (
                        <VerifiedBadge
                            image={channel?.verified_tick_badge?.image ?? null}
                            size={16}
                        />
                    )}
                    {active && channel?.is_premium && (
                        <PremiumBadge size={18} className="flex-none" />
                    )}
                </span>
                <span
                    aria-live="polite"
                    className={cn(
                        'flex min-w-0 items-center gap-1 type-caption-meta',
                        activity
                            ? 'text-(--text-link)'
                            : online
                              ? 'text-(--text-success)'
                              : 'text-(--text-placeholder)',
                    )}
                >
                    {activity ? (
                        <>
                            <Loader className="size-4" />
                            <span className="truncate">{activity}</span>
                        </>
                    ) : online ? (
                        t('message_online')
                    ) : slug ? (
                        <bdi className="truncate">@{slug}</bdi>
                    ) : null}
                </span>
            </span>
        </>
    )

    return (
        <header className="flex h-16 flex-none items-center gap-2 border-b border-solid border-(--separator-default) bg-(--background-surface) px-2 md:px-4">
            <Button
                data-testid="message-room-back"
                variant="ghost"
                size="medium"
                iconOnly
                aria-label={t('message_back_to_chats')}
                render={<Link href={MESSAGES_PATH} />}
                className="md:hidden"
            >
                <Icon name="angle-left" size={24} className="size-6" />
            </Button>
            {slug ? (
                <Link
                    data-testid="message-room-space"
                    href={toChannelPath(slug)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-(--radius-md) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    {identity}
                </Link>
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
            )}
        </header>
    )
}
