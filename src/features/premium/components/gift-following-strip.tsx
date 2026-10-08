'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderTitle } from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { type GiftRecipient, giftRecipientName } from '../api/gift-types'

/**
 * The people you already follow who match the term — **a horizontal strip of faces**, above the
 * exhaustive list.
 *
 * ## Why a strip and not more rows
 *
 * It answers a different question from the list below it. "Did you mean one of the people you
 * already follow?" is usually a two- or three-item answer and it is the answer most gifts actually
 * want, so it goes at the top — and an avatar with a name under it is a **face**, which is how
 * somebody recognises the creator they had in mind. The 80px rows underneath are for reading; these
 * are for recognising. Legacy draws it horizontally on both surfaces that have one, this screen's
 * included (`components/searchCreator/following`, a Swiper with arrow buttons).
 *
 * ## No Swiper
 *
 * Legacy's is `swiper/react` plus `Navigation` and `FreeMode`, four CSS imports, two navigation refs
 * and a `setTimeout(0)` that destroys and re-initialises navigation once those refs exist — about
 * 40KB of library to slide some avatars, and a re-init hack because the refs are `null` on the first
 * render. This is `overflow-x-auto` + `snap-x`: the browser already does paging, momentum, touch,
 * RTL and reduced motion, and none of it ships. Same idiom as `share-dialog.tsx`'s channel row and
 * `legal-toc.tsx` — but **not** `card-carousel.tsx`, which is on Embla: that one is a deck of cards
 * with dots and autoplay, this is a row of avatars.
 *
 * What "professional" costs here is not a library — it is the four things a naive `overflow-x-auto`
 * gets wrong, each handled below and each invisible until it is met:
 *
 * | | why it matters |
 * |---|---|
 * | arrows that **appear only when there is somewhere to go**, and vanish at each end | a scroller with no visible extent reads as a list that is simply short — twenty look like four |
 * | `overscroll-x-contain` | without it a swipe running off the end triggers the browser's **back navigation**, out of a purchase flow |
 * | `scrollBy` corrected for RTL | `left` is *physical*: under `ar` a positive value travels toward the content's start, so the end arrow moves nothing |
 * | the scrollport bleeds, the content does not (`-mx-4 px-4 scroll-px-4`) | a tile mid-scroll is clipped by the panel's own edge rather than by an invisible box inset from it, while the first tile still lines up with the rows below |
 *
 * ## ⚠ It is a second copy of `features/search/components/search-following-strip.tsx`
 *
 * Byte-adjacent in its mechanics, and deliberately not an import: that component's tile is a
 * **`<Link>` to the space**, and this one is a **`<button>` that chooses a recipient** — the whole
 * difference between browsing and picking. It also takes that feature's own row DTO, which is not
 * this one's. A feature may not reach into another's internals, and the exported component is the
 * wrong shape rather than merely inconveniently placed.
 *
 * **Change both**, the same pairing `PREMIUM_GOLD` states about `menu-profile-card.tsx`. If a third
 * strip appears, `useStripScroll` and `StripArrow` are what move to `shared/` — the tiles will still
 * differ, because what a tile *does* is the screen's business.
 */
export function GiftFollowingStrip({
    recipients,
    onSelect,
    className,
}: {
    recipients: GiftRecipient[]
    onSelect: (recipient: GiftRecipient) => void
    /** The host's entrance — `RISE` on the real screen. */
    className?: string
}) {
    const { t } = useTranslation()
    const trackRef = useRef<HTMLUListElement>(null)
    const { canStart, canEnd, scrollBy } = useStripScroll(trackRef, recipients.length)

    return (
        <section aria-labelledby="gift-following-heading" className={className}>
            {/*
             * `rule={false}`: the DS draws a hairline under a list header because what usually
             * follows is a list of rows that continues it. What follows here is a block of tiles
             * with its own visual mass, and the section below brings its own header — two rules
             * across one card reads as three separate cards.
             */}
            <ListHeader rule={false}>
                <ListHeaderTitle as="h2" id="gift-following-heading">
                    {t('giftpremium_following')}
                </ListHeaderTitle>
            </ListHeader>

            <div className="relative px-4 pb-4">
                <ul
                    ref={trackRef}
                    data-testid="premium-gift-following"
                    className={cn(
                        '-mx-4 flex list-none snap-x scroll-px-4 items-start gap-2 px-4',
                        'overflow-x-auto overscroll-x-contain',
                        /*
                         * The scrollbar is chrome the design does not draw, and on the platforms
                         * where it is not an overlay it would sit under the arrow discs and add
                         * 15px to the strip's height. The arrows are the extent cue instead.
                         */
                        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    )}
                >
                    {recipients.map(recipient => (
                        <FollowingTile
                            key={recipient.slug}
                            recipient={recipient}
                            onSelect={() => onSelect(recipient)}
                            verifiedLabel={t('channel_verified')}
                            nsfwLabel={t('channel_nsfw')}
                        />
                    ))}
                </ul>

                <StripArrow edge="start" shown={canStart} onPress={() => scrollBy(-1)} />
                <StripArrow edge="end" shown={canEnd} onPress={() => scrollBy(1)} />
            </div>
        </section>
    )
}

/**
 * How far the strip can still travel, in each direction.
 *
 * ## Read from the DOM, never held alongside it
 *
 * The scroll position is the only state, and these two booleans are *derived* from it. A component
 * tracking an index **and** listening to `scroll` has two sources of truth for one number, and they
 * disagree the first time a touch drag is interrupted. Same discipline as `CardCarousel`, which now
 * reads its index off Embla rather than off a scroll offset — different owner, one owner.
 *
 * ## Three things change the answer and only one of them is a scroll
 *
 * The listener covers scrolling; a `ResizeObserver` covers the window narrowing and the panel
 * changing width across `md`; and `count` covers the list being **replaced as the reader types**,
 * which fires neither — the track's own box is unchanged when its children are swapped, only
 * `scrollWidth` moves. A strip that went from twenty tiles to two would otherwise keep offering an
 * arrow with nowhere to go.
 *
 * ## `scrollLeft`'s sign is not read, and that is deliberate
 *
 * In an RTL container it is a browser-history minefield — negative in current Chrome/Firefox/Safari,
 * `scrollWidth`-based in older WebKit; `share-dialog.tsx` carries the same warning. So travel is a
 * **distance**: `Math.abs(scrollLeft)` is direction-agnostic and the remainder is what is left of
 * `scrollWidth - clientWidth`. `ar` is a supported locale and this has to work in it with no `dir`
 * branch.
 *
 * The 1px tolerance is for fractional layouts: a track at its true end reports a remainder of
 * 0.5-something on a scaled display, and without it the end arrow never goes away.
 */
function useStripScroll(ref: RefObject<HTMLUListElement | null>, count: number) {
    const [canStart, setCanStart] = useState(false)
    const [canEnd, setCanEnd] = useState(false)

    const measure = useCallback(() => {
        const node = ref.current
        if (!node) return
        const travelled = Math.abs(node.scrollLeft)
        const total = node.scrollWidth - node.clientWidth
        setCanStart(travelled > 1)
        setCanEnd(total - travelled > 1)
    }, [ref])

    /*
     * `count` is in the deps and Biome cannot see why — see the note above: the ResizeObserver
     * cannot observe a change that moves only `scrollWidth`. `clamped-text.tsx` suppresses the
     * identical rule for the identical reason.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `count` re-measures a strip the ResizeObserver cannot see change
    useEffect(() => {
        const node = ref.current
        if (!node) return
        measure()
        node.addEventListener('scroll', measure, { passive: true })
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => {
            node.removeEventListener('scroll', measure)
            observer.disconnect()
        }
    }, [ref, measure, count])

    /**
     * Move about one screenful, in the **inline** direction the caller asks for.
     *
     * `scrollBy({ left })` is **physical**, and this is the one place a direction branch is
     * unavoidable: in an RTL container the scroll position runs 0 → negative, so a positive `left`
     * travels toward the *start* of the content — under `ar` the end arrow moves a strip that is
     * already clamped at 0, i.e. nowhere, while it still has hundreds of pixels of travel.
     * `getComputedStyle` rather than a locale prop, so it is the element's own resolved direction
     * and stays right inside any subtree that overrides it.
     *
     * The **measurement** above needs no such branch, which is why only this half has one.
     *
     * 80% rather than 100% leaves a tile of overlap, which is what tells the reader the strip moved
     * rather than replaced itself. `behavior: 'smooth'` is honoured — and switched off — by
     * `prefers-reduced-motion` at the platform level, which is the whole reason the native API beats
     * an animation of our own.
     */
    const scrollBy = useCallback(
        (direction: -1 | 1) => {
            const node = ref.current
            if (!node) return
            const inline = getComputedStyle(node).direction === 'rtl' ? -direction : direction
            node.scrollBy({ left: inline * node.clientWidth * 0.8, behavior: 'smooth' })
        },
        [ref],
    )

    return { canStart, canEnd, scrollBy }
}

/**
 * One overlaid arrow disc, at the strip's leading or trailing edge.
 *
 * ## Removed, not dimmed, when there is nowhere to go
 *
 * A disabled arrow parked over the first tile is chrome covering content to say nothing. Legacy
 * reaches the same conclusion the long way round — `display: none !important` on
 * `.swiper-button-disabled`, *after* also setting `opacity: 0.3` and `cursor: not-allowed` on it.
 *
 * It also means the arrows are simply **absent on a strip that fits**, which is most searches: a
 * term matching two of the people you follow gets two tiles and no chrome at all.
 *
 * ## `pointer-fine`, not a viewport width
 *
 * A touch reader already has the affordance — the strip scrolls under a finger — and an arrow disc
 * on a phone is 32px of tile covered up. Width is the wrong question (a tablet is wide and touched, a
 * small window is narrow and moused), so the query is the **input device**, which is what actually
 * decides whether dragging is available.
 *
 * `aria-hidden` on top of that: the arrows are a convenience over a scrollport that is already
 * keyboard-reachable, so announcing two more controls that duplicate Tab and the arrow keys is noise.
 * The tiles carry the accessible names. With no name to carry they need **no label prop and no
 * translation key** — a `title` on an `aria-hidden` element is read by nothing.
 */
function StripArrow({
    edge,
    shown,
    onPress,
}: {
    edge: 'start' | 'end'
    shown: boolean
    onPress: () => void
}) {
    if (!shown) return null

    return (
        <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={onPress}
            className={cn(
                'absolute top-[24px] hidden size-8 -translate-y-1/2 items-center justify-center',
                'pointer-fine:flex',
                'rounded-(--radius-fill) bg-(--background-elevated) text-(--icon-default) shadow-md',
                'cursor-pointer transition-colors hover:bg-(--background-segment)',
                edge === 'start' ? 'start-2' : 'end-2',
            )}
        >
            <Icon
                name={edge === 'start' ? 'angle-left' : 'angle-right'}
                size={20}
                className="rtl:-scale-x-100"
            />
        </button>
    )
}

/**
 * One person in the strip: a 48px avatar over two centred lines — **and it is a `<button>`**.
 *
 * That is the one structural difference from `/search`'s tile, and it is the difference between the
 * two screens: pressing this *chooses a recipient*, it does not navigate. An anchor would offer
 * middle-click, "open in new tab" and a status-bar preview for a destination that does not exist, and
 * a screen reader planning where to go next would be told this is a link. `type="button"` is not
 * decoration either — the tile sits inside the picker's `<form>`, and a default `submit` would
 * settle the search term on every press.
 *
 * **76px, pinned** (`w-19 flex-none`). A flex item left to size itself takes its widest line, so a
 * strip of them is ragged and every name sets its own truncation point; pinning the track is what
 * makes the row read as a row. 76 is the DS `large` avatar's 48 plus the room a two-line label needs.
 *
 * `snap-start`, so a drag parks a tile against the strip's leading padding rather than halfway
 * through one.
 *
 * ## The two marks sit on the avatar's corners, not inline after the name
 *
 * The list row gives its name ~300px, so a badge beside it costs nothing. A tile gives it ~76 —
 * inline marks turn "katherine" into "kather…" and a badge. The name is the only thing in a tile that
 * tells one face from another, so it gets the whole width and the marks take space the avatar was
 * already occupying. Opposite corners, so the two never collide on a space that is both verified and
 * sensitive; `end-*` rather than `right-*`, so they mirror under RTL.
 *
 * Each carries a 2px ring in the panel's own colour — the cut-out treatment `ListUserItemPin` uses
 * for the same job. Without it the mark blends into a dark avatar.
 *
 * Neither becomes decorative by moving: the badge keeps its `alt` and the glyph its `title`, so the
 * button still reads as "Ada Lovelace, Verified, @ada".
 */
function FollowingTile({
    recipient,
    onSelect,
    verifiedLabel,
    nsfwLabel,
}: {
    recipient: GiftRecipient
    onSelect: () => void
    verifiedLabel: string
    nsfwLabel: string
}) {
    const name = giftRecipientName(recipient)
    const label = name || `@${recipient.slug}`

    return (
        <li className="w-19 min-w-0 flex-none snap-start">
            <button
                type="button"
                data-testid="premium-gift-recipient"
                data-channel-slug={recipient.slug}
                onClick={onSelect}
                className="flex w-full min-w-0 cursor-pointer flex-col items-center gap-1 rounded-(--radius-lg) py-1 outline-none transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
                <span className="relative flex-none">
                    <AnimatedAvatar
                        size="large"
                        thumb={recipient.images.thumb}
                        avatarVideo={recipient.images.avatar_video}
                        isPremium={recipient.is_premium}
                        /* Decorative — the name is right underneath, inside the same button. */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                    {recipient.is_nsfw && (
                        /*
                         * A **pink disc with a white glyph knocked out of it** — `--accents-nsfw`,
                         * the DS's own token for this one fact and legacy's pink, at the same 20/12
                         * `FollowingChannelRow` uses. Not a coloured 16px `Icon`: a glyph the size of
                         * its own disc has no disc, only tinted corners.
                         */
                        <span className="absolute top-0 end-0 flex size-5 items-center justify-center rounded-(--radius-fill) bg-(--accents-nsfw) text-(--white) ring-2 ring-(--background-surface)">
                            <Icon
                                name="nsfw"
                                weight="filled"
                                size={16}
                                title={nsfwLabel}
                                className="size-3"
                            />
                        </span>
                    )}
                    <VerifiedBadge
                        image={recipient.verified_tick_badge?.image ?? null}
                        size="caption"
                        label={verifiedLabel}
                        className="absolute bottom-0 end-0 rounded-(--radius-fill) bg-(--background-surface) ring-2 ring-(--background-surface)"
                    />
                </span>
                {/*
                 * `type-dense-emphasis` and not the row's `type-body-strong`: 16px semibold in a 76px
                 * tile truncates almost every real name to four or five glyphs. 14 is what legacy
                 * renders here too, and a tile is for recognising a face rather than reading a name.
                 */}
                <span className="type-dense-emphasis w-full min-w-0 truncate text-center text-(--text-title)">
                    {label}
                </span>
                {/*
                 * `<bdi>` for the reason `ListUserItemHandle` sets out at length: `@` is
                 * bidi-neutral, so under `ar` a bare `@ada` renders as `ada@`. This tile does not
                 * reach that primitive — it is its own two lines — so it carries the same isolate.
                 */}
                <span className="type-caption-meta w-full min-w-0 truncate text-center text-(--text-subtitle)">
                    <bdi>@{recipient.slug}</bdi>
                </span>
            </button>
        </li>
    )
}

/**
 * The strip's loading shape — **the same header, the same track, the same 76px tiles.**
 *
 * ## Why it exists at all, when the block it stands in for is conditional
 *
 * The picker's placeholder used to be six row-shaped bars and nothing else, while the real success
 * layout is this 167px section *plus* a 48px section header above those rows. Measured at 390 and at
 * 1280: the moment results landed, everything below jumped **215px**. A skeleton that does not
 * reserve what replaces it is a layout shift with extra steps.
 *
 * The objection to drawing it was that the block is conditional — a visitor never gets one — and
 * that is answered rather than dropped: `useGiftRecipients`'s `isFollowingLoading` is gated on the
 * query being enabled at all — a real, non-anonymous account — so this is drawn **only while a
 * request that can produce a strip is actually in flight.** For a guest there is no request and no
 * placeholder, which is exact rather than a guess.
 *
 * What remains is the one case nothing can know in advance: a signed-in reader whose term matches
 * none of the people they follow sees the placeholder go. That collapse is *upward* into a shorter
 * list, which is the cheaper of the two shifts — the alternative was content dropping 215px under a
 * pointer that was already moving toward a row.
 *
 * ## Built from the real markup, not from measured numbers
 *
 * `ListHeader`, the same track classes, the same `w-19` tile with a 48px circle and two lines
 * reserved at their real heights. Reproducing the box by *construction* is what stops the two
 * drifting: a tile that grows takes its placeholder with it. Six tiles, which overflows at 390 and
 * fills the track at 612 — the same count the real strip typically shows.
 */
export function GiftFollowingStripSkeleton({ count = 6 }: { count?: number }) {
    const { t } = useTranslation()

    return (
        <section aria-busy="true" data-testid="premium-gift-following-loading">
            {/*
             * **The real heading, not a bar.** It is not waiting on anything — the word is known
             * before the request goes out — and the "Global search" header a few pixels below is
             * real text in this same state, so a shimmering twin above it reads as a bug rather than
             * as a placeholder. It also makes the 48px box exact by construction instead of by a
             * reserved line height.
             */}
            <ListHeader rule={false}>
                <ListHeaderTitle as="h2">{t('giftpremium_following')}</ListHeaderTitle>
            </ListHeader>

            <div className="px-4 pb-4">
                {/*
                 * `overflow-hidden` rather than the real track's `overflow-x-auto`: there is nothing
                 * to scroll to yet, and a scrollport that briefly accepts a drag and then is replaced
                 * is a control that answers a gesture with nothing.
                 */}
                <ul className="-mx-4 flex list-none items-start gap-2 overflow-hidden px-4">
                    {Array.from({ length: count }, (_, index) => `gift-tile-skeleton-${index}`).map(
                        (key, index) => (
                            <li key={key} className="w-19 min-w-0 flex-none">
                                <span className="flex w-full flex-col items-center gap-1 py-1">
                                    <Skeleton circle w={48} h={48} delay={index * 160} />
                                    {/* 21 and 18 — the two label lines' real heights, not the
                                        bar's own 12. `skeleton.tsx` spells out why. */}
                                    <span className="flex h-[21px] w-full items-center justify-center">
                                        <Skeleton w={56} delay={index * 160} />
                                    </span>
                                    <span className="flex h-[18px] w-full items-center justify-center">
                                        <Skeleton w={40} delay={index * 160 + 40} />
                                    </span>
                                </span>
                            </li>
                        ),
                    )}
                </ul>
            </div>
        </section>
    )
}
