/**
 * The mini-app bridge protocol — **the wire, and nothing else.**
 *
 * A mini app is a third-party page this app frames. It talks to its host over
 * `postMessage`, and the host it was written against is the **native app**: iOS/Android
 * expose a `TeviJSInterface` handler and call back into `TeviJS.onJSCall(base64)`. The web
 * player is a third implementation of that same contract, so nothing here may be invented —
 * every action name below is the string a shipped mini app already sends. The contract is
 * `docs/MINI_APP.md`, ported from legacy's `MINIAPP_INTEGRATION.md`.
 *
 * This file is deliberately **pure**: no React, no DOM, no axios. The bridge hook decides
 * *what* an action does; this decides only what a message *is*. That is what makes the two
 * genuinely awkward parts of the protocol testable rather than commented.
 *
 * ## The two envelopes, and why both are supported
 *
 * Legacy has a host and an SDK that **do not agree**, and both are in production:
 *
 * - Legacy's host (`useMiniAppBridge`) reads `{ action, options }`, where `options` is a
 *   *JSON string*, and replies `{ action, call, userInfo }`.
 * - Legacy's SDK (`public/sdk/miniapp-sdk.js`), on its browser code path, posts
 *   `{ eventType, eventData }` and listens for `{ eventType, eventData }` — it ignores a
 *   message with no `eventType` outright.
 *
 * So an SDK-based mini app and legacy's web player cannot hear each other in **either**
 * direction. There is no way to tell from here which of the two a given app was built
 * against, and guessing wrong is a mini app that loads and then sits inert.
 *
 * The answer is to accept both inbound, and to reply **in the envelope that frame last
 * used**. Until a frame has said anything, a host-initiated event goes out in *both* — the
 * only messages that can precede the app's first word are the header buttons
 * (`backButtonClicked`, `closeButtonClicked`), and an app that understands one envelope
 * ignores the other rather than double-handling it. `Envelope` is that memory, and it is
 * per tab.
 */

/**
 * Every action name on the wire. Web → host unless noted.
 *
 * Kept as one object because the *names* are the contract; which side sends which is a
 * property of the handler, not of the string. Splitting it into "inbound" and "outbound"
 * would be a lie about two of them: `SETTING_BUTTON_CLICKED` and the rest of the
 * `*_BUTTON_CLICKED` family travel **both** ways — the host pushes them when its chrome is
 * pressed, and a mini app may also send them to ask the host to perform the same thing.
 */
export const MINI_APP_ACTIONS = {
    /** Web → host, no reply expected: version + supported layout modes. */
    LOAD_CONFIG: 'action.app.loadConfig',
    /** Web → host, replies: the account, and a token minted for *this app*. */
    GET_USER_INFO: 'action.user.core.getInfo',
    /** Web → host, replies. Nothing behind it on web — see the bridge. */
    CHECK_REMAINING_USER: 'action.user.core.checkRemainingUser',
    /** Web → host, replies: buy an in-app item with Star. */
    BUY_ITEM: 'action.user.billy.buyItem',
    /** Web → host, replies: move Star from the account into the app's own wallet. */
    TOPUP: 'action.user.billy.topup',
    /** Web → host, replies: open the Star purchase sheet. */
    PURCHASE_STAR: 'action.purchaseStar',
    /** Web → host, no reply: close the player. */
    QUIT_GAME: 'action.quitGame',
    /** Web → host, no reply: show a back chevron in the host's chrome. */
    SHOW_BACK_BUTTON: 'action.app.showBackButton',
    /** Web → host, no reply: show a close glyph in the host's chrome. */
    SHOW_CLOSE_BUTTON: 'action.app.showCloseButton',
    /** Web → host, no reply: open a link, another mini app, or a share sheet. */
    EXECUTE_LINK: 'action.executeLink',
    /** Web → host, replies. Unsupported on web. */
    SCAN_QR_CODE: 'action.scanQRCode',
    /** Web → host, replies: save media to the device. */
    DOWNLOAD_MEDIA: 'action.downloadMedia',
    /** Web → host, no reply. Unsupported on web. */
    CREATE_POST: 'action.createPost',

    // ── the host's chrome, pushed down when pressed (and accepted upward) ──
    BACK_BUTTON_CLICKED: 'action.app.backButtonClicked',
    CLOSE_BUTTON_CLICKED: 'action.app.closeButtonClicked',
    SETTING_BUTTON_CLICKED: 'action.app.settingButtonClicked',
    SHARE_BUTTON_CLICKED: 'action.app.shareButtonClicked',
    RELOAD_BUTTON_CLICKED: 'action.app.reloadButtonClicked',
    TERM_BUTTON_CLICKED: 'action.app.termButtonClicked',
    PRIVACY_BUTTON_CLICKED: 'action.app.privacyButtonClicked',
} as const

export type MiniAppAction = (typeof MINI_APP_ACTIONS)[keyof typeof MINI_APP_ACTIONS]

/**
 * Which shape a frame speaks. `'action'` is legacy's host protocol, `'eventType'` is the
 * SDK's browser path. `null` means "not heard from yet" — see the file header.
 */
export type Envelope = 'action' | 'eventType'

export interface IncomingMessage {
    action: string
    /** Always an object, never the raw JSON string the `action` envelope sends. */
    options: Record<string, unknown>
    envelope: Envelope
}

/**
 * `options` arrives as a **JSON string** on the `action` envelope (the native bridge cannot
 * pass structured data), and as an object on the `eventType` one. Both are accepted from
 * either, because an app that hand-rolls the `action` envelope in a browser has no reason to
 * stringify and several have not.
 *
 * A value that will not parse becomes `{}` rather than throwing: the action is still a
 * request, and refusing to hear it because its arguments were malformed leaves the mini app
 * waiting for a reply that never comes. Handlers read fields defensively for the same reason.
 */
function toOptions(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {}
        } catch {
            return {}
        }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
    }
    return {}
}

/**
 * Read one `MessageEvent.data`, or `null` if it is not a bridge message.
 *
 * `null` is the common case and not an error: this page runs Next's own dev-tools
 * channel, React DevTools, Stripe and Turnstile frames, and every one of them posts
 * messages. A parser that threw or logged here would fill the console on a healthy page.
 */
export function parseBridgeMessage(raw: unknown): IncomingMessage | null {
    let data: unknown = raw
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch {
            return null
        }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null

    const record = data as Record<string, unknown>
    if (typeof record.action === 'string' && record.action !== '') {
        return { action: record.action, options: toOptions(record.options), envelope: 'action' }
    }
    if (typeof record.eventType === 'string' && record.eventType !== '') {
        return {
            action: record.eventType,
            options: toOptions(record.eventData),
            envelope: 'eventType',
        }
    }
    return null
}

/**
 * What the host says back. `call` is the protocol's verdict field:
 * `'ok'` · `'cancel'` · a human-readable error string.
 *
 * `response: false` is legacy's *other* way of saying "did not happen", and it is the one
 * shipped mini apps actually branch on — legacy's host sends it for every failure and never
 * sends `call` with an error string, so an app written against that host reads `response`.
 * Both are emitted (see `failedReply`) rather than picking a winner: a field an app does not
 * read is inert, and dropping the one it does read is a silent hang.
 */
export interface ReplyPayload {
    call?: 'ok' | 'cancel' | string
    response?: false
    userInfo?: Record<string, unknown>
    userParam?: Record<string, unknown>
    config?: Record<string, unknown>
    metadata?: Record<string, unknown>
    message?: string
}

export const okReply = (extra: Omit<ReplyPayload, 'call' | 'response'> = {}): ReplyPayload => ({
    call: 'ok',
    ...extra,
})

/** The reader dismissed it. Not a failure, and mini apps distinguish the two. */
export const canceledReply = (): ReplyPayload => ({ call: 'cancel', response: false })

/**
 * It did not happen. `message` is *our* sentence, never the backend's body — a mini app is a
 * third party and an API error body can carry more than a caller should see.
 */
export const failedReply = (message?: string): ReplyPayload => ({
    call: message || 'failed',
    response: false,
    ...(message ? { message } : {}),
})

/**
 * Turn a reply into the frames to post — one per envelope the frame might understand.
 *
 * An array because the unknown-envelope case genuinely sends two messages. Callers post
 * every element; `postMessage` targets a single origin either way, so this never widens who
 * can hear it.
 */
export function serializeBridgeMessage(
    envelope: Envelope | null,
    action: string,
    payload: ReplyPayload = {},
): unknown[] {
    const asAction = { action, ...payload }
    const asEventType = { eventType: action, eventData: { ...payload } }
    if (envelope === 'action') return [asAction]
    if (envelope === 'eventType') return [asEventType]
    return [asAction, asEventType]
}
