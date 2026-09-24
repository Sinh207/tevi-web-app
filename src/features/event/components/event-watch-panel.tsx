'use client'

import { useRequireAuth } from '@features/auth'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
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
}: {
    event: EventDetail
    surface?: EventPanelSurface
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
            return <LockedPanel event={event} state={state} url={url} surface={surface} />
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
                        tone === 'brand' &&
                            'bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)',
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
            icon={<Icon name="ban" weight="filled" size={24} />}
            title={`🚫 ${t('channel_live_restricted_title')}`}
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

    const copy = {
        PAUSED: { title: 'event_paused_title', body: 'event_paused_body' },
        ENDED: { title: 'event_ended_title', body: 'event_ended_body' },
        CANCELLED: { title: 'event_cancelled_title', body: 'event_cancelled_body' },
    }[status]

    return (
        <EventPanelShell
            testId="event-off-air"
            surface={surface}
            icon={
                <Icon
                    name={status === 'PAUSED' ? 'stop' : 'history-rectangle-play'}
                    weight="filled"
                    size={24}
                />
            }
            title={t(copy.title)}
            body={t(copy.body)}
        >
            {slug && (
                <Button
                    data-testid="event-visit-space"
                    variant="secondary"
                    size="large"
                    fullWidth
                    render={<Link href={`/@${encodeURIComponent(slug)}`} />}
                >
                    {t('channel_live_back_to_space', { name })}
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
}: {
    event: EventDetail
    state: Extract<WatchState, { kind: 'locked' }>
    url: string | null
    surface: EventPanelSurface
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
                <StarMark size={20} />
            </span>
        )

    const body = requiresMembership
        ? canUnlock
            ? t('event_locked_body_member_or_star')
            : t('event_locked_body_member')
        : t('event_locked_body_star')

    return (
        <EventPanelShell
            testId="event-locked"
            surface={surface}
            icon={<Icon name="lock-simple" weight="filled" size={24} />}
            title={title}
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
 * weight. No disc above it — legacy draws none on this card, and the heading says what happened.
 */
export function EventKickedOutPanel() {
    const { t } = useTranslation()
    return (
        <EventPanelShell
            testId="event-kicked-out"
            surface="studio"
            title={t('event_kickout_title')}
            body={t('event_kickout_body')}
        >
            <Button
                data-testid="event-kicked-out-home"
                variant="accent"
                size="large"
                fullWidth
                render={<Link href="/" />}
            >
                {t('event_kickout_home')}
            </Button>
        </EventPanelShell>
    )
}

/**
 * **Sign in to watch** — what a guest gets on the studio, free broadcast or paid.
 *
 * Legacy's branch order settles it: `(isExclusive || !isAuthenticated) → <LivePreview/>`, and the
 * preview's own fetches are gated on `currentUser?.id` — so a guest is routed to the preview and
 * then never asks for one. What renders is the preview's `exclusive` card with nothing behind it:
 * the event's title, its description clamped to two lines (or legacy's sneak-peek sentence when it
 * has none), and one *Sign in* button. No price, no membership route: a guest cannot act on either.
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
