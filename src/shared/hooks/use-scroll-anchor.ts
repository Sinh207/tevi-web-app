'use client'

import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { WINDOW_ROW_SELECTOR, windowKeyOf } from './use-render-window'

/**
 * Bring a windowed list back to where the reader left it when it remounts — after a tab press,
 * not only after *Back*.
 *
 * ## Why the browser does not already do this
 *
 * *Back* is a `popstate`: the browser returns to the history entry it left and restores that
 * entry's `scrollY`. A tab press is a **push** — a new entry with no position recorded, and Next's
 * router scrolls a pushed page to the top. So Home → Following → *Back* lands where the reader
 * was, while Home → Following → Home lands at the top. This hook is the memory the second path
 * has no other source for.
 *
 * ## An anchor row, not a pixel
 *
 * What is remembered is **the first row on screen and how far its top edge sat from the
 * viewport's**, not `scrollY`. A feed changes while the reader is away: a refetch on return
 * prepends new posts, a blocked author's group disappears, the live strip above the list gains or
 * loses a row. Any of those moves every pixel offset below it, and a restored `scrollY` lands on
 * a different post. The row the reader was looking at is still the same row. A row that is gone
 * by then — removed, or past what the refetched first page holds — leaves the list at the top,
 * which is the honest answer.
 *
 * ## Why the restore is a microtask
 *
 * Next scrolls a pushed page to the top from a layout effect of its own, and that effect belongs
 * to a component **above** the page — so it runs after this one, in the same commit, and would
 * undo a restore made here. A microtask queued from this layout effect runs once the commit is
 * over and before the browser paints: after Next's scroll, with no frame of the top shown first.
 *
 * ## Memory, not storage
 *
 * Module scope, so it lasts as long as the tab and a reload starts at the top — which is what a
 * reload means. No account scope is needed: nothing here is the account's data, only a row key
 * that resolves to nothing in somebody else's feed.
 */
const anchors = new Map<string, { key: string; offset: number }>()

/** Within this of the top, the reader is "at the top" — remembered as nothing, not as row one. */
const AT_TOP_PX = 4

export function useScrollAnchor(
    /** Names one list's memory — two lists sharing it would land each other on a foreign row. */
    id: string,
    /** The list's container; its rows are the wrappers `useRenderWindow` keys. */
    listRef: RefObject<HTMLElement | null>,
    /** The rows are rendered. The restore waits for this, then runs once per mount. */
    ready: boolean,
) {
    const restored = useRef(false)

    useLayoutEffect(() => {
        if (!ready || restored.current) return
        restored.current = true
        const saved = anchors.get(id)
        if (!saved) return
        queueMicrotask(() => {
            const rows = listRef.current?.querySelectorAll<HTMLElement>(WINDOW_ROW_SELECTOR) ?? []
            const row = [...rows].find(candidate => windowKeyOf(candidate) === saved.key)
            if (!row) return
            window.scrollTo({ top: documentTop(row) - saved.offset, behavior: 'instant' })
        })
    }, [id, listRef, ready])

    useEffect(() => {
        if (!ready) return
        let frame = 0

        const record = () => {
            frame = 0
            const list = listRef.current
            if (!list) return
            if (window.scrollY <= AT_TOP_PX) {
                anchors.delete(id)
                return
            }
            const row = firstRowOnScreen(list.querySelectorAll<HTMLElement>(WINDOW_ROW_SELECTOR))
            const key = row && windowKeyOf(row)
            if (!row || !key) return
            anchors.set(id, { key, offset: documentTop(row) - window.scrollY })
        }

        // Once a frame at most: the last frame before the reader leaves is the one that counts.
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(record)
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [id, listRef, ready])
}

/**
 * The first row whose bottom edge is below the viewport's top — a binary search, since rows are
 * stacked in document order. A stood-down row still holds its height, so it counts like any other.
 */
function firstRowOnScreen(rows: NodeListOf<HTMLElement>): HTMLElement | null {
    let low = 0
    let high = rows.length - 1
    let found: HTMLElement | null = null
    while (low <= high) {
        const middle = (low + high) >> 1
        const row = rows[middle]
        if (documentTop(row) + row.offsetHeight > window.scrollY) {
            found = row
            high = middle - 1
        } else {
            low = middle + 1
        }
    }
    return found
}

/**
 * A row's top edge in document coordinates, **from layout, not from paint**.
 *
 * Not `getBoundingClientRect`, which includes transforms: a remounted feed's rows rise into place
 * (`RISE`, an 8px `translate`), so measuring one mid-animation lands the restore 8px off — the
 * amount the row still had to travel. `offsetTop` ignores transforms on the row and on every
 * ancestor, which is the position the row will settle at.
 */
function documentTop(element: HTMLElement): number {
    let top = 0
    for (
        let node: HTMLElement | null = element;
        node;
        node = node.offsetParent as HTMLElement | null
    ) {
        top += node.offsetTop
    }
    return top
}
