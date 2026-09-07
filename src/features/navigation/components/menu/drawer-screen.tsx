'use client'

import { AppBar, AppBarCluster, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { LeftBar } from '@shared/ui/left-bar'
import { type ReactNode, useEffect, useRef } from 'react'
import { useMenu } from '../../providers/menu-state'

/**
 * The drawer's screen-stack machinery: one layer, and the shell a pushed layer wears. Nothing here
 * knows what the drawer's rows *are* — that is `lib/menu-rows.ts` — or which screen is showing,
 * which is `providers/menu-state.tsx`.
 *
 * The pick-one list two of those layers hold used to be here as well; it is
 * `shared/components/picker-list.tsx` now, because `/my-wallet` offers the same currency choice and
 * a screen feature cannot import the shell's.
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
             * action on the edge, title centred on the bar at a Title weight. Full-bleed
             * (`-mx-4`, cancelling the drawer's own 16) and sticky, so the header holds
             * while the list scrolls under it; the opaque background is what keeps the
             * list from showing through, since there is no hairline.
             *
             * ## Centred by flex, not by `AppBarTitle`'s absolute centring
             *
             * `AppBarTitle` with no `flow` is `position: absolute` on the bar's own centre,
             * which means **nothing pushes it aside**: a title wider than the bar runs
             * straight under the back button. That is not an edge case here — the panel is
             * 372 on desktop and the phone's own width when pushed, and
             * `menu_privacy_security` is 296px of Vietnamese at T1.
             *
             * So the three parts sit in flow instead. The two `flex-1 basis-0` sides share
             * the free space, which puts the title on the bar's centre exactly as the
             * absolute version did while it fits; when it does not, the empty end side
             * gives its share up — the leading one cannot shrink past its button — and the
             * title takes that room rather than overlapping. `min-w-0` is what lets it
             * shrink at all and `truncate` is the floor: a phone under ~330 still
             * ellipsises, which is the honest outcome for a 60px bar.
             *
             * `PageBackBar` answers the same overlap with a `max-w` reserve because its bar
             * carries a trailing cluster of its own. This one is a lone back button, and a
             * symmetric reserve would spend 64px holding an edge that stays empty — which
             * is exactly the 64px the long locales need.
             */}
            <AppBar className="sticky top-0 z-10 -mx-4 w-auto bg-(--background-surface)">
                <AppBarCluster className="flex-1 basis-0">
                    {/*
                     * A ghost Button, not `App Bar/Button`. The App Bar action's fill is
                     * `--background-topbar-action` — 85% of a near-white, made to sit on
                     * content or media, where it reads as a raised frosted disc. On the
                     * drawer's white surface the fill vanishes and only its faint
                     * `#e0e0e0` ring survives, so the control reads as an empty outline
                     * next to a bold title. Ghost is the surface control:
                     * `--button-ghost-bg` is `#ffffff00`, so nothing paints until hover,
                     * and the glyph runs at Text - Title, matching the title's weight.
                     * Kept circular so it still speaks the same shape language as the
                     * rail and the top bar.
                     */}
                    <Button
                        data-testid="navigation-menu-back"
                        variant="ghost"
                        size="large"
                        iconOnly
                        aria-label={backLabel}
                        onClick={onBack}
                        className="rounded-full"
                    >
                        <Icon name="arrow-left" size={20} className="rtl:-scale-x-100" />
                    </Button>
                </AppBarCluster>
                {/*
                 * `AppBarTitleText` on its own, without the `AppBarTitle` box around it:
                 * that box exists to stack a title over a subtitle and to do the absolute
                 * centring this bar has just given up, and it is `flex-none` with 16 of
                 * padding — both of which fight the layout above.
                 *
                 * T2 (20) rather than the `large` size's T1 (24). Legacy's own header for
                 * these screens is 18 on a phone and 21 on desktop, and T1 does not fit the
                 * 372 panel in half the locales — Vietnamese wants 296 where the bar can
                 * offer 272, so the screen would open on an ellipsis every time. `size`
                 * stays `large` because the override has to outrank *some* size class, and
                 * T1 is the one `type-title-t2-bold` follows in `globals.css`.
                 */}
                <AppBarTitleText
                    as="h1"
                    size="large"
                    className="type-title-t2-bold min-w-0 truncate text-center"
                >
                    {title}
                </AppBarTitleText>
                {/*
                 * The end side of the balance: empty, and `aria-hidden` so it is nothing to
                 * a screen reader. It exists only so the title's two neighbours weigh the
                 * same, which is what centres the title on the *bar* rather than on the
                 * free space beside the button.
                 */}
                <div aria-hidden className="flex-1 basis-0" />
            </AppBar>
            {children}
        </LeftBar>
    )
}
