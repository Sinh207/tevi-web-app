// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCsp, CSP_REPORT_ONLY, generateNonce } from './csp'

/** Pull one directive's value out of a serialized policy. */
function directive(csp: string, name: string): string | undefined {
    const found = csp.split('; ').find(part => part === name || part.startsWith(`${name} `))
    if (found === undefined) return undefined
    return found === name ? '' : found.slice(name.length + 1)
}

/**
 * One directive's sources, as a list — a substring check on the whole header proves too little.
 *
 * `directive` already strips the name, so there is nothing to slice off. The existing `script-src`
 * loop above does slice, which is harmless only because the token it drops is `'self'` and the
 * thing it asserts is true of `'self'` too.
 */
function tokens(policy: string, name: string): string[] {
    return (directive(policy, name) ?? '').split(' ').filter(Boolean)
}

describe('generateNonce', () => {
    it('is base64 and 128 bits wide', () => {
        const nonce = generateNonce()
        expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
        expect(atob(nonce)).toHaveLength(16)
    })

    it('never repeats — a reused nonce is the same as no CSP', () => {
        const seen = new Set(Array.from({ length: 200 }, () => generateNonce()))
        expect(seen.size).toBe(200)
    })
})

describe('buildCsp', () => {
    const csp = buildCsp({ nonce: 'TESTNONCE' })

    it('carries the request nonce and strict-dynamic', () => {
        const scriptSrc = directive(csp, 'script-src')
        expect(scriptSrc).toContain("'nonce-TESTNONCE'")
        expect(scriptSrc).toContain("'strict-dynamic'")
    })

    it('admits no host expression for script — not even https:', () => {
        // A CSP3 browser ignores hosts under 'strict-dynamic', so a fallback like
        // `https:` only ever reaches browsers that ignore 'strict-dynamic' — and
        // tells exactly those "any HTTPS host may serve script". That is the hole
        // this policy exists to close, so the fallback is worse than nothing.
        const scriptSrc = directive(csp, 'script-src')
        expect(scriptSrc).not.toContain('https:')
        for (const source of (scriptSrc ?? '').split(' ').slice(1)) {
            expect(source.startsWith("'")).toBe(true)
        }
    })

    it('never allows unsafe-eval outside dev', () => {
        /*
         * ⚠ Written against the **token list**, not the whole header, because
         * `'wasm-unsafe-eval'` now sits in the same directive and `not.toContain("'unsafe-eval'")`
         * only keeps passing by the accident that the quote before it is a `-`. A test that would
         * go green on a substring is not guarding the thing it names.
         */
        expect(tokens(csp, 'script-src')).not.toContain("'unsafe-eval'")
        expect(tokens(buildCsp({ nonce: 'x', isDev: true }), 'script-src')).toContain(
            "'unsafe-eval'",
        )
    })

    /**
     * The video trimmer compiles ffmpeg as wasm in the browser, which this policy gates.
     *
     * Both halves matter. Without the keyword every trim fails with a console violation and no
     * other symptom; with the *older* keyword the policy would also permit `eval()` of arbitrary
     * strings, which is the primitive this file exists to deny.
     */
    it('permits wasm compilation and still refuses string eval', () => {
        const scriptSrc = tokens(csp, 'script-src')
        expect(scriptSrc).toContain("'wasm-unsafe-eval'")
        expect(scriptSrc).not.toContain("'unsafe-eval'")
    })

    /**
     * `@ffmpeg/ffmpeg` starts its core in a worker created from a `blob:` URL. With no `worker-src`
     * the check falls through `child-src` to `default-src 'self'`, which refuses it.
     */
    it('declares worker-src, because the fallback refuses a blob worker', () => {
        expect(tokens(csp, 'worker-src')).toEqual(["'self'", 'blob:'])
    })

    it("allows Google Identity Services' own stylesheet — the button is unstyled without it", () => {
        expect(directive(csp, 'style-src')).toContain('https://accounts.google.com')
    })

    it('frames Stripe Elements and the 3DS challenge — a blocked frame is a silent empty box', () => {
        const frameSrc = directive(csp, 'frame-src')
        expect(frameSrc).toContain('https://js.stripe.com')
        expect(frameSrc).toContain('https://hooks.stripe.com')
    })

    it('lets Elements reach the Stripe API, and adds no host for its script', () => {
        // `loadStripe` injects the script from our own nonce'd bundle, so 'strict-dynamic'
        // covers it; a host expression here would only weaken the policy for a browser that
        // falls back to hosts.
        expect(directive(csp, 'connect-src')).toContain('https://api.stripe.com')
        expect(directive(csp, 'script-src')).not.toContain('stripe.com')
    })

    it('frames the Turnstile and Google sign-in widgets, which render in iframes', () => {
        const frameSrc = directive(csp, 'frame-src')
        expect(frameSrc).toContain('https://challenges.cloudflare.com')
        expect(frameSrc).toContain('https://accounts.google.com')
    })

    /**
     * The identity-verification flow *is* Sumsub's iframe — dropping this host does not
     * degrade the feature, it removes it, and the only symptom is an empty box plus a
     * console violation. See `features/identification/components/sumsub-checkout.tsx`.
     */
    it('frames the Sumsub verification flow', () => {
        expect(directive(csp, 'frame-src')).toContain('https://in.sumsub.com')
    })

    /**
     * Regression: `media-src` was absent, so it inherited `default-src 'self'` and every
     * animated avatar was blocked — in dev too, and with no symptom beyond a console
     * violation. Deleting this directive must break a test, not a feature.
     */
    it('plays CDN video, so animated avatars are not blocked by our own policy', () => {
        const mediaSrc = directive(csp, 'media-src')
        expect(mediaSrc).toBeDefined()
        expect(mediaSrc).toContain('https:')
        // The edit-profile trimmer plays a clip back from a blob URL before upload.
        expect(mediaSrc).toContain('blob:')
    })

    it('reaches the API, Firebase Auth and the socket origin', () => {
        const connectSrc = directive(csp, 'connect-src')
        // vitest.config.ts pins these.
        expect(connectSrc).toContain('https://wapi.tevi.dev')
        expect(connectSrc).toContain('wss://wapi.tevi.dev')
        expect(connectSrc).toContain('https://doorman.tevi.dev')
        expect(connectSrc).toContain('https://identitytoolkit.googleapis.com')
        expect(connectSrc).toContain('https://securetoken.googleapis.com')
    })

    /**
     * Direct-to-storage uploads. This is the regression that shipped: a picked avatar `PUT`s
     * straight at a pre-signed Google Cloud Storage URL, the host was missing here, and every
     * upload on the edit-profile screen was refused by the browser with nothing but a console
     * line to show for it — a CSP block surfaces to the app as an ordinary network failure.
     */
    it('reaches the storage host the pre-signed upload PUTs to', () => {
        expect(directive(csp, 'connect-src')).toContain('https://storage.googleapis.com')
    })

    it('locks down the directives an injection would reach for', () => {
        expect(directive(csp, 'object-src')).toBe("'none'")
        expect(directive(csp, 'base-uri')).toBe("'self'")
        expect(directive(csp, 'form-action')).toBe("'self'")
        expect(directive(csp, 'default-src')).toBe("'self'")
    })

    it('upgrades insecure requests only where https exists', () => {
        expect(csp).toContain('upgrade-insecure-requests')
        expect(buildCsp({ nonce: 'x', isDev: true })).not.toContain('upgrade-insecure-requests')
    })

    it('emits no empty or doubled sources when an optional origin is unset', () => {
        expect(csp).not.toMatch(/ {2}/)
        expect(csp).not.toMatch(/; ;/)
        for (const part of csp.split('; ')) {
            const values = part.split(' ').slice(1)
            expect(new Set(values).size).toBe(values.length)
        }
    })
})

describe('CSP_REPORT_ONLY', () => {
    it('trials Trusted Types on the sinks that can execute script', () => {
        expect(CSP_REPORT_ONLY).toContain("require-trusted-types-for 'script'")
    })

    it('carries nothing the enforced policy already covers', () => {
        // Mirroring the real policy here would report every violation the enforcing
        // header has already blocked, burying the one signal this is sent for.
        expect(CSP_REPORT_ONLY).not.toContain('script-src')
        expect(CSP_REPORT_ONLY).not.toContain('default-src')
        expect(CSP_REPORT_ONLY).not.toContain('nonce-')
    })

    it('names no policies yet — that belongs with enforcement', () => {
        expect(CSP_REPORT_ONLY).not.toContain('trusted-types ')
    })
})

describe('Firebase Remote Config', () => {
    /*
     * Both hosts, because the failure is silent: `useWebConfig()` resolves to the code defaults
     * when the fetch is refused, so a blocked policy looks exactly like a healthy app running on
     * fallbacks. This is the only place that can notice.
     */
    it('may reach the two hosts a template needs', () => {
        const connect = directive(buildCsp({ nonce: 'n' }), 'connect-src')

        expect(connect).toContain('https://firebaseinstallations.googleapis.com')
        expect(connect).toContain('https://firebaseremoteconfig.googleapis.com')
    })
})
