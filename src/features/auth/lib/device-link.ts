/**
 * The string a QR sign-in code encodes, and the browser name printed inside it.
 *
 * The native app scans the code and shows a confirmation before it approves anything — "sign in to
 * Chrome at 203.0.113.4?" — so these three fields are not decoration. They are the **only** thing
 * standing between a user and approving a session for a code they were shown on someone else's
 * screen, which is the whole attack QR sign-in has. Hence a real browser name rather than the
 * literal `web` this app sends the API as `device_name`: "sign in to web?" tells the person
 * holding the phone nothing they can act on.
 *
 * Format is legacy's, exactly (`components/auth/btnQR`): a `device-link:token:` prefix, then
 * base64 of the JSON. It is a wire contract with the mobile scanner, so nothing here is ours to
 * tidy — including the `browser_name` key, which does not match the API's `device_name`.
 */

/** What the scanner is shown. `ip` is always present, empty when the origin could not say. */
interface DeviceLinkPayload {
    browser_name: string
    ip: string
    token: string
}

/**
 * The browser, by name, for a human reading a confirmation on their phone.
 *
 * Legacy gets this from `react-device-detect`, a dependency this app does not carry and would not
 * be worth 40KB for one string. `navigator.userAgentData` answers it properly where it exists
 * (Chromium), and the UA string covers the rest.
 *
 * **Order is the whole trick.** Every Chromium browser puts `Chrome` in its UA and Safari's
 * appears in all of them, so the specific brands have to be tested first or everything reads as
 * Chrome and then as Safari. Anything unrecognised falls back to `Web` rather than to a guess —
 * a wrong browser name on a confirmation screen is worse than a vague one, because it is the
 * thing being checked.
 */
export function browserName(): string {
    if (typeof navigator === 'undefined') return 'Web'

    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
        .userAgentData?.brands
    if (brands?.length) {
        /*
         * Chromium seeds this list with deliberate junk ("Not_A Brand", "Not)A;Brand" — the
         * spelling changes between releases) so that parsers cannot assume a fixed shape. It also
         * lists the engine (`Chromium`) beside the product (`Google Chrome`), and the product is
         * the one a person recognises.
         */
        const real = brands.map(b => b.brand).filter(brand => !/not.?a.?brand/i.test(brand))
        const product = real.find(brand => !/^chromium$/i.test(brand))
        if (product) return product.replace(/^Google /, '')
    }

    const ua = navigator.userAgent
    if (/Edg\//.test(ua)) return 'Edge'
    if (/OPR\/|Opera/.test(ua)) return 'Opera'
    if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
    if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox'
    // `CriOS` is Chrome on iOS, where the UA also says Safari.
    if (/CriOS\/|Chrome\//.test(ua)) return 'Chrome'
    if (/Safari\//.test(ua)) return 'Safari'
    return 'Web'
}

/**
 * `btoa` throws on anything outside Latin-1, and every field here reaches it from somewhere we do
 * not control — a UA string, a header, a server-minted token. Dropping the offending characters is
 * right rather than encoding around them: the scanner reads a fixed base64 contract, and a name
 * that loses an exotic character still identifies the browser, while a throw loses the whole code.
 */
const ascii = (value: string) => value.replace(/[^\x20-\x7E]/g, '')

/** The text to hand `qrImageUrl` — see the file header for why the shape is not ours to change. */
export function deviceLinkQrText({ token, ip }: { token: string; ip?: string | null }): string {
    const payload: DeviceLinkPayload = {
        browser_name: ascii(browserName()),
        // Always the key, empty when unknown — which is also what legacy sends before (and if)
        // its own IP lookup resolves.
        ip: ascii(ip ?? ''),
        token: ascii(token),
    }
    return `device-link:token:${btoa(JSON.stringify(payload))}`
}
