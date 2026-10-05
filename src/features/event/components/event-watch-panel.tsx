'use client'

import { useRequireAuth } from '@features/auth'
import { Sheen } from '@shared/components/sheen'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { GIFT_BOB, LIVE_BREATH, LOCK_JIGGLE, POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { appLink } from '../access'
import type { EventDetail } from '../api/types'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'
import { EVENT_STUDIO_NOTICE } from '../lib/studio'
import { type WatchState, watchState } from '../lib/watch-state'
import { EventAppHandoff } from './event-app-handoff'
import { EventUnlockActions } from './event-unlock-actions'

/**
 * **What this reader can do about this stream** — the page's one action block.
 *
 * `lib/watch-state.ts` decides *which* of the six states applies and states the ordering; this file
 * is only how each one reads. Keeping the decision out of the component is what makes it testable:
 * legacy has the same six branches as early returns inside a component, where the order *is* the
 * behaviour and nothing writes it down.
 *
 * ## Where the player would be
 *
 * This rewrite has no web player. Four of the six states therefore end in
 * `EventAppHandoff` — the QR and the store links — and the sentence above it is what differs. That
 * is deliberately **not** flattened into one message: "the website is not allowed to play this" and
 * "this client cannot play a live yet" are different facts, and saying the first when the second is
 * true blames the creator's settings for our missing feature. `docs/EVENT.md` §3 is the list of what
 * arrives with the player.
 *
 * ## The paywall is offered even though we cannot play it, and that is a judgment
 *
 * A reader who unlocks here can watch in the app, so the purchase is not a sale of nothing — and
 * withholding it would take the creator's revenue off the whole web surface. What it must not do is
 * *imply* a web player: on success the panel becomes `watchable`, which says "watch in the app" and
 * hands over the QR. The alternative — hiding the price until the player ships — was rejected
 * because the page would then advertise a members-only stream with no way in.
 */
/**
 * **Which plate a panel is drawn on** — and why it is a prop rather than a second set of components.
 *
 * The same six refusals are shown on two screens. On **Live details** each is one block in a 612px
 * column of cards (`EVENT_CARD`). In the **Live studio** it stands alone on a 390px plate centred
 * over the blurred stream (`EVENT_STUDIO_NOTICE`). Only the plate differs — the headline, the body,
 * the glyph and, critically, the *actions* are the same sentence either way.
 *
 * Legacy keeps the second set, and it has cost exactly what the duplication predicts.
 * `liveView/platformRestricted/` and the details page's equivalent are separate files with
 * separately hardcoded copy, and they have drifted: one offers *"Back to home"*, the other
 * *"Return to home"*, for the identical action. Only the studio copy offers *Open in Tevi App* at
 * all — so the reader refused on the narrower screen is refused with no way forward.
 */
export type EventPanelSurface = 'card' | 'studio'

export function EventWatchPanel({
    event,
    surface = 'card',
    lockedMidStream = false,
}: {
    event: EventDetail
    surface?: EventPanelSurface
    /**
     * The room locked this broadcast while the reader was watching it — legacy's `isLocked`. Only
     * the locked panel reads it: *Event is locked … to continue watching Live*, legacy's copy for
     * that case, instead of the offer made to a reader arriving at a gated stream.
     */
    lockedMidStream?: boolean
}) {
    const state = watchState(event)
    const url = appLink(event)

    switch (state.kind) {
        case 'off-air':
            return <OffAirPanel event={event} status={state.status} surface={surface} />
        case 'platform-restricted':
            return <PlatformRestrictedPanel url={url} surface={surface} />
        case 'upcoming':
            return <UpcomingPanel url={url} surface={surface} />
        case 'locked':
            return (
                <LockedPanel
                    event={event}
                    state={state}
                    url={url}
                    surface={surface}
                    midStream={lockedMidStream}
                />
            )
        case 'watchable':
            return <WatchablePanel url={url} surface={surface} />
        case 'unknown':
            return <UnknownPanel url={url} surface={surface} />
    }
}

/**
 * The block every state shares: a 48px tinted disc, a capped title and sentence, then whatever the
 * state offers.
 *
 * `role` is left off — this is page content, not a status region. The title is a real `<h2>` so a
 * screen reader meets it in document order, which is the same call `NsfwGatePanel` makes and for the
 * same reason.
 *
 * **Exported**, because it is no longer only this panel's. `EventHostLiveScreen` — the page a
 * creator gets while their own stream is on air — is the same shape saying a different thing, and a
 * second hand-written copy of the disc, the 340px measure and `py-6 md:py-8` is a second place for
 * those to drift. The same reasoning `EventOrderRowsSkeleton` carries one directory over, written
 * after two copies of a header did exactly that.
 */
export function EventPanelShell({
    icon,
    tone = 'neutral',
    title,
    body,
    children,
    testId,
    surface = 'card',
    clampBody = false,
    className,
}: {
    /**
     * The 48px disc. **Optional**, and the one caller that omits it is `EventHostLiveScreen`, where
     * it is decoration above a heading that already says what the state is. The six watch states
     * keep it — they sit under a banner and a details card, where a mark is what separates the
     * action block from the rows above it.
     */
    icon?: ReactNode
    /**
     * Only the disc's two colours change.
     *
     * `neutral` for a statement, `error` for a refusal, `brand` for the one state that is an
     * invitation. Each is a **designed pair** from the DS — a tinted ground with the matching accent
     * ink — so both halves move together between themes, which is the rule
     * `features/channel`'s `channel-event-card.tsx` had to learn the hard way when it pinned a
     * foreground to white over a background token that inverts.
     */
    tone?: 'neutral' | 'error' | 'brand'
    /**
     * A node, not a string — the locked state interpolates a Star mark after the price, and the
     * mark is a raster (`StarMark`) rather than a glyph, so it cannot be part of a translated
     * sentence. See that panel.
     */
    title: ReactNode
    body?: string
    children?: ReactNode
    testId: string
    /** See `EventPanelSurface`: the plate, and nothing else, changes between the two screens. */
    surface?: EventPanelSurface
    /**
     * Cut the body at two lines. Only for a body this app did not write — a creator's description
     * standing in for the refusal's own sentence, which legacy clamps the same way on this card.
     */
    clampBody?: boolean
    /** `flex-1 justify-center` on the host's live screen, so the card fills the column. */
    className?: string
}) {
    return (
        <section
            data-testid={testId}
            className={cn(
                'flex min-w-0 flex-col items-center gap-4 text-center',
                surface === 'studio'
                    ? EVENT_STUDIO_NOTICE
                    : cn(
                          EVENT_CARD,
                          EVENT_PADDING,
                          // More air than the other blocks: this one is the page's action and
                          // reads as a panel rather than a row. Legacy's own is 24px all round at
                          // every width.
                          'py-6 md:py-8',
                      ),
                className,
            )}
        >
            {icon && (
                <span
                    aria-hidden
                    className={cn(
                        'flex size-12 flex-none items-center justify-center rounded-(--radius-fill)',
                        tone === 'error' &&
                            'bg-(--accents-error-bg-active) text-(--accents-error-active)',
                        /*
                         * Indigo, and **not** Warning — which is what this was, and was wrong on its
                         * own terms: Warning is the token for "something may go wrong", and the state it
                         * marked is the page's happy path. Indigo is the DS's brand-adjacent tinted
                         * pair (the one `Avatar`'s initials type uses), so the mark reads as an
                         * invitation rather than a caution. Same class of mistake `NsfwGatePanel`
                         * records from the other direction, where a category was painted as a fault.
                         */
                        /*
                         * The **brand pair** (`--background-brand` / `--text-on-brand`), which did not
                         * exist when this was Indigo — and Indigo reads blue, not Tevi's violet, beside
                         * the violet accent button right under it. The pair is measured in both modes
                         * (`e2e/wallet.spec.ts`); the page's `--text-brand` would not be.
                         */
                        tone === 'brand' && 'bg-(--background-brand) text-(--text-on-brand)',
                        tone === 'neutral' && 'bg-(--background-segment) text-(--icon-secondary)',
                    )}
                >
                    {icon}
                </span>
            )}

            {/* Capped so the sentence breaks over the button below rather than running the full
                width of a 612px column above a short one — the same 340 the NSFW gate uses. */}
            <div className="flex min-w-0 max-w-[340px] flex-col gap-1">
                <h2 className="type-title-t2-semibold text-balance text-(--text-title)">{title}</h2>
                {body && (
                    <p
                        className={cn(
                            'type-dense-default text-pretty text-(--text-subtitle)',
                            clampBody && 'line-clamp-2',
                        )}
                    >
                        {body}
                    </p>
                )}
            </div>

            {/* Capped to match, so a `fullWidth` button is not as wide as the page. */}
            {children && (
                <div className="flex w-full min-w-0 max-w-[340px] flex-col gap-2">{children}</div>
            )}
        </section>
    )
}

/** On air, nothing in the way — the app is where it plays. */
function WatchablePanel({ url, surface }: { url: string | null; surface: EventPanelSurface }) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-watch"
            surface={surface}
            tone="brand"
            icon={<Icon name="signal-stream" weight="filled" size={24} />}
            title={t('event_watch_title')}
            body={t('channel_live_watch_in_app_body')}
        >
            <EventAppHandoff url={url} testId="event-watch-get-app" />
        </EventPanelShell>
    )
}

/**
 * **The studio's refusal card** — dark glass with a lit edge and a deep drop, the material the chat
 * column and the pinned message use, for a card that stands alone on the blurred ground.
 *
 * - `dark` scopes the theme tokens to Dark inside it, and the inks are then **stated** on top
 *   (`[&_h2]`, `[&_p]`): a token like `--text-subtitle` is resolved where it is declared (`:root`),
 *   so the scope does not reach it, and the body read at ~2:1 on the glass.
 * - Motion: the card `RISE`s, the mark pops a beat later (`StudioMark`), then the words at 160ms
 *   and the actions at 260ms — the shell's own children, staggered from here so the shared shell
 *   stays still everywhere else.
 */
const STUDIO_GLASS = cn(
    'dark',
    RISE,
    'bg-[rgba(20,16,30,0.72)] backdrop-blur-2xl ring-1 ring-inset ring-white/10',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.45)]',
    '[&_h2]:text-white [&_p]:text-white/70',
    '[&>*:nth-child(2)]:animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_160ms_both]',
    '[&>*:nth-child(3)]:animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_260ms_both]',
    'motion-reduce:[&>*:nth-child(2)]:animate-none motion-reduce:[&>*:nth-child(3)]:animate-none',
)

/**
 * The card's mark on the studio: it pops in after the card, with a halo of the state's own colour
 * breathing behind it. Off the studio it is the bare glyph, as before.
 */
function StudioMark({ on, glow, children }: { on: boolean; glow: string; children: ReactNode }) {
    return (
        <span className={cn('relative flex', on && cn(POP, '[animation-delay:120ms]'))}>
            {on && (
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -inset-7 rounded-full blur-lg',
                        LIVE_BREATH,
                    )}
                    style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}
                />
            )}
            {children}
        </span>
    )
}

/**
 * **Not available where you are** — legacy's `GeoRestricted`, raised by the preview endpoint's
 * `E003`, the one state the event payload cannot tell this client. Legacy's copy and its one way
 * out (home); drawn on the studio's glass over the blurred ground, never over the stream's art.
 */
export function EventGeoRestrictedPanel() {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-geo-restricted"
            surface="studio"
            tone="brand"
            className={STUDIO_GLASS}
            icon={
                <StudioMark on glow="rgba(124,77,255,0.7)">
                    <Icon name="globe-earth" size={24} className="relative" />
                </StudioMark>
            }
            title={t('event_geo_title')}
            body={t('event_geo_body')}
        >
            <Button
                data-testid="event-geo-home"
                variant="accent"
                size="large"
                fullWidth
                render={<Link href="/" />}
                className="group/home relative overflow-hidden"
            >
                <Sheen />
                <Icon name="house" size={20} className="relative flex-none" />
                <span className="relative min-w-0 truncate">{t('event_geo_home')}</span>
            </Button>
        </EventPanelShell>
    )
}

/**
 * The website may not play this one. Legacy's copy verbatim, including the 🚫 — which earns its
 * place: this is a refusal, and the glyph says so before the sentence is read.
 *
 * The same two strings `ChannelLiveRestrictedDialog` shows at the point of the press, so the dialog
 * a reader dismisses and the page they arrive at cannot contradict each other.
 */
function PlatformRestrictedPanel({
    url,
    surface,
}: {
    url: string | null
    surface: EventPanelSurface
}) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-platform-restricted"
            surface={surface}
            tone="error"
            className={cn(surface === 'studio' && STUDIO_GLASS)}
            icon={
                // Red: a refusal, and the one tone on the glass that says so.
                <StudioMark on={surface === 'studio'} glow="rgba(244,63,94,0.55)">
                    <Icon name="ban" weight="filled" size={24} className="relative" />
                </StudioMark>
            }
            // The 🚫 is legacy's; on the studio the mark above already says it, larger.
            title={
                surface === 'studio'
                    ? t('channel_live_restricted_title')
                    : `🚫 ${t('channel_live_restricted_title')}`
            }
            body={t('channel_live_restricted_body')}
        >
            <EventAppHandoff url={url} testId="event-restricted-get-app" />
        </EventPanelShell>
    )
}

/** Published or preparing. The schedule is already on the card above, so this is the hand-off. */
function UpcomingPanel({ url, surface }: { url: string | null; surface: EventPanelSurface }) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-upcoming"
            surface={surface}
            icon={<Icon name="calendar" weight="filled" size={24} />}
            title={t('event_upcoming_title')}
            body={t('event_upcoming_body')}
        >
            <EventAppHandoff url={url} testId="event-upcoming-get-app" />
        </EventPanelShell>
    )
}

/**
 * Stopped. **Three sentences, not one**, because the three statuses are three different facts and
 * legacy's own grouping of them (`['CANCELLED','ENDED','PAUSED']`) is about the *layout*, not the
 * message: a paused stream may come back, an ended one is over, a cancelled one never happened.
 *
 * The way out is the **space**, not the home feed. They followed a link *about this creator*, so the
 * creator is the nearest useful place; legacy sends them to `/`.
 */
function OffAirPanel({
    event,
    status,
    surface,
}: {
    event: EventDetail
    status: 'ENDED' | 'CANCELLED' | 'PAUSED'
    surface: EventPanelSurface
}) {
    const { t } = useTranslation()
    const slug = event.channel?.slug
    const name = event.channel?.name ?? (slug ? `@${slug}` : '')
    const avatar = event.channel?.images.thumb ?? null

    const copy = {
        PAUSED: { title: 'event_paused_title', body: 'event_paused_body' },
        ENDED: { title: 'event_ended_title', body: 'event_ended_body' },
        CANCELLED: { title: 'event_cancelled_title', body: 'event_cancelled_body' },
    }[status]

    return (
        <EventPanelShell
            testId="event-off-air"
            surface={surface}
            // The room's own glass on the studio — see `STUDIO_GLASS`. Still on the details page.
            tone={surface === 'studio' ? 'brand' : 'neutral'}
            className={cn(surface === 'studio' && STUDIO_GLASS)}
            icon={
                <StudioMark
                    on={surface === 'studio'}
                    // Violet: the room is quiet, not dead.
                    glow="rgba(124,77,255,0.7)"
                >
                    <Icon
                        name={status === 'PAUSED' ? 'stop' : 'history-rectangle-play'}
                        weight="filled"
                        size={24}
                        className="relative"
                    />
                </StudioMark>
            }
            title={t(copy.title)}
            body={t(copy.body)}
        >
            {slug && (
                <Button
                    data-testid="event-visit-space"
                    // The card's one way on, so on the studio it is the accent — with the space's
                    // face beside its name, so "back to" says *where*, and an arrow saying *go*.
                    variant={surface === 'studio' ? 'accent' : 'secondary'}
                    size="large"
                    fullWidth
                    render={<Link href={`/@${encodeURIComponent(slug)}`} />}
                    className={cn(surface === 'studio' && 'group/visit relative overflow-hidden')}
                >
                    {surface === 'studio' && <Sheen />}
                    {surface === 'studio' && (
                        <Avatar
                            size="xs"
                            type={avatar ? 'image' : 'initials'}
                            className="size-6 flex-none ring-2 ring-white/30"
                        >
                            {avatar ? (
                                <Image
                                    src={avatar}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="size-full rounded-full object-cover"
                                />
                            ) : (
                                <AvatarInitials>{name.slice(0, 2).toUpperCase()}</AvatarInitials>
                            )}
                        </Avatar>
                    )}
                    <span className="min-w-0 truncate">
                        {t('channel_live_back_to_space', { name })}
                    </span>
                    {surface === 'studio' && (
                        <Icon
                            name="arrow-right"
                            size={20}
                            className="flex-none transition-transform group-hover/visit:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/visit:-translate-x-0.5 motion-reduce:transition-none"
                        />
                    )}
                </Button>
            )}
        </EventPanelShell>
    )
}

/**
 * Gated, and this reader is outside it.
 *
 * The headline is `liveAccess`'s label — the **same** descriptor the badge over the banner uses, so
 * the two cannot disagree about which routes in exist. The sentence beneath names what unlocking
 * buys, in legacy's words.
 *
 * ## When neither control can be drawn
 *
 * A members-only stream whose space sells no Star-priced tier, or a priced one whose payload carries
 * no `product_id`. `EventUnlockActions` returns `null` there, and the fallback is the app hand-off
 * rather than a dead panel: the app can complete both purchases, so "open it there" is the honest
 * remaining answer. This is the shape of the page for a **cash-only** membership today —
 * `docs/PAYMENT.md` §8 pass 4 is when that stops being true.
 */
function LockedPanel({
    event,
    state,
    url,
    surface,
    midStream,
}: {
    event: EventDetail
    state: Extract<WatchState, { kind: 'locked' }>
    url: string | null
    surface: EventPanelSurface
    midStream: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const { access, requiresMembership, canUnlock } = state
    /*
     * The Star mark sits **after** the interpolated sentence rather than inside it, because it is a
     * raster and not a glyph (`StarMark` explains why the sprite's `star` is a different drawing)
     * — so it cannot be part of a translated string. Only where there is a figure for it to
     * qualify: "Members only" has no price, and a Star beside it would read as a price of nothing.
     * Same arrangement as the badge over the banner, so the two say the same thing the same way.
     */
    const title =
        access.price === null ? (
            t(access.key)
        ) : (
            <span className="inline-flex flex-wrap items-center justify-center gap-1">
                {t(access.key, { price: formatStarAmount(access.price, currentLanguage) })}
                <span className={cn('flex', GIFT_BOB)}>
                    <StarMark size={20} />
                </span>
            </span>
        )

    const priceText = access.price === null ? '' : formatStarAmount(access.price, currentLanguage)
    /*
     * Locked **mid-stream**: legacy's `exclusive/title` + `description` under `isLocked` — *Event
     * is locked*, and the way back in phrased as continuing, not starting. The same three routes
     * pick the sentence as below.
     */
    const body = midStream
        ? requiresMembership
            ? canUnlock
                ? t('event_locked_live_body_member_or_star', { price: priceText })
                : t('event_locked_live_body_member')
            : t('event_locked_live_body_star', { price: priceText })
        : requiresMembership
          ? canUnlock
              ? t('event_locked_body_member_or_star')
              : t('event_locked_body_member')
          : t('event_locked_body_star')

    return (
        <EventPanelShell
            testId="event-locked"
            surface={surface}
            /*
             * An invitation, so the brand pair rather than the neutral grey — the same reading
             * `WatchablePanel` gives a stream you can watch. The card arrives on `RISE`, the tile
             * pops in a beat later, and the lock gives a small shake every few seconds
             * (`LOCK_JIGGLE`) — "this is closed, and here is how to open it", without looping a
             * motion big enough to compete with the two buttons.
             */
            tone="brand"
            className={RISE}
            title={midStream ? t('event_locked_live_title') : title}
            icon={
                <span className={cn('flex', POP, '[animation-delay:120ms]')}>
                    <span className={cn('flex', LOCK_JIGGLE)}>
                        <Icon name="lock-simple" weight="filled" size={24} />
                    </span>
                </span>
            }
            body={body}
        >
            {/*
             * The hand-off is handed *in* rather than rendered beside: whether either control can be
             * drawn depends on a query inside `EventUnlockActions` (the space's tiers), so only that
             * component knows, and it swaps to this when the answer is neither.
             */}
            <EventUnlockActions
                event={event}
                requiresMembership={requiresMembership}
                fallback={<EventAppHandoff url={url} testId="event-locked-get-app" />}
            />
        </EventPanelShell>
    )
}

/**
 * A status this client does not recognise.
 *
 * No claim about time — not "coming soon", which would be a guess, and not an error, because every
 * other field on the page is fine. A status this client has never seen is the backend adding one,
 * and the honest response is to stop describing the schedule rather than to describe it wrongly.
 */
function UnknownPanel({ url, surface }: { url: string | null; surface: EventPanelSurface }) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-unknown"
            surface={surface}
            icon={<Icon name="signal-stream" weight="filled" size={24} />}
            title={t('event_watch_title')}
            body={t('channel_live_watch_in_app_body')}
        >
            <EventAppHandoff url={url} testId="event-unknown-get-app" />
        </EventPanelShell>
    )
}

/**
 * **Removed from the livestream** — the studio's refusal for the room's `kickout` frame.
 *
 * Legacy's `liveView/kickout`, which draws the same 510px column of the channel's art and the same
 * 390px card as every other gate screen and shares none of them — the pattern `EventPanelShell`
 * exists to end, so this is one more caller of it rather than a copy.
 *
 * Studio-only: nothing on Live details can raise it, because the frame arrives on a socket only the
 * studio opens. So the plate is fixed rather than a prop.
 *
 * Two deliberate differences, both from rules this port already applies to its other refusals:
 * legacy prints the title in `#D00416`, and the DS error ink is under AA as text in Light, so it is
 * the title ink here; and legacy's contained-primary button is `accent`, the DS's call-to-action
 * weight.
 *
 * Drawn like the studio's other refusals (region, platform, ended): the glass card on the blurred
 * ground (`blurOnly`), a glowing mark — a door, in the refusal's rose, since the reader has been
 * shown out rather than kept out — and the CTA with its sheen. Legacy's card was a flat black box
 * over the sharp art, the one refusal that did not look like the others.
 */
export function EventKickedOutPanel({
    message = null,
}: {
    /** The server's own sentence, when the removal came from a refused join. */
    message?: string | null
} = {}) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-kicked-out"
            surface="studio"
            tone="error"
            className={STUDIO_GLASS}
            icon={
                <StudioMark on glow="rgba(244,63,94,0.55)">
                    <Icon name="door-open" size={24} className="relative" />
                </StudioMark>
            }
            title={t('event_kickout_title')}
            body={message ?? t('event_kickout_body')}
        >
            <Button
                data-testid="event-kicked-out-home"
                variant="accent"
                size="large"
                fullWidth
                render={<Link href="/" />}
                className="relative overflow-hidden"
            >
                <Sheen />
                <Icon name="house" size={20} className="relative flex-none" />
                <span className="relative min-w-0 truncate">{t('event_kickout_home')}</span>
            </Button>
        </EventPanelShell>
    )
}

/**
 * **Banned from this channel** — the room's `block_user` frame, on the studio's frame.
 *
 * It replaced the whole studio with the details page's wall (`EventBannedState`): a reader went
 * from a black full-screen stage to a white column mid-broadcast, the one refusal that changed
 * screens. It is the same kind of fact as a removal, so it is drawn like one — the glass card on
 * the blurred ground, a rose mark, and the way on: other creators first (this one is closed to
 * them for good, unlike a removal), home second.
 */
export function EventBlockedPanel() {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-blocked"
            surface="studio"
            tone="error"
            className={STUDIO_GLASS}
            icon={
                <StudioMark on glow="rgba(244,63,94,0.55)">
                    <Icon name="ban" weight="filled" size={24} className="relative" />
                </StudioMark>
            }
            title={t('event_banned_notice')}
            body={t('event_banned_body')}
        >
            <div className="grid w-full gap-2">
                <Button
                    data-testid="event-blocked-discover"
                    variant="accent"
                    size="large"
                    fullWidth
                    render={<Link href="/search" />}
                    className="relative overflow-hidden"
                >
                    <Sheen />
                    <Icon name="search" size={20} className="relative flex-none" />
                    <span className="relative min-w-0 truncate">
                        {t('channel_not_found_discover')}
                    </span>
                </Button>
                <Button
                    data-testid="event-blocked-home"
                    variant="secondary"
                    size="large"
                    fullWidth
                    render={<Link href="/" />}
                    className="border-white/15 bg-white/[0.08] text-white hover:bg-white/15"
                >
                    <Icon name="house" size={20} className="flex-none" />
                    <span className="min-w-0 truncate">{t('channel_return_home')}</span>
                </Button>
            </div>
        </EventPanelShell>
    )
}

/**
 * **This account may not be in the room** — the room's `ban` frame.
 *
 * Legacy toasts the server's sentence and navigates home, and this port did the same: five seconds
 * of text in a corner while the page changed under it, so the one explanation the reader got was
 * the thing most likely to be missed. It is a card now, like every other refusal, and it stays until
 * the reader leaves. The server's sentence is the body — it is the only party that knows why — with
 * ours standing in when a frame arrives without one.
 */
export function EventAccountBannedPanel({ message }: { message: string | null }) {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-account-banned"
            surface="studio"
            tone="error"
            className={STUDIO_GLASS}
            icon={
                <StudioMark on glow="rgba(244,63,94,0.55)">
                    <Icon
                        name="exclamation-circle"
                        weight="filled"
                        size={24}
                        className="relative"
                    />
                </StudioMark>
            }
            title={t('event_account_banned_title')}
            body={message ?? t('event_account_banned_body')}
        >
            <Button
                data-testid="event-account-banned-home"
                variant="accent"
                size="large"
                fullWidth
                render={<Link href="/" />}
                className="relative overflow-hidden"
            >
                <Sheen />
                <Icon name="house" size={20} className="relative flex-none" />
                <span className="relative min-w-0 truncate">{t('channel_return_home')}</span>
            </Button>
        </EventPanelShell>
    )
}

/**
 * **Sign in to watch** — the card a guest's paywall carries, free broadcast or paid.
 *
 * Legacy's branch order settles it: `(isExclusive || !isAuthenticated) → <LivePreview/>`. A guest
 * gets the preview (on the anonymous session's bearer) and then this — the preview's `exclusive`
 * card: the event's title, its description clamped to two lines (or legacy's sneak-peek sentence
 * when it has none), and one *Sign in* button. No price, no membership route: a guest cannot act
 * on either. Drawn by `EventExclusivePaywall`, over the preview or once it is over.
 *
 * ⚠ This port used to send a guest on a free broadcast to `watchable`, which asked for playback
 * with no bearer, got refused, and landed on the app hand-off — telling somebody who only needed to
 * sign in that they needed a different app.
 *
 * The description is rendered as **text**. Legacy passes it through `dangerouslySetInnerHTML`,
 * which injects creator-typed markup into the page; `EventDescriptionCard` records the same call.
 */
export function EventSignInPanel({ event }: { event: EventDetail }) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    return (
        <EventPanelShell
            testId="event-sign-in"
            surface="studio"
            title={event.title ?? ''}
            body={event.description?.trim() || t('event_studio_sign_in_body')}
            clampBody
        >
            <Button
                data-testid="event-sign-in-action"
                variant="accent"
                size="large"
                fullWidth
                // `requireAuth` opens the login dialog for a guest, which is the only reader here.
                onClick={requireAuth(() => {})}
            >
                {t('auth_sign_in')}
            </Button>
        </EventPanelShell>
    )
}
