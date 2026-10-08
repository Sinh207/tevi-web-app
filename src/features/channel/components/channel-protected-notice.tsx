'use client'

import { Sheen } from '@shared/components/sheen'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { INVITE_DOT, LOCK_JIGGLE, POP, RIPPLE, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect } from 'react'
import type { Channel } from '../api/types'
import { useChannel } from '../hooks/use-channel'
import { useChannelActions } from '../hooks/use-channel-actions'

/**
 * **"This live belongs to a protected space"** — what a non-follower gets instead of a stream.
 *
 * The live's details answer `422 CHN0009` with the space in the body (`protectedChannelOf`), and
 * until now that fell through to the generic *couldn't load* wall with a Retry that could never
 * work. Legacy bounces to the space; this explains *here*, because the reader followed a link to a
 * live and "go somewhere else" is not an explanation — and it offers the one thing that opens the
 * door, the follow request, in place.
 *
 * The space is read through `useChannel` (seeded by the refusal's own copy), so the follow press
 * is the space page's own `useChannelActions` — optimistic, rolled back on failure, the same
 * request and the same cache — and the card flips to *Requested* the moment it is pressed. When
 * the space later reads `is_followed` (the creator accepted), `onUnlocked` re-asks for the live.
 *
 * Motion: the card rises, the face pops in a beat later with two rings pulsing out of it and the
 * padlock giving its nudge; the words and actions arrive in reading order. A pending request shows
 * three dots breathing in turn — waiting, not stuck.
 */
export function ChannelProtectedNotice({
    channel: refused,
    onUnlocked,
}: {
    /** The space, as the refusal carried it. */
    channel: Channel
    /** The reader can see the space's content now — re-ask for whatever was refused. */
    onUnlocked?: () => void
}) {
    const { t } = useTranslation()
    const { channel: fresh } = useChannel(refused.slug)
    const channel = fresh ?? refused
    const { follow, unfollow } = useChannelActions(channel)

    const unlocked = channel.is_followed || channel.privacy !== 'protected'
    useEffect(() => {
        if (unlocked) onUnlocked?.()
    }, [unlocked, onUnlocked])

    const name = channel.name ?? `@${channel.slug}`
    const thumb = channel.images.thumb
    const requested = channel.follow_requested
    const busy = follow.isPending || unfollow.isPending
    const space = `/@${encodeURIComponent(channel.slug)}`

    return (
        <section
            data-testid="channel-protected"
            data-requested={requested || undefined}
            className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 text-center"
        >
            {/* A soft wash of the brand behind the face, so the wall reads as a door, not an error. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(50%_60%_at_50%_35%,color-mix(in_srgb,var(--button-accent-bg)_16%,transparent),transparent)]"
            />

            <div className={cn('relative flex w-full max-w-[400px] flex-col items-center gap-6')}>
                {/* The face, behind glass: two rings pulse out of it and the padlock nudges. */}
                <div
                    className={cn(
                        'relative grid place-items-center',
                        POP,
                        '[animation-delay:80ms]',
                    )}
                >
                    <span
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--button-accent-bg)_45%,transparent)]',
                            RIPPLE,
                        )}
                    />
                    <span
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--button-accent-bg)_45%,transparent)]',
                            RIPPLE,
                            '[animation-delay:1200ms]',
                        )}
                    />
                    <Avatar
                        size="2xl"
                        type={thumb ? 'image' : 'initials'}
                        className="relative shadow-lg ring-4 ring-(--background-surface)"
                    >
                        {thumb ? (
                            <Image
                                src={thumb}
                                alt=""
                                width={80}
                                height={80}
                                className="size-full rounded-full object-cover"
                            />
                        ) : (
                            <AvatarInitials>
                                {name.replace('@', '').slice(0, 2).toUpperCase()}
                            </AvatarInitials>
                        )}
                    </Avatar>
                    <span
                        aria-hidden
                        className="absolute -end-1 -bottom-1 grid size-8 place-items-center rounded-full bg-(--button-accent-bg) text-(--button-accent-text) shadow-md ring-[3px] ring-(--background-surface)"
                    >
                        <Icon
                            name="lock-simple"
                            weight="filled"
                            size={16}
                            className={LOCK_JIGGLE}
                        />
                    </span>
                </div>

                <div
                    className={cn(
                        'flex min-w-0 flex-col items-center gap-2',
                        RISE,
                        '[animation-delay:160ms]',
                    )}
                >
                    <span className="flex min-w-0 max-w-full items-center gap-1">
                        <span className="type-body-strong min-w-0 truncate text-(--text-title)">
                            {name}
                        </span>
                        {channel.verified_tick_badge?.image && (
                            <VerifiedBadge image={channel.verified_tick_badge.image} size="body" />
                        )}
                    </span>
                    <span className="type-caption-label-strong inline-flex h-6 items-center gap-1 rounded-full bg-(--background-segment) px-2.5 text-(--text-subtitle)">
                        <Icon name="lock-simple" size={16} className="size-3" />
                        {t('channel_protected_badge')}
                    </span>
                </div>

                <div className={cn('flex flex-col gap-2', RISE, '[animation-delay:240ms]')}>
                    <h2 className="type-title-t2-semibold text-balance text-(--text-title)">
                        {t(
                            requested
                                ? 'channel_protected_live_pending_title'
                                : 'channel_protected_live_title',
                        )}
                    </h2>
                    <p className="type-dense-default text-pretty text-(--text-subtitle)">
                        {t(
                            requested
                                ? 'channel_protected_live_pending_body'
                                : 'channel_protected_live_body',
                            { name },
                        )}
                    </p>
                </div>

                <div className={cn('flex w-full flex-col gap-3', RISE, '[animation-delay:320ms]')}>
                    {requested ? (
                        <>
                            {/* Waiting on the creator: three dots breathing in turn. */}
                            <span
                                role="status"
                                className="type-caption-label-strong mx-auto inline-flex h-8 items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--button-accent-bg)_10%,transparent)] px-3 text-(--text-brand)"
                            >
                                <span aria-hidden className="flex gap-1">
                                    {[0, 160, 320].map(delay => (
                                        <span
                                            key={delay}
                                            style={{ animationDelay: `${delay}ms` }}
                                            className={cn(
                                                'size-1.5 rounded-full bg-current',
                                                INVITE_DOT,
                                            )}
                                        />
                                    ))}
                                </span>
                                {t('channel_protected_live_waiting')}
                            </span>
                            <Button
                                data-testid="channel-protected-cancel"
                                variant="secondary"
                                size="large"
                                fullWidth
                                onClick={unfollow.run}
                                disabled={busy}
                            >
                                <Icon name="xmark" size={20} />
                                {t('channel_protected_live_cancel')}
                            </Button>
                        </>
                    ) : (
                        <Button
                            data-testid="channel-protected-follow"
                            variant="accent"
                            size="large"
                            fullWidth
                            onClick={follow.run}
                            disabled={busy}
                            className="relative overflow-hidden"
                        >
                            <Sheen />
                            <Icon name="user-plus" weight="filled" size={20} className="relative" />
                            <span className="relative">{t('channel_protected_live_request')}</span>
                        </Button>
                    )}
                    <Button
                        data-testid="channel-protected-space"
                        variant="ghost"
                        size="large"
                        fullWidth
                        render={<Link href={space} />}
                    >
                        {t('channel_protected_view_space')}
                        <Icon name="angle-right" size={16} className="rtl:-scale-x-100" />
                    </Button>
                </div>
            </div>
        </section>
    )
}
