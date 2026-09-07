'use client'

import { cn } from '@shared/lib/utils'
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react'

export type LegalTocItem = { id: string; title: string }

/**
 * Sticky "Table of contents" rail for a legal document — the legacy `SectionMenu`,
 * rebuilt on plain anchors.
 *
 * Two things changed on purpose. The items come from the document data instead of a
 * `document.querySelectorAll('h2[id]')` sweep after mount, so the list is server
 * rendered and correct on first paint. And navigation is a real `<a href="#id">` with
 * `scroll-margin-top` on the target rather than a `scrollTo` with a hand-computed
 * header offset — it works without JS, is keyboard reachable, and updates the URL hash
 * so a section can be linked to.
 *
 * The highlight is the only part that needs the client — see `useActiveHeading`.
 */
export function LegalToc({
    items,
    label,
    orientation = 'rail',
    numbered = false,
    className,
    style,
}: {
    items: LegalTocItem[]
    label: string
    /** `rail` is the desktop sidebar; `chips` the horizontal scroller for phones. */
    orientation?: 'rail' | 'chips'
    /** Show the section numbers, matching the numbered headings in the document. */
    numbered?: boolean
    className?: string
    style?: CSSProperties
}) {
    const { activeId, atTop } = useActiveHeading(items)
    const chips = orientation === 'chips'
    const listRef = useFollowActiveChip(chips ? activeId : null)
    const navRef = useRef<HTMLElement>(null)
    useHashSync(activeId, atTop, navRef)

    if (items.length === 0) return null

    return (
        <nav
            ref={navRef}
            aria-label={label}
            style={style}
            className={cn(chips ? 'flex' : 'flex flex-col gap-4', className)}
        >
            {/*
             * An overline rather than a heading-sized title: the rail is apparatus around
             * the document, not a second document, so it should sit visually below the
             * copy's own hierarchy. The chip row is self-evident on screen and would spend
             * a third of a phone's viewport saying so, so there its label is for assistive
             * tech only.
             */}
            <h2
                className={cn(
                    'type-micro-overline uppercase text-(--text-body)',
                    chips && 'sr-only',
                )}
            >
                {label}
            </h2>
            <ol
                ref={listRef}
                className={cn(
                    'flex list-none',
                    chips
                        ? // `scrollbar-width: none` — a visible scrollbar under a 40px chip
                          // row is more chrome than content on a phone.
                          'w-full snap-x gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                        : 'flex-col',
                )}
            >
                {items.map((item, index) => {
                    const active = item.id === activeId
                    return (
                        <li
                            data-testid="legal-toc-item"
                            data-row-key={item.id}
                            key={item.id}
                            className={chips ? 'snap-start' : undefined}
                        >
                            <a
                                data-testid="legal-toc-link"
                                data-row-key={item.id}
                                href={`#${item.id}`}
                                aria-current={active ? 'true' : undefined}
                                className={cn(
                                    'flex no-underline transition-colors',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                                    chips
                                        ? // Pill, one line, never shrinks below its text —
                                          // the row scrolls instead of squeezing 14 chips in.
                                          // The Primary ramp inverts with the theme, so one
                                          // tint reads correctly in both modes.
                                          [
                                              'type-dense-emphasis h-[40px] items-center whitespace-nowrap rounded-[var(--radius-fill)] bg-(--background-subtle) px-3 text-(--text-title)',
                                              active && 'bg-(--primary-200)',
                                          ]
                                        : // The rail is quiet by default and marks the
                                          // current section with an accent edge plus full
                                          // contrast — the convention for documentation
                                          // sidebars, and a filled pill at 14 sections reads
                                          // as a menu of buttons instead of a contents list.
                                          // The transparent border is always there so
                                          // nothing shifts when it lights up.
                                          [
                                              'type-dense-emphasis items-baseline gap-2 border-s-2 border-transparent py-2 ps-3 text-(--text-body) hover:text-(--text-title)',
                                              active &&
                                                  'border-(--primary-500) text-(--text-title)',
                                          ],
                                )}
                            >
                                {numbered ? (
                                    <span
                                        className={cn(
                                            'shrink-0 tabular-nums',
                                            // Fixed column, end-aligned: without it "10."
                                            // is wider than "1." and every title from ten
                                            // on sits a few pixels further out.
                                            !chips && 'w-[22px] text-end text-(--text-placeholder)',
                                            active && !chips && 'text-(--primary-500)',
                                        )}
                                    >
                                        {index + 1}.
                                    </span>
                                ) : null}
                                {/* The rail wraps long titles over two lines rather than
                                    truncating them: "Changes and Updates to This Privacy
                                    Policy" is not a useful label as "Changes and Upda…". */}
                                {chips ? item.title : <span className="min-w-0">{item.title}</span>}
                            </a>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

/**
 * Keeps the lit chip on screen as the reader scrolls. Without it the row is only useful
 * for the first three sections — by "Your Rights" the active chip is far off to the side.
 *
 * `scrollIntoView` rather than arithmetic on `scrollLeft`, whose sign flips between LTR and
 * RTL. `inline: 'center'` centres the chip in the row; `block: 'nearest'` is what keeps it
 * from scrolling the page — the row is sticky, so it is always visible vertically and the
 * vertical part is a no-op.
 *
 * The `offsetParent` guard is not defensive tidiness, it is the bug: both orientations are
 * in the DOM at every width (one hidden by CSS, because the server cannot know the
 * viewport), and `scrollIntoView` on a `display: none` element measures as the document
 * origin and scrolls the page to the top. That silently broke every `/privacy#section`
 * deep link from md up.
 */
function useFollowActiveChip(activeId: string | null) {
    const ref = useRef<HTMLOListElement>(null)

    useEffect(() => {
        if (!activeId) return
        const chip = ref.current?.querySelector<HTMLElement>(`a[href="#${activeId}"]`)
        if (!chip?.offsetParent) return
        chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, [activeId])

    return ref
}

/**
 * Keeps the URL's `#section` in step with what the reader is actually on, so scrolling
 * ends up somewhere copy-pasteable — clicking a contents entry already did that, and the
 * two behaving differently is the inconsistency this removes.
 *
 * `replaceState`, never `pushState`: a document with 14 sections would otherwise bury the
 * page the reader came from under 14 back-button presses. `history.state` is passed
 * through because it is Next's router state — dropping it breaks back/forward.
 *
 * At the top of the page the hash is *cleared* rather than set, which covers both ends of
 * the same requirement: opening `/privacy` never rewrites the address bar with a section
 * the reader did not ask for (that would then be what they copy), and scrolling back up
 * from section 14 does not leave the URL claiming they are still down there.
 *
 * Only the rendered orientation writes. Both are mounted at every width with one hidden by
 * CSS, and `offsetParent` is how the hidden one knows to keep quiet.
 */
function useHashSync(activeId: string | null, atTop: boolean, ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!ref.current?.offsetParent) return
        const hash = atTop || !activeId ? '' : `#${activeId}`
        if (window.location.hash === hash) return
        window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}${hash}`,
        )
    }, [activeId, atTop, ref])
}

/** Used when a heading declares no `scroll-margin-top` for us to read. */
const FALLBACK_OFFSET = 76
/** Slack, so a heading parked exactly at its anchor offset counts as reached. */
const ACTIVE_SLACK = 8

/**
 * The id of the last heading scrolled past — read off the live layout on scroll rather
 * than from an IntersectionObserver.
 *
 * An observer is the obvious choice and the wrong one here: a `#hash` jump moves the
 * page in a single frame, so a heading can go from below the observed band to above it
 * without ever intersecting, and the callback simply never fires. Recomputing from
 * `getBoundingClientRect()` cannot miss a jump. It is one rAF-coalesced pass over ~14
 * headings per scroll frame, on a page whose only other job is being read.
 *
 * The line a heading has to cross is its own `scroll-margin-top` — the offset the host
 * already set for the sticky stack above it. Read live rather than cached, because it
 * changes at the md breakpoint and the alternative is a highlight that lags a resize.
 *
 * The one place "last heading past the line" is the wrong answer is the end of the
 * document. A policy's closing sections are short — 12, 13 and 14 all fit on one screen —
 * and the page has stopped scrolling, so their headings never reach the line and the
 * highlight stays stuck on 11 while the reader looks at 14. At the bottom the rule
 * therefore changes to the last heading that has *appeared*, which is what makes the tail
 * reachable at all.
 *
 * `atTop` rides along because this is already the one place that reads the scroll position
 * every frame, and `useHashSync` needs it to know when to drop the hash again. It is a
 * boolean that flips only when crossing 0, so it costs one render per crossing.
 */
function useActiveHeading(items: LegalTocItem[]) {
    const [state, setState] = useState<{ activeId: string | null; atTop: boolean }>({
        activeId: null,
        atTop: true,
    })
    // The items are static per document; keying the effect on the ids keeps it from
    // re-subscribing just because the parent handed down a new array.
    const ids = items.map(item => item.id).join(',')

    useEffect(() => {
        const list = ids ? ids.split(',') : []
        if (list.length === 0) return

        let frame = 0
        const update = () => {
            frame = 0
            let past: string | null = null
            let appeared: string | null = null
            let line: number | null = null
            // No early exit: `appeared` needs the headings *below* the line too, and 14
            // `getBoundingClientRect()` reads inside one rAF is not worth optimising.
            for (const id of list) {
                const element = document.getElementById(id)
                if (!element) continue
                // All the headings share one class, so one measurement covers the set.
                line ??=
                    (Number.parseFloat(getComputedStyle(element).scrollMarginTop) ||
                        FALLBACK_OFFSET) + ACTIVE_SLACK
                const { top } = element.getBoundingClientRect()
                if (top <= line) past = id
                if (top < window.innerHeight) appeared = id
            }
            const root = document.documentElement
            const atBottom = window.scrollY + window.innerHeight >= root.scrollHeight - 2
            // Above the first heading (intro copy) the first section is still the one
            // being read, so it stays lit rather than leaving the rail with nothing on.
            const activeId = (atBottom ? appeared : past) ?? past ?? list[0]
            const atTop = window.scrollY === 0
            setState(previous =>
                previous.activeId === activeId && previous.atTop === atTop
                    ? previous
                    : { activeId, atTop },
            )
        }
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update)
        }

        update()
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        return () => {
            if (frame) cancelAnimationFrame(frame)
            window.removeEventListener('scroll', schedule)
            window.removeEventListener('resize', schedule)
        }
    }, [ids])

    return state
}
