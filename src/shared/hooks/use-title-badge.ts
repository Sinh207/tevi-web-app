'use client'

import { useEffect } from 'react'

/** Past this the prefix reads `(99+)` — the same ceiling as the bell's badge. */
const MAX_SHOWN = 99

/** The prefix this hook writes, and only that: `(3) `, `(99+) `. */
const PREFIX = /^\(\d+\+?\) /

/**
 * Prefix the tab's title with an unread count — `(3) Home · Tevi` — while `count` is above zero.
 *
 * The favicon's dot (`useFaviconBadge`) says *that* something is waiting; this says *how much*, and
 * unlike the dot it works in Safari, which does not repaint a favicon changed from script.
 *
 * ## Next owns the title; this only decorates it
 *
 * Every navigation, Next writes the route's own `<title>` from its `metadata`. Writing the prefix once
 * would last until the next page, so a `MutationObserver` watches `<head>` for the title changing
 * (Next may replace the element as well as its text) and puts the prefix back on the new one. Only
 * a prefix this hook wrote is ever removed (`PREFIX`), so a route title that happens to start with a
 * bracket is left alone, and setting the same text again is skipped — which is also what stops the
 * observer from answering its own write forever.
 *
 * At zero, or when the hook unmounts (leaving the session), the bare title is put back.
 */
export function useTitleBadge(count: number) {
    useEffect(() => {
        const prefix = count > 0 ? `(${count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}) ` : ''

        const apply = () => {
            const bare = document.title.replace(PREFIX, '')
            const next = `${prefix}${bare}`
            if (document.title !== next) document.title = next
        }

        apply()
        const observer = new MutationObserver(apply)
        observer.observe(document.head, { subtree: true, childList: true, characterData: true })
        return () => {
            observer.disconnect()
            document.title = document.title.replace(PREFIX, '')
        }
    }, [count])
}
