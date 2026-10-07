'use client'

import { toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type SearchChannel, searchChannelName } from '../api/types'
import { SearchSectionHeader } from './search-section-header'

/**
 * The spaces you already follow that match the term — a horizontal strip of tiles above the global
 * results.
 *
 * ## Why a strip of faces and not a list
 *
 * It answers a different question from the list below it. "Did you mean one of the people you
 * already follow?" is usually a two- or three-item answer and it is the answer most searches
 * actually want, so it goes at the top — and an avatar with a name under it is a *face*, which is
 * how people recognise a creator they already follow. The 80px full-width rows underneath are the
 * exhaustive answer, and they are for reading rather than recognising.
 *
 * ## Horizontal, which this was not for a while
 *
 * Legacy is horizontal on both surfaces that draw it — `containers/search/components/following`
 * (Swiper with a scrollbar and mousewheel) and gift-premium's (Swiper with arrow buttons) — and this
 * was ported as a **wrapping grid** instead, on three objections written into this file at the time.
 * The product asked for the strip back. The objections were not wrong, so each is answered rather
 * than dropped:
 *
 * | the objection | what answers it here |
 * |---|---|
 * | a scroller has no visible extent — twenty look like four | arrows that appear **only when there is something to scroll to** and disable at each end; on touch, the strip's own overflow is the affordance |
 * | a second scroll axis inside a page that already scrolls | `overscroll-x-contain`, so a swipe running off the end cannot trigger the browser's back navigation — the failure the original note called out by name |
 * | it fights the keyboard | tiles stay in DOM order and focusable, and the browser scrolls a focused one into view; snapping means it parks whole rather than half-clipped |
 *
 * **No Swiper.** Legacy's version is `swiper/react` plus three modules, four CSS imports, a slider
 * ref, two navigation refs and a `setTimeout(200)` that re-initialises navigation once those refs
 * exist — about 40KB to slide some avatars. This is `overflow-x-auto` + `snap-x`, the idiom
 * `share-dialog.tsx` and `legal-toc.tsx` also use: the browser does paging, momentum, touch, RTL
 * and reduced motion, and none of it ships.
 *
 * ⚠ `card-carousel.tsx` is **no longer** one of them — it runs on Embla now, because it has real
 * slide semantics (one card per viewport, dots, autoplay, "go to slide 3"). A row of avatars has
 * none of that, and moving it onto a transform track would cost the two rows in the table above:
 * native momentum, and the browser scrolling a focused tile into view.
 *
 * ## RTL
 *
 * Almost nothing to do, which is the point of using the platform: a flex row flows along the inline
 * axis, so `dir="rtl"` fills from the right and scrolls the other way on its own. The arrows are
 * placed with `start-2`/`end-2` and their glyphs mirror with `rtl:-scale-x-100`. Swiper needs an
 * explicit `dir` prop for this and re-initialises when it changes.
 *
 * The **one** place the platform does not carry it is `scrollBy({ left })`, which is physical rather
 * than inline — see `useStripScroll`. Under `ar` the end arrow moved the strip nowhere until that was
 * measured, which is the kind of break no LTR screenshot shows.
 *
 * ## The track bleeds, the content does not
 *
 * `-mx-6 px-6` — the scrollport runs edge to edge so a tile mid-scroll is clipped by the panel rather
 * than by an invisible box inset from it, while the first and last tiles still line up with the 24px
 * column the header and the rows below use. `scroll-px-6` makes snapping respect the same inset.
 * Below `md` all three are the `-4` twins: the comp's 24 is a card inset, and a phone has no card —
 * there it is 8px of row taken for nothing, and out of line with the search field's 16.
 * Straight from `share-dialog.tsx`, which solved this first.
 *
 * Rendered only when there is something in it — the caller checks, because an empty strip should
 * take no header either.
 */
export function SearchFollowingStrip({
    channels,
    onOpen,
    className,
}: {
    channels: SearchChannel[]
    /** Called on press, so the term can be recorded as a recent. Navigation is the link's. */
    onOpen: () => void
    /** The host's entrance — `RISE` on the real screen. */
    className?: string
}) {
    const { t } = useTranslation()
    const trackRef = useRef<HTMLUListElement>(null)
    const { canStart, canEnd, scrollBy } = useStripScroll(trackRef, channels.length)

    return (
        <section aria-labelledby="search-following-heading" className={className}>
            {/*
             * `rule={false}`: the DS draws a hairline under a list header because what usually
             * follows is a list of rows that continues it. What follows here is a block of tiles
             * with its own visual mass, and the section below brings its own header — two rules
             * across one card reads as three separate cards.
             */}
            <SearchSectionHeader id="search-following-heading" title={t('search_following')} />

            <div className="relative px-4 pb-4 md:px-6">
                <ul
                    ref={trackRef}
                    className={cn(
                        '-mx-4 flex list-none snap-x scroll-px-4 items-start gap-2 px-4 md:-mx-6 md:scroll-px-6 md:px-6',
                        'overflow-x-auto overscroll-x-contain',
                        /*
                         * The scrollbar is chrome the design does not draw, and on the platforms
                         * where it is not an overlay it would sit under the handles and add 15px to
                         * the strip's height. The arrows are the extent cue instead. Same idiom as
                         * `share-dialog.tsx` and `legal-toc.tsx`.
                         */
                        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    )}
                >
                    {channels.map(channel => (
                        <FollowingTile
                            key={channel.slug}
                            channel={channel}
                            onOpen={onOpen}
                            verifiedLabel={t('channel_verified')}
                            nsfwLabel={t('channel_nsfw')}
                            premiumLabel={t('channel_premium')}
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
 * that tracked an index and also listened to `scroll` would have two sources of truth for one
 * number, and they disagree the first time a touch drag is interrupted. (`CardCarousel` keeps the
 * same discipline against a different owner: there the *engine* holds the position and the dots
 * only read it.)
 *
 * ## Three things can change the answer, and only one of them is a scroll
 *
 * The listener covers scrolling; a `ResizeObserver` on the track covers the window narrowing and the
 * panel changing width across `md`; and `count` in the dependency list covers the list itself being
 * replaced as the reader types, which fires neither event — a strip that went from twenty tiles to
 * two would otherwise keep offering an arrow with nowhere to go.
 *
 * ## `scrollLeft` is not read, and that is deliberate
 *
 * Its **sign in an RTL container is a browser-history minefield** (negative in current
 * Chrome/Firefox/Safari, `scrollWidth`-based in older WebKit) — `share-dialog.tsx`'s channel row
 * carries the same warning. So travel is measured as an absolute distance from each end:
 * `Math.abs(scrollLeft)` is
 * direction-agnostic, and the remaining distance is what is left of `scrollWidth - clientWidth`.
 * `ar` is a supported locale and this must work in it without a `dir` branch.
 *
 * The 1px tolerance is for fractional layouts: a track at its true end reports a remainder of
 * 0.5-something on a scaled display, and without it the end arrow never goes away.
 */
function useStripScroll(ref: React.RefObject<HTMLUListElement | null>, count: number) {
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
     * `count` is in the deps and Biome cannot see why: the track's own box is **unchanged** when its
     * children are replaced — only `scrollWidth` moves — so the ResizeObserver never fires and a
     * strip that went from twenty tiles to two would keep offering an arrow with nowhere to go.
     * `clamped-text.tsx` suppresses the identical rule for the identical reason.
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
     * ## `scrollBy({ left })` is physical, and this is the one place a `dir` branch is unavoidable
     *
     * It was written without one, on the assumption that `left` is inline-axis-relative. It is not:
     * in an RTL container the scroll position runs 0 → negative, so a positive `left` travels toward
     * the *start* of the content. Measured under `ar`, the end arrow moved the strip nowhere — it was
     * already clamped at 0 — while the strip still had 252px of travel. Reading `direction` off the
     * node is the fix; `getComputedStyle` rather than a locale prop, so it is the element's own
     * resolved direction and stays right inside any subtree that overrides it.
     *
     * The **measurement** above needs no such branch — `Math.abs(scrollLeft)` is a distance from the
     * inline start whichever sign the engine uses — which is why only this half has one.
     *
     * 80% rather than 100% keeps a tile of overlap, which is what tells the reader the strip moved
     * rather than replaced itself. `behavior: 'smooth'` is honoured — and switched off — by
     * `prefers-reduced-motion` at the platform level, which is the whole reason the native API is
     * worth using over an animation of our own.
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
 * ## It is removed, not dimmed, when there is nowhere to go
 *
 * A disabled arrow parked over the first tile is chrome that covers content to say nothing. Legacy
 * reaches the same conclusion the long way round — `display: none !important` on
 * `.swiper-button-disabled`, after also setting `opacity: 0.3` and `cursor: not-allowed` on it.
 *
 * Removing it also means the arrows are simply **absent on a strip that fits**, which is most
 * searches: a term matching two of the spaces you follow gets two tiles and no chrome at all.
 *
 * ## `pointer-fine` — not a viewport width
 *
 * A touch reader already has the affordance (the strip scrolls under a finger) and an arrow disc on
 * a phone is 32px of tile covered up. But *width* is the wrong question — a tablet is wide and
 * touched, a small window is narrow and moused — so the query is the input device, which is what
 * actually decides whether dragging is available.
 *
 * `aria-hidden` on top of that: the arrows are a **convenience over a scrollport that is already
 * keyboard-reachable**, so announcing two more controls that duplicate what Tab and the arrow keys
 * already do is noise. The tiles themselves carry the accessible names.
 *
 * And with no accessible name to carry, they take **no label prop and no translation key**. A `title`
 * on an `aria-hidden` element is read by nothing; it would be two strings translated into nine
 * languages to produce a tooltip over chrome that a screen reader is explicitly told to skip.
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
 * One space in the strip: a 48px avatar over two centred lines.
 *
 * **76px, pinned** — `w-19 flex-none`. A flex item left to size itself takes its widest line, so a
 * strip of them is ragged and every name sets its own truncation point; pinning the track is what
 * makes the row read as a row. 76 is the DS `large` avatar's 48 plus the room a two-line label needs,
 * and it is what the wrapping grid this replaced used as its own `minmax` floor — so the tile is the
 * same size it has always been, only now it is the tile that owns the number.
 *
 * `snap-start` so a drag parks a tile against the strip's leading padding rather than halfway
 * through one. Both lines are `text-center`, so the stack reads as one column under the avatar's
 * centre, and `min-w-0` is what lets them `truncate` inside a flex item.
 */
function FollowingTile({
    channel,
    onOpen,
    verifiedLabel,
    nsfwLabel,
    premiumLabel,
}: {
    channel: SearchChannel
    onOpen: () => void
    verifiedLabel: string
    nsfwLabel: string
    premiumLabel: string
}) {
    const name = searchChannelName(channel)
    const label = name || `@${channel.slug}`
    const verifiedImage = channel.verified_tick_badge?.image ?? null

    return (
        <li className="w-19 min-w-0 flex-none snap-start">
            <Link
                data-testid="search-following-tile"
                href={toChannelPath(channel.slug)}
                onClick={onOpen}
                /* See `SearchChannelRow` — twenty prefetches for the one space that gets pressed. */
                prefetch={false}
                className="flex w-full min-w-0 flex-col items-center gap-1 rounded-(--radius-lg) py-1 no-underline outline-none transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
                {/*
                 * ## The sensitive mark sits on the avatar; the tick and the crown follow the name
                 *
                 * The tick and the Premium crown go **after the name**, the arrangement every other
                 * row in the app uses (`SearchChannelRow`, `FollowingChannelRow`, the channel
                 * header). They lived on the avatar's corners for width, which gave the same two
                 * marks a second placement on this one surface. The cost is real but bounded: the
                 * name is the one thing that truncates, the marks are `flex-none`, so a long name
                 * ellipsises earlier and the marks stay whole.
                 *
                 * The sensitive mark stays on the avatar's top-end corner. It is a pink disc, not a
                 * name-row badge, and that is how `FollowingChannelRow` draws it too.
                 *
                 * ## The sensitive mark is a **pink disc with a white glyph**
                 *
                 * `--accents-nsfw` (`#f43fca` Light, `#ff5ed9` Dark) — the DS's own token for this one
                 * fact, and legacy's pink. It is the pairing `NsfwGatePanel` uses at 56px and
                 * `FollowingChannelRow` at 20, and this is that construction at the same 20/12: a
                 * `span` carrying the disc with a smaller glyph knocked out inside it, **not** a
                 * coloured 16px `Icon` — a glyph the size of its own disc has no disc, only tinted
                 * corners. The 2px ring in the panel's colour is the cut-out `ListUserItemPin` uses,
                 * so the disc does not blend into a dark avatar.
                 *
                 * ⚠ Measured, the **white glyph** is 3.28:1 on the Light pink and **2.67:1 on the Dark
                 * one** — under WCAG's 3:1 for a graphic. That is a property of the token's dark rung,
                 * not of this call site: `NsfwGatePanel` and `FollowingChannelRow` ship the identical
                 * pairing. The fix belongs on `--accents-nsfw`'s dark value in `globals.css`, where it
                 * lands on all three at once.
                 *
                 * Every mark keeps its accessible name (`alt`, `title`, `label`), so the link still
                 * reads as "Ada Lovelace, Verified, Premium, @ada".
                 */}
                <span className="relative flex-none">
                    <AnimatedAvatar
                        size="large"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        isPremium={channel.is_premium}
                        /* Decorative — the name is right underneath, inside the same link. */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                    {channel.is_nsfw && (
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
                </span>
                {/*
                 * `type-dense-emphasis` and not the row's `type-body-strong`: 16px semibold in an
                 * ~80px tile truncates almost every real name to four or five glyphs. 14 is what
                 * legacy renders here too, and a tile is for recognising a face rather than for
                 * reading a name.
                 *
                 * `justify-center` keeps a short name centred under the avatar together with its
                 * marks. Only the name truncates, so the marks are never cut.
                 *
                 * A Premium name is painted with `--gradient-premium-name`, as `ListUserItemName`
                 * and `CardUserHeaderName` do. Those set `type-body-strong`, which is why the
                 * gradient is written out here rather than borrowed: the badges sit beside the
                 * name, never inside it, because the gradient makes the text's own colour transparent.
                 *
                 * **16 / 12, not equal sizes.** The verified art is a 768px PNG whose tick fills only
                 * the middle 576 (75%), while the crown's hexagon fills ~92% of its box. At equal
                 * sizes the crown reads a third larger. 16 and 12 both draw at about 12px, which is
                 * the same 4:3 the channel header uses (24 / 18).
                 */}
                <span className="flex w-full min-w-0 items-center justify-center gap-0.5">
                    <span
                        className={cn(
                            'type-dense-emphasis min-w-0 truncate',
                            channel.is_premium
                                ? '[background-image:var(--gradient-premium-name)] bg-clip-text text-transparent'
                                : 'text-(--text-title)',
                        )}
                    >
                        {label}
                    </span>
                    <VerifiedBadge image={verifiedImage} size={16} label={verifiedLabel} />
                    {channel.is_premium && (
                        <PremiumBadge size={12} label={premiumLabel} className="flex-none" />
                    )}
                </span>
                <span className="type-caption-meta w-full min-w-0 truncate text-center text-(--text-subtitle)">
                    @{channel.slug}
                </span>
            </Link>
        </li>
    )
}
