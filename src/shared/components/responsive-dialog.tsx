'use client'

import { useCompactViewport } from '@shared/hooks/use-compact-viewport'
import { htmlDir } from '@shared/i18n/settings'
import { useTranslation } from '@shared/i18n/use-translation'
import type { TestIdProps } from '@shared/lib/test-id'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Sheet, SheetContent } from '@shared/ui/sheet'
import type { ReactNode } from 'react'

/**
 * A popup that is a **card above the breakpoint and a screen below it** — legacy's
 * `matchUpSm ? <Dialog> : <SwipeableDrawer>`, as one component.
 *
 * ## Why the choice is a component rather than a branch at each call site
 *
 * Legacy writes that ternary out in every file that needs it, and the two halves drift: its
 * composer dialogs are `anchor='right'`, its notification filter is `anchor='bottom'`, and two of
 * them forget the height cap the third has. One shell means a call site says *what* the popup is
 * and never *which shape it takes at which width*.
 *
 * ## The remount on resize is real and it is legacy's too
 *
 * Crossing the breakpoint with a popup open swaps `Dialog` for `Sheet`, so the content unmounts and
 * remounts — a scroll position is lost, an uncommitted field would be too. That is what legacy's
 * ternary does as well, and it is a resize *while a popup is open*, which on a phone means an
 * orientation change. The alternative — one component styled two ways — cannot give the phone the
 * swipe-to-dismiss, which is the point of the sheet.
 *
 * Draft state is the caller's either way: every popup here keeps its state in the composer above
 * it, which is why the settings dialogs survive being closed and reopened at all.
 */
export function ResponsiveDialog({
    open,
    onOpenChange,
    children,
    className,
    nested,
    ...props
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
    /**
     * Classes for the **dialog** shape only.
     *
     * The sheet is full-bleed by definition — a width cap and a corner radius mean nothing on a
     * panel that fills the screen — so it takes none of this. A call site that needs to style both
     * shapes is a call site that wants two components.
     */
    className?: string
    /** Opened over another popup. See `DialogContent`'s `nested`. */
    nested?: boolean
} & TestIdProps) {
    const compact = useCompactViewport()
    const { currentLanguage } = useTranslation()

    if (compact) {
        return (
            <Sheet
                open={open}
                onOpenChange={onOpenChange}
                /*
                 * Swiping **towards the trailing edge** dismisses, which is the edge the panel
                 * entered from. Mirrored for RTL, where that edge is the left one.
                 */
                swipeDirection={htmlDir(currentLanguage ?? 'en') === 'rtl' ? 'left' : 'right'}
            >
                <SheetContent
                    direction={htmlDir(currentLanguage ?? 'en')}
                    data-testid={props['data-testid']}
                >
                    {children}
                </SheetContent>
            </Sheet>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent nested={nested} className={className} data-testid={props['data-testid']}>
                {children}
            </DialogContent>
        </Dialog>
    )
}
