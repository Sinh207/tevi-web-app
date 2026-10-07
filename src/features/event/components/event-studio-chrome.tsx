'use client'

import { StarChangeFlash, useBalanceDisplay } from '@features/balance'
import type { ShareContext } from '@features/share'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { PhoneMark } from '@shared/components/phone-mark'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import type { EventChannel } from '../api/types'
import { EVENT_STUDIO_PILL } from '../lib/studio'
import { EventStudioChannelActions } from './event-studio-channel-actions'

/**
 * **The studio's floating chrome** — the three plates that sit over the video at the top corners.
 *
 * ```
 * ┌──────────────────────────────────────────────────────┐
 * │ (←) ( ◍ Leslie Alexander · 116.2K followers )   ( ★ 8,734 · ⬡ Get App ) │
 * ```
 *
 * All three are in one file because they are one band and legacy's four copies of it had already
 * drifted — `iconBtnBack` carries the smoked fill with **no** `backdrop-filter`, so the disc reads
 * as a different material from the pill 8px to its right. `EVENT_STUDIO_PILL` is what they share.
 *
 * The trailing toolbar is the same material and the same 40px — see `EVENT_STUDIO_PILL`'s note
 * for why it no longer follows the comps' darker plate.
 *
 * ⚠ **Ink is literal here and that is correct** — see the header of `lib/studio.ts`. The ground is
 * a creator's camera under a scrim, not a surface of ours, so `--text-title` (which inverts between
 * modes) would be near-black text on a black plate in Light. `EventBanner`'s access pill states the
 * same exception for the same reason.
 */

/**
 * Back — **to wherever they came from, and to the space when there is no such place.**
 *
 * Legacy's `iconBtnBack`, including the fallback, which is the part worth keeping: a studio reached
 * from a shared link has nothing behind it in the history, and `router.back()` on a fresh tab does
 * nothing at all. The reader is then stuck on a full-screen stage with no visible way out, because
 * the studio covers the site's own chrome. The space page is the honest destination — it is where
 * the stream came from.
 *
 * `history.length > 1` is the same test legacy uses. It over-counts (a tab that visited two pages
 * before this one and then had the address bar edited still reads 3), but it never *under*-counts,
 * and the failure direction matters: over-counting sends a `back()` that lands somewhere else in
 * this app, under-counting would send somebody with a real history out to the space page and lose
 * their place.
 */
export function EventStudioBackButton({ slug, testId }: { slug: string | null; testId?: string }) {
    const router = useRouter()
    const { t } = useTranslation()

    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={t('common_back')}
            onClick={() => {
                if (window.history.length > 1) {
                    router.back()
                    return
                }
                router.push(slug ? `/@${encodeURIComponent(slug)}` : '/')
            }}
            className={cn(
                EVENT_STUDIO_PILL,
                'flex size-10 flex-none items-center justify-center',
                'transition-colors hover:bg-white/20',
            )}
        >
            {/* `angle-left`, not an arrow — the DS uses the chevron for "up one level" everywhere
                else in this app, and legacy's `ArrowBackIosNewRounded` is the same shape.
                **24, measured off the comps** (`Chevron` is 24×24 inside the 40px disc); 20 was
                inherited from nothing in particular and read a size small against the pill. */}
            <Icon name="angle-left" size={24} className="rtl:-scale-x-100" />
        </button>
    )
}

/**
 * Who is streaming — **avatar, name, verified mark, follower count**, as one plate beside the back
 * disc.
 *
 * ## The whole plate is a link
 *
 * Legacy's is not, and the reason it needs to be is the studio covers the site: there is no navbar,
 * no rail and no breadcrumb, so the creator's name is the *only* route from a stream to the space
 * that owns it. `next/link`, never a bare `<a>` — `CLAUDE.md` records that this exact mistake has
 * already shipped twice in the Live surfaces, and the markup and the pixels are identical either
 * way, so only a network panel shows the full document reload.
 *
 * ⚠ `VerifiedBadge` opens a dialog on press, so it may **not** be nested inside the link — a
 * control inside an anchor is a press that does two things and an invalid tree. It sits as a
 * sibling, which is also what puts it outside the name's truncation.
 *
 * ## The follower count is absent until it is known, never zero
 *
 * Legacy prints the row only when `follower_count > 0`, and that is right for a reason it does not
 * state: the stat arrives in a **second** request, so a freshly-mounted pill has `undefined` and a
 * naive `?? 0` would flash *"0 followers"* under the name of somebody with a hundred thousand.
 * A creator's first stream genuinely having no followers is the same sentence and equally not worth
 * printing.
 *
 * ⚠ Legacy's own plural test is `followerCount > 1` on the **formatted string** (`'1.2K' > 1` is
 * `false` in JS, so every compact count says "follower"). The count goes through i18n plurals here
 * instead, which is also what gets Arabic's six forms right.
 */
export function EventStudioChannelBar({
    channel,
    followerCount,
    eventTitle,
    getShareUrl,
    shareContext = null,
    compact = false,
    testId,
}: {
    channel: EventChannel | null
    /**
     * From `useChannelStats`, and **`null` while it is in flight** — not `0`. The distinction is
     * the whole of the note above; a defaulted zero is a wrong number rather than a missing one.
     */
    followerCount: number | null
    /** The stream's title, which the ⋯ panel prints under the creator's name. */
    eventTitle: string | null
    /** Resolved when that panel opens — see `EventStudioChannelActions`. */
    getShareUrl: () => string | null
    /** Forwarded to the ⋯ panel — see `EventStudioChannelActions`. */
    shareContext?: ShareContext | null
    /** The portrait studio: no upsell pill, and the plate may shrink to the row it is given. */
    compact?: boolean
    testId?: string
}) {
    const { t } = useTranslation()

    if (!channel?.slug) return null

    const name = channel.name ?? channel.slug
    const thumb = channel.images.thumb

    return (
        <div
            data-testid={testId}
            /*
             * The toolbar's grammar on the leading side: a 40px plate whose presses are 32px
             * segments with their own hover wash, so the creator link reads as a control rather
             * than as a caption, and ⋯ sits behind a hairline like Get App does.
             */
            className={cn(
                EVENT_STUDIO_PILL,
                'flex h-10 items-center gap-2 ps-1 pe-1',
                compact && 'min-w-0 max-w-full',
            )}
        >
            <Link
                href={`/@${encodeURIComponent(channel.slug)}`}
                data-testid="event-studio-channel-link"
                className={cn(
                    'group flex h-8 min-w-0 items-center gap-2 rounded-full ps-0.5 pe-2.5',
                    'transition-colors hover:bg-white/10',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                )}
            >
                <Avatar
                    size="small"
                    type={thumb ? 'image' : 'initials'}
                    /* A hairline rim, so the face separates from a dark frame behind the plate;
                       it brightens with the segment's hover. */
                    className="size-7 flex-none ring-1 ring-white/25 transition-shadow group-hover:ring-white/50"
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
                            {channel.slug.replace('@', '').slice(0, 2).toUpperCase()}
                        </AvatarInitials>
                    )}
                </Avatar>

                <span className="flex min-w-0 flex-col">
                    <span className="type-caption-label-strong truncate text-white">{name}</span>
                    {followerCount !== null && followerCount > 0 && (
                        <span className="type-micro-overline truncate text-white/70">
                            {t('event_studio_followers', {
                                count: followerCount,
                                formatted: formatCount(followerCount),
                            })}
                        </span>
                    )}
                </span>
            </Link>

            {/* Outside the anchor — it is a button that opens the "what is this tick" dialog. */}
            {channel.verified_tick_badge?.image && (
                <VerifiedBadge image={channel.verified_tick_badge.image} size={14} label={name} />
            )}

            {/*
             * Follow and the ⋯ menu, which need the **space** rather than the event — their own
             * file says why, and why they are a second query rather than a field on this payload.
             */}
            <EventStudioChannelActions
                channel={channel}
                eventTitle={eventTitle}
                getShareUrl={getShareUrl}
                shareContext={shareContext}
                compact={compact}
            />
        </div>
    )
}

/**
 * The trailing plate — **the reader's Star balance and the way to the app.**
 *
 * ## The balance is only shown to somebody who has one
 *
 * `isKnown` is `useBalanceDisplay`'s "the figure has actually arrived" signal, and the alternative
 * it exists to prevent is printing its `'—'` placeholder: an em dash where a number goes, on a
 * screen whose next control asks the reader to spend it, reads as a balance of nothing rather than
 * as one still loading. A signed-out visitor has no balance at all and gets only *Get App*.
 *
 * Pressing it opens `/get-star` in a **new tab**, which is legacy's behaviour and is deliberate
 * here rather than inherited: navigating in place would tear the studio down — leaving the stream,
 * the socket room and the reader's place in the chat — to buy the Star they wanted in order to
 * stay. It is the one outbound link on this screen that must not be a `next/link`, so it carries
 * the `internal-link-ok:` escape `pnpm lint:links` requires.
 *
 * ## The figure has to acknowledge a spend, and on this screen it is the only thing that can
 *
 * `StarChangeFlash` — legacy's `amountTVSSpend` animation, which this plate had been shipped
 * without. It matters more here than anywhere else it is mounted: the studio covers the app shell,
 * so the navbar's own copy of the flash is **off screen**, and the sustained fee takes a Star every
 * five minutes. Without it a reader is charged repeatedly by a screen that never says so.
 *
 * Scoped to the balance by a `relative` wrapper and a **sibling** of the link, for the two reasons
 * `end-rail-pill.tsx` gives: the flash centres itself in its positioning context (on the whole
 * plate it drifts down under *Get App*), and it carries a `role="status"` sentence, which inside an
 * anchor would be content of that anchor.
 *
 * ## The phone is `PhoneMark`, not a sprite glyph
 *
 * The same mark the end rail's *Get App* draws, which is why it moved to `shared/components`. The
 * DS has no phone and the comps' own `Get App` instantiates this very path — see that file, which
 * also records the upstream `mobile` glyph that was tried and reverted for disagreeing with it.
 *
 * ## One case legacy has that this does not
 *
 * Legacy branches on `react-device-detect`'s `isMobile`: a phone gets an AppsFlyer OneLink
 * (`useDynamicLink`), a desktop gets the QR dialog. AppsFlyer is not in this app —
 * `end-rail/get-app-button.tsx` records why it was dropped rather than ported, including the bug
 * where `redirectToApp()` silently no-ops until a PostHog-gated effect has filled the link. The
 * dialog carries both store badges, so the destination is reachable from a phone; what is lost is
 * "open the app if it is already installed".
 */
export function EventStudioToolbar({ testId }: { testId?: string }) {
    const { t } = useTranslation()
    const { star, isKnown } = useBalanceDisplay()
    const [appOpen, setAppOpen] = useState(false)

    return (
        <>
            <div
                data-testid={testId}
                /*
                 * Two segments on one plate, each its own 32px hover target, split by a hairline —
                 * the balance and the app are two different presses, and a plate with no seam
                 * read as one sentence ("149,575 Get App"). 14px ink, the channel pill's scale,
                 * rather than 16: at 16 this was the largest text in the band.
                 */
                className={cn(EVENT_STUDIO_PILL, 'flex h-10 items-center gap-0.5 px-1')}
            >
                {isKnown && (
                    // internal-link-ok: a new tab on purpose — navigating in place would unmount
                    // the stream and the chat room the reader is buying Star in order to stay in.
                    <span className="relative flex flex-none items-center">
                        <a
                            href="/get-star"
                            target="_blank"
                            rel="noreferrer noopener"
                            data-testid="event-studio-star"
                            className={SEGMENT}
                        >
                            <StarMark size={20} />
                            <span className="type-dense-strong tabular-nums text-white">
                                {star}
                            </span>
                            {/*
                             * The top-up mark: says the figure is a button that adds Star, which
                             * the bare number never did. `tabular-nums` above keeps the plate from
                             * twitching width as the sustained fee ticks the count down.
                             */}
                            <span
                                aria-hidden
                                className="grid size-5 flex-none place-items-center rounded-full bg-white/20"
                            >
                                <Icon name="plus" size={16} />
                            </span>
                            <span className="sr-only">{t('balance_action_get_star')}</span>
                        </a>

                        <StarChangeFlash />
                    </span>
                )}

                {isKnown && <span aria-hidden className="h-4 w-px flex-none bg-white/20" />}

                <button
                    type="button"
                    data-testid="event-studio-app"
                    onClick={() => setAppOpen(true)}
                    className={SEGMENT}
                >
                    {/* 20 now the ink is 14 — the comps' 24 was drawn against 16px text. */}
                    <PhoneMark className="size-5 flex-none" />
                    <span className="type-dense-emphasis text-white">{t('event_studio_app')}</span>
                </button>
            </div>

            <GetAppDialog
                open={appOpen}
                onOpenChange={setAppOpen}
                testId="event-studio-app-dialog"
            />
        </>
    )
}

/** One press on the trailing plate — 32px tall inside its 40, so the hover wash keeps a 4px rim. */
const SEGMENT = cn(
    'flex h-8 flex-none items-center gap-1.5 rounded-full px-2.5 text-white',
    'transition-colors hover:bg-white/10',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
)

/**
 * **Star and Get App, on the portrait studio's top row** — the desktop toolbar's two segments,
 * compacted for a phone: the balance as a glass chip (the Star and the figure, a new tab to top
 * up so the stream keeps playing), and Get App as a round icon, its dialog the toolbar's.
 */
export function EventStudioTopActions() {
    const { t } = useTranslation()
    const { star, isKnown } = useBalanceDisplay()
    const [appOpen, setAppOpen] = useState(false)
    return (
        <>
            <div className="flex flex-none items-center gap-1.5">
                {isKnown && (
                    // internal-link-ok: a new tab on purpose — see the toolbar's note.
                    <a
                        href="/get-star"
                        target="_blank"
                        rel="noreferrer noopener"
                        data-testid="event-studio-top-star"
                        className="relative flex h-8 items-center gap-1 rounded-full bg-black/40 ps-1.5 pe-2.5 ring-1 ring-inset ring-white/15 backdrop-blur-md transition-transform active:scale-95 motion-reduce:transition-none"
                    >
                        <StarMark size={18} />
                        <span className="type-caption-label-strong max-w-20 truncate tabular-nums text-white">
                            {star}
                        </span>
                        <StarChangeFlash />
                    </a>
                )}
                <button
                    type="button"
                    data-testid="event-studio-top-app"
                    aria-label={t('event_studio_app')}
                    onClick={() => setAppOpen(true)}
                    className="grid size-8 place-items-center rounded-full bg-black/40 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-transform active:scale-95 motion-reduce:transition-none"
                >
                    <PhoneMark className="size-4" />
                </button>
            </div>
            <GetAppDialog
                open={appOpen}
                onOpenChange={setAppOpen}
                testId="event-studio-top-dialog"
            />
        </>
    )
}
