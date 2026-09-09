'use client'

import { useEffect } from 'react'

/**
 * Puts the space's web app manifest **into `<head>`**, which is the only place a browser looks.
 *
 * ## Why `generateMetadata`'s `manifest` field is not enough — measured, not assumed
 *
 * Next 15.2+ **streams metadata**: `serveStreamingMetadata` is on for every normal user agent
 * (`base-server.js` decides it per request; only the `htmlLimitedBots` list gets the blocking,
 * in-head variant), so a route whose metadata resolution awaits anything has its whole metadata
 * block emitted *after* `</head>` — in the body. On `/@ada` that is the entire block: no `<title>`,
 * no favicon, no manifest link in the head at all. Most of those tags work anyway, because
 * browsers are lenient about metadata in the body.
 *
 * `rel="manifest"` is the one that is not. Chromium reads the manifest by walking the **children
 * of `<head>`** and nothing else, so a body link is invisible to it. Verified through Chrome's own
 * parser over CDP (`Page.getAppManifest`): `/` and `/premium` — whose metadata resolves before the
 * head is flushed — report their manifest URL, and `/@ada`, whose `generateMetadata` awaits the
 * channel fetch, reports **none**. The link is right there in the DOM; Chrome does not care.
 *
 * That is not a regression this feature introduced: the *site* manifest was equally invisible on
 * those routes before, because the block streams either way. It is the reason a per-space manifest
 * needs one line of client code to exist at all.
 *
 * ## What this does instead
 *
 * On mount it **takes over the head's manifest link** — the one arriving from `/`'s file
 * convention after a client-side navigation, say — or creates one if the head has none, and
 * restores what it found on unmount. So a reader who leaves a space stops advertising that space's
 * manifest, and there is never a second `<link rel="manifest">` competing with the first (browsers
 * use whichever comes first, which is not a coin worth flipping).
 *
 * Imperative rather than a rendered `<link>` on purpose. React *can* hoist a link into the head,
 * but only along the client-mount path — an element that was server-rendered is hydrated **where
 * it stands**, which is exactly the body position that started this. An effect is the one path
 * whose result does not depend on which of those two happened.
 *
 * The trade is that a manifest exists only after hydration. That costs nothing real: the install
 * prompt is offered on engagement, long after, and no crawler reads a manifest.
 */
export function ChannelManifestLink({ href }: { href: string }) {
    useEffect(() => {
        const head = document.head
        const existing = head.querySelector<HTMLLinkElement>('link[rel="manifest"]')
        // Captured before the first write, so the restore below cannot re-apply our own value.
        const previous = existing?.getAttribute('href') ?? null

        const link = existing ?? document.createElement('link')
        if (!existing) {
            link.rel = 'manifest'
            head.appendChild(link)
        }
        link.setAttribute('href', href)

        return () => {
            // Ours to remove; anyone else's to hand back the way it was found.
            if (existing) {
                if (previous === null) link.removeAttribute('href')
                else link.setAttribute('href', previous)
            } else {
                link.remove()
            }
        }
    }, [href])

    return null
}
