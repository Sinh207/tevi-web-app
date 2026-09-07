import type { MiniAppConfig } from './app-config'

/**
 * The `iframe`'s `src`, and the two attributes that decide what the frame may do.
 *
 * Pure on purpose: the URL contract is the part partners integrate against
 * (`docs/MINI_APP.md` §3), so it is stated once, tested, and read by nothing else.
 */

/** What the host knows about the reader when the frame mounts. */
export interface FrameContext {
    /** The signed-in account's id. Absent for a guest — the player is gated, so this is the odd case. */
    userId?: string | null
    /** The reader's *own* space slug, not the space they are looking at. Legacy sends `myChannel.slug`. */
    channelSlug?: string | null
    /** UI locale, as `lan`. */
    locale?: string | null
    /** The app version this device last saw, or `null` on a first run. See `app-version.ts`. */
    version?: string | null
    /** `utm_campaign` off the page that opened it, when there is one. */
    campaign?: string | null
}

/**
 * Build the frame URL, or `null` if the config's URL cannot be framed.
 *
 * Five parameters plus `app_id`, and each is **omitted when empty** rather than sent blank.
 * The contract document writes them all out (`?user=&slug=&lan=&v=&campaign=`) because a
 * native host assembles the string by concatenation; `searchParams.get()` cannot tell an
 * absent parameter from an empty one, so omitting is the same thing to the reader and keeps
 * the URL honest about what the host actually knows.
 *
 * ## Why the app's own query survives
 *
 * A mini app URL commonly carries its own parameters (`?table=4&mode=ranked`) and they are
 * the app's, not ours. `searchParams.set` merges into them; only a collision on one of our
 * six names overwrites, which is the correct precedence — `user` means the reader.
 *
 * ## `v` is the cache bust, and it is the only one
 *
 * The version is what the *device last saw*, so a normal load repeats the URL it used last
 * time and the browser may serve the frame from cache — which is the point. When the app
 * reports a new version over the bridge, that value is written to storage, put on the tab, and
 * the changed `v` makes this a different URL: the frame reloads and cannot be served the old
 * document. That is the web's equivalent of the native hosts wiping their WebView cache
 * (`docs/MINI_APP.md` §9); there is no API to clear a cross-origin frame's cache from here.
 */
export function buildMiniAppFrameUrl(
    config: MiniAppConfig,
    context: FrameContext = {},
): string | null {
    let url: URL
    try {
        url = new URL(config.url)
    } catch {
        return null
    }
    /*
     * The second protocol check, after `normalizeMiniAppConfig`. Not redundant: this function
     * is exported and a caller can reach it with a config assembled by hand, and the value it
     * returns lands in an `iframe src` — the one sink where `javascript:` executes as us with
     * no click. A guard whose failure mode is that severe is worth stating at the sink too.
     */
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const params: [string, string | null | undefined][] = [
        ['user', context.userId],
        ['slug', context.channelSlug],
        ['lan', context.locale],
        ['v', context.version],
        ['campaign', context.campaign],
        ['app_id', config.id],
    ]
    for (const [key, value] of params) {
        if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value)
    }
    return url.toString()
}

/**
 * `utm_campaign` off a page URL, or `null`.
 *
 * Read from the page that *opened* the app rather than passed in by each entry point: the
 * campaign is a property of how the visitor arrived, and threading it through four call sites
 * would mean four chances to forget it.
 */
export function campaignFromUrl(href: string | null | undefined): string | null {
    if (!href) return null
    try {
        return new URL(href).searchParams.get('utm_campaign') || null
    } catch {
        return null
    }
}

/**
 * The frame's `sandbox`, which is the feature's main containment control.
 *
 * Every token here is one legacy grants, and each is load-bearing for a real mini app:
 * `allow-scripts` (it is an application), `allow-forms` and `allow-modals` (sign-in flows and
 * `confirm`), `allow-popups` plus `allow-popups-to-escape-sandbox` (a payment or OAuth window
 * that must not inherit the sandbox to work).
 *
 * What is **absent** matters more than what is present, and none of it is an oversight:
 *
 * - **`allow-top-navigation`** — without it the frame cannot navigate the page it sits in.
 *   A third-party document that could replace the whole tab is a phishing primitive, and this
 *   is the single most valuable token to withhold.
 * - **`allow-downloads`** — the bridge has a `downloadMedia` action that the *host* performs,
 *   after vetting the URL. A frame that could start its own download would route around that.
 *
 * ## `allow-same-origin` is dropped for a same-origin app
 *
 * With `allow-scripts`, `allow-same-origin` on a document from **our** origin lets the frame
 * script the parent and reach `localStorage` — where every account's refresh token lives. The
 * whole sandbox becomes decorative, and worse than decorative, because it reads as a control.
 * For a cross-origin app the token merely means "keep your own origin", which is what a mini
 * app needs to have storage at all, so it stays.
 *
 * A same-origin mini app is not hypothetical: a Tevi-built app served from this domain, or a
 * dev pointing the player at `localhost`, both land here.
 */
export function miniAppFrameSandbox(
    frameUrl: string,
    hostOrigin: string | null | undefined,
): string {
    const tokens = [
        'allow-scripts',
        'allow-same-origin',
        'allow-forms',
        'allow-modals',
        'allow-popups',
        'allow-popups-to-escape-sandbox',
    ]
    if (isSameOrigin(frameUrl, hostOrigin)) {
        return tokens.filter(token => token !== 'allow-same-origin').join(' ')
    }
    return tokens.join(' ')
}

function isSameOrigin(frameUrl: string, hostOrigin: string | null | undefined): boolean {
    if (!hostOrigin) return false
    try {
        return new URL(frameUrl).origin === hostOrigin
    } catch {
        return false
    }
}

/**
 * The frame's `allow` — delegated permissions, and there is **one**.
 *
 * Legacy delegates `camera; microphone; clipboard-write`. The first two are dropped: a
 * permission delegated to a frame is requested *as this origin*, so the browser's prompt says
 * "tevi.com wants to use your camera" for something a third party asked for, and any of the
 * ten signed-in accounts' readers would be the one to grant it. Nothing needs them — the one
 * camera feature in the contract, `scanQRCode`, is a *host* action, and the web host answers
 * it as unsupported.
 *
 * `clipboard-write` stays: an app copying an invite code is common, harmless, and its absence
 * is a silently dead button inside the frame.
 */
export const MINI_APP_FRAME_ALLOW = 'clipboard-write'
