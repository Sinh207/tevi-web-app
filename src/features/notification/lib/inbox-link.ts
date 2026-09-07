import { env } from '@shared/config/env'
import { safeExternalUrl } from '@shared/lib/safe-url'
import {
    INBOX_CATEGORY,
    INBOX_MONEY_TYPE,
    INBOX_SYSTEM_TYPE,
    type InboxMessage,
} from '../api/types'

/**
 * Where a notification goes when it is pressed.
 *
 * ## Three outcomes, and the third is the one legacy gets wrong
 *
 * - **`internal`** — a URL on our own origin. Rendered as a `next/link`, so it is a client
 *   navigation, middle-clickable, copyable and announced as a link.
 * - **`external`** — a vetted `http(s)` URL somewhere else. A new tab with `rel="noreferrer"`.
 * - **`app-only`** — there is nowhere on the website to send the reader. The press opens
 *   `GetAppDialog`, which is the app's existing answer to "this exists only in the app" and is a
 *   real screen with store links and a QR, rather than legacy's `messagesContext.warning('Please
 *   download app to view detail')` — a toast that vanishes in four seconds and offers nothing.
 *
 * ## The two fixes to legacy's rule, both deliberate
 *
 * 1. **A Tevi URL is opened internally for every category.** Legacy's `system` and `default` arms
 *    call `window.open(clickableUrl, '_blank')` unconditionally, so a `system` notification
 *    pointing at `https://tevi.com/@ada` leaves the SPA for a page the app already has — a full
 *    document load into a new tab, losing the session's in-memory cache. Only the two arms that
 *    happen to call `navigateUrl()` check the origin. There is no reason for the category to decide
 *    whether our own origin is our own, so the origin check happens first, for all of them.
 * 2. **Our origin is `NEXT_PUBLIC_BASE_URL`, not a hard-coded pair.** Legacy tests
 *    `['https://tevi.com', 'https://tevi.dev'].includes(url.origin)`, so on any other deployment —
 *    a preview build, a staging host, `localhost` — every internal link becomes a new tab. The
 *    configured base is the app's own answer to "where am I", used the same way
 *    `features/payment/lib/return-url.ts` uses it, and the two legacy hosts are kept **alongside**
 *    it: a notification minted by production and read on staging still points at `tevi.com`, and
 *    following it in-app is right in the one case and harmless in the other.
 *
 * ## What is *not* changed
 *
 * The `money` category's `transaction` rows stay app-only. The destination is a native receipt
 * screen; there is no web route to send anybody to, and a `clickable_url` on such a row (legacy
 * ignores it) is not evidence that there is.
 */

export type InboxTarget =
    | { kind: 'internal'; href: string }
    | { kind: 'external'; href: string }
    /** Nowhere to go on the web. The press opens the get-the-app dialog. */
    | { kind: 'app-only' }

/**
 * Origins this app treats as its own — built **once**, at module load.
 *
 * It was a function, called from `resolveUrl`, which is called once per row *per render*: a `Set`
 * allocation and a `new URL()` parse per notification per paint, for a value that cannot change
 * (`NEXT_PUBLIC_BASE_URL` is inlined at build time).
 *
 * The configured base first, then legacy's two production hosts — see reason 2 above. Parsed
 * rather than compared as strings, so `https://tevi.com/` and `https://tevi.com` are the same
 * origin and `https://tevi.com.evil.example` is not: a `startsWith` check on the base URL would
 * accept that hostname, which is the classic version of this bug and the reason
 * `shared/lib/api/origins.ts` parses too.
 */
const INTERNAL_ORIGINS: ReadonlySet<string> = (() => {
    const origins = new Set<string>(['https://tevi.com', 'https://tevi.dev'])
    try {
        origins.add(new URL(env.NEXT_PUBLIC_BASE_URL).origin)
    } catch {
        // An unset or malformed base must not take the inbox down; the two literals still work.
    }
    return origins
})()

/**
 * The vetted `clickable_url`, split into ours and everyone else's.
 *
 * `safeExternalUrl` first, and it is not optional: `clickable_url` is chosen by whichever service
 * sent the notification, which makes it the same user-controlled `href` sink a creator's bio link
 * is — `javascript:` in one of these runs as the reader, on our origin, with their session.
 *
 * An internal target keeps the **path, query and hash** and drops the origin, because that is what
 * `next/link` wants: passing the absolute URL would make Next treat it as external and do a full
 * document load to our own site.
 */
function resolveUrl(raw: string | null | undefined): InboxTarget | null {
    const safe = safeExternalUrl(raw)
    if (!safe) return null

    let url: URL
    try {
        url = new URL(safe)
    } catch {
        return null
    }

    if (INTERNAL_ORIGINS.has(url.origin)) {
        // `|| '/'` because `https://tevi.com` alone parses to a pathname of `/` already, but a
        // pathname is never empty and an empty `href` would render a link to the current page.
        return { kind: 'internal', href: `${url.pathname}${url.search}${url.hash}` || '/' }
    }
    return { kind: 'external', href: safe }
}

/**
 * What pressing this notification should do.
 *
 * The order matters: the categories that are app-only *whatever* URL they carry are decided first,
 * so a `transaction` row with a stray `clickable_url` does not quietly become a link to somewhere
 * the reader cannot use.
 */
export function resolveInboxTarget(message: InboxMessage): InboxTarget {
    const payloadType = message.content?.payload?.type ?? null
    const url = message.content?.payload?.clickable_url ?? null

    switch (message.category) {
        case INBOX_CATEGORY.money:
            /*
             * `common` is an ordinary clickable row. Everything else in this category — legacy
             * names `transaction` and answers `default:` the same way — points at the native
             * transaction detail screen, which has no web equivalent.
             */
            if (payloadType !== INBOX_MONEY_TYPE.common) return { kind: 'app-only' }
            break

        case INBOX_CATEGORY.system:
            // An MCN invitation is accepted or rejected in the app; the website has no screen for
            // it. Legacy checks this only when there is no URL, which means an invitation that
            // *did* carry one would open somewhere that cannot answer it.
            if (payloadType === INBOX_SYSTEM_TYPE.mcnInvitation) return { kind: 'app-only' }
            break

        default:
            // `creator_activity`, `post`, and every category this client has not been told about:
            // the URL decides. A notification kind that ships after this build renders and opens
            // its own link rather than being dropped or refused.
            break
    }

    return resolveUrl(url) ?? { kind: 'app-only' }
}
