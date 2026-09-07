'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import useEmblaCarousel from 'embla-carousel-react'
import {
    Children,
    type ReactNode,
    type Ref,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react'

/**
 * A one-card-at-a-time horizontal carousel with dots and autoplay — legacy's
 * `components/campaign/campaignSlider`, on **Embla** rather than on Swiper.
 *
 * ## Why a library here, and only here
 *
 * This file was CSS scroll-snap plus a scroll listener for a while, and the argument for that still
 * holds for a *row of things you scroll* — `legal-toc.tsx`, the share sheet's channel row, the two
 * following strips. It stopped holding here, because this is the one place in the app with real
 * **slide semantics**: one card fills the viewport, a dot press means "go to slide 3", arrows mean
 * "one slide", autoplay means "advance the deck". Expressing that on top of a scroll position meant
 * a pure `nearestIndex` helper, a rAF-coalesced scroll listener, a `ResizeObserver`, an unanimated
 * seed effect for `initialIndex`, and a page of prose about `scrollLeft`'s sign in RTL — all of it
 * a reimplementation of what a carousel engine is.
 *
 * The rule for which of the two you are building — carousel or scrolling row — is written once, in
 * [`docs/DESIGN_SYSTEM.md` §10](../../../docs/DESIGN_SYSTEM.md#10-carousels-and-scrolling-rows--which-one-you-are-building);
 * read that before reaching for either.
 *
 * Embla is 11.1 KB gzipped (measured, `embla-carousel` 8.6.0 ESM) against Swiper's ~40 KB for the
 * same job, it is **headless** — it ships no CSS, adds no classes and dictates no markup, so the
 * geometry below is still this repo's — and RTL is an option (`direction`) rather than a sign
 * convention to be careful about. Legacy's Swiper is what this replaces, not what it copies.
 *
 * **It is deliberately not used for the scrolling rows.** Embla moves a transform track, so those
 * rows would lose native momentum, `scroll-snap` and `overscroll-behavior`. Here the track *is* the
 * whole viewport, so there is nothing to lose: one card is showing, and `watchFocus` scrolls a
 * focused slide into view, which is the one thing native scroll gave for free.
 *
 * ## The engine owns the index; this component only reads it
 *
 * `index` comes from `selectedScrollSnap()` on Embla's own `select` and `reInit` events. A dot
 * press calls `scrollTo` and the event reports back — never a second `setIndex`. That rule is why
 * the dots cannot disagree with the card on screen, and it is the same rule the previous
 * implementation had; what changed is who owns the position.
 *
 * ## Autoplay stays hand-written
 *
 * `embla-carousel-autoplay` exists and is not used: the pause rules here are the product's, not the
 * plugin's. Hover, focus inside and a hidden tab all hold (WCAG 2.2.2 wants a way to stop moving
 * content, and a pointer resting on the card *is* that way), and
 * `prefers-reduced-motion: reduce` switches autoplay **off** rather than making it jump — a
 * carousel that advances without animating is worse than one that waits. The plugin's
 * `stopOnMouseEnter` / `stopOnFocusIn` cover two of those four and would still leave the effect
 * below in place for the other two.
 *
 * ## Prev/next are the **caller's** to place
 *
 * This renders dots and nothing else. A caller that wants arrows takes a `ref` for the two moves
 * and `onIndexChange` for the two disabled states, and draws them where its design puts them —
 * which for `/premium`'s benefit dialog is *outside* the dialog, 45px clear of its edges, where a
 * control rendered inside this component could never reach. The alternative, an `arrows` boolean,
 * would fix the placement at this component's own edges and be wrong for the one screen that needs
 * them.
 */
export interface CardCarouselHandle {
    /** Move one slide toward the start. A no-op at the first slide. */
    prev: () => void
    /** Move one slide toward the end. A no-op at the last slide. */
    next: () => void
    /** Park a given slide. Out-of-range indices clamp. */
    goTo: (index: number) => void
}

export function CardCarousel({
    label,
    slideLabel,
    autoplayMs = 5000,
    initialIndex = 0,
    dots = true,
    onIndexChange,
    ref,
    className,
    children,
    testId,
}: {
    /** Names the group. The caller translates it — `shared/` owns no copy. */
    label: string
    /** Per-slide accessible name, also used for its dot. `(index, count) => string`, 1-based. */
    slideLabel: (index: number, count: number) => string
    /** Legacy's `delay: 5000`. `0` disables autoplay. */
    autoplayMs?: number
    /**
     * Which slide to open on — Embla's `startIndex`, so it is applied by the engine at init and
     * never animated from slide 0.
     *
     * For a carousel the reader entered *at* a particular card — the Premium benefits dialog is
     * opened by pressing one row of a list, and landing on the first benefit instead of the one
     * pressed is a different screen from the one they asked for.
     *
     * It is not a controlled `index`: the engine owns the position (see the note on this
     * component), so this seeds it and every later change comes from Embla. A caller that needs it
     * re-seeded should remount — which is what a dialog does anyway.
     */
    initialIndex?: number
    /**
     * Draw the dots. `false` for a caller that renders its own position control somewhere this
     * component cannot reach — `/premium`'s benefit dialog puts them in a lifted footer *below* the
     * caption, beside a Subscribe button, which is legacy's arrangement.
     *
     * It is a switch rather than a `dotTone` variant (which this had for an hour) because the
     * alternative was two sets in the DOM: this component's, hidden by a CSS selector, and the
     * caller's on top. Both carried the same `data-testid`, and a hidden duplicate of an automation
     * handle is exactly the trap `docs/TEST_IDS.md` warns about. Off means off.
     */
    dots?: boolean
    /**
     * The slide that is parked now, and how many there are — for a caller drawing its own controls.
     * Fires on every settle, including the one after `initialIndex` is applied.
     */
    onIndexChange?: (index: number, count: number) => void
    /** The two moves, for a caller's own prev/next. See the note above on placement. */
    ref?: Ref<CardCarouselHandle>
    className?: string
    children: ReactNode
    /**
     * Base `data-testid`. The viewport is the bare id; slides are `${testId}-slide` and dots
     * `${testId}-dot`, each carrying `data-index` (0-based, matching the code).
     *
     * `data-index` and not a name, because position genuinely *is* the identity here — the slides
     * are a fixed ordered set decided by the caller, which is the same reason the React `key` is
     * the index. The list cannot reorder or filter, so positional identity is honest.
     *
     * ⚠ **This autoplays every 5000ms** unless the caller passes `autoplayMs={0}`. A suite must
     * assert on a dot's `aria-current`, never on which slide happens to be showing after a wait.
     */
    testId?: string
}) {
    const { currentLanguage } = useTranslation()
    const [index, setIndex] = useState(initialIndex)
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

    const [viewportRef, embla] = useEmblaCarousel({
        // `direction` is deliberately absent here and applied from layout in an effect below.
        // One card fills the viewport and parks at the leading edge — legacy's `slidesPerView: 1`.
        align: 'start',
        slidesToScroll: 1,
        /*
         * `trimSnaps` drops the snap points that would scroll past the last card. Without it the
         * deck can rest on an empty tail, and the dots then have more entries than there are
         * resting places — the two disagree and neither is wrong.
         */
        containScroll: 'trimSnaps',
        /*
         * No wrap. Legacy's Swiper is not in `loop` mode either — it disables its buttons at the
         * ends — and a carousel of *documentation* that jumps from the last perk back to the first
         * is one the reader cannot tell they have finished.
         */
        loop: false,
        startIndex: initialIndex,
        // Scrolls a slide into view when something inside it takes focus, which is the one thing
        // native scrolling did for free and the reason this is safe to move off it.
        watchFocus: true,
    })

    /**
     * **Which way the track runs is read from layout, not from the locale.**
     *
     * Embla has to be told (`direction`), and the obvious source is the active language — `ar` is
     * this app's RTL locale and it is what sets `<html dir>`. That is wrong in one case that
     * actually exists: `dir` is an *inherited* attribute, so any subtree can flip it, and
     * `/dev/campaign-carousel` renders this component twice, side by side, inside `dir="ltr"` and
     * `dir="rtl"` wrappers to compare them. A locale-derived answer makes the second one translate
     * the wrong way while its text runs the other — the harness would be lying about the thing it
     * exists to show. The scroll-snap version this replaced read direction from layout for the same
     * reason, and that contract is kept.
     *
     * `getComputedStyle` needs a mounted node, so it cannot be an option passed during render (it
     * would also be an SSR hazard). The engine defaults to `ltr`, which is why the guard below
     * means **no re-init at all** in the common case and exactly one in an RTL document.
     *
     * `currentLanguage` is a dependency so that switching to `ar` — which changes `<html dir>`
     * without remounting anything — is noticed. The re-init hands back the slide that is showing,
     * rather than the one this carousel opened on: a language switch must not also be a page turn.
     */
    const appliedDirection = useRef<'ltr' | 'rtl'>('ltr')
    /*
     * ⚠ The suppression below has to be the **last comment line** before the call. Written as three
     * `//` lines of prose it applies to the line after the first one — another comment — and biome
     * reports it as an unused suppression while the rule still fires. Hence the reason lives here.
     *
     * `currentLanguage` is a *trigger*, not a value the effect reads: it is how a language switch
     * gets the direction re-read from layout. Removing it, as the rule suggests, leaves `ar`
     * running an LTR track.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `currentLanguage` is a trigger — see above
    useEffect(() => {
        if (!embla) return
        const direction = getComputedStyle(embla.rootNode()).direction === 'rtl' ? 'rtl' : 'ltr'
        if (direction === appliedDirection.current) return
        appliedDirection.current = direction
        embla.reInit({ direction, startIndex: embla.selectedScrollSnap() })
    }, [embla, currentLanguage])

    /*
     * The engine is the only writer of `index`. `reInit` is listened to as well as `select`,
     * because a resize, a language flip or a change in the number of slides all re-seat the
     * position without a `select` — and the dots would keep pointing at a card that has moved.
     */
    useEffect(() => {
        if (!embla) return
        const sync = () => setIndex(embla.selectedScrollSnap())
        sync()
        embla.on('select', sync).on('reInit', sync)
        return () => {
            embla.off('select', sync).off('reInit', sync)
        }
    }, [embla])

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
        if (!embla || !mayAnimate || paused || count < 2 || autoplayMs <= 0) return
        /*
         * `index` is a dependency, so the timer restarts whenever the slide changes — including a
         * change the *reader* made by dragging. That is the wanted behaviour and not a re-render
         * cost worth avoiding: a hand-dragged carousel should give them the full interval on the
         * card they chose, not whatever was left of the previous one.
         */
        const timer = setTimeout(() => embla.scrollTo((index + 1) % count), autoplayMs)
        return () => clearTimeout(timer)
    }, [autoplayMs, count, embla, index, mayAnimate, paused])

    /*
     * `jump` is the inverse of `mayAnimate`: under `prefers-reduced-motion: reduce` the deck still
     * moves — a control that does nothing is worse — it just arrives instead of travelling.
     * `scrollPrev`/`scrollNext` clamp on their own with `loop: false`; `goTo` is clamped here
     * because `scrollTo` takes whatever index it is handed.
     */
    useImperativeHandle(
        ref,
        () => ({
            prev: () => embla?.scrollPrev(!mayAnimate),
            next: () => embla?.scrollNext(!mayAnimate),
            goTo: (to: number) =>
                embla?.scrollTo(Math.min(count - 1, Math.max(0, to)), !mayAnimate),
        }),
        [count, embla, mayAnimate],
    )

    /*
     * Reported from an effect rather than from the `select` handler, so a caller is never called
     * during the engine's own event pass — and so the first report includes the `startIndex` seed.
     */
    const report = useRef(onIndexChange)
    report.current = onIndexChange
    useEffect(() => {
        report.current?.(index, count)
    }, [index, count])

    if (count === 0) return null
    /*
     * One card is not a carousel — no track, no dots, no autoplay, and nothing announcing a group of
     * one. Legacy returns the lone slide the same way. It matters more here than it looks: the
     * common case is exactly one campaign running.
     *
     * It also keeps Embla out of the common case entirely: the hook above is called (hooks cannot be
     * conditional) but its viewport ref is never attached, so nothing is measured and no engine runs.
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
                ref={viewportRef}
                role="group"
                aria-roledescription="carousel"
                aria-label={label}
                data-testid={testId}
                /*
                 * `overflow-hidden` and nothing else: Embla translates the container inside this
                 * box, so the viewport is a window rather than a scroll port. That is also why the
                 * scrollbar-hiding rules the previous version needed are gone — there is no
                 * scrollbar to hide.
                 */
                className="overflow-hidden"
            >
                {/* Embla's container. The geometry is ours; the transform on it is the engine's. */}
                <div className="flex">
                    {slides.map((slide, i) => (
                        // biome-ignore lint/a11y/useSemanticElements: as above — a slide is a group, not a <fieldset>
                        <div
                            // Position is the identity here: the slides are a fixed, ordered set
                            // decided by the caller, and there is nothing stabler to key on.
                            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                            key={i}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={slideLabel(i + 1, count)}
                            data-testid={subTestId(testId, 'slide')}
                            data-index={i}
                            // `min-w-0` as well as `flex-none w-full`: a slide whose content is wider
                            // than the card (a long single-line caption) would otherwise push the
                            // flex item past 100% and the deck would rest between two cards.
                            className="w-full min-w-0 flex-none"
                        >
                            {slide}
                        </div>
                    ))}
                </div>
            </div>

            {dots && (
                <div className="flex items-center justify-center gap-2">
                    {slides.map((_, i) => (
                        <button
                            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                            key={i}
                            type="button"
                            aria-label={slideLabel(i + 1, count)}
                            aria-current={i === index}
                            data-testid={subTestId(testId, 'dot')}
                            data-index={i}
                            onClick={() => embla?.scrollTo(i, !mayAnimate)}
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
            )}
        </div>
    )
}
