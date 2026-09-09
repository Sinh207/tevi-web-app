'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useRef } from 'react'

/**
 * A **one-shot intent carried by the URL** — read it, act on it once, then take it back out of the
 * address bar without navigating.
 *
 * The shape a deep link into a page takes when the link's job is to *open something*: a donation
 * dialog, a membership sheet, a settings screen. It is not page state — nothing about the page
 * depends on it after the thing has opened — so leaving it in the URL would mean a reload, a copied
 * link or a back button re-opening a dialog the reader already dismissed.
 *
 * ```ts
 * const { intent, consume } = useUrlIntent(parseChannelIntent, channelBasePath)
 *
 * useEffect(() => {
 *     if (intent !== 'direct_donation' || !canOpen) return
 *     if (!consume()) return
 *     open()
 * }, [intent, canOpen, consume, open])
 * ```
 *
 * ## Generic on purpose
 *
 * `shared/` may not import `features/`, and the vocabulary this reads — which words are actions,
 * which sub-paths spell them — belongs to a feature. So the two pure functions are **passed in**
 * from the call site (`@features/channel/routes`), and this file holds only the part that is the
 * same everywhere: reading the URL, guarding against a second fire, and rewriting the address.
 *
 * ## `history.replaceState`, not `router.replace`
 *
 * Both reasons are `use-channel-tab.ts`'s, and they hold identically here. A Next navigation would
 * re-run the **server component** of a route that reads `params` — paying a round trip to remove a
 * path segment — and it would put the dismissed intent into history, so the back button would mean
 * "re-open that dialog" instead of "leave this page". Next syncs its navigation hooks with native
 * history calls, so the URL and this hook's own reading of it both update and nothing else does.
 *
 * ## `consume()` answers **whether you got it**, and that is what makes it safe
 *
 * It returns `true` exactly once and `false` for ever after, so the caller's `open()` sits behind
 * it rather than beside it. Gating on the *URL* having changed would not be enough: React's
 * development double-effect fires every effect twice, and an effect whose dependency list contains
 * a callback the parent re-creates each render re-fires on its own — so "the address bar no longer
 * says `direct-donation`" is a race, and two dialogs is what losing it looks like. This is the
 * guard each call site was keeping by hand, made impossible to forget.
 */
export function useUrlIntent<T extends string>(
    /** The URL's action word, or `null`. Pure; must not depend on anything but its two arguments. */
    parse: (pathname: string, search: URLSearchParams) => T | null,
    /** The URL to leave behind once the intent is spent, or `null` to leave the address alone. */
    clean: (pathname: string) => string | null,
): { intent: T | null; consume: () => boolean } {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const spent = useRef(false)

    /*
     * The ref is read during render, which is not a pure render in the strict sense. It is a
     * **monotonic latch** — it only ever goes unspent → spent — so a render React discards and
     * retries can see it flip, and the later value is the correct one. What it buys is defence in
     * depth: an effect that gates on `intent` alone, without checking `consume()`, still stops.
     * The pure alternative is `useState` beside the ref (the ref is still needed for synchronous
     * idempotency inside `consume`), which is a second source of truth and an extra render for a
     * value nothing paints.
     */
    const intent = spent.current ? null : parse(pathname, searchParams)

    const consume = useCallback(() => {
        if (spent.current) return false
        spent.current = true

        const base = clean(pathname)
        // Not a URL this parser recognises: the intent is still the caller's to act on, the address
        // just has nothing to take back out of it.
        if (base === null) return true

        /*
         * The rest of the query is the reader's — `?tab=media`, a campaign's `utm_*` — and only the
         * action word is being spent, so the string is rebuilt rather than dropped. `action` is
         * legacy's spelling of this intent and the one parameter that is ours to remove.
         */
        const params = new URLSearchParams(searchParams.toString())
        params.delete('action')
        const query = params.toString()
        window.history.replaceState(null, '', query ? `${base}?${query}` : base)
        return true
    }, [clean, pathname, searchParams])

    return { intent, consume }
}
