'use client'

import { PremiumBadge } from '@shared/components/premium-badge'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { VERIFIED_BADGE_CROWN } from '@shared/components/verified-badge-size'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import {
    FLOAT,
    GIFT_BOB,
    GIFT_IN,
    GIFT_OUT,
    GIFT_OUT_MS,
    LIVE_BREATH,
    PIN_OUT,
    PIN_OUT_MS,
    PING,
    PODIUM_RISE,
    POP,
    RISE,
    riseDelay,
    TWINKLE,
} from '@shared/lib/motion'
import { PREMIUM_SPARK_SHAPE } from '@shared/lib/premium-sparkle'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { isExclusiveLive } from '../access'
import type { EventDetail } from '../api/types'
import { useEmojiSuggest } from '../hooks/use-emoji-suggest'
import { ARRIVAL_MS, type LiveChatState } from '../hooks/use-live-chat'
import type { SustainedFeeState } from '../hooks/use-sustained-fee'
import { CHAT_EMOJI, type ChatEmoji } from '../lib/chat-emoji'
import { EVENT_ART } from '../lib/illustrations'
import type { LivePinnedMessage } from '../lib/live-message'
import {
    giftThumb,
    type LiveChatLine,
    type LiveChatUser,
    type LiveTopStar,
} from '../lib/live-message'
import {
    EVENT_STUDIO_CHAT_VARS,
    EVENT_STUDIO_MEDAL,
    EVENT_STUDIO_PANEL,
    EVENT_STUDIO_PILL,
    EVENT_STUDIO_RANK_INK,
} from '../lib/studio'
import { EventOutOfStarDialog } from './event-out-of-star-dialog'
import { NAME_SLOT, NameWithTick } from './name-with-tick'

/**
 * **The chat column** — `EVENT_STUDIO_CHAT_WIDTH` down the trailing edge of the stage.
 *
 * ```
 * ┌───────────────────────────┐
 * │ ⓢ Viewer  (👁 7.5k)    [⇥] │  ← one 56px row: badge · label · count · collapse
 * │ ⌈Top contributing users⌋   │
 * │ ① Liam Chen ✓        679  │  ← 3 rows, the rest on hover
 * ├───────────────────────────┤
 * │ 📌 ada  “read the rules”  ✕ │
 * │ ⌈Ashley has entered⌋       │  ← 3s, then gone
 * │ ◍ MEM Ada ✓                │
 * │   Sent 🎁 x1 (1,500 Star)  │
 * │        ⌈16 new comments⌋   │  ← sticky, only while scrolled up
 * │ [ Send a message      ☺ ➤ ]│
 * └───────────────────────────┘
 * ```
 *
 * ## Every measurement here is off `Right menu` on Figma's `↳ View Live` page
 *
 * ⚠ This column shipped twice built from the **wrong layers**. The comps' `Right menu` frame
 * carries a dead `Header` group — a 16px `Live chat` title, a `settings` gear and a 1px `#666`
 * rule — all three `visible: false`, left behind by an earlier revision. I read that group and
 * drew all three, and drew the live one (`Viewer` · a viewer-count pill · a 40px round
 * `Panel Contract` disc) as a *second* row underneath. So the column had a title the design does
 * not have, a gear that does nothing, a divider that was deleted, and the real header split in
 * half.
 *
 * The lesson is cheap to state and was not cheap to find: **filter on `visible` before reading a
 * Figma frame.** A hidden layer is a decision that was already reversed.
 *
 * The other half of the same mistake was reading the `Chat` **component set** as though it had
 * the four variants I had built. It has twelve, and `Header` has five more; the ones that were
 * missing are listed against the components that now draw them.
 *
 * ## Scrolling is pinned to the bottom, but only when the reader already was
 *
 * A chat that jumps to the newest line while somebody is reading back is the single most
 * irritating thing a live room can do, and it is what an unconditional `scrollTop = scrollHeight`
 * produces. The check is against the **previous** scroll position, taken before the new line
 * renders — and what a reader who has scrolled up gets instead is the `16 new comments` pill.
 */

/**
 * The longest message the room takes, and legacy's own number.
 *
 * Neither client asks the backend for it; 250 is what `handleChangeComment` enforces, so a web
 * reader and an app reader hit the same wall. B118's neighbourhood — if the server has a limit of
 * its own, this is the constant that should come from it.
 */
const CHAT_MAX_LENGTH = 250

/** How many faces the collapsed strip shows before it stops — the comps draw five. */
const STRIP_FACES = 5

/** 24px, which is every avatar in this column — leaderboard, transcript and the collapsed strip. */
function ChatAvatar({ user }: { user: LiveChatUser | null }) {
    const avatar = user?.avatar
    const initials = (user?.name ?? '?').slice(0, 2).toUpperCase()
    return (
        <Avatar size="xs" type={avatar ? 'image' : 'initials'} className="size-6 flex-none">
            {avatar ? (
                <Image
                    src={avatar}
                    alt=""
                    width={24}
                    height={24}
                    className="size-full rounded-full object-cover"
                />
            ) : (
                <AvatarInitials>{initials}</AvatarInitials>
            )}
        </Avatar>
    )
}

/**
 * The platform's own mark, in the avatar slot — the comps' `Tevi icon`. Every `System*` line in the
 * `Chat` set uses it, and only they do, which is what makes "Tevi is speaking" readable at a glance
 * rather than from the ink alone.
 *
 * ⚠ **The logo on its own, not on the comps' 60%-black disc.** The notice is now a card of its
 * own, so the disc was a dark blot inside a dark card; the mark carries its own violet ground and
 * needs nothing behind it. 20px in the 24px slot, the slot an avatar takes in every other row.
 */
function ChatSystemMark() {
    return (
        <span className="grid size-6 flex-none place-items-center">
            <Logo size={20} title={null} />
        </span>
    )
}

/**
 * **A badge beside a name.** The comps' `Badge` set, whose four variants are four different
 * grounds — so this cannot be one component with a colour prop without losing that.
 *
 * `Member` is the gradient one and `Host` the flat black; `Lvl Badge` and `User Badge` are the
 * gifted-level pair and are **not built** — nothing in any frame this client receives carries a
 * level, so they would be a badge with no number in it. B117 asks for the field.
 */
function ChatBadge({
    kind,
    label,
}: {
    /** `pinned-host` is legacy's gold `hostBadge`, drawn only on the pinned message. */
    kind: 'member' | 'host' | 'pinned-host'
    label: string
}) {
    return (
        <span
            className={cn(
                'flex h-4 flex-none items-center gap-0.5 rounded',
                kind === 'member' && 'bg-(image:--live-chat-member) ps-0.5 pe-1',
                kind === 'pinned-host' && 'gap-1 bg-(image:--live-chat-host) ps-0.5 pe-1',
                kind === 'host' && 'bg-(--live-chat-chip) px-1',
            )}
        >
            {/*
                12px inside a 16px chip, which `IconSize` does not offer — that union is the
                *component* scale (16/18/20/24), and this is a glyph inside a badge. `size` sets
                width/height **attributes**, so a utility class wins over them; nothing is added
                to the union and no other call site changes.
            */}
            <Icon
                name="crown"
                // Legacy's gold host badge carries a solid crown; the other two keep the outline.
                weight={kind === 'pinned-host' ? 'filled' : undefined}
                size={16}
                className={cn('size-3', kind === 'host' ? 'text-(--live-chat-gift)' : 'text-white')}
            />
            <span className="type-micro-overline text-white">{label}</span>
        </span>
    )
}

/**
 * The sparkles around the empty board's star, placed on its 134×74 art — two gold, two white,
 * staggered across one `TWINKLE` cycle so one is always catching the light.
 */
const BOARD_SPARKLES: {
    id: string
    at: CSSProperties
    size: number
    ink: string
    delay: number
}[] = [
    { id: 'a', at: { insetInlineStart: '26%', top: '2%' }, size: 9, ink: '#FFE27A', delay: 0 },
    { id: 'b', at: { insetInlineEnd: '18%', top: '-4%' }, size: 7, ink: '#FFFFFF', delay: 600 },
    { id: 'c', at: { insetInlineStart: '12%', top: '34%' }, size: 6, ink: '#FFFFFF', delay: 1200 },
    { id: 'd', at: { insetInlineEnd: '8%', top: '30%' }, size: 8, ink: '#FFE27A', delay: 1800 },
]

/**
 * **The gift leaderboard**, on the header wash — all four of its states.
 *
 * | | comps | source |
 * |---|---|---|
 * | loading | three skeleton rows | `isLoading.topStars` |
 * | empty | `Header/No data` — 134×74 art + a line | `topStars.length === 0` |
 * | hover | `Header/Active=True` — 200 → 356 | `topStars.length > 3` |
 * | own row | `Current User`, `#37343E` + a drop shadow | `findIndex(u => u.id === me)` |
 *
 * The collapsed height is not a number picked to look right: `Header/Expand` is 200 tall and
 * clips, and 56 + 4 + 16 + 4 + 8 + 3×36 lands on exactly 200. Three rows is what the frame *is*,
 * not what fits in it.
 */
/** Rows the board shows before it opens on hover — the comps' collapsed `Header/Expand`. */
const LEADERBOARD_VISIBLE = 3

function ChatLeaderboard({
    rows,
    isLoading,
    ownIndex,
}: {
    rows: LiveTopStar[]
    isLoading: boolean
    /**
     * Where the reader sits on this board, or `-1`.
     *
     * Resolved by the hook rather than here: matching the reader against the board needs the
     * active account, and the chat column has no business reaching for auth to draw a row.
     */
    ownIndex: number
}) {
    const { t } = useTranslation()
    /*
     * ⚠ **The reader's own row is a footer only when they are off the visible board.** Inside the
     * top three it repeated a row already on screen — rank, face and figure twice, which read as
     * the board listing somebody twice. There the row itself is tinted instead.
     */
    const showOwnFooter = ownIndex >= LEADERBOARD_VISIBLE
    /** Fourth place on, opened by the button — hover opens it too, in CSS. */
    const [expanded, setExpanded] = useState(false)

    if (isLoading) {
        return (
            <div
                data-testid="event-studio-leaderboard-loading"
                className="flex flex-col px-4 pt-2 pb-4"
                aria-busy
            >
                {/* The podium's own silhouette — 2, 1, 3 — so the board does not jump on load. */}
                <div className="grid grid-cols-3 items-end gap-2">
                    {PODIUM_ORDER.map(rank => (
                        <div key={rank} className="flex flex-col items-center gap-1">
                            <Skeleton w={PODIUM_AVATAR[rank]} h={PODIUM_AVATAR[rank]} circle />
                            <Skeleton w={48} h={10} />
                            <Skeleton className="w-full" h={PODIUM_STEP[rank]} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    /*
     * `Header/No data`: the art centred, the line centred under it — and brought to life, since
     * it is the board's invitation rather than a dead end. The card `RISE`s in; the podium floats
     * on a slow loop over a breathing gold glow, and a few sparkles twinkle around the star in
     * turn (`TWINKLE`, staggered). The art is one raster, so the motion is around it rather than
     * inside it. The line is balanced across its two lines instead of leaving one word orphaned.
     */
    if (rows.length === 0) {
        return (
            <div
                data-testid="event-studio-leaderboard-empty"
                className={cn('flex flex-col items-center gap-2 px-4 pt-2 pb-4', RISE)}
            >
                <div className="relative grid place-items-center">
                    <span
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute inset-x-2 top-0 bottom-3 rounded-full',
                            'bg-[radial-gradient(closest-side,rgba(255,214,90,0.32),transparent)] blur-md',
                            LIVE_BREATH,
                        )}
                    />
                    <span className={cn('relative flex', FLOAT)}>
                        <Image
                            src={EVENT_ART.leaderboardEmpty.src}
                            alt=""
                            aria-hidden
                            width={EVENT_ART.leaderboardEmpty.width}
                            height={EVENT_ART.leaderboardEmpty.height}
                        />
                    </span>
                    {BOARD_SPARKLES.map(sparkle => (
                        <span
                            key={sparkle.id}
                            aria-hidden
                            className={cn('pointer-events-none absolute', TWINKLE)}
                            style={{
                                ...sparkle.at,
                                width: sparkle.size,
                                height: sparkle.size,
                                background: sparkle.ink,
                                clipPath: PREMIUM_SPARK_SHAPE,
                                animationDelay: `${sparkle.delay}ms`,
                            }}
                        />
                    ))}
                </div>
                <p
                    className={cn(
                        'type-caption-meta max-w-[280px] text-center text-balance text-white/80',
                        RISE,
                    )}
                    style={riseDelay(2)}
                >
                    {t('event_studio_chat_leaderboard_empty')}
                </p>
            </div>
        )
    }

    const rest = rows.slice(LEADERBOARD_VISIBLE)

    return (
        <section
            data-testid="event-studio-leaderboard"
            className={cn('group/board flex flex-none flex-col pt-3', !showOwnFooter && 'pb-3')}
        >
            {/*
             * ⚠ **Top three on a podium, the rest as a list — a stated divergence.** The comps draw
             * all of it as rows (`Header/Expand`); the product asked for the three to stand on a
             * podium, which is what the empty state's art already promises. It is kept to the
             * three rows' footprint (~108px) so the chat below loses nothing.
             *
             * Visual order is 2 · 1 · 3, and it mirrors in RTL with the grid, as a podium should.
             */}
            <div className="grid grid-cols-3 items-end gap-1.5 px-3">
                {PODIUM_ORDER.map(rank => (
                    <PodiumSpot
                        // Keyed on who stands there: a new holder lands with its own entrance.
                        key={`${rank}:${rows[rank]?.user?.id ?? 'empty'}`}
                        row={rows[rank] ?? null}
                        rank={rank}
                        isSelf={rank === ownIndex}
                    />
                ))}
            </div>
            {/*
             * **The floor the podium stands on**, and what ties it to the list under it: a hairline
             * lit in the middle and fading to both edges, with the steps' glow spilling down off it
             * — so fourth place on reads as the crowd at the foot of the podium, not as a second
             * box that happens to follow it.
             */}
            <div aria-hidden className="relative mx-3 h-px">
                <span className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22)_50%,transparent)]" />
                <span className="absolute inset-x-[15%] top-0 h-4 bg-[radial-gradient(ellipse_at_top,rgba(255,213,74,0.14),transparent_70%)]" />
            </div>

            {/*
             * Fourth place on — closed under the podium, opening on hover (the comps' `Active=True`)
             * **or** on the button, so a touch or keyboard reader can reach it too. A grid-rows
             * transition rather than `max-height`: it animates to the list's real height.
             */}
            {rest.length > 0 && (
                <>
                    <div
                        className={cn(
                            'grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                            'group-hover/board:grid-rows-[1fr]',
                            expanded && 'grid-rows-[1fr]',
                        )}
                    >
                        <div className="min-h-0 overflow-hidden">
                            <div
                                data-testid="event-studio-leaderboard-rest"
                                // The first row comes up out of the floor's glow rather than
                                // starting on a hard line under it.
                                className="max-h-[180px] overflow-y-auto px-2 pt-1.5 [mask-image:linear-gradient(to_bottom,transparent_0,black_10px)]"
                            >
                                {rest.map((row, i) => (
                                    <LeaderboardRow
                                        key={row.user?.id ?? i}
                                        row={row}
                                        rank={i + LEADERBOARD_VISIBLE}
                                        index={i}
                                        isSelf={i + LEADERBOARD_VISIBLE === ownIndex}
                                        highlight={i + LEADERBOARD_VISIBLE === ownIndex}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        data-testid="event-studio-leaderboard-toggle"
                        aria-expanded={expanded}
                        aria-label={expanded ? t('common_show_less') : t('common_show_more')}
                        onClick={() => setExpanded(open => !open)}
                        className="mx-auto mt-0.5 grid h-5 w-10 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                        <Icon
                            name="angle-down"
                            size={16}
                            className={cn(
                                'size-3.5 transition-transform duration-200',
                                expanded && 'rotate-180',
                            )}
                        />
                    </button>
                </>
            )}

            {/*
             * `Current User` — the comps run it to the panel's own edges rather than the 16px
             * inset the board above uses, and hang a drop shadow off it, so it reads as a footer
             * under the list instead of as a fourth entry. It keeps its real rank.
             */}
            {showOwnFooter && (
                <div
                    data-testid="event-studio-leaderboard-me"
                    className={cn(
                        /*
                         * Soft-edged rather than a slab with a drop shadow: the band fades in over
                         * its top 10px, so it rises out of the board above it, and the header's
                         * own fade carries it out at the bottom.
                         */
                        'mt-1 bg-[linear-gradient(to_bottom,transparent_0,var(--live-chat-self)_10px)] px-2 pt-1',
                        // With the list open the reader's row is already in it, tinted — a footer
                        // repeating it reads as being listed twice.
                        'group-hover/board:hidden',
                        expanded && 'hidden',
                    )}
                >
                    <LeaderboardRow row={rows[ownIndex]} rank={ownIndex} isSelf />
                </div>
            )}
        </section>
    )
}

/** Whether a board row's person is Premium — either spelling the board may carry. */
function isTopStarPremium(row: LiveTopStar | null): boolean {
    return Boolean(row?.user?.premium_badge || row?.user?.is_premium)
}

/** Podium visual order — second, first, third. */
const PODIUM_ORDER = [1, 0, 2] as const
/** Avatar diameter per place: the winner a size up. */
const PODIUM_AVATAR = [36, 28, 28] as const
/** Step height per place — the podium's silhouette. */
const PODIUM_STEP = [22, 15, 10] as const
/** Steps rise third → second → first, so the winner's lands last. */
const PODIUM_STAGGER = [160, 80, 0] as const

/**
 * One place on the podium: a medal-ringed face (the winner crowned), the name, the figure, and
 * the step with the place number on it.
 *
 * Motion: the step rises from the floor (`PODIUM_RISE`, staggered so first lands last), the face
 * pops on once its step is up, the crown bobs, and the figure pops when it moves. An open place —
 * fewer than three givers — keeps its step at a low opacity with a dashed seat, so the podium
 * still reads as a podium with room on it.
 */
function PodiumSpot({
    row,
    rank,
    isSelf,
}: {
    row: LiveTopStar | null
    rank: 0 | 1 | 2
    isSelf: boolean
}) {
    const { currentLanguage } = useTranslation()
    const medal = EVENT_STUDIO_MEDAL[rank]
    const size = PODIUM_AVATAR[rank]
    const delay = PODIUM_STAGGER[rank]
    const score = row?.score ?? 0
    const name = row?.user?.display_name ?? ''
    const avatar = row?.user?.avatar?.thumb

    return (
        <div
            data-testid="event-studio-leaderboard-spot"
            data-option-value={rank + 1}
            className="flex min-w-0 flex-col items-center"
        >
            <div
                className={cn('relative mb-0.5', row && POP)}
                style={{ animationDelay: `${delay + 220}ms`, width: size, height: size }}
            >
                {rank === 0 && row && (
                    /*
                     * ⚠ Centred by a full-width flex row, **not** `-translate-x-1/2`: Tailwind v4
                     * writes that to the `translate` property, which `GIFT_BOB` animates too, so
                     * the bob replaced the -50% and the crown sat half its width to the right.
                     */
                    <span aria-hidden className="absolute inset-x-0 -top-3.5 flex justify-center">
                        <span className={cn('flex', GIFT_BOB)}>
                            <Icon
                                name="crown"
                                weight="filled"
                                size={16}
                                style={{ color: medal.ink }}
                                className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                            />
                        </span>
                    </span>
                )}
                {row ? (
                    <Avatar
                        size="xs"
                        type={avatar ? 'image' : 'initials'}
                        className="size-full border-2"
                        style={{
                            borderColor: medal.ink,
                            boxShadow: `0 0 ${rank === 0 ? 14 : 8}px ${medal.glow}`,
                        }}
                    >
                        {avatar ? (
                            <Image
                                src={avatar}
                                alt=""
                                width={size}
                                height={size}
                                className="size-full rounded-full object-cover"
                            />
                        ) : (
                            <AvatarInitials>
                                {(name || '?').slice(0, 2).toUpperCase()}
                            </AvatarInitials>
                        )}
                    </Avatar>
                ) : (
                    <span className="block size-full rounded-full border border-white/20 border-dashed" />
                )}
            </div>

            <span className="flex w-full min-w-0 items-center justify-center gap-0.5">
                <span
                    className={cn(
                        'type-caption-label-strong min-w-0 truncate',
                        row ? 'text-white' : 'text-white/30',
                        isSelf && 'text-(--live-chat-gift)',
                    )}
                >
                    {row ? name : '—'}
                </span>
                {row?.user?.verified_tick_badge?.image && (
                    <VerifiedBadge image={row.user.verified_tick_badge.image} size="caption" />
                )}
                {isTopStarPremium(row) && (
                    <span className="flex flex-none">
                        <PremiumBadge size={VERIFIED_BADGE_CROWN.caption} />
                    </span>
                )}
            </span>
            <span
                className="flex h-4 items-center gap-0.5"
                title={score > 0 ? formatStarAmount(score, currentLanguage) : undefined}
            >
                {score > 0 && (
                    <>
                        <StarMark size={10} />
                        <span
                            key={score}
                            className={cn('type-micro-overline tabular-nums text-white/70', POP)}
                        >
                            {formatCount(score)}
                        </span>
                    </>
                )}
            </span>

            <div
                className={cn(
                    'mt-1 grid w-full origin-bottom place-items-center rounded-t-lg',
                    !row && 'opacity-35',
                    isSelf && 'ring-1 ring-inset ring-white/35',
                    PODIUM_RISE,
                )}
                style={{
                    height: PODIUM_STEP[rank],
                    background: medal.step,
                    animationDelay: `${delay}ms`,
                }}
            >
                {/* The smallest step is too short for a digit; its colour already says third. */}
                {PODIUM_STEP[rank] >= 15 && (
                    <span className="type-micro-overline tabular-nums" style={{ color: medal.ink }}>
                        {rank + 1}
                    </span>
                )}
            </div>
        </div>
    )
}

/**
 * One row — the comps' `Top`, whose five variants differ only in the rank ink.
 *
 * The comps' drawing, polished rather than replaced: a rounded hover plate so the row under the
 * pointer is findable, `tabular-nums` so a ticking score does not jitter the column, the rows
 * running in on `RISE` 40ms apart when the board appears, and a score that moves **popping**
 * (`POP`, keyed on the figure) — the one thing on the board that changes while you watch.
 */
function LeaderboardRow({
    row,
    rank,
    index = 0,
    isSelf = false,
    highlight = false,
}: {
    row: LiveTopStar
    rank: number
    /** Position in the list, for the entrance stagger. */
    index?: number
    isSelf?: boolean
    /** Tint the row as the reader's own, in place on the board. */
    highlight?: boolean
}) {
    const { currentLanguage } = useTranslation()
    const score = row.score
    return (
        <div
            className={cn(
                'flex h-9 items-center gap-2 rounded-lg px-2 transition-colors',
                highlight ? 'bg-(--live-chat-self)' : !isSelf && 'hover:bg-white/[0.05]',
                RISE,
            )}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
            {/* 14/Bold in the comps. The scale stops at semibold at this size, so `dense-strong`
                is the utility and the extra 100 of weight is the one thing not reproduced. */}
            <span
                className="type-dense-strong grid size-6 flex-none place-items-center tabular-nums"
                style={{ color: EVENT_STUDIO_RANK_INK[rank] ?? 'var(--live-chat-muted)' }}
            >
                {/* Past third it is a dash, not a number — `Top=Top4` and `Top=Other` are the
                    same drawing. The board reorders constantly and a digit at rank 47 is noise. */}
                {rank < 3 ? rank + 1 : '-'}
            </span>
            <ChatAvatar
                user={
                    {
                        avatar: row.user?.avatar?.thumb,
                        name: row.user?.display_name,
                    } as LiveChatUser
                }
            />
            <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="type-dense-strong min-w-0 truncate text-(--live-chat-name)">
                    {row.user?.display_name ?? ''}
                </span>
                {row.user?.verified_tick_badge?.image && (
                    <VerifiedBadge image={row.user.verified_tick_badge.image} size="dense" />
                )}
                {isTopStarPremium(row) && (
                    <span className="flex flex-none">
                        <PremiumBadge size={VERIFIED_BADGE_CROWN.dense} />
                    </span>
                )}
            </span>
            {/*
             * ⚠ **A Star mark before the figure — a stated divergence.** The comps' `Star w
             * value` frame carries one and hides it (`visible: false` in all five variants), so
             * this port drew the bare number. The product asked for it shown: a bare "4.2k" on a
             * board of people does not say *what* they gave, and the Star is the unit the whole
             * room spends in. Only beside a real figure — a score of nothing stays a lone `-`.
             */}
            <span
                className="flex flex-none items-center gap-1"
                // The exact figure on hover; the row shows it compact (`4.2k`).
                title={score > 0 ? formatStarAmount(score, currentLanguage) : undefined}
            >
                {score > 0 && <StarMark size={12} />}
                <span
                    key={score}
                    className={cn('type-caption-meta tabular-nums', score > 0 && POP)}
                    style={{
                        color:
                            score > 0 ? 'var(--live-chat-muted)' : 'var(--live-chat-score-empty)',
                    }}
                >
                    {score > 0 ? formatCount(score) : '-'}
                </span>
            </span>
        </div>
    )
}

/**
 * **A line spoken by the platform** — the comps' `System`, `System host`, `Paid view live` and
 * `Type11`, which are one row with two inks between them.
 *
 * Amber (`#FFA914`) is Tevi telling the room something; red (`#D00416`) is Tevi telling *this
 * reader* they may not do something. Same geometry as a comment, so the transcript keeps one
 * rhythm.
 */
function ChatSystemLine({
    children,
    tone = 'system',
    testId,
}: {
    children: ReactNode
    tone?: 'system' | 'denied' | 'member'
    testId?: string
}) {
    return (
        /*
         * A notice from the room, set apart as a **card** rather than a line of 14px amber: three
         * paragraphs of it at the top of the column were the loudest thing in the room, louder
         * than anything a person said. 12/500 on a faint plate keeps the platform's amber and
         * gives the conversation its weight back.
         */
        <div
            data-testid={testId}
            className={cn(
                // No outer margin: the gap between cards is the list's `gap-1`, one rule for all.
                'flex gap-2 rounded-xl px-2.5 py-2 ring-1 ring-inset',
                tone === 'denied'
                    ? 'bg-(--live-chat-denied)/10 ring-(--live-chat-denied)/20'
                    : tone === 'member'
                      ? // A new member's announcement, on legacy's `newSubscriber` gradient.
                        'bg-(image:--live-chat-member-row) ring-0 rtl:bg-(image:--live-chat-member-row-rtl)'
                      : 'bg-white/[0.04] ring-white/[0.06]',
                RISE,
            )}
        >
            <ChatSystemMark />
            <p
                className={cn(
                    'type-caption-label min-w-0 flex-1 self-center break-words',
                    tone === 'denied'
                        ? 'text-(--live-chat-denied)'
                        : tone === 'member'
                          ? 'text-white'
                          : 'text-(--live-chat-system)',
                )}
            >
                {children}
            </p>
        </div>
    )
}

/**
 * **The room's own opening lines**: the community-guidelines welcome (`System`) and, when the
 * creator charges for chat, what a message costs (`System host`).
 *
 * Rendered *before* the transcript rather than seeded into it, and that is not cosmetic: the
 * history is **replaced** on every reconnect (see `useLiveChat`), so a notice living in `lines`
 * would vanish the first time the wifi blinked. Legacy seeds them into its comment array and
 * never re-asks for history at all, which is how it avoids this problem by having a different one.
 */
function ChatNotices({ event }: { event: EventDetail }) {
    const { t } = useTranslation()
    const name = event.channel?.name ?? event.channel?.slug ?? ''

    return (
        <div data-testid="event-studio-chat-notices" className="flex flex-col gap-1">
            <ChatSystemLine>{t('event_studio_chat_welcome')}</ChatSystemLine>
            {event.paid_chat && (
                <ChatSystemLine>
                    <NameWithTick
                        sentence={t('event_studio_chat_paid_notice', { name: NAME_SLOT, fee: 1 })}
                        name={name}
                        tick={event.channel?.verified_tick_badge?.image}
                    />
                </ChatSystemLine>
            )}
        </div>
    )
}

/** The sender's name and whatever badges the payload earned them — the comps' `Title Container`. */
function ChatName({ user, isMember }: { user: LiveChatUser | null; isMember: boolean }) {
    const { t } = useTranslation()
    const name = user?.name ?? ''
    const slug = user?.channel_slug

    const label = (
        <span className="flex h-[21px] min-w-0 max-w-full items-center gap-1 [&>*:not(.min-w-0)]:flex-none">
            {/*
             * ⚠ **`Title Container` has two badge slots, not one**, and which badge goes in which
             * is the comps' answer rather than a choice: `Property 1=Default` puts `MEM` in the
             * **leading** slot, `Variant3` puts `Host` in the **trailing** one, and `Variant2`
             * uses neither. Both were drawn leading here, which reads as a run of chips before a
             * name that is already truncated to 120px.
             */}
            {isMember && <ChatBadge kind="member" label={t('event_studio_chat_member')} />}
            {/*
             * ⚠ **No fixed caps.** The name was `max-w-[120px]` and the handle `max-w-[80px]` —
             * legacy's numbers for its 390px column — so both were cut to "…" with half the row
             * still empty, and the column is responsive now besides. They share what the row has
             * instead: both may shrink, the handle **three times as fast** (`shrink-[3]`), so the
             * name is the last thing to lose letters. Badges and the tick never shrink.
             */}
            <span className="type-dense-strong min-w-0 shrink truncate text-(--live-chat-name)">
                {name}
            </span>
            {user?.verified_tick_badge?.image && (
                <VerifiedBadge image={user.verified_tick_badge.image} size="dense" />
            )}
            {/*
             * Premium, as the app's own animated mark (`PremiumBadge`, sparks and all) rather
             * than the backend's still image — the same crown the pinned message and every name
             * row in the product carry. The field decides *whether*, not *what*.
             */}
            {user?.premium_badge && (
                <span className="flex flex-none">
                    <PremiumBadge size={VERIFIED_BADGE_CROWN.dense} />
                </span>
            )}
            {/*
             * ⚠ **The handle is legacy's, not the comps'** — and it is kept deliberately.
             *
             * No variant of `Title Container` carries one; it is absent from the design rather
             * than hidden in it, so this is a stated divergence and not a reading error. Legacy
             * prints it at 12/Regular capped at 80px, and it is the only thing in the row that
             * tells two readers with the same display name apart — which in a room being asked
             * for money is worth the 80px. Remove it only with the comps updated to match.
             */}
            {slug && (
                <span className="type-caption-meta min-w-0 shrink-[3] truncate text-white">
                    @{slug}
                </span>
            )}
            {/* The trailing slot — see the note on `MEM` above. */}
            {user?.is_host && <ChatBadge kind="host" label={t('event_studio_host')} />}
        </span>
    )

    // A sender with a space is a link to it; one without is not a control. `next/link`, never a
    // bare anchor — the studio covers the site's own navigation, so these are real routes out.
    // `flex min-w-0` on the link too, or the inline anchor sizes to its content and the name's
    // truncation never engages at the row's edge.
    return slug ? (
        <Link href={`/@${encodeURIComponent(slug)}`} className="flex min-w-0 max-w-full">
            {label}
        </Link>
    ) : (
        label
    )
}

/** The shared shell of every person-spoken row: 24px avatar, then a column. */
function ChatRow({
    user,
    isMember,
    tint,
    children,
}: {
    user: LiveChatUser | null
    isMember: boolean
    /** A faint warm wash behind the row — a gift is an event, not just a sentence. */
    tint?: boolean
    children: ReactNode
}) {
    return (
        /*
         * Every row arrives with `RISE`. The list is keyed by index and only ever appended to (and
         * trimmed from the front), so an element is mounted exactly once — a new line plays its
         * entrance and nothing already on screen replays it, whatever the trim does to positions.
         * A hover plate so the row under the pointer is findable in a fast room.
         */
        <div
            className={cn(
                'flex gap-2 rounded-xl px-2 py-1.5 transition-colors',
                /*
                 * ⚠ **A member's row wears legacy's warm gradient**, in the column's own shape:
                 * full width like the gift row, in legacy's own colours
                 * (`--live-chat-member-row`). The comps draw no such variant and this port had
                 * followed them; the product asked for it back, because in a paid room *who is a
                 * member* is what a creator scans the chat for, and a 16px `MEM` chip alone is not
                 * findable at speed. It replaces the gift wash and the hover plate on that row —
                 * one ground, never two.
                 */
                isMember
                    ? 'bg-(image:--live-chat-member-row) rtl:bg-(image:--live-chat-member-row-rtl)'
                    : cn(
                          'hover:bg-white/[0.04]',
                          tint &&
                              'bg-linear-to-r from-(--live-chat-gift)/12 to-transparent rtl:bg-linear-to-l',
                      ),
                RISE,
            )}
        >
            <ChatAvatar user={user} />
            <div className="min-w-0 flex-1">
                <ChatName user={user} isMember={isMember} />
                {children}
            </div>
        </div>
    )
}

function ChatLine({ line, channel }: { line: LiveChatLine; channel: EventDetail['channel'] }) {
    const { t } = useTranslation()

    switch (line.kind) {
        /* `Nor cmt` and `Top host` — one row, one or many lines of text. */
        case 'comment':
            return (
                /* A member's row takes legacy's gradient ground — see `ChatRow`. */
                <ChatRow user={line.user} isMember={line.isMember}>
                    <p className="type-dense-emphasis break-words text-white">{line.text}</p>
                </ChatRow>
            )

        /* `Send gift` — a sentence, not a pill. */
        case 'gift': {
            const thumb = giftThumb(line.gift)
            return (
                <ChatRow user={line.user} isMember={line.isMember} tint>
                    <p className="type-dense-emphasis flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-white">
                        <span>{t('event_studio_chat_gift_sent')}</span>
                        <span className="flex items-center gap-1">
                            {thumb && (
                                <Image
                                    src={thumb}
                                    alt={line.gift?.name ?? ''}
                                    width={16}
                                    height={16}
                                    className="flex-none"
                                />
                            )}
                            <span className="type-dense-emphasis text-(--live-chat-gift)">
                                x{formatCount(line.quantity)}
                            </span>
                            <span className="type-caption-meta text-(--live-chat-gift)">
                                {t('event_studio_chat_gift_stars', {
                                    stars: formatCount(line.total),
                                })}
                            </span>
                        </span>
                        {/*
                         * Who it went to. The comps print `[Space name]`, legacy reads
                         * `gift_data.recipient_name`, and a gift in a live goes to the streamer's
                         * space — so the broadcast's own channel is the fallback rather than a
                         * blank. A sentence ending in "to" says nothing.
                         */}
                        {line.gift?.recipient_name && (
                            <>
                                <span className="type-dense-default">
                                    {t('event_studio_chat_gift_to')}
                                </span>
                                {/*
                                 * The tick when the recipient is the broadcast's own space — the
                                 * only recipient whose verification this frame can know; a gift
                                 * names its co-host recipient by name alone.
                                 */}
                                <span className="type-dense-strong inline-flex items-center gap-1">
                                    {line.gift.recipient_name}
                                    {channel?.verified_tick_badge?.image &&
                                        line.gift.recipient_name === channel.name && (
                                            <VerifiedBadge
                                                image={channel.verified_tick_badge.image}
                                                size="dense"
                                            />
                                        )}
                                </span>
                            </>
                        )}
                    </p>
                </ChatRow>
            )
        }

        case 'subscriber':
            return (
                <ChatSystemLine tone="member">
                    {t('event_studio_chat_subscriber', { name: line.user?.name ?? '' })}
                </ChatSystemLine>
            )

        case 'notice':
            return <ChatSystemLine>{line.text}</ChatSystemLine>

        /*
         * A command this client does not know. It exists in the list so the count is right — see
         * `parseChatLine` — and renders nothing **deliberately**, which is the difference from
         * legacy dropping it and leaving no trace that anything arrived.
         */
        case 'unknown':
            return null
    }
}

/**
 * **A float pill** — the comps' `New joined`, `Alert mute` and `Unlock level` all share it:
 * 28 tall, 12 radius, 2/8 of padding, sitting on a 12px inset with 6px above and below.
 */
/**
 * A stable key per arrival *object*. The queue hands `useLiveChat` a fresh user object for each
 * person shown, and the same person twice in a row is still two arrivals — so identity, not the
 * user's id, is what says "this is a new toast".
 */
const arrivalKeys = new WeakMap<object, number>()
let arrivalSeq = 0
function arrivalKey(user: object): number {
    let key = arrivalKeys.get(user)
    if (key === undefined) {
        arrivalSeq += 1
        key = arrivalSeq
        arrivalKeys.set(user, key)
    }
    return key
}

/**
 * **Somebody joined** — the comps' `Chat/New joined`, redrawn as one of the stage's arrivals.
 *
 * Their face, their name with its blue tick (the tick was missing: a verified creator walking in
 * read the same as a lookalike), the sentence, and a wave — on the room's glass, as a pill.
 *
 * It moves the way the other things that *arrive* over this screen move (the gift banner, the
 * stage's follow prompt): `GIFT_IN` from the leading edge with a small overshoot, and `GIFT_OUT`
 * back toward it `GIFT_OUT_MS` before the next person takes its place (`ARRIVAL_MS`), so one
 * arrival hands over to the next instead of being swapped in a frame.
 */
function ArrivalToast({
    user,
    sentence,
    name,
}: {
    user: LiveChatUser
    sentence: string
    name: string
}) {
    const [leaving, setLeaving] = useState(false)
    const [entered, setEntered] = useState(false)
    useEffect(() => {
        const timer = setTimeout(() => setLeaving(true), ARRIVAL_MS - GIFT_OUT_MS)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="flex-none px-3 py-1.5">
            <p
                data-testid="event-studio-arrival"
                onAnimationEnd={e => {
                    if (e.target === e.currentTarget) setEntered(true)
                }}
                className={cn(
                    'flex h-8 w-fit max-w-full items-center gap-1.5 rounded-full pe-3',
                    // The avatar takes the leading slot; without one the pill opens on the name.
                    user.avatar ? 'ps-1' : 'ps-3',
                    // The pinned message's material — the violet glass, its lit edge and drop — so
                    // the room's two announcements read as one family.
                    'bg-(image:--live-chat-pinned) ring-1 ring-inset ring-[rgba(196,170,255,0.22)] backdrop-blur-md',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_18px_rgba(0,0,0,0.28)]',
                    '[--gift-dir:1] rtl:[--gift-dir:-1]',
                    leaving ? GIFT_OUT : !entered && GIFT_IN,
                )}
            >
                {/*
                 * Only a real picture. An initials disc in a toast that lasts three seconds is a
                 * blank coloured circle saying nothing the name beside it does not.
                 */}
                {user.avatar && (
                    <span className="flex size-6 flex-none rounded-full ring-2 ring-(--live-chat-arrival)">
                        <ChatAvatar user={user} />
                    </span>
                )}
                <span className="type-caption-meta min-w-0 truncate text-white">
                    <NameWithTick
                        sentence={sentence}
                        name={name}
                        tick={user.verified_tick_badge?.image}
                        nameClassName="type-caption-label-strong"
                    />
                </span>
            </p>
        </div>
    )
}

function ChatFloat({
    testId,
    ground,
    children,
    role,
}: {
    testId: string
    ground: string
    children: ReactNode
    role?: 'alert'
}) {
    return (
        <div className="flex-none px-3 py-1.5">
            <p
                data-testid={testId}
                role={role}
                className={cn(
                    'flex h-7 w-fit max-w-full items-center gap-1 rounded-xl px-2 py-0.5',
                    ground,
                )}
            >
                {children}
            </p>
        </div>
    )
}

/**
 * **The `:` suggestion strip** — one row of up to eight emoji above the composer, the active one
 * lifted, and its shortcode named at the trailing end so the reader learns the name for next time.
 *
 * The room's dark glass, as the emoji panel and the stage plates are. It rises in (`RISE`) when
 * it opens, and moving between items eases the highlight and the lift rather than snapping.
 * `onMouseDown` is cancelled on every option so pressing one never blurs the field (which would
 * close the strip before the click lands).
 */
function EmojiSuggestStrip({
    id,
    items,
    active,
    onHover,
    onPick,
}: {
    id: string
    items: ChatEmoji[]
    active: number
    onHover: (index: number) => void
    onPick: (emoji: ChatEmoji) => void
}) {
    const current = items[active]
    return (
        <div
            className={cn(
                '@container absolute inset-x-3 bottom-[60px] z-20 flex items-center gap-2 rounded-full py-1 ps-1.5 pe-4',
                'bg-[color-mix(in_srgb,var(--white)_14%,var(--black))] shadow-[0_6px_20px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/10',
                RISE,
            )}
        >
            <div id={id} role="listbox" className="flex min-w-0 flex-1 items-center gap-0.5">
                {items.map((emoji, index) => (
                    <button
                        key={emoji.char}
                        id={`${id}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        aria-label={`:${emoji.names[0]}:`}
                        onMouseDown={e => e.preventDefault()}
                        onMouseEnter={() => onHover(index)}
                        onClick={() => onPick(emoji)}
                        className={cn(
                            'grid size-8 flex-none place-items-center rounded-full text-lg leading-none',
                            'transition-[background-color,scale] duration-150 ease-out motion-reduce:transition-none',
                            index === active ? 'scale-115 bg-white/15' : 'hover:bg-white/10',
                        )}
                    >
                        {emoji.char}
                    </button>
                ))}
            </div>
            {current && (
                /*
                 * The active shortcode, behind a hairline — and only where the strip has room
                 * for it beside eight emoji (a 320px content box; the query measures inside the
                 * strip's padding, which is what a 360 threshold missed on a 393px column). On the narrowest column the row of faces is the
                 * point and the name would crowd the last of them.
                 */
                <span
                    aria-hidden
                    className="type-caption-meta hidden max-w-[40%] flex-none truncate border-white/15 border-s ps-3 text-white/60 @[320px]:inline"
                >
                    :{current.names[0]}:
                </span>
            )}
        </div>
    )
}

/**
 * **The emoji row** — a curated grid (`lib/chat-emoji.ts`), and a deliberate divergence from legacy.
 *
 * Legacy mounts `emoji-picker-react`, which is **40MB unpacked**: the full Unicode set, its
 * search index and its sprite sheets. For a secondary control in a chat box that is a poor
 * trade, and `CLAUDE.md`'s dependency and byte rules both point the other way.
 *
 * So: the emoji a live chat actually uses, as native characters. No dependency, no images, no
 * lazy chunk, and correct in every locale because the font does the work.
 *
 * ⚠ **This is not the same product as a full picker** — there is no search and no skin-tone
 * selector. If the product wants the real thing, `emoji-picker-react` behind a `next/dynamic` is
 * the swap, and this component is the seam.
 */
function EmojiButton({
    onPick,
    disabled = false,
}: {
    onPick: (emoji: string) => void
    /** The field it writes into is disabled — so is this, and an open panel closes. */
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    /*
     * A picker for a field that will not take the result is a control that does nothing: the
     * panel opened over *You can't send messages here* and every press was swallowed. Closed the
     * moment the field disables, so a mute or a lock mid-pick does not leave it hanging open.
     */
    useEffect(() => {
        if (disabled) setOpen(false)
    }, [disabled])
    /*
     * **Hover opens it, and leaving closes it** — with a short grace on the way out, so the pointer
     * can cross the gap between the button and the panel above it without the panel vanishing
     * mid-reach. Both elements share the same enter/leave pair, so moving between them never
     * closes it. The press still toggles, for touch and the keyboard, where there is no hover.
     */
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** How the last press arrived — a keyboard press fires no pointer event and reads as `''`. */
    const pointerType = useRef('')
    const hover = {
        onMouseEnter: () => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
            if (!disabled) setOpen(true)
        },
        onMouseLeave: () => {
            pointerType.current = ''
            closeTimer.current = setTimeout(() => setOpen(false), 160)
        },
    }
    useEffect(
        () => () => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
        },
        [],
    )

    return (
        <>
            {open && !disabled && (
                /*
                 * Above the composer, inside the column. `absolute` against the chat panel
                 * rather than a portal: the studio is already a `fixed` stage and a portalled
                 * popover would land outside it, over the video.
                 */
                <div
                    {...hover}
                    data-testid="event-studio-emoji-panel"
                    className={cn(
                        'absolute inset-x-3 bottom-16 z-20 grid grid-cols-8 gap-1 rounded-xl p-2',
                        RISE,
                        'bg-[color-mix(in_srgb,var(--white)_16%,var(--black))]',
                    )}
                >
                    {CHAT_EMOJI.map(({ char, names }) => (
                        <button
                            key={char}
                            type="button"
                            title={`:${names[0]}:`}
                            onClick={() => {
                                onPick(char)
                                setOpen(false)
                            }}
                            className="rounded p-1 text-lg transition-colors hover:bg-white/15"
                        >
                            {char}
                        </button>
                    ))}
                </div>
            )}
            <button
                type="button"
                {...hover}
                onPointerDown={e => {
                    pointerType.current = e.pointerType
                }}
                /*
                 * With a mouse the hover has already opened it, so a click that toggled would close
                 * it again in the same gesture. A mouse click keeps it open; touch and the keyboard
                 * (no hover to rely on) toggle.
                 */
                onClick={() => (pointerType.current === 'mouse' ? setOpen(true) : setOpen(v => !v))}
                data-testid="event-studio-emoji"
                aria-label={t('event_studio_chat_emoji')}
                aria-expanded={open && !disabled}
                disabled={disabled}
                className="flex size-6 flex-none items-center justify-center text-[#C2C2C2] transition-[color,opacity] hover:not-disabled:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
                <Icon name="face-smile" size={20} />
            </button>
        </>
    )
}

export function EventStudioChat({
    event,
    chat,
    fee,
    onCollapse,
    hasEnded,
    onLocked,
    lockedBySignIn = false,
    variant = 'column',
    accessory,
    overlayHeight = 'tall',
    className,
}: {
    event: EventDetail
    chat: LiveChatState
    /**
     * **The stream is exclusive and this reader is outside it** — the preview's column.
     *
     * Same column, same header and board (the board is HTTP), but no room is joined, so there is no
     * transcript to show and nothing can be sent. The list becomes a locked placeholder and the
     * composer a single control; both call this, and the stage opens its paywall.
     */
    onLocked?: () => void
    /** A guest: the locked controls say *Sign in*, since that is the way in for them. */
    lockedBySignIn?: boolean
    /**
     * `column` — the desktop studio's panel beside the stage. `overlay` — the portrait studio's:
     * no panel and no header block (the board has no room on a phone), the transcript floating over
     * the video and fading out toward the top, and the composer on one row with `accessory` beside
     * it. Every behaviour — sending, paid chat, emoji, the lock — is the same component's.
     */
    variant?: 'column' | 'overlay'
    /** Controls drawn beside the composer in the `overlay` variant (the gift button). */
    accessory?: ReactNode
    /**
     * The overlay transcript's window: `tall` over a single face (the picture is behind the words
     * anyway), `short` under a grid of seats, so the grid can grow instead of being covered.
     */
    overlayHeight?: 'tall' | 'short'
    /**
     * The sustained fee, when one applies.
     *
     * Drawn with `ChatSystemLine` because that is what the comps call it — `Paid view live` is a
     * `Tevi icon` row in the `Chat` set, not a banner of its own — but **positioned above** the
     * transcript rather than inside it: the notice clears itself after ten seconds, and a line
     * that appears and vanishes mid-list drags every message under it up and down.
     */
    fee?: SustainedFeeState
    /**
     * Fold the column away — the comps' `Panel Contract` control.
     *
     * Optional, and the column simply does not draw the button without it: the stage owns whether
     * it can be collapsed, and a control that is always there but sometimes inert is worse than
     * one that is not there.
     */
    onCollapse?: () => void
    /**
     * **The broadcast is over** — the comps' `Right menu/Type=Ended`.
     *
     * It drops the header block entirely (`Header/Active=False, Type=Ended` keeps a bare 56px row,
     * but the *composed* column hides even that) and replaces the composer with a disabled pill.
     * There is nothing left to count, nobody left to rank and no message that could be sent.
     *
     * ⚠ **The transcript stays**, which is the one place this departs from the frame: the comps
     * hide every `Chat` instance too, because their Ended column is one somebody *arrives* at. A
     * reader here only reaches this state by having watched the stream end, so blanking what was
     * just said would be taking the conversation away at the moment it finished.
     */
    hasEnded?: boolean
    className?: string
}) {
    const { t } = useTranslation()
    const [draft, setDraft] = useState('')
    const listRef = useRef<HTMLDivElement | null>(null)
    /*
     * Whether the reader was at the bottom **before** this batch of lines rendered. Read off the
     * previous render's geometry, because once the new line is in the DOM the measurement has
     * already moved.
     */
    const wasAtBottom = useRef(true)
    /**
     * How many lines had arrived when the reader was last at the bottom.
     *
     * The `16 new comments` pill counts from here. It is a ref plus a piece of state rather than
     * state alone because the *count* has to survive renders that do not change it, and legacy
     * keeps the same pair (`listIndexViewed` and `isNewComments`).
     */
    const seenCount = useRef(0)
    const [unread, setUnread] = useState(0)

    useEffect(() => {
        const node = listRef.current
        // Reading the length is also what makes `chat.lines` a dependency the linter accepts —
        // it is the trigger rather than a value, and an empty list has nothing to scroll to.
        if (!node || chat.lines.length === 0) return
        if (wasAtBottom.current) {
            node.scrollTop = node.scrollHeight
            seenCount.current = chat.lines.length
            setUnread(0)
            return
        }
        setUnread(Math.max(0, chat.lines.length - seenCount.current))
    }, [chat.lines])

    /*
     * Whether the transcript has scrolled off its first line — what turns the top fade on. At rest
     * on the first line the fade would eat it, so it only appears once there is something above.
     */
    const [scrolledDown, setScrolledDown] = useState(false)
    /** …and whether it has scrolled up off its last — the same rule for the bottom fade. */
    const [scrolledUp, setScrolledUp] = useState(false)
    const onScroll = () => {
        const node = listRef.current
        if (!node) return
        // 24px of slack: a reader one line from the bottom is still "at the bottom", and an exact
        // comparison fails on fractional scroll positions anyway.
        const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24
        wasAtBottom.current = atBottom
        setScrolledDown(node.scrollTop > 2)
        setScrolledUp(node.scrollHeight - node.scrollTop - node.clientHeight > 2)
        if (atBottom) {
            seenCount.current = chat.lines.length
            setUnread(0)
        }
    }

    const jumpToLatest = () => {
        const node = listRef.current
        if (!node) return
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
        wasAtBottom.current = true
        seenCount.current = chat.lines.length
        setUnread(0)
    }

    const submit = (e: FormEvent) => {
        e.preventDefault()
        if (!draft.trim()) return
        /*
         * A paid chat this balance cannot cover: *Out of Star*, and the draft **stays** — checked
         * here, before clearing, because a refused send that ate the message would make the
         * reader type it again after topping up.
         */
        if (chat.mustTopUp) {
            chat.outOfStar.show()
            return
        }
        const body = draft
        setDraft('')
        void chat.send(body)
    }

    const arrivalName = chat.arrival?.name ?? ''
    const canSubmit = chat.canSend && draft.trim() !== ''
    const suggest = useEmojiSuggest({
        value: draft,
        onChange: setDraft,
        maxLength: CHAT_MAX_LENGTH,
    })
    const suggestId = useId()
    const isOverlay = variant === 'overlay'

    return (
        <aside
            data-testid="event-studio-chat"
            data-option-value={variant}
            className={cn(
                isOverlay ? 'flex flex-col' : cn(EVENT_STUDIO_PANEL, 'flex h-full flex-col'),
                className,
            )}
            /*
             * The comps' palette, declared once on the panel — see `EVENT_STUDIO_CHAT_VARS`.
             * Every plate below reads `var(--live-chat-*)`, so the family is legible in one
             * place instead of sprinkled through six components as one-off hex values.
             */
            style={EVENT_STUDIO_CHAT_VARS as CSSProperties}
        >
            {/*
             * ⚠ **The header is one 56px row, and there is no title, gear or rule.**
             *
             * `Header/Expand` is `Header`(56) · `Host Badges`(16) · `Top Contributors` on a single
             * `#9B8DBC` 20% wash with 4px between and 16 below — no divider under it; the comps'
             * `Divider Container` is `visible: false`, as are the `Live chat` title and the
             * `settings` gear that were drawn here from that same dead group.
             */}
            {/* Gone once the broadcast has ended — see `hasEnded`. */}
            {!hasEnded && !isOverlay && (
                /*
                 * The wash does not stop on a hard edge: it runs on 24px past the block and fades
                 * out over whatever sits below — the pin, or the transcript — so the board and the
                 * chat meet as one surface rather than two stacked boxes. An `after:` overlay,
                 * not padding: it overlaps the next block instead of pushing it down, and it is
                 * `pointer-events-none` so the first line under it stays clickable.
                 */
                <div
                    className={cn(
                        'relative z-10 flex flex-none flex-col gap-1 bg-(--live-chat-header)',
                        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:content-['']",
                        'after:bg-[linear-gradient(to_bottom,var(--live-chat-header),transparent)]',
                    )}
                >
                    <header className="flex h-14 items-center justify-between gap-1 px-4">
                        <div className="flex min-w-0 items-center gap-1">
                            {/*
                             * `Live badge` — `badge-dollar` for an exclusive broadcast, `users` for a
                             * free one. It is about the **live**, not about paid chat; this drew the
                             * dollar off `paid_chat` and the `users` glyph unconditionally, so a free
                             * live wearing a paid-chat flag showed both.
                             */}
                            <Icon
                                name={isExclusiveLive(event) ? 'badge-dollar' : 'users'}
                                size={18}
                                className="flex-none text-white"
                            />
                            <span className="type-dense-emphasis flex-none text-white">
                                {t('event_studio_chat_viewers', { count: chat.ccu ?? 0 })}
                            </span>
                            {chat.ccu !== null && (
                                <span className="flex flex-none items-center gap-1 rounded-full px-1 py-px backdrop-blur-[4px]">
                                    <Icon name="eye" size={16} className="text-white" />
                                    <span
                                        data-testid="event-studio-ccu"
                                        className="type-caption-label text-white"
                                    >
                                        {formatCount(chat.ccu)}
                                    </span>
                                </span>
                            )}
                        </div>

                        {onCollapse && (
                            <button
                                type="button"
                                onClick={onCollapse}
                                data-testid="event-studio-chat-collapse"
                                aria-label={t('event_studio_chat_collapse')}
                                className="grid size-10 flex-none place-items-center rounded-full bg-black/20 text-[#C2C2C2] transition-colors hover:text-white"
                            >
                                {/* `Panel Contract` in the comps. The sprite's nearest is the sidebar
                                pair — same panel, a chevron where Figma draws an arrow. It mirrors
                                for RTL, where the column sits on the other edge. */}
                                <Icon
                                    name="layout-sidebar-angle-right"
                                    size={24}
                                    className="rtl:-scale-x-100"
                                />
                            </button>
                        )}
                    </header>

                    {/*
                     * ⚠ **`All` and `High level user` are in the comps and are `visible: false`.**
                     *
                     * All three chips exist in `Host Badges`; only `Top contributing users` is shown,
                     * and it is a **label for the board**, not a tab — which is why it renders
                     * unconditionally rather than only when there are rows, and why the other two are
                     * not drawn. They are also absent from legacy entirely (`grep`: nothing), so
                     * there is no data source behind either.
                     */}
                    <div className="flex items-center gap-1 px-4">
                        <span className="type-micro-overline flex h-4 items-center rounded bg-(--live-chat-chip) px-2 text-white">
                            {t('event_studio_chat_top_contributors')}
                        </span>
                        {/*
                         * How many more are on the board than the three it shows — the board only
                         * opens on hover, so without a count nobody knows there is anything below.
                         */}
                        {chat.topStars.length > LEADERBOARD_VISIBLE && (
                            <span className="type-micro-overline flex h-4 items-center rounded bg-white/10 px-1.5 tabular-nums text-white/70">
                                +{chat.topStars.length - LEADERBOARD_VISIBLE}
                            </span>
                        )}
                    </div>

                    <ChatLeaderboard
                        rows={chat.topStars}
                        isLoading={chat.isLoadingTopStars}
                        ownIndex={chat.topStarsSelfIndex}
                    />
                </div>
            )}

            {/*
             * The host's pin, 48 tall on a 12px inset — `Chat/Pinned Message`. Dismissable, and
             * the dismissal is local: the pin is still up for everybody else, and the next
             * `pinned_message` frame brings it back.
             */}
            {!hasEnded && !onLocked && chat.pinned && (
                <div className="flex-none px-3 pt-2 pb-1">
                    {/* Keyed by the text, so a new pin replaces the old one with its own entrance. */}
                    <PinnedMessage
                        host={event.channel}
                        key={`${chat.pinned.user_name ?? ''}:${chat.pinned.message}`}
                        pinned={chat.pinned}
                        onDismiss={chat.dismissPinned}
                    />
                </div>
            )}

            {/*
             * ⚠ **Muted needs its own sentence.** `isBlocked` disables the box and says nothing;
             * legacy shows this for ten seconds at the moment the host mutes somebody. Without
             * it the composer simply stops working, which reads as the app breaking.
             *
             * `Chat/Alert mute` — the red tenth, an `exclamation-triangle` and 12/Regular. The
             * comps also have `Type11`, the same sentence as a *transcript* line in `#D00416`;
             * this is the transient one, which is the state the room actually raises.
             */}
            {!hasEnded && !onLocked && chat.justMuted && (
                <ChatFloat
                    testId="event-studio-muted"
                    role="alert"
                    ground="bg-(--live-chat-alert-ground)"
                >
                    <Icon
                        name="exclamation-triangle"
                        size={16}
                        className="flex-none text-(--live-chat-alert)"
                    />
                    <span className="type-caption-meta text-(--live-chat-alert)">
                        {t('event_studio_chat_muted')}
                    </span>
                </ChatFloat>
            )}

            {/*
             * ⚠ **An arrival is a toast, not a line.** One at a time, three seconds, above the
             * transcript — legacy's `Attendance`, the comps' `Chat/New joined`. Appending them to
             * the conversation, which this did first, turns a busy room's chat into a wall of
             * "X has entered".
             */}
            {!hasEnded && !onLocked && chat.arrival && (
                <ArrivalToast
                    // A new arrival is a new element, so its entrance plays — see `arrivalKey`.
                    key={arrivalKey(chat.arrival)}
                    user={chat.arrival}
                    sentence={t('event_studio_chat_joined', { name: NAME_SLOT })}
                    name={arrivalName}
                />
            )}

            {/*
             * Money, above the conversation but drawn as the system lines it is. A charge that
             * **failed** does not clear itself: the streamer was not paid, and that stays true
             * until the next interval succeeds.
             */}
            {/*
             * In the list's own inset (`px-2`) and spacing (`gap-1`), so a fee card lines up with
             * the notices under it. Drawn straight in the column it ran edge to edge, wider than
             * every other card.
             */}
            {!hasEnded && !onLocked && (fee?.hasFailed || fee?.notice) && (
                // `-mb-1` against the list's `pt-2`, so the step from a fee card to the first notice is the
                // same 4px as every other step.
                <div className="-mb-1 flex flex-none flex-col gap-1 px-2 pt-2">
                    {fee?.hasFailed && (
                        <ChatSystemLine tone="denied" testId="event-studio-fee-error">
                            {t('event_studio_fee_failed')}
                        </ChatSystemLine>
                    )}
                    {fee?.notice && (
                        <ChatSystemLine testId="event-studio-fee-notice">
                            {t(fee.notice.key, {
                                fee: fee.notice.fee,
                                duration: fee.notice.duration,
                            })}
                        </ChatSystemLine>
                    )}
                </div>
            )}

            {/* `role="log"` with `aria-live="polite"`: a screen reader announces each new line
                as it arrives without interrupting whatever is being read. There is no element
                that carries the role, so it is spelled out. */}
            <div
                ref={listRef}
                onScroll={onScroll}
                role="log"
                aria-live="polite"
                aria-label={t('event_studio_chat_log')}
                data-testid="event-studio-chat-list"
                className={cn(
                    'flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-2',
                    /*
                     * Overlay: a capped window over the video, its top always fading out (the
                     * picture is what is above it, not a header), and every line lifted off the
                     * frame by a soft shadow, since there is no panel behind the words.
                     */
                    isOverlay
                        ? cn(
                              '[mask-image:linear-gradient(to_bottom,transparent_0,black_56px)] [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]',
                              overlayHeight === 'short'
                                  ? 'max-h-[min(26vh,220px)]'
                                  : 'max-h-[min(36vh,320px)]',
                          )
                        : 'flex-1',
                    /*
                     * Lines **dissolve** into both edges — up under the pin or the header, down
                     * into the composer — instead of being cut by them. Each edge fades only when
                     * there is more beyond it (`scrolledDown` / `scrolledUp`): at rest the fade
                     * would eat the first or the newest line. Three literal classes, because a
                     * mask assembled from pieces is a class Tailwind never sees.
                     */
                    scrolledDown && scrolledUp
                        ? '[mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-24px),transparent_100%)]'
                        : scrolledDown
                          ? '[mask-image:linear-gradient(to_bottom,transparent_0,black_20px)]'
                          : scrolledUp &&
                            '[mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent_100%)]',
                )}
            >
                {/* The overlay keeps the video clear: no welcome cards, no locked placeholder. */}
                {!hasEnded && !isOverlay && <ChatNotices event={event} />}
                {onLocked && !isOverlay && (
                    <LockedTranscript onUnlock={onLocked} signIn={lockedBySignIn} />
                )}
                {/*
                 * Locked, the room's conversation is not this reader's — the same column the
                 * preview draws, with no transcript. Lines a session left behind (a mid-watch lock
                 * keeps the hook's state) are not shown under the lock.
                 */}
                {!onLocked &&
                    chat.lines.map((line, index) => (
                        /*
                         * The index is the key, and it is correct here rather than lazy: the list is
                         * **append-only** and trimmed from the front, so a line's position is stable
                         * for as long as it is on screen. Frames carry no id — there is nothing else
                         * to key on.
                         */
                        // biome-ignore lint/suspicious/noArrayIndexKey: append-only, no id on the wire.
                        <ChatLine key={index} line={line} channel={event.channel} />
                    ))}

                {/*
                 * ⚠ **`Chat/Type7` — the one variant with no counterpart here at all.**
                 *
                 * A reader who scrolls up stops being auto-scrolled, which is right, and then has
                 * no way of knowing the room kept talking. This is that: `sticky` inside the
                 * scroller so it rides 24px above the bottom edge, and it takes them back.
                 *
                 * `mt-auto` is what pins it to the bottom of a short list — without it a chat with
                 * three lines in it would float the pill in the middle of the empty column.
                 */}
                {!onLocked && unread > 0 && (
                    <button
                        type="button"
                        onClick={jumpToLatest}
                        data-testid="event-studio-chat-jump"
                        className="sticky bottom-6 mx-auto mt-auto flex h-7 w-fit flex-none items-center rounded-xl bg-(--live-chat-jump) px-2 py-0.5 shadow-[0_2px_2px_0_#00000040] backdrop-blur-[4px]"
                    >
                        <span className="type-caption-label text-(--live-chat-alert)">
                            {t('event_studio_chat_new_comments', {
                                count: unread,
                                formatted: formatCount(unread),
                            })}
                        </span>
                    </button>
                )}
            </div>

            {/*
             * `Input Container` — one 44px field on a 12px inset, with the emoji and send controls
             * **inside** it. They were outside, as a 40px pill of their own, which is 52px of
             * column the design gives to the message.
             *
             * Once the broadcast has ended it is replaced rather than disabled: the comps' Ended
             * column has a `Small Button / Pill` where the field was, and a greyed-out text box is
             * an invitation the room can no longer accept.
             */}
            <div
                className={cn(
                    isOverlay &&
                        'flex flex-none items-end gap-2 px-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] [&>*:first-child]:m-0 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-1 [&>*:first-child]:p-0',
                )}
            >
                {onLocked ? (
                    /*
                     * The composer, standing in as one control: the field's own pill shape and height,
                     * a lock where the caret would be, and the sentence that says what unlocks it — so
                     * the column keeps its silhouette and the reader can see exactly where they would
                     * be typing.
                     */
                    <div className="flex-none px-3 pt-2 pb-3">
                        <button
                            type="button"
                            data-testid="event-studio-chat-locked"
                            onClick={onLocked}
                            className={cn(
                                'group flex h-11 w-full items-center gap-2.5 rounded-full ps-4 pe-1.5 text-start',
                                'bg-(--live-chat-field) ring-1 ring-inset ring-white/10 transition-colors hover:ring-white/25',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                            )}
                        >
                            <Icon
                                name="lock-simple"
                                weight="filled"
                                size={16}
                                className="flex-none text-white/60"
                            />
                            <span className="type-dense-default min-w-0 flex-1 truncate text-white/60">
                                {t(
                                    lockedBySignIn
                                        ? 'event_exclusive_chat_sign_in'
                                        : 'event_exclusive_chat_locked',
                                )}
                            </span>
                            <span className="type-caption-label-strong flex h-8 flex-none items-center rounded-full bg-[#501BC0] px-3 text-white transition-colors group-hover:bg-[#6B2FE0]">
                                {lockedBySignIn ? t('auth_sign_in') : t('event_exclusive_unlock')}
                            </span>
                        </button>
                    </div>
                ) : hasEnded ? (
                    <p
                        data-testid="event-studio-chat-ended"
                        className="type-title-t4-semibold flex h-12 flex-none items-center justify-center rounded-lg bg-(--live-chat-ended) text-(--live-chat-ended-ink) mx-3 mb-3"
                    >
                        {t('event_studio_chat_ended')}
                    </p>
                ) : (
                    <form onSubmit={submit} className="relative flex-none px-3 pt-2 pb-3">
                        {suggest.isOpen && (
                            <EmojiSuggestStrip
                                id={suggestId}
                                items={suggest.items}
                                active={suggest.active}
                                onHover={suggest.setActive}
                                onPick={suggest.insert}
                            />
                        )}
                        {/*
                         * The 1px edge is `Input Container/Hover` and `/Active`, which differ from
                         * `Inactive` by nothing else. `border-transparent` rather than no border at all,
                         * so the field does not gain 2px of height the moment it is focused.
                         */}
                        {/*
                         * A pill rather than a box, so it reads as the room's own control and matches
                         * the plates over the stage. Focus lifts the edge *and* rings it softly — the
                         * 1px edge alone was easy to miss on a dark column.
                         */}
                        <div
                            className={cn(
                                'flex h-11 items-center gap-3 rounded-full border border-transparent bg-(--live-chat-field) ps-4 pe-1.5',
                                'transition-[border-color,box-shadow] duration-200',
                                'hover:border-(--live-chat-field-focus)',
                                'focus-within:border-(--live-chat-field-focus) focus-within:shadow-[0_0_0_3px_rgba(155,141,188,0.18)]',
                            )}
                        >
                            <input
                                ref={suggest.inputRef}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                {...suggest.fieldProps}
                                // The `:` suggestions are a combobox popup on this field.
                                role="combobox"
                                aria-autocomplete="list"
                                aria-expanded={suggest.isOpen}
                                aria-controls={suggest.isOpen ? suggestId : undefined}
                                aria-activedescendant={
                                    suggest.isOpen ? `${suggestId}-${suggest.active}` : undefined
                                }
                                disabled={!chat.canSend}
                                /*
                                 * Legacy's own clamp (`if (value?.length <= 250) setComment(value)`), and
                                 * the only length rule either client has. Enforced on the field rather
                                 * than at `send`, so a reader is stopped at 250 instead of typing a
                                 * paragraph that is silently truncated or refused by the room.
                                 */
                                maxLength={CHAT_MAX_LENGTH}
                                data-testid="event-studio-chat-input"
                                placeholder={
                                    /*
                                     * Five states, in the order they outrank each other: the whole room's
                                     * chat being off beats this reader being muted, which beats a wire
                                     * that is still coming up, which beats a message already in flight,
                                     * which beats the price of the next one.
                                     *
                                     * ⚠ The middle two are legacy's `Connecting...` and `Sending...`, and
                                     * they were missing. A disabled field still inviting a message is how
                                     * a socket that has not connected reads as the app being broken.
                                     */
                                    chat.isChatOff
                                        ? t('event_studio_chat_off')
                                        : chat.isBlocked
                                          ? t('event_studio_chat_blocked')
                                          : !chat.isConnected
                                            ? t('event_studio_chat_connecting')
                                            : chat.isSending
                                              ? t('event_studio_chat_sending')
                                              : event.paid_chat
                                                ? t('event_studio_chat_paid_placeholder')
                                                : t('event_studio_chat_placeholder')
                                }
                                className={cn(
                                    'type-dense-emphasis min-w-0 flex-1 bg-transparent text-white outline-none',
                                    'placeholder:text-(--live-chat-muted) disabled:opacity-50',
                                )}
                            />
                            <span className="flex flex-none items-center gap-1">
                                <EmojiButton
                                    onPick={e => setDraft(d => d + e)}
                                    disabled={!chat.canSend}
                                />
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    data-testid="event-studio-chat-send"
                                    aria-label={t('event_studio_chat_send')}
                                    /* `Input Container/Active` lifts the send glyph from `#C2C2C2` to
                                   `#F9F7FD` — the one thing in the column that says the message is
                                   ready to go. */
                                    className={cn(
                                        'flex size-8 flex-none items-center justify-center rounded-full',
                                        'transition-[background-color,color,scale] duration-200 ease-out disabled:opacity-40',
                                        'active:scale-90 motion-reduce:transition-none',
                                        // Ready to go: the room's violet disc. Otherwise a quiet glyph.
                                        canSubmit
                                            ? 'bg-[#501BC0] text-white hover:bg-[#6B2FE0]'
                                            : 'text-[#C2C2C2] hover:text-white',
                                    )}
                                >
                                    <Icon name="send" size={18} />
                                </button>
                            </span>
                        </div>
                    </form>
                )}
                {isOverlay && accessory}
            </div>

            {/*
             * One line, under the composer. Three different failures reach it and each needs its
             * own sentence — "you have no Star" and "your message posted but you were not
             * charged" are not the same news, and the second is the one legacy never tells
             * anybody. See `useLiveChat`.
             */}
            {chat.errorKey && (
                <p
                    data-testid="event-studio-chat-error"
                    role="alert"
                    className="type-caption-meta px-3 pb-3 text-(--live-chat-alert)"
                >
                    {t(chat.errorKey)}
                </p>
            )}
            {/* Paid chat's wall — dismissable, with the chat's own sentence (legacy's). */}
            <EventOutOfStarDialog
                open={chat.outOfStar.open}
                description={t('event_studio_chat_out_of_star_body')}
                onClose={chat.outOfStar.close}
            />
        </aside>
    )
}

/**
 * **The folded column** — the comps' `Header/Active=False, Type=Colapse`, and the other half of
 * the `Panel Contract` control.
 *
 * ```
 * ( ⇤  ⓢ ◍◍◍◍◍  Viewer  👁 7.5k )
 * ```
 *
 * A 40px round expand button, the live badge, up to five of the board's faces overlapping by 6,
 * the label and the head count — on a 20% black pill. It was listed as *not built* on the grounds
 * that "the stage owns folding", which was true of nothing: the stage never folded it either, so
 * the column had no collapsed state and `onCollapse` was never passed.
 *
 * It takes `chat` rather than the pieces because the same state drives both halves, and the strip
 * has to keep counting while it is folded — a reader who hides the chat to watch is exactly the
 * one who wants to see the number move.
 */
export function EventStudioChatStrip({
    event,
    chat,
    onExpand,
    since = null,
    hideUnread = false,
    className,
}: {
    event: EventDetail
    chat: LiveChatState
    onExpand: () => void
    /**
     * The last line on screen when the column was folded. Everything said after it is **unread**:
     * counted on the expand control and previewed beside it, so a folded chat is still a room the
     * reader can hear.
     */
    since?: LiveChatLine | null
    /** Behind the exclusive gate: no badge, no preview — the transcript is not the reader's. */
    hideUnread?: boolean
    className?: string
}) {
    const { t } = useTranslation()
    const faces = chat.topStars.slice(0, STRIP_FACES)
    const unread = hideUnread ? [] : unreadSince(chat.lines, since)
    const latest = unread.at(-1) ?? null

    return (
        <div
            data-testid="event-studio-chat-strip"
            className={cn(
                // The chrome band's plate, so it matches the toolbar it sits beside — and the
                // toolbar's grammar too: 32px segments on a 40px plate, split by a hairline.
                EVENT_STUDIO_PILL,
                'flex h-10 items-center gap-0.5 px-1',
                // Unread: a violet edge comes up on the plate, so a folded chat still catches the eye.
                'transition-shadow duration-300 motion-reduce:transition-none',
                unread.length > 0 &&
                    'shadow-[0_0_0_1px_rgba(196,170,255,0.35),0_6px_20px_rgba(110,52,232,0.35)]',
                className,
            )}
        >
            <button
                type="button"
                onClick={onExpand}
                data-testid="event-studio-chat-expand"
                aria-label={t('event_studio_chat_expand')}
                className={cn(
                    'group relative grid size-8 flex-none place-items-center rounded-full text-white/70',
                    'transition-colors hover:bg-white/10 hover:text-white',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                )}
            >
                {/*
                 * The mirror of the collapse control, and the same sprite pair. On hover the glyph
                 * leans 2px the way the column will come from — a hint at what the press does, on
                 * `translate` so the RTL flip (`scale`) still composes with it.
                 */}
                <Icon
                    name="layout-sidebar-angle-left"
                    size={20}
                    className={cn(
                        'rtl:-scale-x-100 transition-[translate] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                        'group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 motion-reduce:transition-none',
                    )}
                />
                {/*
                 * How much was said while folded — on the control that opens it, the way every
                 * messenger badges its chat. Keyed on the count so each new line pops it.
                 */}
                {unread.length > 0 && (
                    <span
                        key={unread.length}
                        data-testid="event-studio-chat-unread"
                        className="absolute -end-1 -top-1 flex"
                    >
                        {/* One ripple per new line — it arrived, it did not merely change. */}
                        <span
                            aria-hidden
                            className={cn('absolute inset-0 rounded-full bg-[#FF4D6A]', PING)}
                        />
                        <span
                            className={cn(
                                'type-micro-overline relative flex h-4 min-w-4 items-center justify-center rounded-full px-1 tabular-nums text-white',
                                'bg-[linear-gradient(135deg,#FF6B8B,#E8264A)] shadow-[0_2px_6px_rgba(232,38,74,0.5)] ring-2 ring-[rgba(20,16,30,0.9)]',
                                POP,
                            )}
                        >
                            {unread.length > 99 ? '99+' : unread.length}
                        </span>
                    </span>
                )}
            </button>

            {/*
             * The newest line, previewed — face, name and what they said (or the gift's picture).
             * A new line replaces the bubble with its own entrance; pressing it opens the chat.
             */}
            {latest && (
                <>
                    <span aria-hidden className="mx-1 h-4 w-px flex-none bg-white/20" />
                    <button
                        key={unread.length}
                        type="button"
                        onClick={onExpand}
                        data-testid="event-studio-chat-latest"
                        className={cn(
                            /*
                             * The pinned message's violet glass, so "somebody spoke" reads in the
                             * room's own voice. It flies in from the chat's side (`GIFT_IN` along
                             * `--gift-dir`, flipped in RTL) — the line is coming *from* the column.
                             */
                            'group/latest flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-full ps-1 pe-2.5 text-start',
                            'bg-(image:--live-chat-pinned) ring-1 ring-inset ring-[rgba(196,170,255,0.25)]',
                            'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.25)]',
                            'transition-[filter] hover:brightness-110',
                            GIFT_IN,
                            '[--gift-dir:-1] rtl:[--gift-dir:1]',
                        )}
                    >
                        <span className="flex size-6 flex-none rounded-full ring-2 ring-white/20">
                            <ChatAvatar user={latest.user} />
                        </span>
                        <span className="type-caption-label min-w-0 truncate text-white/75">
                            <span className="type-caption-label-strong text-white">
                                {latest.user?.name ?? ''}
                            </span>
                            {latest.kind === 'comment' && <> {latest.text}</>}
                        </span>
                        {/* A new member: their crown, the badge the transcript gives them. */}
                        {latest.kind === 'subscriber' && (
                            <Icon
                                name="crown"
                                weight="filled"
                                size={16}
                                className="size-3.5 flex-none text-[#FFC700]"
                            />
                        )}
                        {latest.kind === 'gift' && giftThumb(latest.gift) && (
                            <span className={cn('flex flex-none', GIFT_BOB)}>
                                <Image
                                    src={giftThumb(latest.gift) as string}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="size-5 object-contain"
                                />
                            </span>
                        )}
                    </button>
                </>
            )}

            <span aria-hidden className="mx-1 h-4 w-px flex-none bg-white/20" />

            <span className="flex min-w-0 items-center gap-1.5 pe-1.5">
                <Icon
                    name={isExclusiveLive(event) ? 'badge-dollar' : 'users'}
                    size={16}
                    className="flex-none text-white/80"
                />
                {/*
                 * The board's own faces, overlapping by 6 — `Frame 1171276630` is an `itemSpacing`
                 * of **-6** in the frame. Each carries a dark rim so the overlap reads as a stack
                 * rather than as one blurred shape. Decorative: the names are one press away in the
                 * expanded column, and five avatars with no labels are not a list a screen reader
                 * should read out.
                 */}
                {faces.length > 0 && (
                    <span aria-hidden className="flex flex-none items-center">
                        {faces.map((row, i) => (
                            <span
                                key={row.user?.id ?? i}
                                className={cn(
                                    /*
                                     * `flex size-6`, not a bare inline `span`: inline, the box is
                                     * a line of text tall rather than the 24px disc, and the ring
                                     * drawn round it came out an oval taller than the face.
                                     */
                                    'flex size-6 flex-none rounded-full ring-2 ring-black/40',
                                    i > 0 && '-ms-1.5',
                                )}
                            >
                                <ChatAvatar
                                    user={
                                        {
                                            avatar: row.user?.avatar?.thumb,
                                            name: row.user?.display_name,
                                        } as LiveChatUser
                                    }
                                />
                            </span>
                        ))}
                    </span>
                )}
                <span className="type-dense-emphasis flex-none text-white">
                    {t('event_studio_chat_viewers', { count: chat.ccu ?? 0 })}
                </span>
                {chat.ccu !== null && (
                    /*
                     * The head count, on its own glass chip. The number is keyed on itself so each
                     * change plays `RISE` — a count that moves while the reader watches should look
                     * like it moved.
                     */
                    <span className="flex h-6 flex-none items-center gap-1 rounded-full bg-black/35 ps-1.5 pe-2 ring-1 ring-inset ring-white/10">
                        <Icon name="eye" size={16} className="size-3.5 flex-none text-white/80" />
                        <span
                            key={chat.ccu}
                            data-testid="event-studio-chat-strip-ccu"
                            className={cn(
                                'type-caption-label-strong tabular-nums text-white',
                                RISE,
                            )}
                        >
                            {formatCount(chat.ccu)}
                        </span>
                    </span>
                )}
            </span>
        </div>
    )
}

/**
 * **The host's pin** — `Chat/Pinned Message`, dismissable for this reader only (the pin is still up
 * for everybody else, and the next `pinned_message` frame brings it back).
 *
 * Kept to the comps' anatomy — pin disc, name + `Host` chip, the message, a close — and given the
 * live room's material: the pinned-message violet as a **glass** plate (a tint over the panel's
 * blur, a lit inner edge, a soft drop) rather than a flat fill, so it reads as a card sitting over
 * the transcript instead of a coloured row in it. The disc carries the colour as a filled violet
 * mark, which is what the eye finds first.
 *
 * Motion: the card `RISE`s in, the disc `POP`s a beat later (the pin landing), and dismissing
 * plays `PIN_OUT` before the state is cleared — under reduced motion it clears at once, because a
 * disabled exit would leave the card sitting there for its whole duration. A host *unpin* removes
 * it immediately; there is no copy left to animate.
 *
 * ⚠ **The `Host` chip needs no field, so it is drawn.** Only a host can pin, so the chip states
 * something the frame's existence already guarantees. The `@mention` stays out — that one would be
 * invented (`pinned_message` carries only `{ message, user_name }`). B117.
 */
function PinnedMessage({
    pinned,
    host,
    onDismiss,
}: {
    pinned: LivePinnedMessage
    /**
     * The broadcast's own channel. Only a host can pin, so the frame's `user_name` is this
     * channel's — which is where the tick and the Premium mark come from, since the frame itself
     * carries neither.
     */
    host: EventDetail['channel']
    onDismiss: () => void
}) {
    const { t } = useTranslation()
    const mayAnimate = useMayAnimate()
    const [leaving, setLeaving] = useState(false)

    useEffect(() => {
        if (!leaving) return
        const timer = setTimeout(onDismiss, PIN_OUT_MS)
        return () => clearTimeout(timer)
    }, [leaving, onDismiss])

    return (
        <div
            data-testid="event-studio-pinned"
            className={cn(
                'relative flex min-h-12 items-start gap-2.5 overflow-clip rounded-xl px-2.5 py-2',
                'bg-(image:--live-chat-pinned)',
                'ring-1 ring-inset ring-[rgba(196,170,255,0.22)] backdrop-blur-md',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_18px_rgba(0,0,0,0.28)]',
                leaving ? PIN_OUT : RISE,
            )}
        >
            {/* The pin, landing — a filled violet disc with a white tack, popping in after the card. */}
            <span
                aria-hidden
                className={cn(
                    'mt-0.5 grid size-7 flex-none place-items-center rounded-full',
                    'bg-[linear-gradient(135deg,#7C4DFF_0%,#501BC0_100%)] shadow-[0_2px_8px_rgba(80,27,192,0.5)] ring-1 ring-white/20',
                    POP,
                    '[animation-delay:120ms]',
                )}
            >
                <Icon name="thumbtack" size={16} className="size-3.5 rotate-[-20deg] text-white" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {pinned.user_name && (
                    <p className="flex items-center gap-1">
                        {/* Leading, as legacy's pin has it — the badge before the name. */}
                        <ChatBadge kind="pinned-host" label={t('event_studio_host')} />
                        <span className="type-dense-strong min-w-0 truncate text-white">
                            {pinned.user_name}
                        </span>
                        {host?.verified_tick_badge?.image && (
                            <VerifiedBadge image={host.verified_tick_badge.image} size="dense" />
                        )}
                        {/* The Premium mark with its spark burst — the one every crown carries. */}
                        {host?.is_premium && (
                            <span className="flex flex-none">
                                <PremiumBadge size={VERIFIED_BADGE_CROWN.dense} />
                            </span>
                        )}
                    </p>
                )}
                {/* One step lighter than the name, so the line reads as *who*, then *what*. */}
                <p className="type-dense-default break-words text-white/90">{pinned.message}</p>
            </div>
            <button
                type="button"
                onClick={() => (mayAnimate ? setLeaving(true) : onDismiss())}
                disabled={leaving}
                data-testid="event-studio-pinned-close"
                aria-label={t('common_close')}
                className={cn(
                    '-me-1 -mt-0.5 grid size-7 flex-none place-items-center rounded-full text-white/80',
                    'transition-colors hover:bg-white/12 hover:text-white',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                )}
            >
                <Icon name="xmark" size={16} />
            </button>
        </div>
    )
}

/** Ghost lines behind the locked transcript: width of the text bar, and whether the row is a gift. */
const LOCKED_GHOST_ROWS = [
    { w: '72%', gift: false },
    { w: '48%', gift: false },
    { w: '64%', gift: true },
    { w: '38%', gift: false },
    { w: '56%', gift: false },
] as const

/**
 * **The transcript an exclusive stream keeps behind its gate.**
 *
 * Not an empty column — an empty column says "nobody is here". Ghost lines in the transcript's own
 * shape (a face, a name bar, a message bar, one row tinted as a gift) say the room is talking, and
 * the lock over them says it is not open to this reader yet. They breathe in turn so the room reads
 * as alive; the lock pops in a beat after the column. No sentence here — the composer under it
 * already says what unlocks the chat, and saying it twice in one column reads as nagging. The
 * button is the same unlock, so either is a way in.
 */
function LockedTranscript({ onUnlock, signIn }: { onUnlock: () => void; signIn: boolean }) {
    const { t } = useTranslation()
    return (
        <div
            data-testid="event-studio-chat-locked-transcript"
            className={cn('relative mt-auto flex flex-col gap-1.5 pt-6', RISE)}
        >
            <div
                aria-hidden
                className="flex flex-col gap-1.5 [mask-image:linear-gradient(to_bottom,transparent,black_45%)]"
            >
                {LOCKED_GHOST_ROWS.map((row, i) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative list.
                        key={i}
                        className={cn(
                            'flex items-start gap-2 rounded-lg px-2 py-1.5',
                            row.gift && 'bg-white/[0.04]',
                            LIVE_BREATH,
                        )}
                        style={{ animationDelay: `${i * 220}ms` }}
                    >
                        <span className="size-6 flex-none rounded-full bg-white/10" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                            <span className="h-2.5 w-20 rounded-full bg-white/15" />
                            <span
                                className="h-2.5 rounded-full bg-white/10"
                                style={{ width: row.w }}
                            />
                        </span>
                    </div>
                ))}
            </div>
            <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-6 text-center">
                <span
                    aria-hidden
                    className={cn(
                        'grid size-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md',
                        POP,
                        '[animation-delay:160ms]',
                    )}
                >
                    <Icon name="lock-simple" weight="filled" size={18} />
                </span>
                <button
                    type="button"
                    data-testid="event-studio-chat-unlock"
                    onClick={onUnlock}
                    className="type-caption-label-strong flex h-8 items-center gap-1.5 rounded-full bg-[#501BC0] px-4 text-white transition-colors hover:bg-[#6B2FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                    <Icon name="lock-simple" weight="filled" size={16} className="size-3.5" />
                    {signIn ? t('auth_sign_in') : t('event_exclusive_unlock')}
                </button>
            </div>
        </div>
    )
}

/** The kinds a reader would count as "something was said" — not the room's own notices. */
type SpokenLine = Extract<LiveChatLine, { kind: 'comment' | 'gift' | 'subscriber' }>

/**
 * The lines after `since`, spoken ones only.
 *
 * `null` is "folded while the transcript was empty", so every line since is new. A `since` no
 * longer in the list was trimmed off the front, so everything still in it is new too. (A history
 * reload on reconnect replaces the line objects, and then the whole transcript counts — an
 * over-count on a rare path, which is the safe direction for a badge.)
 */
export function unreadSince(lines: LiveChatLine[], since: LiveChatLine | null): SpokenLine[] {
    const index = since ? lines.lastIndexOf(since) : -1
    const after = index === -1 ? lines : lines.slice(index + 1)
    return after.filter(
        (line): line is SpokenLine =>
            line.kind === 'comment' || line.kind === 'gift' || line.kind === 'subscriber',
    )
}
