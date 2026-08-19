/**
 * Vetting a URL that came from someone else before it reaches an `href`.
 *
 * A channel's social links, custom link and mini-app URL are typed in by the creator and
 * returned verbatim by the API, so `href={link.url}` is a user-controlled sink. The attack
 * is not exotic: `javascript:fetch('/api/…')` in a bio link runs **as the visitor**, on our
 * origin, with their session, the moment they click. `data:text/html,…` is the same problem
 * wearing a different scheme. Neither is blocked by CSP's `script-src`, because navigating
 * to a `javascript:` URL is not loading a script — it is the browser evaluating the URL.
 *
 * So the rule is an allow-list of two schemes, not a deny-list of the ones we thought of.
 * Ported from legacy's `@utils/safeUrl.safeExternalUrl`, and named for what it returns:
 * `null` means "do not render a link at all", which callers must handle by rendering plain
 * text — not by falling back to the raw value.
 */

/** Only these may reach an `href`. Everything else — including `mailto:` and `tel:`, which
 *  no current call site needs — returns `null` until something asks for it deliberately. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * The vetted absolute URL, or `null`.
 *
 * A bare host (`tevi.com/ada`) is accepted and upgraded to `https://` — creators type links
 * without a scheme constantly, and dropping those links silently would look like a bug in
 * the profile rather than a rule. The upgrade happens **before** the protocol check, so it
 * cannot be used to smuggle anything: `new URL()` on `https://javascript:alert(1)` fails.
 */
export function safeExternalUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed === '') return null

    // A leading `//` is protocol-relative, not a scheme — `new URL('//evil.example')`
    // throws without a base, so it would be dropped rather than resolved. Treat it as a
    // host, which is what the creator meant.
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed.replace(/^\/+/, '')}`

    let url: URL
    try {
        url = new URL(candidate)
    } catch {
        return null
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null
    // A URL with no host is not somewhere to navigate (`https:?x=1` parses, and goes nowhere).
    if (!url.hostname) return null
    return url.toString()
}

/**
 * `true` when a URL is safe to link to. For callers that only need the decision — the
 * vetted string is what you want almost everywhere else, since `safeExternalUrl` also
 * normalises the value being rendered.
 */
export function isSafeExternalUrl(value: unknown): boolean {
    return safeExternalUrl(value) !== null
}
