'use client'

import { Menu } from '@base-ui/react/menu'
import { ChannelReportDialog, useChannel, useChannelActions } from '@features/channel'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useState } from 'react'
import type { EventChannel } from '../api/types'
import { EVENT_STUDIO_PILL } from '../lib/studio'
import { EventStudioUpsell } from './event-studio-upsell'

/**
 * The two **controls** inside the studio's channel plate — legacy's `BtnFollow` and `IconBtnMore`.
 *
 * ```
 * ( ◍ Leslie Alexander · 116.2K followers   [+ Follow]  (⋯) )
 * ```
 *
 * The plate had neither, which is what made it a label rather than a bar: somebody who arrived on a
 * shared link could not follow the person they were watching, and had no route to *report* them —
 * on the one screen in this app where a stranger is broadcasting live.
 *
 * ## Two sources, and which control hangs off which
 *
 * The ⋯ panel is built from the **event's** own `channel`, the payload this screen already has, so
 * it opens whatever else is happening. Follow cannot be: `is_followed` is viewer-relative and
 * `eventChannelSchema` carries `is_premium` and stops there, so it needs `useChannel(slug)` — a
 * second request.
 *
 * That split is the point rather than an accident. A failed or slow space request costs the reader
 * **Follow** and leaves the QR, the link and the creator's card exactly where they were. Hanging
 * the whole menu off that query would mean one 500 on an unrelated endpoint taking *Report* off a
 * live stream.
 *
 * ## Follow, and the state it must not guess
 *
 * `isViewerKnown` gates it, not `is_followed` alone. The channel body is **server-seeded
 * anonymously**, so its first client render says `is_followed: false` for everybody —
 * `use-channel.ts` records the bug that came of trusting it (the auto-follow bar painting for
 * people who already follow). A Follow button that appears and then vanishes on a stream you
 * follow is that same failure with a press attached, so it stays absent until the answer is real.
 *
 * `follow_requested` hides it too: a protected space that has already been asked cannot be asked
 * again, and legacy's condition (`is_followed` only) offers a second request that can only fail.
 *
 * ⚠ **Unfollow is deliberately not here.** Legacy's studio has none either — the control simply
 * disappears once followed — and the space's own menu is where the pair lives
 * (`channel-viewer-menu.tsx`). Half a toggle on a plate 40px tall is a second place to get the
 * state wrong.
 *
 * ## The ⋯ is legacy's panel, not a list of rows
 *
 * `IconBtnMore` opens a 256px card: the creator, the stream's title, a QR of the share URL, and two
 * controls — *Copy link* and *Report*. That shape is kept, because the QR is the point of it: the
 * menu exists to get the stream onto a phone, and a row reading "QR code" that opens a second popup
 * is one press more for the thing most people came for.
 *
 * What is **not** kept is its colour. Legacy hard-codes `#292532` with white text; this app has a
 * dark mode, and a popup is a surface of ours rather than something drawn on the video, so it wears
 * the DS's elevated background. `lib/studio.ts`'s literal-ink rule is about the plates floating *on
 * the stream* — the trigger is one of those and stays on `EVENT_STUDIO_PILL`.
 *
 * Report opens `features/channel`'s own dialog, which already carries the nine reasons, the
 * description field and *Report and Block*. It needs a full `Channel`, so it is the one thing in
 * the panel that waits on the second request.
 */
export function EventStudioChannelActions({
    channel,
    eventTitle,
    getShareUrl,
}: {
    /** The event payload's channel — everything the panel draws. */
    channel: EventChannel
    /** The stream's own title, under the creator's name in the panel. */
    eventTitle: string | null
    /**
     * What the QR encodes and what *Copy link* writes — called when the menu **opens**, never
     * during render.
     *
     * The fallback it builds reads `window.location.origin`, and `event-share-button.tsx` records
     * what that costs during a render: the server has no origin, so the markup differs and React
     * throws the server's tree away over a difference nothing else makes visible.
     */
    getShareUrl: () => string | null
}) {
    const { t } = useTranslation()
    const { channel: space, isViewerKnown } = useChannel(channel.slug)
    /** Resolved when the menu opens — see `getShareUrl`. */
    const [shareUrl, setShareUrl] = useState<string | null>(null)
    const [reportOpen, setReportOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    const name = channel.name ?? channel.slug
    const thumb = channel.images.thumb

    async function copyLink() {
        if (!shareUrl) return
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            /*
             * `navigator.clipboard` is absent on an insecure origin and can be refused outright —
             * the same failure `channel-copy-link.tsx` handles. Nothing is announced: the menu
             * stays open and the label simply does not change to *Link copied*.
             */
        }
    }

    return (
        <>
            {space && (
                <SpaceControls
                    channel={space}
                    isViewerKnown={isViewerKnown}
                    reportOpen={reportOpen}
                    onReportOpenChange={setReportOpen}
                />
            )}

            <Menu.Root onOpenChange={open => open && setShareUrl(getShareUrl())}>
                <Menu.Trigger
                    data-testid="event-studio-more"
                    aria-label={t('channel_menu_actions')}
                    className={cn(
                        EVENT_STUDIO_PILL,
                        'flex size-7 flex-none items-center justify-center',
                        'transition-colors hover:bg-white/20',
                    )}
                >
                    <Icon name="more-horizontal" size={16} />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
                        <Menu.Popup
                            data-testid="event-studio-more-panel"
                            className={cn(
                                'flex w-[256px] flex-col gap-3 p-3',
                                'rounded-(--radius-lg) bg-(--background-elevated) shadow-lg outline-none',
                            )}
                        >
                            {/* The creator, the stream, and the code that opens both on a phone. */}
                            <div className="flex flex-col items-center gap-3 rounded-(--radius-md) border border-(--separator-default) p-3">
                                <Avatar
                                    size="small"
                                    type={thumb ? 'image' : 'initials'}
                                    className="size-7 flex-none"
                                >
                                    {thumb ? (
                                        <Image
                                            src={thumb}
                                            alt=""
                                            width={28}
                                            height={28}
                                            className="size-full rounded-full object-cover"
                                        />
                                    ) : (
                                        <AvatarInitials>
                                            {channel.slug
                                                .replace('@', '')
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </AvatarInitials>
                                    )}
                                </Avatar>

                                <span className="flex w-full min-w-0 items-center justify-center gap-1">
                                    <span className="type-dense-strong truncate text-(--text-title)">
                                        {name}
                                    </span>
                                    {channel.verified_tick_badge?.image && (
                                        <VerifiedBadge
                                            image={channel.verified_tick_badge.image}
                                            size={16}
                                            label={name}
                                        />
                                    )}
                                </span>

                                {eventTitle && (
                                    <span className="type-micro-overline w-full truncate text-center text-(--text-placeholder)">
                                        {eventTitle}
                                    </span>
                                )}

                                {shareUrl && (
                                    <>
                                        {/*
                                         * White whatever the theme: a QR is read by a camera, and
                                         * the quiet zone around it is part of the symbol rather
                                         * than decoration. `qrImageUrl` returns Tevi's branded
                                         * code, which is why no QR library is in the bundle.
                                         */}
                                        <span className="rounded-(--radius-lg) bg-white p-5">
                                            <Image
                                                src={qrImageUrl(shareUrl)}
                                                alt=""
                                                width={108}
                                                height={108}
                                                unoptimized
                                                className="size-[108px] object-contain"
                                            />
                                        </span>
                                        <span className="type-caption-meta text-center text-(--text-body)">
                                            {t('event_studio_qr_hint')}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    data-testid="event-studio-copy-link"
                                    disabled={!shareUrl}
                                    onClick={copyLink}
                                    className={cn(
                                        'flex h-10 min-w-0 flex-1 items-center justify-center gap-2',
                                        'rounded-(--radius-md) bg-(--background-subtle)',
                                        'type-dense-default text-(--text-body)',
                                        'transition-colors hover:bg-(--background-segment) disabled:opacity-60',
                                    )}
                                >
                                    <Icon name="link-simple" size={20} className="flex-none" />
                                    <span className="truncate">
                                        {copied ? t('channel_link_copied') : t('channel_copy_link')}
                                    </span>
                                </button>

                                {/*
                                 * The form needs a full `Channel`, so this is the one control that
                                 * waits on the second request rather than on the event payload.
                                 */}
                                {space && (
                                    <button
                                        type="button"
                                        data-testid="event-studio-report"
                                        aria-label={t('channel_report_title')}
                                        onClick={() => setReportOpen(true)}
                                        className={cn(
                                            'flex size-10 flex-none items-center justify-center',
                                            'rounded-(--radius-md) bg-(--background-subtle)',
                                            'text-(--text-body) transition-colors hover:bg-(--background-segment)',
                                        )}
                                    >
                                        <Icon name="exclamation-circle" size={20} />
                                    </button>
                                )}
                            </div>
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
        </>
    )
}

/**
 * Follow and the report form — the two that need the **space** rather than the event.
 *
 * One component because `useChannelActions` takes a `Channel` and hooks cannot be called after a
 * `null` guard. Its `follow.run` is already wrapped in `useRequireAuth`, so an anonymous press
 * opens the login dialog instead of failing — which is why nothing here calls that hook again.
 */
function SpaceControls({
    channel,
    isViewerKnown,
    reportOpen,
    onReportOpenChange,
}: {
    channel: NonNullable<ReturnType<typeof useChannel>['channel']>
    isViewerKnown: boolean
    reportOpen: boolean
    onReportOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()
    const { follow, block } = useChannelActions(channel)

    const showsFollow = isViewerKnown && !channel.is_followed && !channel.follow_requested

    return (
        <>
            {showsFollow && (
                <button
                    type="button"
                    data-testid="event-studio-follow"
                    disabled={follow.isPending}
                    onClick={follow.run}
                    className={cn(
                        'flex h-7 flex-none items-center gap-1 rounded-(--radius-fill) px-2',
                        'bg-(--button-accent-bg) text-(--text-on-accent) transition-colors',
                        'hover:bg-(--button-accent-bg-hover) disabled:opacity-60',
                    )}
                >
                    <Icon name="plus" size={16} />
                    <span className="type-micro-overline">{t('channel_action_follow')}</span>
                </button>
            )}

            {/* Legacy's `BtnPremiumOrMembership`, between Follow and ⋯ — see its own note. */}
            <EventStudioUpsell channel={channel} isViewerKnown={isViewerKnown} />

            <ChannelReportDialog
                channel={channel}
                open={reportOpen}
                onOpenChange={onReportOpenChange}
                onBlock={block.run}
            />
        </>
    )
}
