'use client'

import { useEffect } from 'react'

/** Drawn at 64 and scaled down by the browser to 16/32 — enough pixels for a round dot at either. */
const SIZE = 64
/** The dot: top-trailing, ~40% of the icon across, with a 4px transparent moat around it. */
const DOT_RADIUS = 13
const MOAT = 4
const DOT_CENTRE = { x: SIZE - DOT_RADIUS - 2, y: DOT_RADIUS + 2 }
/** `--badge-bg` in both themes; read live so a re-themed badge follows, this is the fallback. */
const FALLBACK_RED = '#ff3636'

/** Badged copies by source, so toggling the dot does not redraw. */
const drawn = new Map<string, string>()

/**
 * Put a red dot on the tab's favicon while `on` — the browser-chrome half of "you have something
 * unread", for a reader whose Tevi tab is in the background.
 *
 * ## How
 *
 * The page's own icon (`icon.svg` where the head has it, else the first `rel="icon"`) is drawn onto
 * a 64px canvas, a circle is cut **out** of its top-trailing corner (`destination-out`, so the moat
 * is transparent and works on a light tab strip and a dark one alike), and the dot is filled inside
 * it. The result goes onto every `link[rel~="icon"]` as a `data:` URL with `type="image/png"` —
 * `img-src` already allows `data:` (`shared/config/csp.ts`) — and each link's original `href` and
 * `type` are kept on `data-tevi-favicon*`, so turning it off, or unmounting, puts back exactly what
 * Next rendered.
 *
 * `revision` re-applies it: pass something that changes when the head may have been re-rendered
 * (the pathname), so a navigation that rewrites the links does not silently drop the dot.
 *
 * ## Limits, stated rather than worked around
 *
 * Safari does not repaint a favicon changed from script, so there this does nothing visible — and
 * nothing harmful. The icon is same-origin, so the canvas is never tainted; if it fails to load the
 * links are left alone.
 */
export function useFaviconBadge(on: boolean, revision?: unknown) {
    // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is a re-apply signal only.
    useEffect(() => {
        const links = iconLinks()
        if (links.length === 0) return
        for (const link of links) remember(link)

        if (!on) {
            restore(links)
            return
        }

        let cancelled = false
        const source = pickSource(links)
        badged(source).then(url => {
            if (cancelled || !url) return
            for (const link of iconLinks()) {
                remember(link)
                link.href = url
                // The data is a PNG whatever the link declared — a browser picks icons by `type`,
                // and an `image/svg+xml` link pointing at PNG bytes may be skipped or misread.
                link.type = 'image/png'
            }
        })
        return () => {
            cancelled = true
        }
    }, [on, revision])

    // Leaving the session (a webview, a sign-out that unmounts the shell) leaves no dot behind.
    useEffect(() => () => restore(iconLinks()), [])
}

function iconLinks(): HTMLLinkElement[] {
    return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
}

/** Keep what Next rendered — `href` and `type` — the first time a link is touched. */
function remember(link: HTMLLinkElement) {
    if (link.dataset.teviFavicon !== undefined) return
    link.dataset.teviFavicon = link.getAttribute('href') ?? ''
    link.dataset.teviFaviconType = link.getAttribute('type') ?? ''
}

function restore(links: HTMLLinkElement[]) {
    for (const link of links) {
        const original = link.dataset.teviFavicon
        if (original === undefined) continue
        link.setAttribute('href', original)
        const type = link.dataset.teviFaviconType
        if (type) link.setAttribute('type', type)
        else link.removeAttribute('type')
    }
}

/** The vector icon when the head has one — it draws crisp at 64 — else whatever comes first. */
function pickSource(links: HTMLLinkElement[]): string {
    // The *original* type: once badged, every link says `image/png`.
    const svg = links.find(link => link.dataset.teviFaviconType === 'image/svg+xml')
    return (svg ?? links[0]).dataset.teviFavicon || '/favicon.ico'
}

async function badged(source: string): Promise<string | null> {
    const cached = drawn.get(source)
    if (cached) return cached

    const image = new Image(SIZE, SIZE)
    image.src = source
    try {
        await image.decode()
    } catch {
        return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(image, 0, 0, SIZE, SIZE)

    // The moat: cut a transparent ring so the dot reads as its own shape on any tab colour.
    context.globalCompositeOperation = 'destination-out'
    context.beginPath()
    context.arc(DOT_CENTRE.x, DOT_CENTRE.y, DOT_RADIUS + MOAT, 0, Math.PI * 2)
    context.fill()

    context.globalCompositeOperation = 'source-over'
    context.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--badge-bg').trim() ||
        FALLBACK_RED
    context.beginPath()
    context.arc(DOT_CENTRE.x, DOT_CENTRE.y, DOT_RADIUS, 0, Math.PI * 2)
    context.fill()

    const url = canvas.toDataURL('image/png')
    drawn.set(source, url)
    return url
}
