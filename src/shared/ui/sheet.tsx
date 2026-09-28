'use client'

import { Drawer as BaseDrawer } from '@base-ui/react/drawer'
import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'

/**
 * Sheet — a popup that is a **screen**, for viewports too narrow to hold a card.
 *
 * ## Why this exists now, when six files say it does not
 *
 * `notification-filter-dialog.tsx`, `star-purchase-dialog.tsx`, `add-card-dialog.tsx`,
 * `ledger-detail-dialog.tsx`, `donate-dialogs.tsx` and `create-tab-bar-fab.tsx` each record the
 * same thing: legacy opens a `SwipeableDrawer` below the breakpoint, this app has no sheet, and
 * *"reproducing a drag-to-dismiss sheet would mean inventing the interaction"*.
 *
 * That objection was right and it no longer holds. `@base-ui/react` — the primitive layer
 * `shared/ui` already builds on — ships `Drawer`, with the swipe, the snap points and the focus
 * management done. Nothing below is invented; it is the library's drawer wearing this app's tokens.
 *
 * ⚠ **The DS's own sheet was not readable.** `preview/sheet.html` ships `.tevi-bottom-sheet`
 * (Figma `Sheet/_Overlay` 40:9676) but `components.css` truncates at the 256 KiB read cap partway
 * through it, and this session could not reach the design project at all. So the geometry here is
 * **legacy's**, not the DS's: `SwipeableDrawer anchor='right'`, `width: 100%` — a full-screen panel
 * sliding in from the trailing edge, which is what the post composer's popups use. It is not the
 * DS bottom sheet, and it should not be treated as one: when the DS sheet becomes readable, a
 * *bottom* variant belongs here beside this one rather than replacing it.
 *
 * ## Trailing edge, not the bottom
 *
 * The two are different components in legacy and it is not an inconsistency. A bottom sheet is for
 * a short list of choices; these popups are **screens** — six radio rows with hints, a collection
 * list, a whole post preview — and a screen enters from the side, keeps its own app bar and its own
 * back control. `DialogScreenHeader` already draws that bar, which is why the call sites need
 * nothing but a different shell.
 *
 * RTL comes free: `insetInlineEnd` and a swipe direction chosen from the document's direction.
 */

export const Sheet = BaseDrawer.Root

/**
 * Keyboard-aware focus and scroll handling, for a **bottom sheet with form fields**.
 *
 * Base UI's own words. Re-exported here rather than imported from `@base-ui/react` at the call
 * site, so every part of this component comes from one module — `responsive-dialog.tsx` decides
 * *when* it applies, this decides *what* it is.
 */
export const VirtualKeyboardProvider = BaseDrawer.VirtualKeyboardProvider

/** Which edge the panel comes from. See `SheetContent`'s `side`. */
export type SheetSide = 'end' | 'bottom'

export function SheetContent({
    className,
    children,
    direction = 'ltr',
    side = 'end',
    nested,
    ...props
}: BaseDrawer.Popup.Props &
    TestIdProps & {
        /**
         * The document's direction, so the panel enters from the **trailing** edge either way.
         *
         * Passed rather than read, because `Drawer.Root` needs `swipeDirection` and the Root is
         * the caller's — so the caller is where the two have to agree.
         */
        direction?: 'ltr' | 'rtl'
        /**
         * Which edge it comes from, and it decides the shape as much as the direction.
         *
         * - `end` — a **screen**: full width, full height, entering from the trailing edge. For a
         *   popup that replaces what you were looking at (the composer's settings, a preview).
         * - `bottom` — a **sheet**: full width, **as tall as its content** up to a cap, entering
         *   from below with rounded top corners and a grab handle. For a popup that sits over what
         *   you were doing and hands it back.
         *
         * Not interchangeable: a bottom sheet the height of the screen is a screen that animates
         * from the wrong edge, and a side panel sized to its content is a card that has lost its
         * margins.
         */
        side?: SheetSide
        /**
         * This sheet opens **over another popup**.
         *
         * Exactly what it means on `DialogContent`, and for the same measured reason: the backdrop
         * still renders (it is the hit target an outside press needs) but paints nothing, because
         * two `--overlay-default` scrims compound to about 0.94 and the popup behind all but
         * disappears. On the composer that defeats the arrangement's whole point — the draft is
         * meant to stay visible behind the settings opened over it.
         */
        nested?: boolean
    }) {
    const bottom = side === 'bottom'
    return (
        <BaseDrawer.Portal>
            {/*
             * `forceRender` for the reason `dialog.tsx` spells out at length: a nested popup that
             * renders no backdrop has no hit target, so pressing outside it reaches the parent's
             * inert scrim and nothing closes. A sheet over the composer is exactly that case.
             */}
            <BaseDrawer.Backdrop
                forceRender
                data-testid={subTestId(props['data-testid'], 'overlay')}
                className={cn(
                    'fixed inset-0 z-50',
                    nested ? 'bg-transparent' : 'bg-overlay-default',
                    'transition-opacity duration-200',
                    'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
                )}
            />
            {/*
             * ⚠ **Required, and its absence is silent in the UI and loud only in the console.**
             *
             * Base UI: *"<Drawer.Popup> expected to be rendered within <Drawer.Viewport>. Omitting
             * the viewport disables drawer swipe handling and touch scroll locking."* The panel
             * looks perfectly correct without it and simply cannot be swiped away — which is the
             * whole reason this is a drawer and not a full-screen dialog.
             *
             * It is the positioning container, so the edge pinning lives here and the popup fills
             * it.
             */}
            <BaseDrawer.Viewport className="fixed inset-0 z-50">
            <BaseDrawer.Popup
                className={cn(
                    'absolute flex flex-col bg-background-subtle outline-none',
                    'transition-transform duration-250 ease-out',
                    bottom
                        ? [
                              /*
                               * ⚠ **`h-auto`, not `h-full`** — the sheet is as tall as what is in
                               * it. `max-h` is the ceiling rather than the height, so a short
                               * popup is short and a long one scrolls inside itself; the body is
                               * the `overflow-y-auto` child the caller already has.
                               *
                               * 90dvh rather than 100: the strip of page left showing above it is
                               * what says *this is over something*, which is the whole difference
                               * between a sheet and a screen.
                               */
                              'inset-x-0 bottom-0 h-auto max-h-[90dvh] w-full',
                              'rounded-t-[16px]',
                              'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
                          ]
                        : [
                              /*
                               * Full bleed, pinned to the trailing edge **of the viewport part**,
                               * which is what carries the `fixed inset-0` box. `h-full` rather
                               * than `100dvh` for the same reason: the container is already
                               * exactly the visual viewport, so the address-bar trap `dialog.tsx`
                               * records is handled one level up.
                               */
                              'inset-y-0 end-0 h-full w-full',
                              /*
                               * The enter and exit transform is **logical**: `translate-x-full`
                               * moves right in LTR and left in RTL, so the panel always leaves by
                               * the edge it came from.
                               */
                              'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
                              'rtl:data-[starting-style]:-translate-x-full rtl:data-[ending-style]:-translate-x-full',
                          ],
                    className,
                )}
                {...props}
            >
                {bottom ? (
                    /*
                     * The grab handle. It is the affordance that says the panel can be pulled
                     * down, and on a bottom sheet it is the only one — a side panel has a whole
                     * edge to grab, this has a bar.
                     */
                    <span
                        aria-hidden="true"
                        className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-(--separator-default)"
                    />
                ) : null}
                {/*
                 * Where a dismissing drag may start: the leading edge for a side panel, the top
                 * strip — the handle's own band — for a bottom sheet. It is `Drawer.SwipeArea`'s
                 * job to know what counts as a dismissing drag; this only says where.
                 */}
                <BaseDrawer.SwipeArea
                    swipeDirection={bottom ? 'down' : direction === 'rtl' ? 'left' : 'right'}
                    className={
                        bottom
                            ? 'absolute inset-x-0 top-0 h-6'
                            : 'absolute inset-y-0 start-0 w-4'
                    }
                />
                {children}
            </BaseDrawer.Popup>
            </BaseDrawer.Viewport>
        </BaseDrawer.Portal>
    )
}
