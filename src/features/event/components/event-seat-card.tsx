'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { PremiumBadge } from '@shared/components/premium-badge'
import { Sheen } from '@shared/components/sheen'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { LIVE_BREATH, POP, RISE } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect } from 'react'
import type { LivePublisher } from '../api/live-types'
import { EventHostBadge } from './event-host-badge'

/**
 * **A publisher's card** — what pressing a seat opens.
 *
 * Legacy's seats are not interactive at all; this is an addition. It answers the two things a
 * viewer wants from a face on stage: *who is this*, and *how do I reach them*. So: the face (its
 * ring red while the microphone is open, as the seat's own ring is), the name with its tick and
 * the Host badge right after it, what is live on the wire (mic, camera), the Star they have been
 * given in this room — and the actions:
 *
 * - **Send a gift** — opens the catalogue with this person already chosen as the recipient, the
 *   one decision the picker would otherwise ask for again. Outside an exclusive stream's gate it
 *   opens the paywall instead, as every gift there does.
 * - **View space** — the publisher's own space when the room payload names it (B120), otherwise
 *   the host only, through the event's channel. A new tab, so the broadcast keeps playing.
 *
 * Docked to the foot of the stage box rather than floated beside a seat: tiles go down to ~80px in
 * a nine-up grid, and a popover anchored there would cover the very seat it is about. The seat is
 * lit instead (`isSelected`), which is what ties the two together. Escape and ✕ close it; pressing
 * the same seat again does too.
 *
 * Motion: the card `RISE`s, the face pops a beat later, an open microphone breathes a red halo,
 * and the gift button carries the CTA sheen. Keyed by the caller on the publisher, so moving to
 * another seat replays the entrance for the new person.
 */
export function EventSeatCard({
    publisher,
    score,
    hostSlug,
    onSendGift,
    onClose,
}: {
    publisher: LivePublisher
    /** Star given to this person in this room, from the seat scores. `0` hides the figure. */
    score: number
    /** The event's channel slug — offered as *View space* only when this publisher is the host. */
    hostSlug: string | null
    onSendGift: () => void
    onClose: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const name = publisher.name ?? ''

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    /*
     * The publisher's own space when the room payload names it (**B120** — unconfirmed, legacy
     * reads no slug), else the event's channel for the host. A co-host without one gets no link
     * rather than a wrong one.
     */
    const slug = publisher.channel_slug ?? (publisher.is_host ? hostSlug : null)
    const space = slug ? `/@${encodeURIComponent(slug)}` : null

    return (
        <section
            data-testid="event-seat-card"
            data-publisher-id={publisher.id}
            aria-label={name}
            className={cn(
                'relative flex w-full max-w-[360px] flex-col gap-4 rounded-2xl p-4',
                'bg-[rgba(20,16,30,0.82)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_rgba(0,0,0,0.5)]',
                RISE,
            )}
        >
            <div className="flex items-center gap-3 pe-9">
                {/* The face, ringed like its seat: red while the microphone is open. */}
                <span className={cn('relative flex flex-none', POP, '[animation-delay:80ms]')}>
                    {publisher.audio && (
                        <span
                            aria-hidden
                            className={cn(
                                'pointer-events-none absolute -inset-2 rounded-full bg-[radial-gradient(closest-side,rgba(255,104,104,0.55),transparent)] blur-md',
                                LIVE_BREATH,
                            )}
                        />
                    )}
                    <Avatar
                        size="xs"
                        type={publisher.avatar ? 'image' : 'initials'}
                        className={cn(
                            'relative size-14 ring-2',
                            publisher.audio ? 'ring-[#FF6868]' : 'ring-white/20',
                        )}
                    >
                        {publisher.avatar ? (
                            <Image
                                src={publisher.avatar}
                                alt=""
                                width={56}
                                height={56}
                                className="size-full rounded-full object-cover"
                            />
                        ) : (
                            <AvatarInitials>
                                {(name || '?').slice(0, 2).toUpperCase()}
                            </AvatarInitials>
                        )}
                    </Avatar>
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {/* Name, then its marks — the tick and the Host badge right after it. */}
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="type-body-strong min-w-0 truncate text-white">{name}</span>
                        {publisher.verified_tick_badge?.image && (
                            <VerifiedBadge image={publisher.verified_tick_badge.image} size={16} />
                        )}
                        {/* Premium, as legacy reads it off the publisher — the animated crown. */}
                        {publisher.premium_badge && (
                            <span className="flex flex-none">
                                <PremiumBadge size={16} />
                            </span>
                        )}
                        {publisher.is_host && <EventHostBadge />}
                    </span>
                    {/* What is live on the wire, and what they have been given here. */}
                    <span className="flex flex-wrap items-center gap-1.5">
                        <StatusChip
                            icon={publisher.audio ? 'microphone' : 'microphone-slash'}
                            label={t(
                                publisher.audio ? 'event_studio_mic_on' : 'event_studio_mic_off',
                            )}
                            on={publisher.audio}
                        />
                        <StatusChip
                            // The sprite has no struck camera; the label and the muted chip say "off".
                            icon="video"
                            label={t(
                                publisher.video ? 'event_seat_camera_on' : 'event_seat_camera_off',
                            )}
                            on={publisher.video}
                        />
                        {score > 0 && (
                            <span
                                title={formatStarAmount(score, currentLanguage)}
                                className="type-caption-label-strong flex h-6 items-center gap-1 rounded-full bg-[rgba(255,199,0,0.14)] px-2 text-[#FFD54A] ring-1 ring-inset ring-[rgba(255,199,0,0.25)]"
                            >
                                <StarMark size={12} />
                                <span className="tabular-nums">{formatCount(score)}</span>
                            </span>
                        )}
                    </span>
                </div>
            </div>

            <div className={cn('grid gap-2', space ? 'grid-cols-2' : 'grid-cols-1')}>
                <Button
                    data-testid="event-seat-card-gift"
                    variant="accent"
                    size="large"
                    fullWidth
                    onClick={onSendGift}
                    className="relative overflow-hidden px-3"
                >
                    <Sheen />
                    <Icon name="gift-simple" size={20} className="relative flex-none" />
                    <span className="relative min-w-0 truncate">{t('event_seat_send_gift')}</span>
                </Button>
                {space && (
                    <Button
                        data-testid="event-seat-card-space"
                        variant="secondary"
                        size="large"
                        fullWidth
                        render={<Link href={space} target="_blank" rel="noopener" />}
                        className="border-white/15 bg-white/[0.08] px-3 text-white hover:bg-white/15"
                    >
                        <span className="min-w-0 truncate">{t('event_seat_view_space')}</span>
                        <Icon
                            name="arrow-up-right"
                            size={16}
                            className="flex-none rtl:-scale-x-100"
                        />
                    </Button>
                )}
            </div>

            <DialogCloseButton
                onClose={onClose}
                data-testid="event-seat-card-close"
                className="absolute end-1.5 top-1.5 text-white/70 hover:text-white"
            />
        </section>
    )
}

/**
 * One live state, as a 24px disc: lit when on, muted when off. Icon-only to keep the row on one
 * line beside a name — the full sentence is the disc's accessible name and its tooltip.
 */
function StatusChip({
    icon,
    label,
    on,
}: {
    icon: 'microphone' | 'microphone-slash' | 'video'
    label: string
    on: boolean
}) {
    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className={cn(
                'grid size-6 flex-none place-items-center rounded-full ring-1 ring-inset transition-colors',
                on
                    ? 'bg-white/[0.12] text-white ring-white/20'
                    : 'bg-white/[0.04] text-white/40 ring-white/10',
            )}
        >
            <Icon name={icon} size={16} className="size-3.5" />
        </span>
    )
}
