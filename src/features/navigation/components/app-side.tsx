'use client'

import { useEffect } from 'react'
import { useMenu } from '../providers/menu-state'
import { AppNavbar } from './app-navbar'
import { MenuDrawer } from './menu/menu-drawer'

/** The md breakpoint, in px — must track `--breakpoint-md` in globals.css. */
const MD = 900

/**
 * The rail and the account drawer it opens.
 *
 * **Desktop** follows the `My Star — Desktop` comp
 * (claude.ai/design/p/87e00715-ad01-43ad-9a23-20469b60276d): a panel pinned beside the
 * rail at 88, 372 wide, a hairline on its trailing edge, **no scrim** — the page stays
 * visible and usable — sliding on `transform` over 240ms `cubic-bezier(0.32, 0.72, 0, 1)`.
 * No scrim does not mean no dismiss: a press on the page closes it there too (below).
 *
 * **Mobile** has no comp, so it takes the ordinary phone-drawer shape rather than an
 * invented one: from the inline-start edge at the DS's authored 342 (capped so a strip
 * of page still shows), over a scrim, above the top bar and the tab bar. The scrim is
 * what makes it dismissable there — with the rail gone there is no visible toggle to
 * press again, so tap-outside and Escape are the only ways out.
 *
 * **A pushed screen takes the whole width on mobile** (`view !== 'root'`). At 342 the
 * root drawer is a panel you glance at and dismiss by tapping the strip beside it; a
 * pushed screen is somewhere you went — a settings list, a language picker — and on a
 * phone that is a screen, with its own App Bar and a back button as the way out. The
 * back button is why losing the tap-outside strip costs nothing here, and it is why the
 * root keeps the strip: it has no header to go back from. Desktop is unaffected — the
 * comp's 372 panel holds at every view.
 *
 * With no scrim on desktop this is a disclosure, not a dialog, so it stays a labelled
 * `<aside>` rather than `role="dialog"`. `inert` while closed keeps its 20-odd buttons
 * out of the tab order and the a11y tree without unmounting them, so the slide still runs.
 */
export function AppSide() {
    const { open, close, view, pop } = useMenu()

    /**
     * Escape unwinds one level, the way the App Bar's back button does — only the root
     * screen has nothing left to pop, and there it dismisses the drawer.
     *
     * It used to close outright from any screen, which threw away the drawer as well as
     * the screen and left nowhere to land. That matters most on a phone, where a pushed
     * screen is full-bleed: there is no strip of page to tap, so this and the back button
     * are the only ways back.
     */
    useEffect(() => {
        if (!open) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (view === 'root') close()
            else pop()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open, close, view, pop])

    /**
     * A press anywhere outside dismisses it — on the phone that is the scrim below, and on
     * desktop, where there is no scrim, it is the page itself. Same gesture either way, so
     * the panel never has to be dismissed by finding the control that opened it.
     *
     * Three things are not "outside":
     *
     *   · the drawer, obviously — including a press that starts on a row and drags;
     *   · the toggles (`aria-controls="app-menu-drawer"` — the rail's Menu and Language
     *     entries, the top bar's). Without this, closing here on `pointerdown` and the
     *     button's own `click` toggling right after would reopen it on every press;
     *   · every press while a dialog is up. The sign-out confirm is raised *from* the open
     *     drawer and portals to the top of the document, so its popup, and its backdrop
     *     more so, both read as outside. While something is layered over the drawer the
     *     drawer is not what a press is aimed at, so it stays put and the dialog handles it.
     *
     * `pointerdown` rather than `click`: a press that lands on the page should dismiss
     * immediately, and a `click` never arrives at all if the press ends as a drag or a
     * selection. Targets already detached from the document (a row that removed itself
     * between press and handler) are ignored — they can't be tested for containment.
     */
    useEffect(() => {
        if (!open) return
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target
            if (!(target instanceof Element) || !target.isConnected) return
            if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
            if (target.closest('[data-slot="menu-drawer"], [aria-controls="app-menu-drawer"]'))
                return
            close()
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [open, close])

    // Only the scrimmed mobile drawer locks the page; the desktop panel is meant to be
    // used with the page still scrolling behind it.
    useEffect(() => {
        if (!open || window.matchMedia(`(min-width: ${MD}px)`).matches) return
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previous
        }
    }, [open])

    return (
        <>
            {/* Above the drawer (z-30): the closed panel is parked at `--rail-width - 372`, so
                its trailing edge lands exactly on the rail's — without the rail on top,
                a panel-width slab of surface would sit over the rail at rest. */}
            <div className="sticky top-0 z-40 hidden h-[var(--window-height)] shrink-0 md:flex print:md:hidden">
                <AppNavbar />
            </div>

            {/* aria-hidden with a click handler: the scrim is a redundant pointer
                affordance and Escape (bound above) is the keyboard path. */}
            <div
                data-slot="menu-scrim"
                aria-hidden="true"
                onClick={close}
                className={[
                    'fixed inset-0 z-[59] bg-(--overlay-default) transition-opacity duration-200 md:hidden print:hidden',
                    open ? 'opacity-100' : 'pointer-events-none opacity-0',
                ].join(' ')}
            />

            <div
                // `aria-controls` on both toggles points here: the drawer is this frame,
                // not whichever of its screens happens to be showing.
                id="app-menu-drawer"
                data-slot="menu-drawer"
                data-open={open ? 'true' : undefined}
                inert={!open}
                className={[
                    // The frame clips and does not scroll — each screen in the stack is its
                    // own scroll container, so a short pushed screen cannot be dragged past
                    // its end by the 2000px root sitting behind it, and the root keeps its
                    // scroll position while you are away. See `DrawerScreen`.
                    'fixed inset-y-0 start-0 z-[60] overflow-hidden',
                    // A pushed screen is full-bleed on the phone; the root is the 342 panel
                    // with a strip of page left to tap. The width transitions with nothing —
                    // the swap happens while the drawer is already still, and animating it
                    // would put a 240ms reflow of 23 rows in front of the tap.
                    view === 'root' ? 'w-[342px] max-w-[calc(100%-56px)]' : 'w-full max-w-none',
                    // Over the page, under the rail. It has to clear the sub-pages' own
                    // sticky bars (`z-20`) — those are page chrome, and a header painting
                    // over the panel swallows the panel's header — while still passing
                    // behind the rail (`z-40`) on the way in and out.
                    'md:start-(--rail-width) md:z-30 md:w-[372px] md:max-w-none',
                    // The trailing hairline separates the panel from the page beside it.
                    // Full-bleed there is no page beside it, so it would only eat a pixel
                    // of the inline-end edge — but the desktop panel always has one.
                    view === 'root' ? 'border-e border-e-(--separator-default)' : '',
                    'md:border-e md:border-e-(--separator-default)',
                    'bg-(--background-surface)',
                    'transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                    /*
                     * Print drops it entirely. `-translate-x-full` hides the closed drawer on
                     * screen, but a print engine lays `fixed` boxes out on the first page and
                     * the transform no longer takes it off the sheet — so a strip of the
                     * drawer's rows printed down the inline-start edge of every `(main)`
                     * page, the policies included.
                     */
                    'print:hidden',
                    open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
                ].join(' ')}
            >
                <MenuDrawer />
            </div>
        </>
    )
}
