// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    callNative,
    hasNativeBridge,
    NATIVE_ACTIONS,
    NativeBridgeError,
    nativeBridge,
    postNativeAction,
    receiveNativeFrame,
    resetNativeBridge,
} from './native-bridge'

type Mutable = Record<string, unknown>

function stubIos() {
    const postMessage = vi.fn()
    ;(window as unknown as Mutable).webkit = {
        messageHandlers: { TeviJSInterface: { postMessage } },
    }
    return postMessage
}

function stubAndroid() {
    const jsCall = vi.fn()
    ;(window as unknown as Mutable).TeviJSInterface = { jsCall }
    return jsCall
}

/** The host answering, in the frame it actually sends. */
function reply(action: string, inner: unknown, { asString = false } = {}) {
    receiveNativeFrame({ action, data: asString ? JSON.stringify(inner) : inner })
}

afterEach(() => {
    resetNativeBridge()
    ;(window as unknown as Mutable).webkit = undefined
    ;(window as unknown as Mutable).TeviJSInterface = undefined
    ;(window as unknown as Mutable).TeviJS = undefined
    vi.useRealTimers()
})

describe('hasNativeBridge', () => {
    it('is false in a plain browser', () => {
        expect(hasNativeBridge()).toBe(false)
    })

    it('is true for either host', () => {
        stubIos()
        expect(hasNativeBridge()).toBe(true)
    })

    /**
     * Not ceremony: iOS injects `webkit.messageHandlers` for its own handlers, so the object exists on
     * every WKWebView — including ones that registered no `TeviJSInterface`. Truthiness on `webkit`
     * alone would claim a bridge on any iOS webview in the app.
     */
    it('is false when the host object exists without the method', () => {
        ;(window as unknown as Mutable).webkit = { messageHandlers: {} }
        ;(window as unknown as Mutable).TeviJSInterface = { somethingElse: 1 }
        expect(hasNativeBridge()).toBe(false)
    })
})

describe('postNativeAction', () => {
    it('posts to iOS with options serialised as a JSON string', () => {
        const postMessage = stubIos()
        expect(postNativeAction(NATIVE_ACTIONS.membershipResult, { status: 'succeeded' })).toBe(
            true,
        )
        expect(postMessage).toHaveBeenCalledWith({
            action: 'action.user.billy.membershipResult',
            options: '{"status":"succeeded"}',
        })
    })

    it('calls Android with (action, jsonString)', () => {
        const jsCall = stubAndroid()
        expect(postNativeAction(NATIVE_ACTIONS.executeLink, { a: 1 })).toBe(true)
        expect(jsCall).toHaveBeenCalledWith('action.executeLink', '{"a":1}')
    })

    it('reports failure rather than throwing when no host is listening', () => {
        expect(postNativeAction(NATIVE_ACTIONS.membershipResult, { status: 'failed' })).toBe(false)
    })

    it('reports failure when the host throws', () => {
        ;(window as unknown as Mutable).TeviJSInterface = {
            jsCall: () => {
                throw new Error('detached')
            },
        }
        expect(postNativeAction(NATIVE_ACTIONS.membershipResult, { status: 'failed' })).toBe(false)
    })
})

describe('callNative', () => {
    it('resolves with the host’s reply, unwrapping an object payload', async () => {
        stubIos()
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods)
        reply(NATIVE_ACTIONS.myPaymentMethods, { success: true, data: [{ id: 'pm_1' }] })
        await expect(call).resolves.toEqual({
            success: true,
            code: null,
            message: null,
            data: [{ id: 'pm_1' }],
        })
    })

    /**
     * The shape is checked, never the platform. Legacy cannot agree with itself about which side
     * sends a string — one file parses when `isAndroid`, another parses unless `isIOS` — so anywhere
     * that is neither, one of the two throws.
     */
    it('unwraps a JSON-string payload identically', async () => {
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods)
        reply(
            NATIVE_ACTIONS.myPaymentMethods,
            { success: true, data: [{ id: 'pm_1' }] },
            {
                asString: true,
            },
        )
        await expect(call).resolves.toMatchObject({ success: true, data: [{ id: 'pm_1' }] })
    })

    it('accepts a base64 frame, which is what `TeviJS.onJSCall` is documented to take', async () => {
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.stripeCallback, { clientSecret: 'pi_secret' })
        const frame = { action: NATIVE_ACTIONS.stripeCallback, data: { success: true } }
        receiveNativeFrame(btoa(JSON.stringify(frame)))
        await expect(call).resolves.toMatchObject({ success: true })
    })

    it('resolves — not rejects — for a refusal, carrying the code and the sentence', async () => {
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.stripeCallback, { clientSecret: 'x' })
        reply(NATIVE_ACTIONS.stripeCallback, {
            success: false,
            code: 'PM0003',
            message: 'Still processing',
        })
        await expect(call).resolves.toEqual({
            success: false,
            code: 'PM0003',
            message: 'Still processing',
            data: null,
        })
    })

    /** The SDK's own transport envelope (`Not Available Device!`) is a failure whatever else it says. */
    it('treats an `error_code` frame as a failure', async () => {
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods)
        receiveNativeFrame({
            action: NATIVE_ACTIONS.myPaymentMethods,
            error_code: -6,
            error_message: 'Not Available Device!',
            data: { success: true },
        })
        await expect(call).resolves.toMatchObject({
            success: false,
            message: 'Not Available Device!',
        })
    })

    it('rejects with `unavailable` when nothing is listening', async () => {
        await expect(callNative(NATIVE_ACTIONS.myPaymentMethods)).rejects.toBeInstanceOf(
            NativeBridgeError,
        )
        await expect(callNative(NATIVE_ACTIONS.myPaymentMethods)).rejects.toMatchObject({
            kind: 'unavailable',
        })
    })

    /**
     * The failure legacy cannot express. Its timeout envelope is built and never used — no timer is
     * started anywhere — so a host that takes the message and says nothing leaves the screen on a
     * spinner for ever.
     */
    it('rejects with `timeout` when the host never answers', async () => {
        vi.useFakeTimers()
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods, {}, { timeoutMs: 1000 })
        const assertion = expect(call).rejects.toMatchObject({ kind: 'timeout' })
        await vi.advanceTimersByTimeAsync(1001)
        await assertion
    })

    /**
     * Replies are correlated by action name — the host echoes no request id. Legacy overwrites the
     * stored callback, so the first caller is silently handed the second's answer. On a payment path
     * that must be refused instead.
     */
    it('refuses a second call of the same action while one is outstanding', async () => {
        stubAndroid()
        const first = callNative(NATIVE_ACTIONS.myPaymentMethods)
        await expect(callNative(NATIVE_ACTIONS.myPaymentMethods)).rejects.toMatchObject({
            kind: 'in-flight',
        })
        reply(NATIVE_ACTIONS.myPaymentMethods, { success: true, data: [] })
        await expect(first).resolves.toMatchObject({ success: true })
    })

    it('drops a frame nobody is waiting on rather than queueing it', async () => {
        stubAndroid()
        reply(NATIVE_ACTIONS.myPaymentMethods, { success: true, data: ['stale'] })
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods)
        reply(NATIVE_ACTIONS.myPaymentMethods, { success: true, data: ['fresh'] })
        await expect(call).resolves.toMatchObject({ data: ['fresh'] })
    })

    /** The host has no handle on our modules; it calls a name. */
    it('installs `window.TeviJS.onJSCall` for the host to call back into', async () => {
        stubAndroid()
        const call = callNative(NATIVE_ACTIONS.myPaymentMethods)
        const global = (window as unknown as { TeviJS?: { onJSCall?: (p: unknown) => void } })
            .TeviJS
        expect(typeof global?.onJSCall).toBe('function')
        global?.onJSCall?.({ action: NATIVE_ACTIONS.myPaymentMethods, data: { success: true } })
        await expect(call).resolves.toMatchObject({ success: true })
    })
})

describe('nativeBridge', () => {
    it('sends the verdict under legacy’s own action name and status strings', () => {
        const jsCall = stubAndroid()
        nativeBridge.membershipResult('succeeded')
        nativeBridge.membershipResult('failed')
        expect(jsCall.mock.calls).toEqual([
            ['action.user.billy.membershipResult', '{"status":"succeeded"}'],
            ['action.user.billy.membershipResult', '{"status":"failed"}'],
        ])
    })

    it('sends the whole price row on a checkout, as legacy does', () => {
        const jsCall = stubAndroid()
        /* Never answered; `resetNativeBridge` rejects it in afterEach, so it must be handled here. */
        nativeBridge
            .membershipCheckout({
                packageId: 'pkg_1',
                priceInfo: { id: 'price_usd', amount: 5, amount_currency: 'USD' },
            })
            .catch(() => {})
        expect(jsCall).toHaveBeenCalledWith(
            'action.user.billy.membershipCheckout',
            JSON.stringify({
                packageId: 'pkg_1',
                priceInfo: { id: 'price_usd', amount: 5, amount_currency: 'USD' },
            }),
        )
    })

    it('wraps a link in the `metadata` envelope the app expects', () => {
        const jsCall = stubAndroid()
        nativeBridge.openLink({ title: 'Term of use', url: 'https://tevi.com/app/terms' })
        expect(jsCall).toHaveBeenCalledWith(
            'action.executeLink',
            JSON.stringify({
                metadata: { title: 'Term of use', link: 'https://tevi.com/app/terms' },
            }),
        )
    })
})
