'use client'

import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { LeftBar, LeftBarList, LeftBarRow } from '@shared/ui/left-bar'
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'
import { useMenu } from '../../providers/menu-state'

/**
 * The drawer's screen-stack machinery: one layer, the shell a pushed layer wears, and the
 * pick-one list two of those layers hold. Nothing here knows what the drawer's rows *are* —
 * that is `lib/menu-rows.ts` — or which screen is showing, which is `providers/menu-state.tsx`.
 */

/**
 * One layer of the drawer's screen stack.
 *
 * All screens stay mounted, parked off-screen, rather than being swapped in and out. That
 * is what buys the animation for free in CSS: a screen that mounts already at its final
 * transform has nothing to transition *from*, so an enter animation on a freshly-mounted
 * layer needs either `@starting-style` or a rAF flip — and both of those are bookkeeping
 * around a stack that is a few cheap lists long.
 *
 * The push is the platform gesture, not an invention: the incoming screen comes in from
 * the inline-end edge, the one you left slides a quarter of the way toward the start and
 * dims under it, so the motion says "on top of" rather than "instead of". Reversed on the
 * way back, which is `active` flipping the other way — nothing here knows the direction.
 *
 * Each layer is its own scroll container (the frame in `app-side.tsx` clips instead of
 * scrolling). Two things follow, both of them the native behaviour: a pushed screen
 * cannot be scrolled past its own end just because the root behind it is 2000px tall, and
 * the root keeps its scroll position while you are away.
 *
 * `inert` on the parked layers is what keeps ~40 off-screen buttons out of the tab order
 * and the a11y tree without unmounting them — the same trick the frame uses while closed.
 */
export function DrawerScreen({
    active,
    depth,
    children,
}: {
    active: boolean
    /** `root` slides aside and dims; `pushed` comes in over it from the end edge. */
    depth: 'root' | 'pushed'
    children: ReactNode
}) {
    const { open } = useMenu()
    const ref = useRef<HTMLDivElement>(null)
    const was = useRef({ active, open })

    useEffect(() => {
        const previous = was.current
        was.current = { active, open }

        /*
         * Focus follows a navigation *within* an open drawer — a push or a pop.
         *
         * Without this it goes nowhere: making a screen inert blurs whatever was focused
         * inside it and the browser drops focus to `<body>`, so the screen that just
         * arrived is never announced and Tab restarts from the top of the document. Moving
         * it onto the screen itself is what a native push does, and it is why the container
         * carries `tabIndex={-1}` (programmatically focusable, never a tab stop).
         *
         * `preventScroll` because this container *is* the scroll container: focusing it
         * would otherwise be a scroll-to-top, undoing the root's kept position on a pop.
         *
         * Guarded on the drawer having *already* been open, so neither the first paint nor
         * opening the drawer takes focus off whatever the visitor was using — only
         * navigating inside it does.
         */
        if (open && previous.open && active && !previous.active) {
            ref.current?.focus({ preventScroll: true })
        }

        /*
         * A reopened drawer starts at the top, for the same reason it starts at the root
         * screen: it is a fresh visit, and coming back to a menu scrolled half way down
         * reads as the app having lost its place. Popping back from a pushed screen
         * deliberately does *not* reset — that is the root keeping its place while you
         * were away, which is the whole point of per-screen scrolling.
         */
        if (open && !previous.open && ref.current) ref.current.scrollTop = 0
    }, [active, open])

    return (
        <div
            ref={ref}
            tabIndex={-1}
            data-slot="drawer-screen"
            data-active={active ? 'true' : undefined}
            inert={!active}
            className={[
                'absolute inset-0 overflow-y-auto overscroll-contain outline-none',
                /*
                 * `translate`, not `transform`: Tailwind v4's `translate-x-*` set the
                 * `translate` property, so a transition list naming `transform` compiles,
                 * applies, and animates nothing — the layers would jump while the opacity
                 * politely faded. (`transition-transform` covers it because v4 expands that
                 * one to `transform, translate, scale, rotate`; a hand-written list does not.)
                 *
                 * Same 240ms curve as the frame's own slide, so a push that lands while the
                 * drawer is still opening reads as one movement rather than two.
                 */
                'transition-[translate,opacity] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                'motion-reduce:transition-none',
                /*
                 * The incoming screen casts on the one it covers. The layer is exactly the
                 * frame, so this is only ever visible mid-slide — settled, the shadow falls
                 * outside the frame and the frame clips it. Costs one paint during the
                 * transition and is the whole difference between "sliding over" and
                 * "sliding next to".
                 */
                depth === 'pushed' ? 'shadow-2xl' : '',
                active
                    ? 'translate-x-0 opacity-100'
                    : depth === 'root'
                      ? '-translate-x-1/4 opacity-0 rtl:translate-x-1/4'
                      : 'translate-x-full opacity-0 rtl:-translate-x-full',
            ].join(' ')}
        >
            {children}
        </div>
    )
}

/**
 * The shell every pushed sub-screen wears: the drawer's own frame with the top padding
 * traded for a sticky header that holds while the list scrolls under it.
 */
export function DrawerSubScreen({
    title,
    onBack,
    backLabel,
    children,
}: {
    title: string
    onBack: () => void
    backLabel: string
    children: ReactNode
}) {
    return (
        <LeftBar
            as="aside"
            aria-label={title}
            className="w-full min-h-full gap-4 bg-(--background-surface) pt-0"
        >
            {/*
             * The DS `title-center` App Bar rather than a hand-stacked row: leading
             * action on the edge, title absolutely centred on the bar at Title T1 —
             * which is what `AppBarTitle` does with no `flow`. Full-bleed (`-mx-4`,
             * cancelling the drawer's own 16) and sticky, so the header holds while
             * the list scrolls under it; the opaque background is what keeps the
             * list from showing through, since there is no hairline.
             */}
            <AppBar className="sticky top-0 z-10 -mx-4 w-auto bg-(--background-surface)">
                {/*
                 * A ghost Button, not `App Bar/Button`. The App Bar action's fill is
                 * `--background-topbar-action` — 85% of a near-white, made to sit on
                 * content or media, where it reads as a raised frosted disc. On the
                 * drawer's white surface the fill vanishes and only its faint
                 * `#e0e0e0` ring survives, so the control reads as an empty outline
                 * next to a 24px bold title. Ghost is the surface control:
                 * `--button-ghost-bg` is `#ffffff00`, so nothing paints until hover,
                 * and the glyph runs at Text - Title, matching the title's weight.
                 * Kept circular so it still speaks the same shape language as the
                 * rail and the top bar.
                 */}
                <Button
                    variant="ghost"
                    size="large"
                    iconOnly
                    aria-label={backLabel}
                    onClick={onBack}
                    className="rounded-full"
                >
                    <Icon name="arrow-left" size={20} className="rtl:-scale-x-100" />
                </Button>
                <AppBarTitle size="large">
                    <AppBarTitleText as="h1" size="large">
                        {title}
                    </AppBarTitleText>
                </AppBarTitle>
            </AppBar>
            {children}
        </LeftBar>
    )
}

export type PickerOption = {
    value: string
    label: string
    /**
     * The 32px mark in the leading slot — a flag, a glyph. Never a coloured DS tile: a
     * picker row is a choice, not a destination, and the tiles are the drawer's way of
     * telling its destinations apart.
     */
    mark: ReactNode
}

/**
 * One choice out of a list, applied on press — Appearance and Language are both this.
 *
 * It is a real `radiogroup`, which is a promise about the keyboard as much as about the
 * announcement: arrow keys move within the group, Home/End jump to its ends, and only one
 * row is in the tab order at a time (the checked one, or the first when nothing is
 * checked) so Tab steps *over* the group rather than through every option. Declaring the
 * roles without that behaviour is worse than not declaring them — a screen reader would
 * say "use the arrow keys" about arrows that do nothing.
 *
 * **Arrows move focus without selecting**, which is the variant the APG allows when
 * activating an option has side effects, and here it has: the language picker closes the
 * drawer on pick, so a selection-follows-focus group would shut itself the moment you
 * pressed Down. Space and Enter select, via the row's own `<button>`.
 *
 * Up/Down only, not Left/Right: the list runs vertically, and the horizontal pair would
 * have to flip under RTL for the eight-language screen that is the most likely place to
 * meet Arabic.
 *
 * `LeftBarRow` renders a `<button>` and the roles are layered on top rather than swapping
 * in a native `<input type="radio">` — that would bring its own hit target and focus ring
 * into a row whose geometry is the design system's.
 */
export function PickerList({
    label,
    options,
    value,
    onSelect,
}: {
    label: string
    options: readonly PickerOption[]
    /** Undefined until the choice is known — the roving tab stop falls to the first row. */
    value: string | undefined
    onSelect: (value: string) => void
}) {
    const checked = options.findIndex(option => option.value === value)
    const tabStop = checked === -1 ? 0 : checked

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // `currentTarget` is the list, so the rows come from the DOM rather than from a
        // ref array — `LeftBarRow` is a plain function component and forwards no ref.
        const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
        const from = rows.indexOf(document.activeElement as HTMLElement)
        if (from === -1) return

        let to: number
        switch (event.key) {
            case 'ArrowDown':
                to = (from + 1) % rows.length
                break
            case 'ArrowUp':
                to = (from - 1 + rows.length) % rows.length
                break
            case 'Home':
                to = 0
                break
            case 'End':
                to = rows.length - 1
                break
            default:
                return
        }
        // Only once a key we handle has matched, so the drawer's own scrolling and the
        // rest of the page keep theirs.
        event.preventDefault()
        rows[to]?.focus()
    }

    return (
        <LeftBarList bordered role="radiogroup" aria-label={label} onKeyDown={handleKeyDown}>
            {options.map((option, i) => {
                const active = option.value === value
                return (
                    <LeftBarRow
                        key={option.value}
                        role="radio"
                        aria-checked={active}
                        tabIndex={i === tabStop ? 0 : -1}
                        // The same Primary 50 wash the drawer uses for "you are here"; the
                        // ramp inverts, so one tint works in both modes.
                        className="aria-checked:bg-(--primary-50)"
                        rule={i > 0}
                        title={option.label}
                        brand={option.mark}
                        chevron={false}
                        trailing={
                            active ? (
                                <Icon name="check" size={20} className="text-(--text-link)" />
                            ) : undefined
                        }
                        onClick={() => onSelect(option.value)}
                    />
                )
            })}
        </LeftBarList>
    )
}
