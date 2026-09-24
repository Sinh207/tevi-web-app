'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { isExclusiveLive } from '../access'
import type { EventDetail } from '../api/types'
import type { LiveChatState } from '../hooks/use-live-chat'
import type { SustainedFeeState } from '../hooks/use-sustained-fee'
import { EVENT_ART } from '../lib/illustrations'
import {
    giftThumb,
    type LiveChatLine,
    type LiveChatUser,
    type LiveTopStar,
} from '../lib/live-message'
import { EVENT_STUDIO_CHAT_VARS, EVENT_STUDIO_PANEL, EVENT_STUDIO_RANK_INK } from '../lib/studio'

/**
 * **The chat column** — 390px down the trailing edge of the stage.
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
 * reader and an app reader hit the same wall. B109's neighbourhood — if the server has a limit of
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
 * The platform's own mark, in the avatar slot — the comps' `Tevi icon`: a 24px disc at 60% black
 * with the logo on it. Every `System*` line in the `Chat` set uses it, and only they do, which is
 * what makes "Tevi is speaking" readable at a glance rather than from the ink alone.
 */
function ChatSystemMark() {
    return (
        <span className="grid size-6 flex-none place-items-center rounded-full bg-black/60">
            <Logo size={16} title={null} />
        </span>
    )
}

/**
 * **A badge beside a name.** The comps' `Badge` set, whose four variants are four different
 * grounds — so this cannot be one component with a colour prop without losing that.
 *
 * `Member` is the gradient one and `Host` the flat black; `Lvl Badge` and `User Badge` are the
 * gifted-level pair and are **not built** — nothing in any frame this client receives carries a
 * level, so they would be a badge with no number in it. B108 asks for the field.
 */
function ChatBadge({ kind, label }: { kind: 'member' | 'host'; label: string }) {
    return (
        <span
            className={cn(
                'flex h-4 flex-none items-center gap-0.5 rounded',
                kind === 'member'
                    ? 'bg-(image:--live-chat-member) ps-0.5 pe-1'
                    : 'bg-(--live-chat-chip) px-1',
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
                size={16}
                className={cn(
                    'size-3',
                    kind === 'member' ? 'text-white' : 'text-(--live-chat-gift)',
                )}
            />
            <span className="type-micro-overline text-white">{label}</span>
        </span>
    )
}

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

    if (isLoading) {
        return (
            <div
                data-testid="event-studio-leaderboard-loading"
                className="flex flex-col px-4 pt-2 pb-4"
                aria-busy
            >
                {[0, 1, 2].map(i => (
                    <div key={i} className="flex h-9 items-center gap-2 py-1">
                        <Skeleton w={24} h={24} circle />
                        <Skeleton w={24} h={24} circle />
                        <Skeleton className="flex-1" h={14} />
                        <Skeleton w={28} h={14} />
                    </div>
                ))}
            </div>
        )
    }

    /* `Header/No data`: the art is centred, the line runs the full 358 and is centred under it. */
    if (rows.length === 0) {
        return (
            <div
                data-testid="event-studio-leaderboard-empty"
                className="flex flex-col items-center gap-1 px-4 pt-2 pb-4"
            >
                <Image
                    src={EVENT_ART.leaderboardEmpty.src}
                    alt=""
                    aria-hidden
                    width={EVENT_ART.leaderboardEmpty.width}
                    height={EVENT_ART.leaderboardEmpty.height}
                />
                <p className="type-caption-meta w-full text-center text-(--live-chat-name)">
                    {t('event_studio_chat_leaderboard_empty')}
                </p>
            </div>
        )
    }

    return (
        <section
            data-testid="event-studio-leaderboard"
            /*
             * The 16px under the board belongs to the board, not to the header block — the comps'
             * `Active=True` variant ends flush on `Current User` (`User List` pads only its top),
             * while `Expand` pads 16 below the list. Keeping it on the wrapper left a bare strip
             * of wash under the reader's own row.
             */
            className={cn('flex flex-none flex-col pt-2', ownIndex === -1 && 'pb-4')}
        >
            {/*
             * ⚠ **Hover-to-expand in CSS, not in state.**
             *
             * The comps have two `Header` variants — `Active=False` at 200 and `Active=True` at
             * 356 — and legacy drives the pair from `onMouseEnter`/`onMouseLeave`. Doing that here
             * would put a mouse-only handler on a non-interactive element, which the a11y lint
             * refuses (correctly), and re-render the column on every pointer cross.
             *
             * A `max-height` transition does the same thing with no state, and it degrades better
             * than legacy's: the track is `overflow-y-auto`, so a keyboard or touch reader who
             * cannot hover **scrolls** to the rest of the board rather than being unable to reach
             * it at all. 108 is three 36px rows; 264 is the taller variant's own list height.
             */}
            <div className="max-h-[108px] overflow-y-auto px-4 transition-[max-height] duration-200 ease-out hover:max-h-[264px]">
                {rows.map((row, i) => (
                    <LeaderboardRow key={row.user?.id ?? i} row={row} rank={i} />
                ))}
            </div>

            {/*
             * `Current User` — the comps run it to the panel's own edges rather than the 16px
             * inset the board above uses, and hang a drop shadow off it, so it reads as a footer
             * under the list instead of as a fourth entry. It keeps its real rank.
             */}
            {ownIndex !== -1 && (
                <div
                    data-testid="event-studio-leaderboard-me"
                    className="mt-1 bg-(--live-chat-self) px-4 shadow-[0_-1px_4px_0_#2C1C4E]"
                >
                    <LeaderboardRow row={rows[ownIndex]} rank={ownIndex} />
                </div>
            )}
        </section>
    )
}

/** One row — the comps' `Top`, whose five variants differ only in the rank ink. */
function LeaderboardRow({ row, rank }: { row: LiveTopStar; rank: number }) {
    const score = row.score
    return (
        <div className="flex h-9 items-center gap-2 py-1 pe-4 ps-0.5">
            {/* 14/Bold in the comps. The scale stops at semibold at this size, so `dense-strong`
                is the utility and the extra 100 of weight is the one thing not reproduced. */}
            <span
                className="type-dense-strong grid size-6 flex-none place-items-center"
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
            <span className="type-dense-strong min-w-0 flex-1 truncate text-(--live-chat-name)">
                {row.user?.display_name ?? ''}
            </span>
            {/*
             * ⚠ **No Star mark.** The comps' `Star w value` frame carries one and it is
             * `visible: false` in every one of the five variants — the figure stands alone. A
             * mark was drawn here, which put a gold coin on all three podium rows the design
             * has bare. A score of nothing prints `-`, one step darker than a real figure.
             */}
            <span
                className="type-caption-meta flex-none"
                style={{
                    color: score > 0 ? 'var(--live-chat-muted)' : 'var(--live-chat-score-empty)',
                }}
            >
                {score > 0 ? formatCount(score) : '-'}
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
    tone?: 'system' | 'denied'
    testId?: string
}) {
    return (
        <div data-testid={testId} className="flex gap-2 py-1 pe-4 ps-0.5">
            <ChatSystemMark />
            <p
                className={cn(
                    'type-dense-emphasis min-w-0 flex-1 break-words',
                    tone === 'denied' ? 'text-(--live-chat-denied)' : 'text-(--live-chat-system)',
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
        <div data-testid="event-studio-chat-notices">
            <ChatSystemLine>{t('event_studio_chat_welcome')}</ChatSystemLine>
            {event.paid_chat && (
                <ChatSystemLine>
                    {t('event_studio_chat_paid_notice', { name, fee: 1 })}
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
        <span className="flex h-[21px] min-w-0 items-center gap-1">
            {/*
             * ⚠ **`Title Container` has two badge slots, not one**, and which badge goes in which
             * is the comps' answer rather than a choice: `Property 1=Default` puts `MEM` in the
             * **leading** slot, `Variant3` puts `Host` in the **trailing** one, and `Variant2`
             * uses neither. Both were drawn leading here, which reads as a run of chips before a
             * name that is already truncated to 120px.
             */}
            {isMember && <ChatBadge kind="member" label={t('event_studio_chat_member')} />}
            <span className="type-dense-strong max-w-[120px] truncate text-(--live-chat-name)">
                {name}
            </span>
            {user?.verified_tick_badge?.image && (
                <VerifiedBadge image={user.verified_tick_badge.image} size={16} />
            )}
            {user?.premium_badge && (
                <Image
                    src={user.premium_badge}
                    alt=""
                    width={14}
                    height={14}
                    className="flex-none"
                />
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
                <span className="type-caption-meta max-w-[80px] truncate text-white">@{slug}</span>
            )}
            {/* The trailing slot — see the note on `MEM` above. */}
            {user?.is_host && <ChatBadge kind="host" label={t('event_studio_host')} />}
        </span>
    )

    // A sender with a space is a link to it; one without is not a control. `next/link`, never a
    // bare anchor — the studio covers the site's own navigation, so these are real routes out.
    return slug ? <Link href={`/@${encodeURIComponent(slug)}`}>{label}</Link> : label
}

/** The shared shell of every person-spoken row: 24px avatar, then a column. */
function ChatRow({
    user,
    isMember,
    children,
}: {
    user: LiveChatUser | null
    isMember: boolean
    children: ReactNode
}) {
    return (
        <div className="flex gap-2 py-1 pe-4 ps-0.5">
            <ChatAvatar user={user} />
            <div className="min-w-0 flex-1">
                <ChatName user={user} isMember={isMember} />
                {children}
            </div>
        </div>
    )
}

function ChatLine({ line }: { line: LiveChatLine }) {
    const { t } = useTranslation()

    switch (line.kind) {
        /* `Nor cmt` and `Top host` — one row, one or many lines of text. */
        case 'comment':
            return (
                /*
                 * ⚠ **No gradient ground.** Legacy paints a member's whole row
                 * `linear-gradient(90.92deg, rgba(255,0,0,.6), rgba(255,153,0,.6))`, and the
                 * comps have no such variant anywhere in the `Chat` set — the `MEM` badge is the
                 * entire member marker, on a row identical to everybody else's. A gradient was
                 * drawn here from the legacy reading; Figma wins, and this note is the divergence.
                 */
                <ChatRow user={line.user} isMember={line.isMember}>
                    <p className="type-dense-emphasis break-words text-white">{line.text}</p>
                </ChatRow>
            )

        /* `Send gift` — a sentence, not a pill. */
        case 'gift': {
            const thumb = giftThumb(line.gift)
            return (
                <ChatRow user={line.user} isMember={line.isMember}>
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
                                <span className="type-dense-strong">
                                    {line.gift.recipient_name}
                                </span>
                            </>
                        )}
                    </p>
                </ChatRow>
            )
        }

        case 'subscriber':
            return (
                <ChatSystemLine>
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
 * **Bold the name inside a translated sentence, wherever the sentence puts it.**
 *
 * The comps set `Ashley Soto` at 12/Semi Bold and the rest at 12/Regular, and the obvious way to
 * get that — a prefix key and a suffix key — is wrong: legacy's own `fil` string is
 * `Pumasok na si [%s] sa live na broadcast!`, with the name in the **middle**. Two keys would put
 * the Filipino sentence back to front.
 *
 * So the sentence stays one key and the *translated* result is split on a sentinel. Any word
 * order works, and a locale that drops the placeholder degrades to a single unstyled run rather
 * than to a missing name.
 */
function EmphasisedName({ sentence, name }: { sentence: string; name: string }) {
    const parts = sentence.split(' ')
    if (parts.length !== 2) return <>{sentence.replace(' ', name)}</>
    return (
        <>
            {parts[0]}
            <span className="type-caption-label-strong">{name}</span>
            {parts[1]}
        </>
    )
}

/**
 * **The emoji row** — a curated grid, and a deliberate divergence from legacy.
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
const CHAT_EMOJI = [
    '😀',
    '😂',
    '🥹',
    '😍',
    '😎',
    '🤔',
    '😮',
    '😭',
    '👍',
    '👏',
    '🙏',
    '💪',
    '🔥',
    '✨',
    '💯',
    '🎉',
    '❤️',
    '💜',
    '💔',
    '🌹',
    '🎁',
    '⭐',
    '👑',
    '🏆',
    '😅',
    '😴',
    '🤯',
    '🥳',
    '😡',
    '🤝',
    '👀',
    '🫶',
] as const

function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <>
            {open && (
                /*
                 * Above the composer, inside the column. `absolute` against the chat panel
                 * rather than a portal: the studio is already a `fixed` stage and a portalled
                 * popover would land outside it, over the video.
                 */
                <div
                    data-testid="event-studio-emoji-panel"
                    className={cn(
                        'absolute inset-x-3 bottom-16 z-20 grid grid-cols-8 gap-1 rounded-xl p-2',
                        'bg-[color-mix(in_srgb,var(--white)_16%,var(--black))]',
                    )}
                >
                    {CHAT_EMOJI.map(emoji => (
                        <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                                onPick(emoji)
                                setOpen(false)
                            }}
                            className="rounded p-1 text-lg transition-colors hover:bg-white/15"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                data-testid="event-studio-emoji"
                aria-label={t('event_studio_chat_emoji')}
                aria-expanded={open}
                className="flex size-6 flex-none items-center justify-center text-[#C2C2C2] transition-colors hover:text-white"
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
    className,
}: {
    event: EventDetail
    chat: LiveChatState
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

    const onScroll = () => {
        const node = listRef.current
        if (!node) return
        // 24px of slack: a reader one line from the bottom is still "at the bottom", and an exact
        // comparison fails on fractional scroll positions anyway.
        const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24
        wasAtBottom.current = atBottom
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
        const body = draft
        setDraft('')
        void chat.send(body)
    }

    const arrivalName = chat.arrival?.name ?? ''
    const canSubmit = chat.canSend && draft.trim() !== ''

    return (
        <aside
            data-testid="event-studio-chat"
            className={cn(EVENT_STUDIO_PANEL, 'flex h-full flex-col', className)}
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
            {!hasEnded && (
                <div className="flex flex-none flex-col gap-1 bg-(--live-chat-header)">
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
                                {t('event_studio_chat_viewers')}
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
                    <div className="flex gap-1 px-4">
                        <span className="type-micro-overline flex h-4 items-center rounded bg-(--live-chat-chip) px-2 text-white">
                            {t('event_studio_chat_top_contributors')}
                        </span>
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
            {!hasEnded && chat.pinned && (
                <div className="flex-none px-3 pt-2">
                    <div
                        data-testid="event-studio-pinned"
                        className="flex min-h-12 items-start gap-1 rounded-xl bg-(--live-chat-pinned) px-2 py-0.5"
                    >
                        {/* A white disc with the pin in the pinned-message purple — the comps put
                            the colour on the glyph, not on the plate behind it. */}
                        <span className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-white">
                            {/* 14 in a 20px disc — same reason as the badge crown above. */}
                            <Icon name="thumbtack" size={16} className="size-3.5 text-[#501BC0]" />
                        </span>
                        <div className="min-w-0 flex-1 py-0.5">
                            {chat.pinned.user_name && (
                                <p className="flex items-center gap-1">
                                    <span className="type-dense-strong min-w-0 truncate text-[#E1E1E1]">
                                        {chat.pinned.user_name}
                                    </span>
                                    {/*
                                     * ⚠ **The `Host` chip needs no field, so it is drawn.**
                                     *
                                     * This was skipped alongside the `@mention` on the grounds
                                     * that `pinned_message` carries only `{ message, user_name }`
                                     * — true of the mention and not of this: only a host can pin,
                                     * so the chip states something the frame's existence already
                                     * guarantees. It is the comps' `Host Badge Container`, which
                                     * is the black chip *without* a crown at 10/Regular, and not
                                     * the `Badge/Host` used beside a name in the transcript.
                                     *
                                     * The `@mention` stays out — that one would be invented. B108.
                                     */}
                                    <span className="type-micro-overline flex h-4 flex-none items-center rounded bg-(--live-chat-chip) px-1 text-white">
                                        {t('event_studio_host')}
                                    </span>
                                </p>
                            )}
                            <p className="type-dense-emphasis break-words text-white">
                                {chat.pinned.message}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={chat.dismissPinned}
                            data-testid="event-studio-pinned-close"
                            aria-label={t('common_close')}
                            className="mt-1 flex-none text-white transition-opacity hover:opacity-70"
                        >
                            <Icon name="xmark" size={20} />
                        </button>
                    </div>
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
            {!hasEnded && chat.justMuted && (
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
            {!hasEnded && chat.arrival && (
                <ChatFloat testId="event-studio-arrival" ground="bg-(--live-chat-arrival)">
                    <span className="type-caption-meta truncate text-white">
                        <EmphasisedName
                            sentence={t('event_studio_chat_joined', { name: ' ' })}
                            name={arrivalName}
                        />
                    </span>
                </ChatFloat>
            )}

            {/*
             * Money, above the conversation but drawn as the system lines it is. A charge that
             * **failed** does not clear itself: the streamer was not paid, and that stays true
             * until the next interval succeeds.
             */}
            {!hasEnded && fee?.hasFailed && (
                <ChatSystemLine tone="denied" testId="event-studio-fee-error">
                    {t('event_studio_fee_failed')}
                </ChatSystemLine>
            )}

            {!hasEnded && fee?.notice && (
                <ChatSystemLine testId="event-studio-fee-notice">
                    {t(fee.notice.key, { fee: fee.notice.fee, duration: fee.notice.duration })}
                </ChatSystemLine>
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
                className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2"
            >
                {!hasEnded && <ChatNotices event={event} />}
                {chat.lines.map((line, index) => (
                    /*
                     * The index is the key, and it is correct here rather than lazy: the list is
                     * **append-only** and trimmed from the front, so a line's position is stable
                     * for as long as it is on screen. Frames carry no id — there is nothing else
                     * to key on.
                     */
                    // biome-ignore lint/suspicious/noArrayIndexKey: append-only, no id on the wire.
                    <ChatLine key={index} line={line} />
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
                {unread > 0 && (
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
            {hasEnded ? (
                <p
                    data-testid="event-studio-chat-ended"
                    className="type-title-t4-semibold flex h-12 flex-none items-center justify-center rounded-lg bg-(--live-chat-ended) text-(--live-chat-ended-ink) mx-3 mb-3"
                >
                    {t('event_studio_chat_ended')}
                </p>
            ) : (
                <form onSubmit={submit} className="relative flex-none px-3 pb-3">
                    {/*
                     * The 1px edge is `Input Container/Hover` and `/Active`, which differ from
                     * `Inactive` by nothing else. `border-transparent` rather than no border at all,
                     * so the field does not gain 2px of height the moment it is focused.
                     */}
                    <div className="flex h-11 items-center gap-4 rounded-lg border border-transparent bg-(--live-chat-field) px-3 transition-colors hover:border-(--live-chat-field-focus) focus-within:border-(--live-chat-field-focus)">
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
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
                            <EmojiButton onPick={e => setDraft(d => d + e)} />
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                data-testid="event-studio-chat-send"
                                aria-label={t('event_studio_chat_send')}
                                /* `Input Container/Active` lifts the send glyph from `#C2C2C2` to
                                   `#F9F7FD` — the one thing in the column that says the message is
                                   ready to go. */
                                className={cn(
                                    'flex size-6 flex-none items-center justify-center transition-colors hover:text-white disabled:opacity-40',
                                    canSubmit ? 'text-[#F9F7FD]' : 'text-[#C2C2C2]',
                                )}
                            >
                                <Icon name="send" size={20} />
                            </button>
                        </span>
                    </div>
                </form>
            )}

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
    className,
}: {
    event: EventDetail
    chat: LiveChatState
    onExpand: () => void
    className?: string
}) {
    const { t } = useTranslation()
    const faces = chat.topStars.slice(0, STRIP_FACES)

    return (
        <div
            data-testid="event-studio-chat-strip"
            className={cn(
                'flex h-10 items-center gap-1 rounded-full bg-black/20 pe-3 ps-0',
                className,
            )}
        >
            <button
                type="button"
                onClick={onExpand}
                data-testid="event-studio-chat-expand"
                aria-label={t('event_studio_chat_expand')}
                className="grid size-10 flex-none place-items-center rounded-full text-[#C2C2C2] transition-colors hover:text-white"
            >
                {/* The mirror of the collapse control, and the same sprite pair. */}
                <Icon name="layout-sidebar-angle-left" size={24} className="rtl:-scale-x-100" />
            </button>
            <Icon
                name={isExclusiveLive(event) ? 'badge-dollar' : 'users'}
                size={18}
                className="flex-none text-white"
            />
            {/*
             * The board's own faces, overlapping by 6 — `Frame 1171276630` is an `itemSpacing` of
             * **-6** in the frame. Decorative: the names are one press away in the expanded column,
             * and five avatars with no labels are not a list a screen reader should read out.
             */}
            {faces.length > 0 && (
                <span aria-hidden className="flex flex-none items-center">
                    {faces.map((row, i) => (
                        <span
                            key={row.user?.id ?? i}
                            className={cn('rounded-full', i > 0 && '-ms-1.5')}
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
                {t('event_studio_chat_viewers')}
            </span>
            {chat.ccu !== null && (
                <span className="flex flex-none items-center gap-1">
                    <Icon name="eye" size={16} className="text-white" />
                    <span
                        data-testid="event-studio-chat-strip-ccu"
                        className="type-caption-label text-white"
                    >
                        {formatCount(chat.ccu)}
                    </span>
                </span>
            )}
        </div>
    )
}
