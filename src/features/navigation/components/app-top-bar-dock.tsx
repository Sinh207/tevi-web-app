'use client'

import { useHideOnScroll } from '@shared/hooks/use-hide-on-scroll'
import { useMediaQuery } from '@shared/hooks/use-media-query'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { useEffect } from 'react'
import { AppTopBar } from './app-top-bar'

/**
 * The tab screens' global top bar **as it sits on a phone**: sticky, frosted, and out of the way
 * while the reader scrolls down — it slides up and off, and slides back the moment they scroll up.
 *
 * ## Glass with a progressive edge
 *
 * The surface colour at 72% over a `--blur-sm` backdrop, so the feed is still faintly there as it
 * passes under — the bar reads as part of the screen, not a lid on it. `--background-surface`, not
 * `--background`: below `md` every tab screen paints the surface full-bleed
 * (`docs/DESIGN_SYSTEM.md` §6), so a page-grey bar sat as a grey slab on a white feed. The glass
 * runs 16px past the bar's bottom edge and is masked to nothing over that run, so content
 * dissolves into the bar instead of being cut by a line. That layer is `pointer-events-none`, so
 * the 16px it overhangs never swallows a press meant for the row underneath.
 *
 * ## Hide on scroll — and what moves with it
 *
 * `useHideOnScroll` decides; this slides the whole dock up by its height **plus** that 16px
 * overhang, or a blurred sliver would be left at the top of the screen. 240ms on the app's arrival
 * curve (`shared/lib/motion.ts`); under reduced motion it simply appears and disappears.
 *
 * Headers that stick **under** the bar have to follow it, or a stuck "Following" header would hang
 * 60px below an empty strip once the bar is gone. So the dock publishes where its bottom edge is as
 * `--top-bar-inset` on `<html>` — `60px` shown, `0px` hidden — and a header parks at
 * `top-[var(--top-bar-inset,60px)]` with the same transition, so the two travel as one. The
 * property is set **only below `md`** and removed otherwise: from `md` this bar is hidden and the
 * screens' own bars (`PageBackBar`, also 60) never move, which is exactly what each caller's
 * fallback says.
 *
 * `focus-within` brings it back regardless: a keyboard reader tabbing into a hidden bar must see
 * where focus went.
 *
 * Disabled from `md` (where the bar is `md:hidden` anyway), so a desktop scroll does no work here.
 */
export function AppTopBarDock() {
    // `md` is 900 in this app (`globals.css`); the bar exists only below it.
    const belowMd = useMediaQuery('(max-width: 899.98px)')
    const hidden = useHideOnScroll({ enabled: belowMd, revealWithin: APP_BAR_HEIGHT })

    useEffect(() => {
        const root = document.documentElement
        if (belowMd) {
            root.style.setProperty('--top-bar-inset', hidden ? '0px' : `${APP_BAR_HEIGHT}px`)
        } else {
            root.style.removeProperty('--top-bar-inset')
        }
        return () => {
            root.style.removeProperty('--top-bar-inset')
        }
    }, [belowMd, hidden])

    return (
        <div
            data-viewport="md-down"
            data-hidden={hidden || undefined}
            className={cn(
                'sticky top-0 z-20 transition-[translate] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:hidden',
                hidden && '-translate-y-[calc(100%+16px)] focus-within:translate-y-0',
            )}
        >
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 -bottom-4 bg-(--background-surface)/72 backdrop-blur-(--blur-sm) backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]"
            />
            <div className="relative">
                <AppTopBar />
            </div>
        </div>
    )
}
