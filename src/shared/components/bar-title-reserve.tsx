'use client'

import { useEffect, useState } from 'react'

/**
 * Keeps a bar's title **centred on the bar** however wide its side clusters are, by measuring them.
 *
 * Below `md` a bar with the Star pill after its back button (`PageBackBar starBalance`) has a leading
 * cluster ~150px wide, and its width follows the figure (`—`, `120,018`, `1.2M`). The title is absolutely
 * centred on the whole bar (product's rule: always centred), so it has to stay clear of the **wider**
 * of the two sides, on both sides. A hard-coded reserve is either wrong for a seven-character balance
 * (the title runs under the pill) or wasteful for a guest's `—`. So this measures both clusters with a
 * `ResizeObserver` and publishes the larger inset as `--bar-title-reserve` on the bar, which
 * `BAR_TITLE_RESERVE_BELOW_MD` turns into the title's `max-width`.
 *
 * A side is any direct child of the bar that is in the flow — the title (`position: absolute`) is
 * skipped by that test, so neither the DS slot names nor a marker are needed. Its inset is measured
 * from the bar edge it hugs, which makes the same arithmetic right under `dir="rtl"`.
 *
 * Before the first measurement — the server render — the CSS fallback in
 * `BAR_TITLE_RESERVE_BELOW_MD` applies, sized for the common case.
 *
 * ## A child, not a ref
 *
 * `AppBar` is a DS primitive whose props are `ComponentPropsWithoutRef<'header'>`, and `shared/ui`
 * changes only to track the DS. So this renders a hidden `<span>` *inside* the bar and measures its
 * `parentElement`. The span has no box,
 * so it is skipped as a side by the zero-width test below.
 */
export function BarTitleReserve() {
    const [node, setNode] = useState<HTMLSpanElement | null>(null)

    useEffect(() => {
        const bar = node?.parentElement
        if (!bar || typeof ResizeObserver === 'undefined') return

        const measure = () => {
            const box = bar.getBoundingClientRect()
            let reserve = 0
            for (const side of Array.from(bar.children)) {
                if (getComputedStyle(side).position === 'absolute') continue
                const r = side.getBoundingClientRect()
                if (r.width === 0) continue
                const fromStart = r.left - box.left
                const fromEnd = box.right - r.right
                // The cluster hugs whichever edge it is nearer; its inset is measured from there.
                const inset = fromStart <= fromEnd ? r.right - box.left : box.right - r.left
                reserve = Math.max(reserve, inset)
            }
            // 8px of air between the title and the nearer cluster, `AppBarCluster`'s own gap.
            bar.style.setProperty('--bar-title-reserve', `${Math.ceil(reserve) + 8}px`)
        }

        const observer = new ResizeObserver(measure)
        const observeAll = () => {
            observer.disconnect()
            observer.observe(bar)
            for (const side of Array.from(bar.children)) observer.observe(side)
            measure()
        }
        // A cluster that mounts later (actions that wait on data) has to be observed too.
        const children = new MutationObserver(observeAll)
        children.observe(bar, { childList: true })
        observeAll()
        return () => {
            observer.disconnect()
            children.disconnect()
        }
    }, [node])

    return <span ref={setNode} hidden />
}
