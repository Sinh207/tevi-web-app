'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useEnterTransition } from '../hooks/use-enter-transition'
import { useMiniApp } from '../hooks/use-mini-app'
import { useViewport } from '../hooks/use-viewport'
import { useWindowDrag } from '../hooks/use-window-drag'
import { useWindowResize } from '../hooks/use-window-resize'
import { defaultRect, WINDOW_ASPECT_RATIO } from '../lib/window-geometry'
import { useMiniAppStore } from '../store/mini-app-store'
import { MiniAppFrame } from './mini-app-frame'
import { MiniAppMinimizedPill } from './mini-app-minimized-pill'
import { MiniAppTabBar } from './mini-app-tab-bar'
import { ResizeHandles } from './resize-handles'

/**
 * The player: a floating, draggable, resizable window of tabbed mini apps — full-screen on a phone.
 *
 * ## ⚠ This surface is **not** in the design system
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`. Figma draws no window chrome, no
 * tab strip and no floating player; the DS `Dialog` is a 370px centred card and `Sheet` is an
 * edge-anchored panel, and neither is a resizable window that has to keep a phone's aspect ratio
 * because the thing inside it was drawn for a phone.
 *
 * So the geometry here is **legacy's**, ported number for number (420×730, 10px radius, 34px tabs),
 * and everything that *can* come from the DS does: the tokens, the type utilities, the sprite, the
 * `Loader`, the `Dialog` the top-up confirmation is built from, and the `ActionMenu` behind the ⋯
 * menu. When design draws this, the numbers in `lib/window-geometry.ts` and the two chrome
 * primitives (`ChromeButton`, the tab pill) are what change; nothing else moves.
 *
 * ## Why a window and not a route
 *
 * A mini app is a *guest* on whatever page the reader is on. Navigating to `/mini-app/…` would
 * unmount the page they were reading, put the app in the history stack, and make "go back" ambiguous
 * between the app's own history and the browser's. It also could not survive being minimised. This
 * is the same call `useRequireAuth` makes about sign-in: gate and overlay, never navigate.
 *
 * ## `z-40`, under the dialogs
 *
 * Every dialog in the app is `z-50` (`shared/ui/dialog.tsx`), and three of them can be raised *by*
 * a mini app: the sign-in dialog, the Star purchase sheet and this feature's own top-up
 * confirmation. A player above them would put an application on top of the question it just asked.
 */
export function MiniAppWindow() {
    const { t } = useTranslation()
    const tabs = useMiniAppStore(state => state.tabs)
    const activeTabId = useMiniAppStore(state => state.activeTabId)
    const rect = useMiniAppStore(state => state.rect)
    const isMinimized = useMiniAppStore(state => state.isMinimized)
    const isMaximized = useMiniAppStore(state => state.isMaximized)
    const syncViewport = useMiniAppStore(state => state.syncViewport)
    const switchTab = useMiniAppStore(state => state.switchTab)
    const closeTab = useMiniAppStore(state => state.closeTab)
    const closeAll = useMiniAppStore(state => state.closeAll)
    const minimize = useMiniAppStore(state => state.minimize)
    const maximize = useMiniAppStore(state => state.maximize)
    const restore = useMiniAppStore(state => state.restore)
    const { openCenter } = useMiniApp()

    const { viewport, isCompact } = useViewport()
    /**
     * Below `md` the window is the screen, so drag and resize are not merely hidden — the handlers
     * are never attached, and the resize zones are not rendered. A hidden control that still reacts
     * to a touch is how a phone ends up dragging a full-screen window a few pixels sideways.
     */
    const canResizeWindow = Boolean(viewport) && !isCompact
    const isFullScreen = isCompact || isMaximized
    /**
     * Maximised on a desktop — the one shape where handing the app the whole area looks broken. Not
     * a phone (which is narrower than the ratio and should fill), and not the floating window (which
     * already *is* the ratio). See the stage below.
     */
    const isLetterboxed = isMaximized && !isCompact

    const { isDragging, dragHandlers } = useWindowDrag({ enabled: canResizeWindow && !isMaximized })
    const { isResizing, startResize, resizeHandlers } = useWindowResize({
        enabled: canResizeWindow && !isMaximized,
    })

    /** The window arrives rather than blinking into existence. See the hook. */
    const { entered, reducedMotion } = useEnterTransition()

    /**
     * Focus the window when it opens.
     *
     * It is not modal and focus is not trapped (see the `role` below), but it is mounted at the
     * **end** of the document — after every row, card and link on the page — so without this a
     * keyboard reader who pressed Open would have to tab through the whole page to reach the
     * application that just covered it. Focusing the container puts the strip's controls and the
     * frame one `Tab` away, and leaves `Shift+Tab` going back to the page, which is what a
     * non-modal window should do.
     *
     * `preventScroll` because the container is `position: fixed`: without it Safari scrolls the
     * document behind the player to "reveal" an element that was never out of view.
     */
    const windowRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        windowRef.current?.focus({ preventScroll: true })
    }, [])

    /*
     * Establish the rect before the first paint and keep it on screen afterwards. A layout effect
     * rather than an effect: with `rect` still `null` the window would paint at the default for one
     * frame and then jump to where the reader left it.
     */
    useLayoutEffect(() => {
        if (viewport) syncViewport(viewport)
    }, [viewport, syncViewport])

    /*
     * Lock the page behind a full-screen player. Scoped to that case on purpose: a *floating*
     * window leaves the page usable, and locking the body there would freeze a feed the reader can
     * still see and reach.
     */
    const shouldLockScroll = tabs.length > 0 && !isMinimized && isFullScreen
    useEffect(() => {
        if (!shouldLockScroll) return
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previous
        }
    }, [shouldLockScroll])

    if (tabs.length === 0) return null

    const active = tabs.find(tab => tab.id === activeTabId) ?? tabs[tabs.length - 1]

    if (isMinimized) {
        return (
            <MiniAppMinimizedPill
                name={active.config.name}
                hiddenCount={tabs.length - 1}
                onRestore={restore}
                onClose={closeAll}
            />
        )
    }

    // One frame with no measurement. See `useViewport` — guessing here is a wrong first paint in
    // whichever of the two layouts the guess did not match.
    if (!viewport) return null
    const box = rect ?? defaultRect(viewport)

    return (
        <div
            ref={windowRef}
            /*
             * `dialog` with `aria-modal={false}`: it is a window, not a modal — the page behind a
             * floating player is still readable and reachable, and claiming otherwise would tell a
             * screen reader to ignore the rest of the document. Focus is deliberately not trapped
             * for the same reason.
             */
            role="dialog"
            aria-modal={false}
            aria-label={t('miniapp_player', { name: active.config.name })}
            /* Focusable but not in the tab order: this is a landing spot for the effect above, not
               a stop a keyboard user has to pass through on the way somewhere else. */
            tabIndex={-1}
            className={cn(
                /*
                 * **No `overflow-hidden` here**, and that is the whole reason this is two elements.
                 * The rounded corners need clipping, but the resize zones stick 4px *outside* the
                 * box — that is the half of an 8px target a pointer can comfortably hit — and a clip
                 * on this element removes it from hit-testing as well as from paint, leaving a 4px
                 * strip. Legacy clips here and has exactly that. So this element positions and the
                 * surface below it clips.
                 */
                'fixed top-0 z-40 outline-none',
                /*
                 * `scale`, not `transform` — Tailwind v4's `scale-*` set the `scale` property, and
                 * naming `transform` here would fight the `translate()` the drag writes inline.
                 * That is the same trap `shared/ui/dialog.tsx` records, from the other side.
                 */
                !reducedMotion && 'transition-[opacity,scale] duration-200 ease-out',
                entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
            )}
            style={{
                /*
                 * **`left`, not `inset-inline-start`.** `x` is a physical coordinate — it is fed
                 * to `translate()`, which is physical in both writing directions — so anchoring
                 * the box logically would put the window's origin on the right in an RTL locale
                 * and then translate it further right, off the screen. Same reasoning as
                 * `resize-handles.tsx`, which has the longer note.
                 */
                left: 0,
                ...(isFullScreen
                    ? { width: '100vw', height: '100dvh' }
                    : {
                          /*
                           * `translate`, not `left`: a transform is composited, so a drag does not
                           * relayout the frame beneath it — which for a third-party application
                           * means it is not asked to reflow 60 times a second.
                           */
                          transform: `translate(${box.x}px, ${box.y}px)`,
                          width: box.width,
                          height: box.height,
                      }),
            }}
        >
            {/* The visual box: everything that has to be clipped by the corner radius. */}
            <div
                className={cn(
                    'absolute inset-0 flex flex-col overflow-hidden bg-(--background-subtle) shadow-2xl',
                    /*
                     * A 1px edge on the floating window, the same one `shared/ui/dialog.tsx` gives
                     * its popup. Without it the window's own right and bottom edges are white
                     * content against a white page, defined by the shadow alone — legible on a
                     * grey feed, nearly invisible on a plain background. Full-screen needs none:
                     * its edges are the viewport's.
                     */
                    !isFullScreen && 'border border-(--separator-default)',
                )}
                style={{ borderRadius: isFullScreen ? 0 : 10 }}
            >
                <MiniAppTabBar
                    tabs={tabs}
                    activeTabId={active.id}
                    isFullScreen={isFullScreen}
                    canResizeWindow={canResizeWindow}
                    onSelect={switchTab}
                    onCloseTab={closeTab}
                    onAddTab={openCenter}
                    onMinimize={minimize}
                    onToggleMaximize={() =>
                        isMaximized ? restore() : viewport && maximize(viewport)
                    }
                    onCloseAll={closeAll}
                    dragHandlers={dragHandlers}
                />

                {/*
                 * The stage the app sits on.
                 *
                 * ## Why a maximised window does not hand the app the whole area
                 *
                 * A mini app is drawn for a phone. Maximised on a desktop the content area is
                 * ~2000×1050, so an app that centres its own narrow column ends up as a strip of
                 * content in a field of its own background — and when that background matches the
                 * host's, the whole thing reads as a broken page rather than as a phone-shaped app
                 * in a window. Legacy letterboxes for exactly this reason
                 * (`aspectRatio: '9/16'` on its iframe).
                 *
                 * So **only** in the case that is actually wrong — maximised on a desktop — the
                 * frame is constrained to the window's own phone ratio and centred, on a surface
                 * that is visibly the host's rather than the app's. The floating window already
                 * *is* that ratio, and a phone is narrower than it, so both fill: letterboxing a
                 * 390px screen would put bars above and below an app that should own the display
                 * (which legacy, applying it unconditionally, does).
                 */}
                {isLetterboxed ? (
                    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-(--background-subtle)">
                        <div
                            /*
                             * `height: 100%` plus `aspectRatio` gives width = height × ratio with no
                             * measurement, and `max-w-full` keeps it inside a very short viewport.
                             * The ratio comes from the geometry module rather than a Tailwind
                             * `aspect-[…]` literal, so the window and its stage cannot drift apart.
                             *
                             * Full height and no padding, so maximising never makes the app
                             * *smaller* than the floating window it came from — the floating window
                             * is already viewport-height, so a stage with an inset would have lost
                             * that trade. Which also means the two side hairlines are the whole
                             * frame: an app whose background matches the stage still has an edge,
                             * and it is a column on a surface rather than a card floating on one.
                             */
                            className="relative h-full max-w-full overflow-hidden border-(--separator-default) border-x bg-(--background-listing)"
                            style={{ aspectRatio: WINDOW_ASPECT_RATIO }}
                        >
                            {tabs.map(tab => (
                                <MiniAppFrame
                                    key={`${tab.id}:${tab.reloadKey}`}
                                    tab={tab}
                                    isActive={tab.id === active.id}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="relative flex-1 overflow-hidden rounded-t-xl bg-(--background-listing)">
                        {tabs.map(tab => (
                            /*
                             * `reloadKey` in the key, so a reload discards the element.
                             * `lib/tabs.ts` explains why that is the only sound reload for a
                             * cross-origin frame.
                             */
                            <MiniAppFrame
                                key={`${tab.id}:${tab.reloadKey}`}
                                tab={tab}
                                isActive={tab.id === active.id}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/*
             * A pointer shield over the frames while the window is being moved or resized.
             * Without it the first pointer move hands the gesture to the frame's own document and
             * the drag dies the moment the cursor crosses into the app.
             */}
            {(isDragging || isResizing) && (
                <div
                    aria-hidden
                    className="absolute inset-0 z-10"
                    style={{ cursor: isDragging ? 'grabbing' : undefined }}
                />
            )}

            {canResizeWindow && !isMaximized && (
                <ResizeHandles onStart={startResize} handlers={resizeHandlers} />
            )}
        </div>
    )
}
