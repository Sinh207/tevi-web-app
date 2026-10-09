'use client'

import { VERIFIED_BADGE_TIER } from '@shared/components/verified-badge-size'
import { useTranslation } from '@shared/i18n/use-translation'
import { LOCK_JIGGLE, POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type KeyboardEvent, type PointerEvent, useRef } from 'react'
import { Trans } from 'react-i18next'
import type { SpaceTierState } from '../api/types'
import { tierBadgeSrc } from '../lib/tiers'
import { BadgeStage } from './badge-stage'
import { StarAmount } from './star-amount'

/** Legacy's slide: a 160px badge, 180px tall track, neighbours at 72% behind a 2px blur. */
const SLIDE = 160
/** A horizontal drag shorter than this is a tap, not a swipe. */
const SWIPE_PX = 40

/**
 * The tier ladder — the badge in the middle is the one selected, its neighbours peek either side.
 *
 * ## Not `CardCarousel`, and not a scrolling row either
 *
 * Legacy's is a Swiper with `centeredSlides` and `slidesPerView: 'auto'`: one slide in focus *with
 * the next ones visible at the edges*. `CardCarousel` is one card per viewport parked at the leading
 * edge, so it cannot draw the peek; and a native scroll-snap row would make the selection a function
 * of `scrollLeft`, which `docs/DESIGN_SYSTEM.md` §10 reserves for rows with no selection at all.
 *
 * What this really is is a **stepper over five values with artwork**, so it is built as one: the
 * selected index is React state owned by the page, each badge is absolutely placed at its offset
 * from it with a logical `inset-inline-start` (so RTL mirrors without a sign convention), and the
 * moves are the arrows, the arrow keys, a tap on a neighbour, and a swipe. No engine, no transform
 * track — at five slides there is nothing for one to do.
 */
export function TierSelector({
    state,
    selectedIndex,
    onSelect,
}: {
    state: SpaceTierState
    selectedIndex: number
    onSelect: (index: number) => void
}) {
    const { t } = useTranslation()
    const dragFrom = useRef<number | null>(null)
    const trackRef = useRef<HTMLDivElement>(null)

    const { tiers, images, current } = state
    const selectedTier = tiers[selectedIndex] ?? 0
    const currentBadge = tierBadgeSrc(images, current)
    const last = tiers.length - 1

    const go = (index: number) => onSelect(Math.min(Math.max(index, 0), last))

    /** "Forward" on screen is toward the inline end, which is left in Arabic. */
    const isRtl = () =>
        trackRef.current ? getComputedStyle(trackRef.current).direction === 'rtl' : false

    const onKeyDown = (event: KeyboardEvent) => {
        const forward = isRtl() ? 'ArrowLeft' : 'ArrowRight'
        const back = isRtl() ? 'ArrowRight' : 'ArrowLeft'
        if (event.key === forward) go(selectedIndex + 1)
        else if (event.key === back) go(selectedIndex - 1)
        else if (event.key === 'Home') go(0)
        else if (event.key === 'End') go(last)
        else return
        event.preventDefault()
    }

    const onPointerDown = (event: PointerEvent) => {
        dragFrom.current = event.clientX
    }
    const onPointerUp = (event: PointerEvent) => {
        if (dragFrom.current === null) return
        const dx = event.clientX - dragFrom.current
        dragFrom.current = null
        if (Math.abs(dx) < SWIPE_PX) return
        const towardEnd = isRtl() ? dx > 0 : dx < 0
        go(selectedIndex + (towardEnd ? 1 : -1))
    }

    return (
        <div className="flex w-full flex-col items-center gap-4">
            <div
                data-testid="space-tier-current"
                className="type-caption-label mt-2 flex items-center gap-2 rounded-full bg-(--background-surface) px-2 py-0.5 text-(--text-body) shadow-xs"
            >
                {t('space_tier_current')}
                {/* Keyed on the tier, so a change lands with a pop — the pill is the one place
                    on the screen that says the switch took. */}
                <span
                    key={current}
                    className={cn(
                        'type-caption-label-strong flex items-center gap-1 text-(--text-title)',
                        POP,
                    )}
                >
                    {currentBadge ? (
                        /* Sized off the caption text beside it, from the table every other tier
                           mark uses — 2× box, CSS height, width following the art. */
                        <Image
                            src={currentBadge}
                            alt=""
                            width={VERIFIED_BADGE_TIER.caption * 2}
                            height={VERIFIED_BADGE_TIER.caption * 2}
                            style={{ height: VERIFIED_BADGE_TIER.caption }}
                            className="w-auto"
                        />
                    ) : null}
                    {t('space_tier_tier', { tier: current })}
                </span>
            </div>

            {/* The group is the keyboard target; the arrows and the side badges are the pointer
                ones. `aria-roledescription` names the pattern for a screen reader, the way
                `CardCarousel` does. */}
            {/* biome-ignore lint/a11y/useSemanticElements: the rule suggests <fieldset>, a
                form-control group; this is the APG carousel container, as in `CardCarousel` */}
            <div
                ref={trackRef}
                data-testid="space-tier-selector"
                role="group"
                aria-roledescription="carousel"
                aria-label={t('space_tier_title')}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: the group takes the arrow keys
                tabIndex={0}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                    dragFrom.current = null
                }}
                className={cn(
                    'relative h-[180px] w-full touch-pan-y overflow-clip select-none',
                    'rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                )}
            >
                {tiers.map((tier, index) => {
                    const offset = index - selectedIndex
                    const isSelected = offset === 0
                    const badge = tierBadgeSrc(images, tier)
                    const isLocked = !state.available.includes(tier)
                    return (
                        <button
                            key={tier}
                            type="button"
                            data-testid="space-tier-slide"
                            data-option-value={tier}
                            aria-label={t('space_tier_tier', { tier })}
                            aria-current={isSelected || undefined}
                            // Only the selected slide is in the tab order; the group's arrow keys
                            // move between them, which is the carousel pattern's own contract.
                            tabIndex={-1}
                            onClick={() => go(index)}
                            style={{
                                insetInlineStart: `calc(50% - ${SLIDE / 2}px + ${offset * SLIDE}px)`,
                            }}
                            className={cn(
                                'absolute top-2.5 flex size-[160px] cursor-pointer items-center justify-center',
                                /*
                                 * The easing `RISE` and `POP` use — fast out, long settle — so the
                                 * ladder glides into place rather than sliding at constant speed.
                                 */
                                'transition-[inset-inline-start,scale,opacity,filter] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                                isSelected
                                    ? 'scale-100 opacity-100'
                                    : 'scale-[0.72] opacity-55 blur-[2px]',
                                Math.abs(offset) > 2 && 'invisible',
                            )}
                        >
                            <BadgeStage active={isSelected} className="size-full">
                                {badge ? (
                                    <Image
                                        src={badge}
                                        alt=""
                                        width={SLIDE * 2}
                                        height={SLIDE * 2}
                                        draggable={false}
                                        priority={isSelected}
                                        className="size-full object-contain"
                                    />
                                ) : null}
                            </BadgeStage>
                            {/* A tier this Space has not unlocked wears a lock, and the lock
                                jiggles while it is the one selected — the press it would take is
                                the one the button below refuses. */}
                            {isLocked ? (
                                <span
                                    aria-hidden
                                    className="absolute end-5 bottom-5 grid size-9 place-items-center rounded-full bg-(--background-surface) text-(--text-title) shadow-md"
                                >
                                    <Icon
                                        name="lock"
                                        weight="filled"
                                        size={18}
                                        className={isSelected ? LOCK_JIGGLE : undefined}
                                    />
                                </span>
                            ) : null}
                        </button>
                    )
                })}

                <Button
                    data-testid="space-tier-prev"
                    variant="secondary"
                    size="medium"
                    iconOnly
                    aria-label={t('space_tier_previous')}
                    disabled={selectedIndex <= 0}
                    onClick={() => go(selectedIndex - 1)}
                    className="-translate-y-1/2 absolute start-2 top-1/2 z-10 disabled:hidden"
                >
                    <Icon name="angle-left" size={20} className="rtl:-scale-x-100" />
                </Button>
                <Button
                    data-testid="space-tier-next"
                    variant="secondary"
                    size="medium"
                    iconOnly
                    aria-label={t('space_tier_next')}
                    disabled={selectedIndex >= last}
                    onClick={() => go(selectedIndex + 1)}
                    className="-translate-y-1/2 absolute end-2 top-1/2 z-10 disabled:hidden"
                >
                    <Icon name="angle-right" size={20} className="rtl:-scale-x-100" />
                </Button>
            </div>

            {/* Keyed on the selection, so every move replays the rise: the number and the price
                are the two things that changed, and the motion is what points at them. */}
            {/* The live region stays mounted outside the keyed node — a region inserted fresh
                is not announced, so keying the region itself would silence it. */}
            <div aria-live="polite" className="w-full">
                <div
                    key={selectedTier}
                    className={cn('flex w-full flex-col items-center gap-2 px-2 text-center', RISE)}
                >
                    <h2
                        data-testid="space-tier-selector-title"
                        className="type-heading-h1-bold m-0 text-(--text-title)"
                    >
                        {t('space_tier_tier', { tier: selectedTier })}
                    </h2>
                    <p className="type-body-default m-0 max-w-[400px] text-(--text-body)">
                        <Trans
                            i18nKey="space_tier_fans_pay"
                            values={{ tier: selectedTier }}
                            components={[<StarAmount key="price" />]}
                        />
                    </p>
                </div>
            </div>
        </div>
    )
}
