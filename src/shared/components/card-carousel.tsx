'use client'

import { cn } from '@shared/lib/utils'
import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

/**
 * A one-card-at-a-time horizontal carousel with dots and autoplay — legacy's
 * `components/campaign/campaignSlider`, without Swiper.
 *
 * Legacy pulls in `swiper` (loop + `Autoplay`, ~40KB) to slide between **two** promo cards. This is
 * CSS scroll-snap plus a scroll listener: the browser already does paging, momentum, RTL, touch and
 * the reduced-motion honouring of `scroll-behavior`, and none of it has to ship.
 *
 * ## The scroll position is the only state
 *
 * `index` is *derived* from where the track is scrolled to, never set independently: a dot press and
 * the autoplay tick both call `scrollToIndex`, the scroll event reports back, and the dots follow.
 * The alternative — an `activeIndex` that the handlers write and the scroll handler also writes — is
 * two sources of truth for one number, and they disagree the moment a touch drag is interrupted.
 * Legacy gets away with it because Swiper owns the position; here the DOM does.
 *
 * ## Nothing here reads `scrollLeft` directly
 *
 * `scrollLeft`'s sign in a **RTL** container is a browser-history minefield (negative in current
 * Chrome/Firefox/Safari, `scrollWidth`-based in older WebKit). So both directions of travel are
 * expressed as *relative* measurements instead — the distance between a slide's leading edge and
 * the track's, from `getBoundingClientRect` — which is direction-agnostic by construction and needs
 * no `dir` branch. `ar` is a supported locale; this file must work in it without a special case.
 *
 * ## Autoplay stops when someone is there
 *
 * Hover, focus inside, and a hidden tab all pause it (WCAG 2.2.2 wants a way to stop moving
 * content, and a pointer resting on the card *is* that way). `prefers-reduced-motion: reduce`
 * switches it off entirely rather than making it jump — a carousel that advances without animating
 * is worse than one that waits.
 */
export function CardCarousel({
    label,
    slideLabel,
    autoplayMs = 5000,
    className,
    children,
}: {
    /** Names the group. The caller translates it — `shared/` owns no copy. */
    label: string
    /** Per-slide accessible name, also used for its dot. `(index, count) => string`, 1-based. */
    slideLabel: (index: number, count: number) => string
    /** Legacy's `delay: 5000`. `0` disables autoplay. */
    autoplayMs?: number
    className?: string
    children: ReactNode
}) {
    const trackRef = useRef<HTMLDivElement>(null)
    const [index, setIndex] = useState(0)
    /*
     * One flag for every reason to hold: hover, focus-within, hidden tab. They are folded into a
     * counter-free boolean because they are not exclusive — a card can be hovered *and* focused —
     * and the last event to end would otherwise clear a hold the other still wants. Each source
     * writes its own slot instead.
     */
    const [held, setHeld] = useState({ pointer: false, focus: false, hidden: false })
    const [mayAnimate, setMayAnimate] = useState(false)

    const slides = Children.toArray(children)
    const count = slides.length

    /**
     * Scroll so slide `i` sits at the track's leading edge.
     *
     * `scrollBy` with a *delta* rather than `scrollTo` with an absolute `left`: the delta is the gap
     * between two rects, which is the same number in both writing directions. See the note above.
     */
    const scrollToIndex = useCallback((i: number, smooth: boolean) => {
        const track = trackRef.current
        const slide = track?.children[i]
        if (!track || !(slide instanceof HTMLElement)) return
        const delta = slide.getBoundingClientRect().left - track.getBoundingClientRect().left
        // A sub-pixel delta is layout noise, and smooth-scrolling by it cancels a drag in progress.
        if (Math.abs(delta) < 1) return
        track.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' })
    }, [])

    // Which slide is parked at the leading edge now. Read on every scroll, so it is rAF-coalesced.
    const syncIndex = useCallback(() => {
        const track = trackRef.current
        if (!track) return
        const origin = track.getBoundingClientRect().left
        const offsets = Array.from(track.children, child =>
            child instanceof HTMLElement ? child.getBoundingClientRect().left : Number.NaN,
        )
        setIndex(nearestIndex(offsets, origin))
    }, [])

    useEffect(() => {
        const track = trackRef.current
        if (!track) return
        let frame = 0
        const onScroll = () => {
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                syncIndex()
            })
        }
        track.addEventListener('scroll', onScroll, { passive: true })
        // A resize re-lays the slides out; the scroll offset survives but the index may not.
        const observer = new ResizeObserver(onScroll)
        observer.observe(track)
        return () => {
            track.removeEventListener('scroll', onScroll)
            observer.disconnect()
            if (frame) cancelAnimationFrame(frame)
        }
    }, [syncIndex])

    /*
     * `false` until the effect runs, which is the honest server answer — and the safe one: the first
     * client render never animates, so nothing moves before the preference is known.
     */
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setMayAnimate(!mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    // A background tab still fires timers; advancing there burns wake-ups to move nothing.
    useEffect(() => {
        const update = () => setHeld(prev => ({ ...prev, hidden: document.hidden }))
        update()
        document.addEventListener('visibilitychange', update)
        return () => document.removeEventListener('visibilitychange', update)
    }, [])

    const paused = held.pointer || held.focus || held.hidden

    useEffect(() => {
        if (!mayAnimate || paused || count < 2 || autoplayMs <= 0) return
        /*
         * `index` is a dependency, so the timer restarts whenever the slide changes — including a
         * change the *reader* made by swiping. That is the wanted behaviour and not a re-render
         * cost worth avoiding: a hand-scrolled carousel should give them the full interval on the
         * card they chose, not whatever was left of the previous one.
         */
        const timer = setTimeout(() => scrollToIndex((index + 1) % count, true), autoplayMs)
        return () => clearTimeout(timer)
    }, [autoplayMs, count, index, mayAnimate, paused, scrollToIndex])

    if (count === 0) return null
    /*
     * One card is not a carousel — no track, no dots, no autoplay, and nothing announcing a group of
     * one. Legacy returns the lone slide the same way. It matters more here than it looks: the
     * common case is exactly one campaign running.
     */
    if (count === 1) return <>{slides[0]}</>

    return (
        <div
            className={cn('flex flex-col gap-3', className)}
            onPointerEnter={() => setHeld(prev => ({ ...prev, pointer: true }))}
            onPointerLeave={() => setHeld(prev => ({ ...prev, pointer: false }))}
            onFocusCapture={() => setHeld(prev => ({ ...prev, focus: true }))}
            onBlurCapture={() => setHeld(prev => ({ ...prev, focus: false }))}
        >
            {/* biome-ignore lint/a11y/useSemanticElements: the rule suggests <fieldset>, which is a
                form-control group; this is the APG carousel container, and the <section> it means
                would file a landmark per slide into a page that already has its own */}
            <div
                ref={trackRef}
                role="group"
                aria-roledescription="carousel"
                aria-label={label}
                className={cn(
                    'flex snap-x snap-mandatory overflow-x-auto',
                    // The scrollbar is chrome the design does not draw, and on a 96px-tall card it
                    // would eat a tenth of it. Same idiom as `legal-toc.tsx`.
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )}
            >
                {slides.map((slide, i) => (
                    // biome-ignore lint/a11y/useSemanticElements: as above — a slide is a group, not a <fieldset>
                    <div
                        // Position is the identity here: the slides are a fixed, ordered set decided
                        // by the caller, and there is nothing stabler to key on.
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                        key={i}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={slideLabel(i + 1, count)}
                        className="w-full flex-none snap-start"
                    >
                        {slide}
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-center gap-2">
                {slides.map((_, i) => (
                    <button
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                        key={i}
                        type="button"
                        aria-label={slideLabel(i + 1, count)}
                        aria-current={i === index}
                        onClick={() => scrollToIndex(i, mayAnimate)}
                        /*
                         * The dot is 8px, which is far under the 24px minimum a pointer target
                         * needs (WCAG 2.5.8). So the *button* is 24px with the dot drawn inside
                         * it — the mark stays legacy's size and the target is reachable.
                         */
                        className="flex size-6 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                    >
                        <span
                            className={cn(
                                'size-2 rounded-full bg-(--text-title) transition-opacity',
                                i === index ? 'opacity-100' : 'opacity-30',
                            )}
                        />
                    </button>
                ))}
            </div>
        </div>
    )
}

/**
 * The index of the offset closest to `origin` — i.e. which slide is parked at the track's leading
 * edge.
 *
 * Pure, and separate from the component, because it is the one piece of this that can be wrong in a
 * way a person would not see straight away: mid-drag, two slides are partly visible and the answer
 * has to be stable rather than flickering between them. Ties go to the earlier slide.
 *
 * `NaN` entries (a child that is not an element) are skipped rather than compared — every
 * comparison against `NaN` is `false`, so an unguarded `<` would silently keep index 0.
 */
export function nearestIndex(offsets: number[], origin: number): number {
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < offsets.length; i++) {
        const distance = Math.abs(offsets[i] - origin)
        if (Number.isNaN(distance) || distance >= bestDistance) continue
        best = i
        bestDistance = distance
    }
    return best
}
