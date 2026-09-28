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

export function SheetContent({
    className,
    children,
    direction = 'ltr',
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
    }) {
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
                    'fixed inset-0 z-50 bg-overlay-default',
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
                    /*
                     * Full bleed, pinned to the trailing edge **of the viewport part**, which is
                     * what carries the `fixed inset-0` box. `h-full` rather than `100dvh` for the
                     * same reason: the container is already exactly the visual viewport, so the
                     * address-bar trap `dialog.tsx` records is handled one level up.
                     */
                    'absolute inset-y-0 end-0 flex h-full w-full flex-col',
                    'bg-background-subtle outline-none',
                    /*
                     * The enter and exit transform is **logical**: `translate-x-full` moves right
                     * in LTR and left in RTL, so the panel always leaves by the edge it came from.
                     */
                    'transition-transform duration-250 ease-out',
                    'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
                    'rtl:data-[starting-style]:-translate-x-full rtl:data-[ending-style]:-translate-x-full',
                    className,
                )}
                {...props}
            >
                {/*
                 * The grab area, along the leading edge — the edge the panel would be pushed back
                 * towards. It is `Drawer.SwipeArea`'s job to know what counts as a dismissing drag;
                 * this only says where the reader may start one.
                 */}
                <BaseDrawer.SwipeArea
                    swipeDirection={direction === 'rtl' ? 'left' : 'right'}
                    className="absolute inset-y-0 start-0 w-4"
                />
                {children}
            </BaseDrawer.Popup>
            </BaseDrawer.Viewport>
        </BaseDrawer.Portal>
    )
}
