'use client'

import { type Channel, ChannelProtectedNotice, type FollowedLive } from '@features/channel'

import { EVENT_CONTAINER } from '@features/event'
import {
    billTotal,
    EVENT_PANEL,
    EventAccountBannedPanel,
    EventAgeGate,
    EventBannedState,
    EventBlockedPanel,
    EventCardState,
    EventDescriptionCard,
    EventDetailsCard,
    EventEndedRail,
    EventErrorState,
    EventExclusivePaywall,
    EventGeoRestrictedPanel,
    EventGiftFloat,
    EventGiftPanel,
    EventGiftTray,
    EventHostCard,
    EventHostInfoCard,
    EventInfoDialog,
    EventInvitationDialog,
    EventKickedOutPanel,
    EventLiveAnalyticsCard,
    EventMaintenanceFeeCard,
    EventMobileLiveNotice,
    EventNewMembersCard,
    EventNotEnoughStarsDialog,
    EventNotFoundState,
    EventOrderRow,
    EventOrdersPanel,
    EventOutOfStarDialog,
    EventPremiumNudge,
    EventPreviewCountdown,
    EventRevenueSummary,
    EventSeatCard,
    EventSkeleton,
    EventStudioChat,
    EventStudioChatStrip,
    EventStudioCompact,
    EventStudioScreen,
    EventStudioSeats,
    EventStudioSkeleton,
    EventTopBar,
    EventTotalRevenueCard,
    EventWatchPanel,
    eventDetailSchema,
    eventOrderSchema,
    eventSummarySchema,
    interactiveBill,
    liveBill,
    MAINTENANCE_FEE_INFO,
    mergeGiftBurst,
    normalizeBill,
    normalizeGiftPackages,
    SEAT_LAYOUT_CODES,
    SUSTAINED_VIEWERS_INFO,
    seatArrangement,
    seatBoxAspect,
    seatBoxStyle,
    watchState,
} from '@features/event/dev'
import { cn } from '@shared/lib/utils'
import { type ReactNode, useState } from 'react'

/**
 * Every state of the event page on one scroll, in a client component because two of the screens
 * take callbacks (`onRetry`, `onConfirm`) and a server component cannot hand a function across the
 * boundary.
 *
 * Parsed through `eventDetailSchema` rather than written as literals — see the route's own note.
 */
const CHANNEL = {
    id: '1',
    slug: 'ada',
    name: 'Ada Lovelace',
    images: { thumb: null, cover: null },
    verified_tick_badge: null,
    // A Premium host, so the pinned message's crown has something to show.
    is_premium: true,
}

const base = (fields: Record<string, unknown>) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        title: 'Friday night listening party',
        start_at: '2026-02-20T14:30:00.000Z',
        status: 'LIVE',
        channel: CHANNEL,
        images: { banner: null },
        public_url: 'https://tevi.com/e/evt-1/',
        ...fields,
    })

/**
 * The six watch states, each with the payload that produces it — so the *decision* is being
 * exercised here and not just the markup. `watchState`'s `kind` is printed beside each one, which is
 * what makes a mis-ordered branch visible rather than merely wrong.
 */
const WATCH_FIXTURES = [
    { label: 'watchable — on air, nothing in the way', event: base({}) },
    {
        label: 'locked — priced, purchasable',
        event: base({ price: '250.00', price_currency: 'TVS', product_id: 'prod-1' }),
    },
    {
        label: 'locked — priced, no product id (fails closed to the app hand-off)',
        event: base({ price: '250.00', price_currency: 'TVS' }),
    },
    {
        label: 'locked — members only',
        event: base({ required_packages: ['pkg-1'], need_unlock_package: true }),
    },
    {
        label: 'locked — members or Star',
        event: base({
            price: '250.00',
            product_id: 'prod-1',
            required_packages: ['pkg-1'],
            need_unlock_package: true,
        }),
    },
    { label: 'upcoming — published', event: base({ status: 'PUBLISHED' }) },
    { label: 'off-air — paused', event: base({ status: 'PAUSED' }) },
    {
        label: 'off-air — ended',
        event: base({ status: 'ENDED', ended_at: '2026-02-20T16:30:00.000Z' }),
    },
    { label: 'off-air — cancelled', event: base({ status: 'CANCELLED' }) },
    {
        label: 'platform-restricted — outranks the paywall',
        event: base({ restricted_platforms: ['Website'], price: '250.00', product_id: 'prod-1' }),
    },
    {
        label: 'unknown — a status this client has never seen',
        event: base({ status: 'ARCHIVED' }),
    },
]

const FULL_PAGE = base({
    price: '250.00',
    price_currency: 'TVS',
    product_id: 'prod-1',
    description:
        'Two hours of covers, requests and one very long paragraph so the description card has something to clamp. Bring your own guitar.\n\nStarts right after the sound check.',
})

/**
 * The **host's** report, from parsed fixtures.
 *
 * Every card below is behind an owner session on an event that has already aired — a bill needs
 * somebody to have bought a ticket — so none of it is reachable by browsing, and the *No data*
 * branches and the MCN-commission row have never been visible any other way.
 *
 * The bill is deliberately the **awkward** payload rather than a tidy one: one line reports
 * `amount` without `subtotal` (the fallback legacy applies to some rows and not others), the
 * interactive half carries a type this client has no label for, and an MCN commission is present.
 */
const BILL = normalizeBill([
    {
        category: 'LIVE',
        amount: '182.50',
        fee: '18.25',
        net_amount: '155.25',
        bill_detail: {
            revenue: [
                {
                    type: 'ticket',
                    quantity: 3,
                    price: { amount: '60' },
                    subtotal: { amount: '180' },
                },
                // `amount` with no `subtotal` — the row legacy prints as `$0` on some cards.
                { type: 'gift', quantity: 12, amount: { amount: '2.50' } },
                { type: 'consumables', quantity: 0, subtotal: { amount: '0' } },
            ],
            commission: { mcn: { amount: '9.00' } },
        },
    },
    {
        category: 'ACTION',
        amount: '40.00',
        fee: '20.00',
        net_amount: '20.00',
        bill_detail: {
            revenue: [
                { type: 'live_chat', quantity: 88, subtotal: { amount: '8.80' } },
                { type: 'view_cost', quantity: 312, subtotal: { amount: '31.20' } },
                // A type this client has no label for — falls back to the un-snake-cased name.
                { type: 'some_new_thing', quantity: 4, amount: { amount: '0.40' } },
            ],
        },
    },
])

const SUMMARY = eventSummarySchema.parse({
    peak_ccu: 1842,
    unique_view_count: 9310,
    // 25 hours of aggregate watch time — the figure legacy wraps to `01:00:00`.
    live_duration: 7384,
    total_view_duration: 25 * 3600 + 61,
    new_member_count: 37,
    go_live_total_display: 12,
})

const ORDERS = [
    {
        net_amount: '60',
        created_at: 1771597800000,
        user: {
            display_name: 'Grace Hopper',
            channel_slug: 'grace',
            avatar: { thumb: null },
            channel_verified_tick_badge: null,
        },
    },
    // No slug — the row is not a link, in either client.
    { net_amount: '2.50', created_at: 1771597900000, user: { display_name: 'Anonymous fan' } },
    // A game order names a product rather than a person.
    {
        net_amount: '0.40',
        created_at: 1771598000000,
        product: { name: 'Lucky wheel spin', images: { thumb: null } },
    },
].map(row => eventOrderSchema.parse(row))

/**
 * The three studio states Phase A routes to, each with the payload that produces it.
 *
 * Deliberately **not** every `watchState` kind. `upcoming` and `unknown` cannot reach the stage —
 * `isStudioEligible` only opens it for `LIVE` or a stream off air inside the five-minute window —
 * and `watchable` is held back until the player exists (`EventScreen` carries that clause and the
 * case that pins it). Listing states the screen cannot be in is how a harness starts lying.
 */
const STUDIO_FIXTURES = [
    /*
     * On air and watchable — the state the studio exists for, and the one that used to be routed
     * away from it. It asks `playback/` rather than `preview/`: no quota, no countdown, no blur.
     */
    { label: 'watchable — on air, nothing in the way', event: base({}) },
    {
        label: 'locked — priced, purchasable',
        event: base({ price: '250.00', price_currency: 'TVS', product_id: 'prod-1' }),
    },
    {
        label: 'locked — members only',
        event: base({ required_packages: ['pkg-1'], need_unlock_package: true }),
    },
    {
        label: 'platform-restricted — the website may not play it',
        event: base({ restricted_platforms: ['Website'] }),
    },
    {
        label: 'off-air — ended inside the five-minute window',
        event: base({ status: 'ENDED', ended_at: '2026-02-20T16:30:00.000Z' }),
    },
    /*
     * The same refusal **with art**, because the backdrop is the half of this screen the other
     * fixtures cannot show: they carry no banner and no avatar, so the stage is plain black — a
     * correct state, and one that hides the blur, the 10% overscan and the 60% scrim entirely.
     *
     * A committed illustration rather than a CDN URL: `pnpm art:audit` fails on a remote image in
     * `src/`, and a harness is not the exception (`docs/STATIC_ASSETS.md`). It is the wrong *shape*
     * for a stream banner, which does not matter — what is being checked is that the blur has no
     * visible seam at the edges and that white chrome stays legible over it.
     */
    {
        label: 'locked — with art, so the blurred backdrop and the scrim are visible',
        event: base({
            price: '250.00',
            price_currency: 'TVS',
            product_id: 'prod-1',
            images: { banner: '/illustrations/event/no-data.webp' },
        }),
    },
]

/**
 * Stand-in co-hosts for the seat grid.
 *
 * Nine, because that is the ceiling the layout vocabulary stops at, and each one differs in the
 * two states the tile actually renders differently — camera and microphone. Without that variety
 * the grid looks correct while the "camera off" branch, which is the one with the avatar and the
 * mic ring, is never drawn.
 */
const SEAT_PUBLISHERS = Array.from({ length: 9 }, (_, i) => ({
    id: `u${i + 1}`,
    name: ['Ada', 'Grace', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Linus', 'Radia', 'Tim'][i],
    /*
     * Two of the camera-off seats carry a real picture, so the blurred-avatar ground is in the
     * gallery at all — with every avatar `null` it never rendered, and only initials did. A
     * committed asset rather than a CDN URL, per the no-CDN rule.
     */
    avatar: i === 0 || i === 3 ? '/illustrations/channel/invitation-banner.webp' : null,
    audio: i % 2 === 0,
    video: i % 3 !== 0,
    is_host: i === 0,
    verified_tick_badge: null,
}))

/**
 * **The gift catalogue**, parsed through the real schema.
 *
 * Deliberately through `normalizeGiftPackages` rather than written as `GiftPackage` literals: the
 * wire sends `price` as a decimal string and `exclusive` as a string too, and a fixture typed
 * straight to the parsed shape would not exercise either. A fixture that could not survive the
 * parser is a state nobody will ever see.
 */
const GIFT_PACKAGES = normalizeGiftPackages({
    count: 8,
    results: [
        ['Rose', '1.00', 1, ''],
        ['Heart', '10.00', 1, ''],
        ['Crown', '99.00', 1, ''],
        ['Rocket', '500.00', 1, ''],
        ['Roses ×10', '9.00', 10, ''],
        ['Diamond', '1000.00', 1, 'true'],
        ['Galaxy', '5000.00', 1, 'true'],
        // ⚠ `"false"` — the spelling legacy's bare truthiness test files under *Exclusive*.
        ['Star box', '250.00', 1, 'false'],
    ].map(([name, price, quantity, exclusive], i) => ({
        id: i + 1,
        quantity,
        price,
        price_currency: 'TVS',
        /*
         * A **real picture**, because the tile's height is the whole thing this harness is for: with
         * `thumb: null` the tile falls back to a 32px glyph and the 40px image that actually ships
         * is never drawn — which is exactly how the names came to be clipped on a real broadcast
         * and not here. `/tevi-star.png` is committed art, so no CDN is involved.
         */
        product: { name, images: { thumb: '/tevi-star.png' }, exclusive },
    })),
})

/** Two banners mid-burst, as the fold would have built them from the room's frames. */
const GIFT_BURSTS = (() => {
    const line = (userId: string, name: string, quantity: number) =>
        ({
            kind: 'gift' as const,
            user: {
                id: userId,
                name,
                avatar: null,
                channel_slug: null,
                is_host: false,
                channel_subscription_duration: null,
                premium_badge: null,
                verified_tick_badge: null,
            },
            gift: {
                id: 'g1',
                name: 'Rose',
                image: null,
                thumb: null,
                recipient_name: 'Ada Lovelace',
                price: 1,
                anim_background: null,
                animation: null,
            },
            quantity,
            total: quantity,
            isMember: false,
        }) as const
    let bursts = mergeGiftBurst([], line('u1', 'Grace Hopper', 10), 0)
    bursts = mergeGiftBurst(bursts, line('u1', 'Grace Hopper', 2), 0)
    bursts = mergeGiftBurst(bursts, line('u2', 'Alan Turing', 1), 0)
    // Far enough out that the harness's own clock never sweeps them away mid-inspection.
    return bursts.map(b => ({ ...b, expiresAt: Number.MAX_SAFE_INTEGER }))
})()

/**
 * Every state the chat column can be in, as `LiveChatState` shapes.
 *
 * ⚠ Built by hand rather than driven through `useLiveChat`, deliberately: what needs looking at
 * here is the **column**, and driving it for real would need a live broadcast plus a host pinning
 * a message and muting somebody on cue. The hook's own behaviour is pinned by
 * `use-live-chat.test.tsx` (27 cases); this is the half a test cannot show.
 */
const CHAT_USER = {
    id: 'u1',
    name: 'Athena Green',
    avatar: null,
    channel_slug: 'athena',
    is_host: false,
    premium_badge: null,
    verified_tick_badge: null,
}

const CHAT_BASE = {
    lines: [],
    ccu: 7500,
    canSend: true,
    isConnected: true,
    isSending: false,
    isBlocked: false,
    arrival: null,
    topStars: [],
    isLoadingTopStars: false,
    topStarsSelfIndex: -1,
    pinned: null,
    dismissPinned: () => {},
    justMuted: false,
    isChatOff: false,
    errorKey: null,
    chargedAt: null,
    send: async () => {},
    mustTopUp: false,
    outOfStar: { open: false, show: () => {}, close: () => {} },
} as const

const CHAT_FIXTURES = [
    {
        label: 'quiet — notices only, nothing said yet',
        chat: { ...CHAT_BASE },
    },
    {
        label: 'a conversation, a gift burst and a new member',
        chat: {
            ...CHAT_BASE,
            lines: [
                {
                    kind: 'comment',
                    user: { ...CHAT_USER, is_host: true },
                    text: 'thanks for coming!',
                    isMember: false,
                },
                {
                    kind: 'comment',
                    user: CHAT_USER,
                    text: 'the fact that this works at all',
                    isMember: false,
                },
                /*
                 * ⚠ `isMember` comes off the **frame**, not off `user` — see `parseChatLine`.
                 * This fixture carried `user.channel_subscription_duration` and therefore drew
                 * no badge, which is exactly the bug it was meant to demonstrate.
                 */
                {
                    kind: 'comment',
                    user: CHAT_USER,
                    text: 'a member says hello',
                    isMember: true,
                },
                {
                    kind: 'gift',
                    user: CHAT_USER,
                    gift: {
                        id: 'g1',
                        name: 'Rose',
                        image: null,
                        thumb: null,
                        recipient_name: 'Ada’s Space',
                        price: 30,
                    },
                    quantity: 3,
                    total: 90,
                    isMember: true,
                },
                { kind: 'subscriber', user: CHAT_USER },
            ],
        },
    },
    {
        label: 'leaderboard, a pinned message and somebody arriving',
        chat: {
            ...CHAT_BASE,
            topStars: [
                {
                    score: 4200,
                    user: { id: '1', display_name: 'Athena Green', avatar: null, is_premium: true },
                },
                { score: 1800, user: { id: '2', display_name: 'Liam Chen', avatar: null } },
                { score: 400, user: { id: '3', display_name: 'Test app', avatar: null } },
            ],
            pinned: {
                message: 'Read the community guidelines before chatting',
                user_name: 'sinhpn',
            },
            arrival: CHAT_USER,
        },
    },
    {
        label: 'leaderboard still loading — skeletons, not an empty state',
        chat: { ...CHAT_BASE, isLoadingTopStars: true },
    },
    {
        label: 'nobody has given anything yet — the prompt, not a blank block',
        chat: { ...CHAT_BASE, topStars: [] },
    },
    {
        label: 'the reader is on the board, outside the top three',
        chat: {
            ...CHAT_BASE,
            topStars: [
                {
                    score: 4200,
                    user: { id: '1', display_name: 'Athena Green', avatar: null, is_premium: true },
                },
                { score: 1800, user: { id: '2', display_name: 'Liam Chen', avatar: null } },
                { score: 900, user: { id: '3', display_name: 'Noah Patel', avatar: null } },
                { score: 400, user: { id: '9', display_name: 'Test app', avatar: null } },
            ],
            topStarsSelfIndex: 3,
        },
    },
    {
        label: 'muted by the host — the notice, then a dead box',
        chat: { ...CHAT_BASE, isBlocked: true, canSend: false, justMuted: true },
    },
    {
        label: 'chat switched off for the whole broadcast',
        chat: { ...CHAT_BASE, isChatOff: true, canSend: false },
    },
    {
        label: 'a message posted but the Star could not be charged',
        chat: { ...CHAT_BASE, errorKey: 'event_studio_chat_charge_failed' },
    },
    /* The wire is not up yet — legacy's `Connecting...`, which the composer had no sentence for. */
    {
        label: 'the socket has not connected — the field says so',
        chat: { ...CHAT_BASE, isConnected: false, canSend: false },
    },
    /*
     * Enough lines to overflow the box, which is the **only** way to see `Chat/Type7` — the
     * `16 new comments` pill only exists for a reader who has scrolled away from the bottom, so
     * a fixture that fits on screen can never show it. Scroll this one up.
     */
    {
        label: 'a busy room — scroll up and the new-comments pill appears',
        chat: {
            ...CHAT_BASE,
            lines: Array.from({ length: 40 }, (_, i) => ({
                kind: 'comment' as const,
                user: CHAT_USER,
                text: `message number ${i + 1}`,
                isMember: false,
            })),
        },
    },
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="type-caption-label-strong text-(--text-placeholder) uppercase">
                {title}
            </h2>
            {children}
        </section>
    )
}

/** Followed lives for the ended rail — dev only, so the projection is cast rather than parsed. */
const ENDED_LIVES = [1, 2, 3, 4].map(i => ({
    code: `live-${i}`,
    title: ['Friday listening party', 'Late-night lo-fi', 'Q&A with Ada', 'Studio session'][i - 1],
    images: { banner: '/illustrations/channel/invitation-banner.webp' },
    // Free and ungated, but every field `liveAccess` reads must be there.
    price: i === 2 ? 50 : null,
    required_packages: [],
    purchased: false,
    channel: {
        slug: `creator-${i}`,
        name: ['Ada Lovelace', 'Liam Chen', 'Noah Patel', 'Athena Green'][i - 1],
        images: { thumb: null, cover: null },
        verified_tick_badge: null,
        is_premium: false,
    },
})) as unknown as FollowedLive[]

/** A hand-built model for the compact studio frame — dev only, typed loosely on purpose. */
function compactModel(mode: 'solo' | 'session' | 'preview') {
    const feed = {
        playback: null,
        layout: { layout: 'P3', spotlight: false, spotlight_uid: null, spotlightUid: null },
        publishers: SEAT_PUBLISHERS.slice(0, mode === 'solo' ? 1 : 2),
    }
    const event = base({ paid_chat: true })
    const noop = () => {}
    return {
        art: '/illustrations/channel/invitation-banner.webp',
        backdropUrl: null,
        onStage: true,
        blurOnly: false,
        stageFeed: feed,
        scores: new Map(),
        isPlaying: false,
        setSeatCardId: noop,
        seatCardId: null,
        isExclusive: mode === 'preview',
        phase: mode === 'preview' ? 'preview' : null,
        isStreamPending: false,
        isGeoRestricted: false,
        isKickedOut: false,
        kickMessage: null,
        showEndedRail: false,
        event,
        isLockedByRoom: false,
        room: { status: 'idle', isConnected: false, subscribe: () => noop },
        canGift: false,
        channel: event.channel,
        stats: { follower_count: 1280 },
        getShareUrl: () => null,
        chat: { ...CHAT_FIXTURES[1]?.chat, ccu: 7520 },
        preview: { secondsLeft: 7, totalSeconds: 10 },
        setPaywallReason: noop,
        isGuest: false,
        bursts: [],
        showChat: true,
        fee: undefined,
        hasEnded: false,
        showTray: true,
        setIsCatalogOpen: noop,
        seatCardLayer: null,
        isCatalogOpen: false,
        catalog: { packages: [], exclusive: [], isLoading: false },
        live: feed,
        recipient: null,
        setPickedRecipient: noop,
        gift: {
            notEnough: { open: false, close: noop },
            pendingId: null,
            canSend: true,
            send: noop,
        },
        endedLives: { visible: [] },
        currentLanguage: 'en',
        paywallLayer: null,
        invite: { invitation: null, dismiss: noop },
        isWalled: false,
    }
}

export function EventStates() {
    const [ageConfirmed, setAgeConfirmed] = useState(false)
    const [info, setInfo] = useState<'sustained' | 'maintenance' | null>(null)
    const [outOfStar, setOutOfStar] = useState(false)
    const [notEnough, setNotEnough] = useState(false)
    const [nudgeOpen, setNudgeOpen] = useState(false)
    const [invited, setInvited] = useState(false)
    const [exclusivePrompt, setExclusivePrompt] = useState<'chat' | 'gift' | null>('chat')

    return (
        // The page's own surface pair, so the blocks are seen on the plane they actually sit on —
        // `docs/DESIGN_SYSTEM.md` §6. Resize past `md` to check both halves.
        <main className="flex flex-1 flex-col py-6">
            <div className={cn('flex flex-col gap-10', EVENT_CONTAINER)}>
                {/* The bar in isolation. It is sticky on the real page; here it is just the row. */}
                <Section title="Top bar">
                    <div className="bg-(--background)">
                        <EventTopBar slug="ada" />
                    </div>
                </Section>

                <Section title="The page, assembled">
                    <div className="flex flex-col gap-4">
                        <EventDetailsCard event={FULL_PAGE} />
                        <EventHostCard channel={FULL_PAGE.channel!} />
                        <EventWatchPanel event={FULL_PAGE} />
                        <EventDescriptionCard description={FULL_PAGE.description} />
                    </div>
                </Section>

                <Section title="Watch panel — every state, with the payload that produces it">
                    <div className="flex flex-col gap-6">
                        {WATCH_FIXTURES.map(({ label, event }) => (
                            <div key={label} className="flex flex-col gap-2">
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    {label} → <code>{watchState(event).kind}</code>
                                </p>
                                <EventWatchPanel event={event} />
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Live studio — the stage, and the refusals it carries">
                    {/*
                     * ⚠ **The wrapper's `transform-gpu` is load-bearing, not decoration.**
                     *
                     * `EVENT_STUDIO_STAGE` is `fixed inset-0`, so on the real page the studio
                     * covers the site — which is the point of it and also why three of them cannot
                     * be compared. An ancestor carrying a `transform` becomes the containing block
                     * for `position: fixed` descendants, so each preview resolves against its own
                     * 640×420 box instead of the viewport.
                     *
                     * The one thing that does **not** survive the trick is the viewport gate:
                     * `useLiveStudio` is not involved here, so these render at any window width.
                     * On the real page nothing below 900px ever reaches this screen.
                     */}
                    <div className="flex flex-col gap-6">
                        {STUDIO_FIXTURES.map(({ label, event }) => (
                            <div key={label} className="flex flex-col gap-2">
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    {label} → <code>{watchState(event).kind}</code>
                                </p>
                                <div className="transform-gpu relative h-[420px] overflow-hidden rounded-2xl">
                                    {/* A no-op: the harness has no room, so nothing can raise the wall. */}
                                    <EventStudioScreen
                                        event={event}
                                        onBlocked={() => {}}
                                        onBanned={() => {}}
                                        contained
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Live studio — gifts: the tray, the catalogue and the banners">
                    {/*
                     * All three on a dark ground, because that is what they sit on: the stage is a
                     * video under a scrim, so `lib/studio.ts`'s rule is literal ink rather than
                     * theme tokens, and inspecting them on the harness's own surface would show a
                     * palette none of them ever has.
                     */}
                    <div className="flex flex-col gap-6 rounded-2xl bg-black p-4">
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                the tray — eight gifts, one of them a ×10 package
                            </p>
                            <div className="max-w-[860px]">
                                <EventGiftTray
                                    packages={GIFT_PACKAGES}
                                    isLoading={false}
                                    pendingId={null}
                                    canSend
                                    onSend={() => {}}
                                    isCatalogOpen={false}
                                    onOpenCatalog={() => {}}
                                    onCloseCatalog={() => {}}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                the tray, loading · and with the wire down (every tile refused)
                            </p>
                            <div className="flex max-w-[860px] flex-col gap-3">
                                <EventGiftTray
                                    packages={[]}
                                    isLoading
                                    pendingId={null}
                                    canSend
                                    onSend={() => {}}
                                    isCatalogOpen={false}
                                    onOpenCatalog={() => {}}
                                    onCloseCatalog={() => {}}
                                />
                                <EventGiftTray
                                    packages={GIFT_PACKAGES}
                                    isLoading={false}
                                    pendingId={3}
                                    canSend={false}
                                    onSend={() => {}}
                                    isCatalogOpen={false}
                                    onOpenCatalog={() => {}}
                                    onCloseCatalog={() => {}}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <div className="flex flex-col gap-2">
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    the catalogue — a solo broadcast, so no recipient picker
                                </p>
                                <EventGiftPanel
                                    packages={GIFT_PACKAGES}
                                    exclusive={GIFT_PACKAGES.filter(p => p.product?.exclusive)}
                                    publishers={[]}
                                    recipient={null}
                                    onSelectRecipient={() => {}}
                                    pendingId={null}
                                    canSend
                                    onSend={() => {}}
                                    onClose={() => {}}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    …and with three people on camera, which is what raises it
                                </p>
                                <EventGiftPanel
                                    packages={GIFT_PACKAGES}
                                    exclusive={GIFT_PACKAGES.filter(p => p.product?.exclusive)}
                                    publishers={SEAT_PUBLISHERS.slice(0, 3)}
                                    recipient={SEAT_PUBLISHERS[0]}
                                    onSelectRecipient={() => {}}
                                    pendingId={null}
                                    canSend
                                    onSend={() => {}}
                                    onClose={() => {}}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                the banners — two senders, one of them mid-burst at ×12
                            </p>
                            <EventGiftFloat bursts={GIFT_BURSTS} />
                        </div>
                    </div>
                </Section>

                <Section title="Exclusive — the session's layout around the preview">
                    {/*
                     * The studio itself only reaches this for a signed-in reader with a real
                     * preview, so the pieces are composed by hand: the stage with its countdown,
                     * the paywall, and the chat column locked. Left: the preview with a prompt
                     * raised from the chat (✕ or the frost dismisses it; the composer reopens it).
                     * Right: the wall once the preview is over — nothing to dismiss.
                     */}
                    <div className="relative start-1/2 flex w-[min(1100px,calc(100vw-48px))] -translate-x-1/2 flex-col gap-4 rtl:translate-x-1/2">
                        {(['preview', 'closed'] as const).map(mode => (
                            <div
                                key={mode}
                                className="relative flex h-[560px] overflow-hidden rounded-xl bg-[#14101e]"
                            >
                                <div className="relative flex min-w-0 flex-1 flex-col">
                                    <div className="relative flex-1 bg-[radial-gradient(circle_at_40%_35%,#6b3fd6,#2a0f6e_60%,#14101e)]">
                                        {mode === 'preview' && (
                                            <div className="absolute inset-x-3 bottom-3 flex justify-center">
                                                <EventPreviewCountdown
                                                    secondsLeft={exclusivePrompt ? 7 : 2}
                                                    totalSeconds={10}
                                                    onUnlock={() => setExclusivePrompt('chat')}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {(mode === 'closed' || exclusivePrompt) && (
                                        <EventExclusivePaywall
                                            event={base({
                                                price: '250.00',
                                                price_currency: 'TVS',
                                                product_id: 'prod-1',
                                            })}
                                            reason={
                                                mode === 'closed'
                                                    ? 'preview-ended'
                                                    : exclusivePrompt
                                            }
                                            lockedMidStream={false}
                                            onClose={
                                                mode === 'preview'
                                                    ? () => setExclusivePrompt(null)
                                                    : undefined
                                            }
                                        />
                                    )}
                                </div>
                                <div className="w-[340px] flex-none">
                                    <EventStudioChat
                                        event={base({})}
                                        chat={CHAT_FIXTURES[0]?.chat as never}
                                        onLocked={() => setExclusivePrompt('chat')}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Live studio — the chat column, every state">
                    {/*
                     * The panel is 390 wide and full height on the real stage; here each preview
                     * is boxed at 520 tall so several fit in one scroll. The paid-chat fixtures
                     * carry `paid_chat`, which is what changes the composer's placeholder.
                     */}
                    <div className="flex flex-wrap gap-4">
                        {CHAT_FIXTURES.map(({ label, chat }) => (
                            <div key={label} className="flex flex-col gap-1">
                                <p className="type-caption-meta max-w-[390px] text-(--text-placeholder)">
                                    {label}
                                </p>
                                <div className="h-[520px] overflow-hidden rounded-xl bg-black">
                                    <EventStudioChat
                                        event={base({ paid_chat: true })}
                                        chat={chat as never}
                                        onCollapse={() => {}}
                                    />
                                </div>
                            </div>
                        ))}

                        {/*
                         * `Right menu/Type=Ended` and `Type=collapse` — the two states the column
                         * could not reach before, because the stage unmounted it the instant
                         * playback stopped and never handed it an `onCollapse`.
                         */}
                        <div className="flex flex-col gap-1">
                            <p className="type-caption-meta max-w-[390px] text-(--text-placeholder)">
                                the broadcast has ended — no header, no composer
                            </p>
                            <div className="h-[520px] overflow-hidden rounded-xl bg-black">
                                <EventStudioChat
                                    event={base({})}
                                    chat={CHAT_FIXTURES[0]?.chat as never}
                                    hasEnded
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <p className="type-caption-meta max-w-[390px] text-(--text-placeholder)">
                                folded — the strip that stands where the column was
                            </p>
                            <div className="flex h-[520px] w-[390px] items-start justify-end overflow-hidden rounded-xl bg-black p-3">
                                <EventStudioChatStrip
                                    event={base({})}
                                    chat={
                                        {
                                            ...CHAT_BASE,
                                            topStars: [
                                                {
                                                    score: 9,
                                                    user: { id: '1', display_name: 'Ada' },
                                                },
                                                { score: 8, user: { id: '2', display_name: 'Bo' } },
                                                { score: 7, user: { id: '3', display_name: 'Cy' } },
                                            ],
                                            // Said while folded — the badge and the preview.
                                            lines: CHAT_FIXTURES[1]?.chat.lines ?? [],
                                        } as never
                                    }
                                    onExpand={() => {}}
                                />
                            </div>
                        </div>
                    </div>
                </Section>

                <Section title="Seat layouts — all eighteen, at the publisher count each is for">
                    {/*
                     * No SDK here, so every tile's mount node is empty and the stage is black
                     * behind the chrome. That is the point: what needs checking is the geometry
                     * and the overlays, and neither depends on a video being present.
                     *
                     * ⚠ `P7`, `L7` and `L8` draw **six** tiles — legacy's own count, and the
                     * arrangement for the seventh and eighth seats is a design this port does not
                     * have. The row below each grid prints the tile count against the publisher
                     * count, so the gap is visible rather than inferred.
                     */}
                    <div className="grid grid-cols-2 gap-4">
                        {SEAT_LAYOUT_CODES.map(code => {
                            /*
                             * ⚠ Filled to the **arrangement's own tile count**, not to the digit
                             * in the code. The digit is an id — `P3` draws two tiles — and
                             * passing three publishers to it fires `seatArrangement`'s
                             * more-people-than-boxes fallback, so the comped shape is replaced by
                             * a generic grid. Eight of the eighteen were being drawn that way,
                             * including all four main-plus-rail designs, which is the half of
                             * this gallery worth looking at.
                             */
                            const tiles = seatArrangement({
                                layout: code,
                                publisherCount: 1,
                            }).areas.length
                            const publishers = SEAT_PUBLISHERS.slice(0, tiles)
                            const arrangement = seatArrangement({
                                layout: code,
                                publisherCount: publishers.length,
                            })
                            return (
                                <div key={code} className="flex flex-col gap-1">
                                    <p className="type-caption-meta text-(--text-placeholder)">
                                        <code>{code}</code> · {arrangement.areas.length} tiles · box{' '}
                                        {seatBoxAspect(arrangement)}
                                    </p>
                                    {/*
                                     * ⚠ **The aspect box is the point of this gallery**, and for a
                                     * while it was missing: the grid was stretched into a bare
                                     * `h-[260px]` panel, which draws every layout in the same
                                     * rectangle and therefore cannot show a wrong one. `L3` laid
                                     * into a 16:9 box instead of 18:16 looked exactly like `L3`
                                     * laid into the right one here, and the squeeze was only
                                     * visible on a real broadcast.
                                     *
                                     * Same two elements the stage uses, in the same order — see
                                     * `event-studio-stage.tsx`.
                                     */}
                                    <div className="flex h-[260px] items-center justify-center rounded-xl bg-(--background-segment) p-2 [container-type:size]">
                                        <div className="relative" style={seatBoxStyle(arrangement)}>
                                            <EventStudioSeats
                                                arrangement={arrangement}
                                                publishers={publishers}
                                                videoUids={null}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/*
                     * The open seat — `P9` with four co-hosts, so five of the nine tiles have
                     * nobody in them. Every grid above is filled to its tile count, so without
                     * this the empty-seat state is in no gallery at all.
                     */}
                    {(() => {
                        const arrangement = seatArrangement({ layout: 'P9', publisherCount: 4 })
                        return (
                            <div className="mt-4 flex flex-col gap-1">
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    <code>P9</code> · four co-hosts · five open seats
                                </p>
                                <div className="flex h-[360px] items-center justify-center rounded-xl bg-(--background-segment) p-2 [container-type:size]">
                                    <div className="relative" style={seatBoxStyle(arrangement)}>
                                        <EventStudioSeats
                                            arrangement={arrangement}
                                            publishers={SEAT_PUBLISHERS.slice(0, 4)}
                                            videoUids={null}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </Section>

                <Section title="Ended — followed lives to discover">
                    {/* On a dark stage stand-in, the way the studio draws it over the poster. */}
                    <div className="relative flex min-h-[520px] items-center overflow-hidden rounded-xl bg-[#2a0f6e]">
                        <div className="absolute inset-0 z-10 flex items-center bg-black/55 px-3 backdrop-blur-2xl">
                            <EventEndedRail lives={ENDED_LIVES} locale="en" />
                        </div>
                    </div>
                </Section>

                <Section title="Invitation — the host asks this reader on camera">
                    {/* Raised only by a socket frame on a real broadcast, so opened by hand. */}
                    <button
                        type="button"
                        className="type-dense-emphasis w-fit rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                        onClick={() => setInvited(true)}
                    >
                        Open the invitation dialog
                    </button>
                    <EventInvitationDialog
                        invitation={
                            invited
                                ? {
                                      name: 'Ada',
                                      avatar: '/illustrations/channel/invitation-banner.webp',
                                  }
                                : null
                        }
                        shareUrl="https://tevi.com/@ada/live"
                        onClose={() => setInvited(false)}
                    />
                </Section>

                <Section title="Out of Star — the sustained fee's wall">
                    {/*
                     * Only ever raised by a failed fee charge on a real broadcast, so it is opened
                     * by hand here. It cannot be dismissed (that is the point of it), so the
                     * harness reloads to close it.
                     */}
                    <button
                        type="button"
                        className="type-dense-emphasis w-fit rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                        onClick={() => setOutOfStar(true)}
                    >
                        Open the Out of Star dialog
                    </button>
                    <EventOutOfStarDialog open={outOfStar} />
                    {/* A gift the balance cannot cover — dismissable, unlike the wall above. */}
                    <button
                        type="button"
                        className="type-dense-emphasis w-fit rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                        onClick={() => setNotEnough(true)}
                    >
                        Open the Not enough Stars dialog
                    </button>
                    <EventNotEnoughStarsDialog
                        open={notEnough}
                        onClose={() => setNotEnough(false)}
                    />
                </Section>

                <Section title="Premium nudge — after a sustained-fee charge">
                    {/* Toggle it to watch it come in from the trailing edge and go back out. */}
                    <button
                        type="button"
                        className="type-dense-emphasis w-fit rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)"
                        onClick={() => setNudgeOpen(o => !o)}
                    >
                        {nudgeOpen ? 'Hide the Premium nudge' : 'Show the Premium nudge'}
                    </button>
                    <div className="relative flex h-[300px] items-end justify-end overflow-hidden rounded-xl bg-[radial-gradient(circle_at_30%_40%,#3a2470,#1a0f3a_70%)] p-3">
                        <EventPremiumNudge
                            open={nudgeOpen}
                            secondsLeft={7}
                            onClose={() => setNudgeOpen(false)}
                        />
                    </div>
                </Section>

                <Section title="Age gate — the wall over an 18+ broadcast">
                    {ageConfirmed ? (
                        <div className="flex flex-col gap-4">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                confirmed — the page below is what is revealed
                            </p>
                            <EventDetailsCard event={FULL_PAGE} />
                            <button
                                type="button"
                                className="type-link-dense self-start text-(--text-link)"
                                onClick={() => setAgeConfirmed(false)}
                            >
                                reset
                            </button>
                        </div>
                    ) : (
                        <EventAgeGate onConfirm={() => setAgeConfirmed(true)} slug="ada" />
                    )}
                </Section>

                <Section title="Protected space — a non-follower's 422 CHN0009 (new · request pending)">
                    {/*
                     * `dev-protected-*` slugs 404 upstream, so `useChannel` stays empty and the
                     * wall draws the refusal's own copy — what this harness is here to show.
                     */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {[false, true].map(requested => (
                            <div
                                key={String(requested)}
                                className={cn('flex min-h-[560px] flex-col', EVENT_PANEL)}
                            >
                                <ChannelProtectedNotice
                                    channel={
                                        {
                                            id: 'dev',
                                            name: 'Ada Lovelace',
                                            slug: requested
                                                ? 'dev-protected-pending'
                                                : 'dev-protected',
                                            images: { cover: null, thumb: null },
                                            privacy: 'protected',
                                            is_followed: false,
                                            follow_requested: requested,
                                            verified_tick_badge: {
                                                image: 'https://static.tevicdn.com/Images/Channel/VerifiedTick/verified.png',
                                            },
                                        } as unknown as Channel
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Studio skeleton — a live stream before the studio is decided (md and up)">
                    {/* `transform` makes the box the containing block, so `fixed` stays inside it. */}
                    <div className="relative h-[640px] overflow-hidden rounded-xl [transform:translateZ(0)]">
                        <EventStudioSkeleton
                            event={base({
                                status: 'LIVE',
                                title: 'Friday night listening party',
                                images: { banner: '/illustrations/channel/invitation-banner.webp' },
                            })}
                            className="absolute"
                        />
                    </div>
                </Section>

                <Section title="Phone on a live stream — the notice (the phone studio is switched off)">
                    <div className="mx-auto h-[844px] w-[390px] overflow-hidden rounded-[44px] ring-8 ring-black">
                        <EventMobileLiveNotice
                            contained
                            event={base({
                                status: 'LIVE',
                                title: 'Friday night listening party',
                                public_url: 'https://tevi.com/@ada/event/evt-1',
                                images: { banner: '/illustrations/channel/invitation-banner.webp' },
                            })}
                        />
                    </div>
                </Section>

                <Section title="Portrait studio — a phone, assembled (session · preview)">
                    {/*
                     * The real compact layout, contained in a 390×844 frame and fed a hand-built
                     * model: the seats (faces, no SDK here), the chat over them, the rail, the
                     * composer. Left is a session; right is a preview with its clock and the
                     * locked chat.
                     */}
                    <div className="relative start-1/2 flex w-[min(1240px,calc(100vw-32px))] -translate-x-1/2 flex-wrap justify-center gap-6 rtl:translate-x-1/2">
                        {(['solo', 'session', 'preview'] as const).map(mode => (
                            <div
                                key={mode}
                                className="h-[844px] w-[390px] overflow-hidden rounded-[44px] ring-8 ring-black"
                            >
                                <EventStudioCompact contained model={compactModel(mode) as never} />
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Portrait studio — the chat over the picture (phones)">
                    <div className="relative mx-auto flex h-[720px] w-[390px] max-w-full flex-col justify-end overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_50%_30%,#6b3fd6,#2a0f6e_55%,#100820)]">
                        <div className="bg-[linear-gradient(to_top,rgba(0,0,0,0.7),rgba(0,0,0,0.35)_60%,transparent)] pt-10">
                            <EventStudioChat
                                variant="overlay"
                                event={base({ paid_chat: true })}
                                chat={CHAT_FIXTURES[1]?.chat as never}
                                accessory={
                                    <span className="grid size-11 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,#7C4DFF,#501BC0)] text-white">
                                        ★
                                    </span>
                                }
                            />
                        </div>
                    </div>
                </Section>

                <Section title="Seat card — what pressing a publisher's seat opens">
                    <div className="flex flex-col gap-4 rounded-xl bg-[radial-gradient(circle_at_30%_30%,#4b2a8a,#1a1033_55%,#3d3410)] p-6">
                        <EventSeatCard
                            publisher={{
                                ...SEAT_PUBLISHERS[0],
                                audio: true,
                                video: true,
                                is_host: true,
                            }}
                            score={4200}
                            hostSlug="ada"
                            onSendGift={() => {}}
                            onClose={() => {}}
                        />
                        <EventSeatCard
                            publisher={{
                                ...SEAT_PUBLISHERS[1],
                                audio: false,
                                video: false,
                                is_host: false,
                            }}
                            score={0}
                            hostSlug="ada"
                            onSendGift={() => {}}
                            onClose={() => {}}
                        />
                    </div>
                </Section>

                <Section title="Studio refusals on the blurred ground — ended, platform, region, removed, blocked, banned">
                    <div className="flex flex-col gap-4">
                        {[
                            <EventWatchPanel
                                key="ended"
                                event={base({ status: 'ENDED' })}
                                surface="studio"
                            />,
                            <EventWatchPanel
                                key="platform"
                                event={base({ restricted_platforms: ['Website'] })}
                                surface="studio"
                            />,
                            <EventGeoRestrictedPanel key="geo" />,
                            <EventKickedOutPanel key="kicked" />,
                            <EventBlockedPanel key="blocked" />,
                            <EventAccountBannedPanel
                                key="banned"
                                message="Your account has been suspended for violating our Community Guidelines."
                            />,
                        ].map(card => (
                            <div
                                key={card.key}
                                className="flex min-h-[380px] items-center justify-center rounded-xl bg-[radial-gradient(circle_at_30%_30%,#4b2a8a,#1a1033_55%,#3d3410)] p-6"
                            >
                                {card}
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Age gate — on the studio frame (a live 18+ stream, wide screens)">
                    {/* The studio's blurred ground stood in by a gradient; the card is the real one. */}
                    <div className="flex min-h-[460px] items-center justify-center rounded-xl bg-[radial-gradient(circle_at_30%_30%,#4b2a8a,#1a1033_55%,#3d3410)] p-6">
                        <EventAgeGate onConfirm={() => {}} slug="ada" surface="studio" />
                    </div>
                </Section>

                <Section title="Host — the revenue report, assembled">
                    <div className="flex flex-col gap-4">
                        <EventHostInfoCard event={FULL_PAGE} />
                        <EventRevenueSummary
                            bills={BILL}
                            live={liveBill(BILL)}
                            interactive={interactiveBill(BILL)}
                            isLoading={false}
                            reportHref="/@ada/event/evt-1/report"
                        />
                        <EventMaintenanceFeeCard summary={SUMMARY} isLoading={false} />
                        <EventLiveAnalyticsCard
                            event={FULL_PAGE}
                            summary={SUMMARY}
                            isLoading={false}
                        />
                        <EventNewMembersCard summary={SUMMARY} />
                        <EventTotalRevenueCard state={{ kind: 'ready', amount: billTotal(BILL) }} />
                    </div>
                </Section>

                <Section title="Host — the states no aired event can show">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                bill loading
                            </p>
                            <EventRevenueSummary
                                bills={[]}
                                live={null}
                                interactive={null}
                                isLoading
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                nothing earned — the branch legacy makes unreachable, because
                                <code> [] </code> is truthy
                            </p>
                            <EventRevenueSummary
                                bills={[]}
                                live={null}
                                interactive={null}
                                isLoading={false}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                never aired — no analytics summary
                            </p>
                            <EventLiveAnalyticsCard
                                event={FULL_PAGE}
                                summary={null}
                                isLoading={false}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                maintenance fee — loading, then no data
                            </p>
                            <EventMaintenanceFeeCard summary={null} isLoading />
                            <EventMaintenanceFeeCard summary={null} isLoading={false} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                every request failed — the state legacy has none of, and which this
                                port rendered as “no data” (and as <code>$0</code>) until it was
                                reviewed
                            </p>
                            <EventRevenueSummary
                                bills={[]}
                                live={null}
                                interactive={null}
                                isLoading={false}
                                isError
                                onRetry={() => {}}
                            />
                            <EventLiveAnalyticsCard
                                event={FULL_PAGE}
                                summary={null}
                                isLoading={false}
                                isError
                                onRetry={() => {}}
                            />
                            <EventTotalRevenueCard state={{ kind: 'error' }} onRetry={() => {}} />
                            <EventTotalRevenueCard state={{ kind: 'loading' }} />
                        </div>
                    </div>
                </Section>

                <Section title="Report details — the list as the /report page draws it">
                    {/*
                     * The real panel, against the real endpoint. It needs an owner session to
                     * answer, so on a plain load it lands on its own empty state — worth seeing.
                     * Intercept `v1/ecom/event-orders/` to drive it with rows.
                     */}
                    {/* The **screen's** own frame, not one invented here: `/report` is
                        `docs/DESIGN_SYSTEM.md` §6's single-panel branch, so the list is full-bleed
                        below `md` and a card above it. A harness wrapper with a fixed radius would
                        show a card at every width and hide exactly that. */}
                    <div className={cn('md:overflow-clip', EVENT_PANEL)}>
                        <EventOrdersPanel code="evt-1" />
                    </div>
                </Section>

                <Section title="Order rows, and the two explainers">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col overflow-clip rounded-2xl border border-(--separator-default) bg-(--background-surface)">
                            {ORDERS.map(order => (
                                <EventOrderRow
                                    // The fixtures' names are unique, and a harness list is not
                                    // reordered — an index key is what biome rejects here.
                                    key={order.user?.display_name ?? order.product?.name ?? ''}
                                    order={order}
                                />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="type-link-dense text-(--text-link)"
                                onClick={() => setInfo('sustained')}
                            >
                                open “Sustained viewers”
                            </button>
                            <button
                                type="button"
                                className="type-link-dense text-(--text-link)"
                                onClick={() => setInfo('maintenance')}
                            >
                                open “Maintenance fee details”
                            </button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <p className="type-caption-meta text-(--text-placeholder)">
                                the two card states — empty, then failed with its retry
                            </p>
                            <EventCardState
                                kind="empty"
                                className="rounded-2xl border border-(--separator-default) bg-(--background-surface)"
                            />
                            <EventCardState
                                kind="error"
                                onRetry={() => {}}
                                className="rounded-2xl border border-(--separator-default) bg-(--background-surface)"
                            />
                        </div>
                    </div>
                </Section>

                <Section title="Skeleton — what loading.tsx and the screen's own branch both draw">
                    <div className="flex flex-col gap-4">
                        <EventSkeleton />
                    </div>
                </Section>
            </div>

            {/*
             * The two full-page screens sit outside the column: each renders its own `<main>` with
             * its own backdrop, which is the point — they replace the page rather than sitting in it.
             */}
            <div className="mt-10 flex flex-col">
                <p className={cn('type-caption-meta text-(--text-placeholder)', EVENT_CONTAINER)}>
                    not found — the client path (a gone event 404s at the server instead)
                </p>
                <EventNotFoundState />
                <p className={cn('type-caption-meta text-(--text-placeholder)', EVENT_CONTAINER)}>
                    error — the request failed, which is not the same as the event not existing. A
                    block **inside** the page, not a replacement for it: the bar and the column
                    stay.
                </p>
                <div className={cn(EVENT_CONTAINER)}>
                    <EventErrorState onRetry={() => {}} />
                </div>
                <p className={cn('type-caption-meta text-(--text-placeholder)', EVENT_CONTAINER)}>
                    banned — the room's `block_user` frame. Replaces Live details and Live studio
                    alike; nothing short of a reload re-asks.
                </p>
                <div className={cn(EVENT_CONTAINER)}>
                    <EventBannedState />
                </div>
                <p className={cn('type-caption-meta text-(--text-placeholder)', EVENT_CONTAINER)}>
                    removed — the room's `kickout` frame, on the studio plate it only ever appears
                    on.
                </p>
                <div
                    className={cn('flex justify-center rounded-2xl bg-black p-6', EVENT_CONTAINER)}
                >
                    <EventKickedOutPanel />
                </div>
            </div>

            {/*
             * The real dialog, against the real endpoint. It needs an owner session to return
             * anything, so on a plain load it lands on its own empty state — which is itself worth
             * seeing. Intercept `v1/ecom/event-orders/` to drive it with data.
             */}

            <EventInfoDialog
                open={info === 'sustained'}
                onOpenChange={(open: boolean) => setInfo(open ? 'sustained' : null)}
                title="Sustained viewers"
                items={SUSTAINED_VIEWERS_INFO}
            />
            <EventInfoDialog
                open={info === 'maintenance'}
                onOpenChange={(open: boolean) => setInfo(open ? 'maintenance' : null)}
                title="Maintenance fee details"
                items={MAINTENANCE_FEE_INFO}
            />
        </main>
    )
}
