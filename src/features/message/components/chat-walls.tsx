'use client'

import { type Channel, toChannelPath, useChannelActions } from '@features/channel'
import { channelActionPath } from '@features/channel/routes'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Why the composer is not there — one of legacy's six panels at the foot of a conversation, each
 * with the one action that changes the answer where there is one.
 *
 * | Wall         | Legacy component      | Way out                                        |
 * |--------------|-----------------------|------------------------------------------------|
 * | `follow`     | `followChannel`       | Follow; on a protected space Request / Cancel  |
 * | `member`     | `becomeAMember`       | the space's membership page                    |
 * | `first`      | `getStared`           | Get started 👋👋👋 — sends the wave             |
 * | `blocked-me` | `recipientBlock`      | none                                           |
 * | `i-blocked`  | `meBlock`             | none here (unblocking is the space page's)     |
 * | `inactive`   | `inactiveRecipient`   | none                                           |
 *
 * The member wall links out rather than opening legacy's in-chat checkout (three dialogs and a
 * Stripe frame inside the chat). `/@{slug}/membership` is the one checkout every other entry point
 * uses, and `useRoom` re-asks on return, so coming back after paying opens the conversation.
 */
export type ChatWallKind = 'follow' | 'member' | 'first' | 'blocked-me' | 'i-blocked' | 'inactive'

export function ChatWall({
    kind,
    channel,
    onWave,
}: {
    kind: ChatWallKind
    channel: Channel | null
    onWave?: () => void
}) {
    const { t } = useTranslation()
    const name = channel?.name ?? (channel?.slug ? `@${channel.slug}` : t('message_inactive_user'))

    switch (kind) {
        case 'follow':
            return channel ? <FollowWall channel={channel} /> : null
        case 'member':
            return (
                <Panel
                    kind="member"
                    title={t('message_wall_member_title')}
                    body={t('message_wall_member_body')}
                    action={
                        channel?.slug ? (
                            <Button
                                data-testid="message-wall-member-join"
                                variant="primary"
                                size="large"
                                render={
                                    <Link
                                        href={channelActionPath(channel.slug, 'become_a_member')}
                                    />
                                }
                            >
                                {t('message_wall_member_action')}
                            </Button>
                        ) : null
                    }
                />
            )
        case 'first':
            return (
                <Panel
                    kind="first"
                    title={t('message_wall_first_title')}
                    body={t('message_wall_first_body')}
                    action={
                        <Button
                            data-testid="message-wall-first-wave"
                            variant="primary"
                            size="large"
                            onClick={onWave}
                        >
                            {t('message_wall_first_action')}
                        </Button>
                    }
                />
            )
        case 'blocked-me':
            return (
                <Panel
                    kind="blocked-me"
                    title={t('message_wall_unavailable_title')}
                    body={t('message_wall_blocked_me_body')}
                />
            )
        case 'i-blocked':
            return (
                <Panel
                    kind="i-blocked"
                    title={t('message_wall_i_blocked_title')}
                    body={t('message_wall_i_blocked_body', { name })}
                />
            )
        case 'inactive':
            return (
                <Panel
                    kind="inactive"
                    title={t('message_wall_unavailable_title')}
                    body={t('message_wall_inactive_body')}
                />
            )
    }
}

/**
 * Follow, for a public space; Request / Cancel request for a protected one. The buttons are the
 * space page's own (`useChannelActions`) — same mutation, same cache, same sign-in gate.
 */
function FollowWall({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const { follow, unfollow } = useChannelActions(channel)
    const protectedSpace = channel.privacy === 'protected'
    const requested = channel.follow_requested

    if (!protectedSpace) {
        return (
            <Panel
                kind="follow"
                title={t('message_wall_follow_title')}
                body={t('message_wall_follow_body')}
                action={
                    <Button
                        data-testid="message-wall-follow-submit"
                        variant="primary"
                        size="large"
                        disabled={follow.isPending}
                        aria-busy={follow.isPending || undefined}
                        onClick={follow.run}
                    >
                        {t('message_wall_follow_action')}
                    </Button>
                }
            />
        )
    }

    return (
        <Panel
            kind="follow"
            title={t('message_wall_protected_title')}
            body={
                requested
                    ? t('message_wall_requested_body', { name: channel.name ?? `@${channel.slug}` })
                    : t('message_wall_request_body')
            }
            action={
                requested ? (
                    <Button
                        data-testid="message-wall-request-cancel"
                        variant="secondary"
                        size="large"
                        disabled={unfollow.isPending}
                        aria-busy={unfollow.isPending || undefined}
                        onClick={unfollow.run}
                    >
                        {t('message_wall_cancel_request')}
                    </Button>
                ) : (
                    <Button
                        data-testid="message-wall-request-submit"
                        variant="primary"
                        size="large"
                        disabled={follow.isPending}
                        aria-busy={follow.isPending || undefined}
                        onClick={follow.run}
                    >
                        {t('message_wall_request_action')}
                    </Button>
                )
            }
        />
    )
}

function Panel({
    title,
    body,
    action,
    kind,
}: {
    title: string
    body: string
    action?: ReactNode
    kind: ChatWallKind
}) {
    return (
        <section
            data-testid="message-wall"
            data-wall-kind={kind}
            className={cn(
                'mx-auto flex w-full max-w-[400px] flex-col items-center gap-1 px-4 py-6 text-center',
                RISE,
            )}
        >
            <h2 className="type-title-t2-semibold text-(--text-title)">{title}</h2>
            <p className="type-dense-default text-(--text-body)">{body}</p>
            {action && <div className="mt-3">{action}</div>}
        </section>
    )
}

/**
 * The space, introduced — legacy's `channelInfo`, shown above an empty conversation or a wall so the
 * reader can see who they are about to write to.
 */
export function ChannelIntro({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const active = !channel.is_suspended
    const name = active ? (channel.name ?? `@${channel.slug}`) : t('message_inactive_user')

    return (
        <div data-testid="message-intro" className="flex flex-col items-center gap-1 pt-12 pb-4">
            <AnimatedAvatar
                size="2xl"
                thumb={active ? channel.images.thumb : null}
                avatarVideo={active ? channel.images.avatar_video : null}
                isPremium={active && channel.is_premium}
                alt=""
            />
            <span className="mt-2 flex items-center gap-1">
                <span className="max-w-[240px] truncate type-body-strong text-(--text-title)">
                    {name}
                </span>
                {active && (
                    <VerifiedBadge image={channel.verified_tick_badge?.image ?? null} size={16} />
                )}
            </span>
            {active && channel.slug && (
                <Link
                    href={toChannelPath(channel.slug)}
                    className="type-link-dense text-(--text-link) no-underline hover:underline"
                >
                    <bdi>tevi.com/@{channel.slug}</bdi>
                </Link>
            )}
        </div>
    )
}
