/**
 * The native app's JS bridge — **the wire, and nothing else.**
 *
 * A `/app/*` screen the mobile app opens is framed by a WKWebView / Android WebView that exposes a
 * message handler, and the page talks to it by name. This is the third implementation of a contract
 * this app did not design: every action string below is one a shipped iOS or Android build already
 * matches on, and none of them may be invented here.
 *
 * ## Why a screen talks to the host at all
 *
 * Because on this path **the host owns the session**. The account, its saved cards and its money live
 * on the native side; the webview is a renderer the app opens for one job and dismisses. So the
 * account-scoped calls are *asked of the app*, not made by us — and the screen has no bearer, which is
 * why `/app/[channelSlug]/membership/[packageId]` mounts no `AuthProvider`. Public reads (the tier,
 * the Stripe publishable key) are still ordinary HTTP: they need no session and going through the
 * bridge for them would be a round trip through another process to fetch something anyone can fetch.
 *
 * ## The wire
 *
 * ```
 * out  iOS      webkit.messageHandlers.TeviJSInterface.postMessage({ action, options })
 * out  Android  TeviJSInterface.jsCall(action, options)
 * in   both     TeviJS.onJSCall(<base64 or JSON>)          ← the host calls into our global
 * ```
 *
 * `options` is a **JSON string** on both transports. That is the contract, not an accident of
 * legacy's `serialize()`.
 *
 * Inbound is why this module installs a `window.TeviJS` global at all: the host has no handle on our
 * modules and calls a name. Legacy ships that global as a `<script>` the page injects at runtime
 * (`../tevi-web-app/public/js/membership-sdk.js`); here it is installed on first use, from bundled
 * code that the CSP nonce already covers, so there is no script tag to fail to load and no
 * `sdkLoaded` state to be stuck `false`.
 *
 * ## Replies are correlated **by action name**, and that is a real constraint
 *
 * The host echoes only `action` — there is no request id in the protocol — so at most one call per
 * action can be outstanding. Legacy stores one callback per action and lets a second call overwrite
 * it, which silently hands the first caller's reply to the second. Here a second call while one is in
 * flight is **refused** (`in-flight`), because a payment path must not resolve a promise with another
 * request's answer. The settle poll is sequential, so it never meets this.
 *
 * ## Everything that can hang, times out
 *
 * Legacy builds a `{ error_code: -14, error_message: 'request Timeout!' }` object and then never uses
 * it — no timer is ever started. That is the direct cause of its checkout's infinite spinner: the only
 * `setIsLoading(false)` lives inside a reply that may never arrive. Every call here has a deadline and
 * rejects with `timeout`, so the screen can say so.
 *
 * ## Not `features/mini-app`'s protocol
 *
 * Same family of names, opposite direction. That module is the host for a third-party page **this app
 * frames**; here we *are* the framed page. Two files, no shared abstraction to get wrong.
 */

/**
 * Every action this app sends its native host, as the string the app matches on.
 *
 * `membership-sdk.js` declares three more (`createMyPaymentMethod`, `deleteMyPaymentMethod`,
 * `setAsDefaultMyPaymentMethod`) for its Add-card drawer. They are not here because the card form on
 * this app's checkout adds a method through Stripe's own `PaymentElement` against the PaymentIntent
 * that is already open — there is no SetupIntent to mint and no card list to mutate.
 */
export const NATIVE_ACTIONS = {
    /** Open a URL in the app's own browser chrome. Fire-and-forget. */
    executeLink: 'action.executeLink',
    /** Mint the PaymentIntent for a membership tier. Replies with the checkout envelope. */
    membershipCheckout: 'action.user.billy.membershipCheckout',
    /** The checkout reached a verdict; the app dismisses the screen. Fire-and-forget. */
    membershipResult: 'action.user.billy.membershipResult',
    /** The account's saved cards. Replies with an array of Stripe payment methods. */
    myPaymentMethods: 'action.user.paymee.myPaymentMethods',
    /** Ask whether a PaymentIntent has settled. Replies; `PM0003` means "not yet". */
    stripeCallback: 'action.user.paymee.createStripeCallback',
} as const

export type NativeAction = (typeof NATIVE_ACTIONS)[keyof typeof NATIVE_ACTIONS]

/** What the app is told a membership checkout came to. Legacy's own two strings. */
export type MembershipResultStatus = 'succeeded' | 'failed'

/**
 * One reply, normalised.
 *
 * The host's frame is `{ action, data }` where `data` is **either an object or a JSON string**
 * depending on the platform — and legacy cannot agree with itself about which is which: one file
 * parses when `isAndroid`, another parses unless `isIOS`. On the two real platforms those happen to
 * coincide; anywhere else one of them throws. The shape is checked here instead of the platform
 * guessed, so there is no `react-device-detect` on this path and no third behaviour off a device.
 */
export interface NativeReply {
    /** The host says the operation succeeded. Anything less is `false`. */
    success: boolean
    /** The backend's code, e.g. `PM0003`. `null` when the host sent none. */
    code: string | null
    /** The host's own sentence. `null` when it sent none. Shown only where a 4xx body would be. */
    message: string | null
    /** The payload, untouched — parsed by whoever asked for it. */
    data: unknown
}

/** Why a call could not produce a reply. Distinct from a reply that says `success: false`. */
export type NativeFailureKind =
    /** No host is listening — a desktop browser, or an app build without the handler. */
    | 'unavailable'
    /** The host took the message and never answered. */
    | 'timeout'
    /** Another call of the same action is outstanding; see the note on correlation. */
    | 'in-flight'
    /** The message could not be serialised or the transport threw. */
    | 'transport'

export class NativeBridgeError extends Error {
    readonly kind: NativeFailureKind
    readonly action: string

    constructor(kind: NativeFailureKind, action: string, message?: string) {
        super(message ?? `native bridge ${kind}: ${action}`)
        this.name = 'NativeBridgeError'
        this.kind = kind
        this.action = action
    }
}

interface IosBridge {
    postMessage(payload: { action: string; options: string }): void
}

interface AndroidBridge {
    jsCall(action: string, options: string): void
}

/**
 * The host objects, read off `window` rather than declared globally.
 *
 * A global `declare` would make `TeviJSInterface` look defined everywhere and let a call site skip
 * the check — which on the website, where neither exists, is a `ReferenceError` at the top of a
 * render. Legacy hits exactly that and swallows it in a `try`, which is how "the bridge did nothing"
 * became indistinguishable from "there is no bridge".
 */
function iosBridge(): IosBridge | null {
    if (typeof window === 'undefined') return null
    const handler = (
        window as unknown as { webkit?: { messageHandlers?: Record<string, unknown> } }
    ).webkit?.messageHandlers?.TeviJSInterface
    return handler && typeof (handler as IosBridge).postMessage === 'function'
        ? (handler as IosBridge)
        : null
}

function androidBridge(): AndroidBridge | null {
    if (typeof window === 'undefined') return null
    const host = (window as unknown as { TeviJSInterface?: unknown }).TeviJSInterface
    return host && typeof (host as AndroidBridge).jsCall === 'function'
        ? (host as AndroidBridge)
        : null
}

/**
 * Whether a native host is listening **right now**.
 *
 * Asked before a screen offers anything only the host can honour. Legacy draws its Done button
 * regardless and, off a device, it does nothing at all with no indication why.
 */
export function hasNativeBridge(): boolean {
    return iosBridge() !== null || androidBridge() !== null
}

/** One outstanding call. Keyed by action — see the note on correlation. */
interface Pending {
    resolve: (reply: NativeReply) => void
    reject: (error: unknown) => void
    timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()

/**
 * Legacy's `parseJSON`: a frame may arrive base64-encoded, as a JSON string, or as an object.
 *
 * The base64 branch cannot false-positive on JSON — `{` is not in the alphabet — but it is still
 * guarded, because a decode that throws must not take down the listener the whole screen depends on.
 */
function decodeFrame(input: unknown): Record<string, unknown> | null {
    if (input && typeof input === 'object') return input as Record<string, unknown>
    if (typeof input !== 'string') return null

    const trimmed = input.trim()
    if (trimmed === '') return null

    const base64 =
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/
    if (base64.test(trimmed)) {
        try {
            const decoded = JSON.parse(atob(trimmed))
            if (decoded && typeof decoded === 'object') return decoded as Record<string, unknown>
        } catch {
            // Fall through and try it as plain JSON.
        }
    }

    try {
        const parsed = JSON.parse(trimmed)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}

function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * `{ action, data }` → `NativeReply`.
 *
 * `data` is unwrapped by **shape** rather than by platform (see `NativeReply`). A frame carrying
 * `error_code` is the SDK's own transport failure envelope (`Not Available Device!`, `Not ready!`) and
 * is a failure whatever else it says.
 */
function normalizeReply(frame: Record<string, unknown>): NativeReply {
    const errorCode = frame.error_code
    if (typeof errorCode === 'number' && errorCode !== 0) {
        return {
            success: false,
            code: String(errorCode),
            message: text(frame.error_message),
            data: null,
        }
    }

    const inner = decodeFrame(frame.data) ?? {}
    return {
        success: inner.success === true,
        code: text(inner.code),
        message: text(inner.message),
        data: inner.data ?? null,
    }
}

/**
 * The inbound entry point the **host** calls: `TeviJS.onJSCall(payload)`.
 *
 * Exported so a harness can drive it; the app calls it through the global installed below. A frame
 * for an action nobody is waiting on is dropped rather than queued — the host does not push
 * unsolicited messages on this path, and holding one would mean the *next* caller of that action
 * resolving instantly with a stale answer.
 */
export function receiveNativeFrame(payload: unknown): void {
    const frame = decodeFrame(payload)
    const action = text(frame?.action)
    if (!frame || !action) return

    const waiting = pending.get(action)
    if (!waiting) return
    pending.delete(action)
    clearTimeout(waiting.timer)
    waiting.resolve(normalizeReply(frame))
}

/**
 * Marks a `TeviJS` global as ours. A `Symbol.for` so two copies of this module — a chunk boundary, a
 * test reimport — recognise each other's work instead of wrapping it twice.
 */
const INSTALLED = Symbol.for('tevi.native-bridge.installed')

/**
 * Install `window.TeviJS.onJSCall`, so the host has a name to call back into.
 *
 * Lazily, on the first call rather than at import: this module lives in `shared/`, the website
 * imports it transitively, and a global on a page no host is framing is a name in the way for
 * nothing.
 *
 * **Idempotence is read off the global, never off a module flag.** The global is the thing that can
 * disappear — an older app build injecting `membership-sdk.js` *after* us, a harness clearing it — and
 * a `let installed = true` that outlives it leaves the host calling a function that is no longer
 * there, with every reply silently dropped. An existing foreign `TeviJS` is not overwritten either:
 * its `onJSCall` is wrapped, so both registries see the frame and neither breaks.
 */
function installGlobal(): void {
    if (typeof window === 'undefined') return

    const host = window as unknown as {
        TeviJS?: { onJSCall?: (payload: unknown) => void; [INSTALLED]?: boolean }
    }
    if (host.TeviJS?.[INSTALLED]) return

    const previous = host.TeviJS?.onJSCall
    host.TeviJS = {
        ...(host.TeviJS ?? {}),
        [INSTALLED]: true,
        onJSCall: (payload: unknown) => {
            receiveNativeFrame(payload)
            if (typeof previous === 'function') {
                try {
                    previous.call(host.TeviJS, payload)
                } catch {
                    // A stale SDK's own handler must not break ours.
                }
            }
        },
    }
}

/** How long a call may go unanswered. Generous: the host may be showing its own UI over ours. */
const DEFAULT_TIMEOUT_MS = 20_000

/**
 * Post a message and forget it. For the two actions that have no reply.
 *
 * Returns whether a host took it, so a caller can tell "sent" from "there is nobody there" — which is
 * the difference between a screen that will be dismissed and one that is now stuck.
 */
export function postNativeAction(
    action: NativeAction,
    options: Record<string, unknown> = {},
): boolean {
    let payload: string
    try {
        payload = JSON.stringify(options)
    } catch {
        return false
    }

    const ios = iosBridge()
    if (ios) {
        try {
            ios.postMessage({ action, options: payload })
            return true
        } catch {
            return false
        }
    }

    const android = androidBridge()
    if (android) {
        try {
            android.jsCall(action, payload)
            return true
        } catch {
            return false
        }
    }

    return false
}

/**
 * Ask the host something and wait for its answer.
 *
 * Rejects with `NativeBridgeError` when there is no answer to be had — no host, a deadline passed, a
 * second call of the same action. It **resolves** for a reply that says `success: false`: that is the
 * host answering, and the answer is the caller's to interpret.
 */
export function callNative(
    action: NativeAction,
    options: Record<string, unknown> = {},
    { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<NativeReply> {
    if (!hasNativeBridge()) {
        return Promise.reject(new NativeBridgeError('unavailable', action))
    }
    if (pending.has(action)) {
        return Promise.reject(new NativeBridgeError('in-flight', action))
    }

    installGlobal()

    return new Promise<NativeReply>((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(action)
            reject(new NativeBridgeError('timeout', action))
        }, timeoutMs)

        pending.set(action, { resolve, reject, timer })

        /*
         * Registered **before** posting. A host that answers synchronously — which a stubbed one in a
         * harness does — would otherwise reply into an empty registry and the frame would be dropped.
         */
        if (!postNativeAction(action, options)) {
            pending.delete(action)
            clearTimeout(timer)
            reject(new NativeBridgeError('transport', action))
        }
    })
}

/** Drop every outstanding call — for a screen unmounting mid-flight, and for tests. */
export function resetNativeBridge(): void {
    for (const [, waiting] of pending) {
        clearTimeout(waiting.timer)
        waiting.reject(new NativeBridgeError('transport', 'reset'))
    }
    pending.clear()
}

export const nativeBridge = {
    /**
     * Mint the PaymentIntent for a tier.
     *
     * `priceInfo` is the **price row**, not just its id — legacy sends the object it read off
     * `packageInfo.prices[…]` and the host builds its request from it. See **B85** on the one thing
     * that differs: this client sends the *parsed* row, so `amount` is a number where legacy passed
     * the wire's `"5.00"` string.
     */
    membershipCheckout(options: {
        packageId: string
        priceInfo: { id: string; amount: number; amount_currency: string }
    }): Promise<NativeReply> {
        return callNative(NATIVE_ACTIONS.membershipCheckout, { ...options })
    },

    /** The account's saved cards, as the host has them. */
    getPaymentMethods(): Promise<NativeReply> {
        return callNative(NATIVE_ACTIONS.myPaymentMethods, {})
    },

    /**
     * Ask whether a PaymentIntent settled. Called repeatedly by the settle poll, never concurrently.
     *
     * A shorter deadline than the default: this is one step of a bounded schedule, and a step that
     * hangs for twenty seconds eats most of the window that schedule was given.
     */
    stripeCallback(options: { clientSecret: string }): Promise<NativeReply> {
        return callNative(NATIVE_ACTIONS.stripeCallback, { ...options }, { timeoutMs: 10_000 })
    },

    /**
     * Hand the verdict back and let the app dismiss the screen.
     *
     * The **only** thing that ends this flow: a webview screen has no back button of its own, so
     * without this the reader is left on a result they cannot close.
     */
    membershipResult(status: MembershipResultStatus): boolean {
        return postNativeAction(NATIVE_ACTIONS.membershipResult, { status })
    },

    /**
     * Open a URL in the app's own chrome.
     *
     * For links a webview screen cannot host — an external document, a store page. **Not** for our own
     * legal pages: `/app/terms` and `/app/privacy` are routes in this app, so a plain link keeps the
     * reader in the same document and works in a browser too. Legacy sends `executeLink` for both,
     * pointed at `https://webview.integridata.xyz/…` — a vendor host, in production copy.
     */
    openLink(options: { title: string; url: string }): boolean {
        return postNativeAction(NATIVE_ACTIONS.executeLink, {
            metadata: { title: options.title, link: options.url },
        })
    },
}
