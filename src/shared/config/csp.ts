/**
 * Content Security Policy.
 *
 * **This is the compensating control for keeping tokens in `localStorage`.** That choice
 * (see `shared/lib/api/token.ts`) trades away the XSS protection an httpOnly cookie would
 * give, on the grounds that the backend authenticates via the `Authorization` header. The
 * trade only holds if script injection is hard in the first place — which is what a CSP
 * is for. Without one, a single injected `<script>` reads every account's refresh token.
 *
 * ## Strict CSP, not an allowlist
 *
 * `script-src` is nonce-based with `'strict-dynamic'`: only scripts carrying this
 * request's nonce run, plus whatever those scripts go on to load themselves. Host
 * allowlists are the older style and are worth little — one JSONP endpoint or outdated
 * library on an allowed origin reopens the hole. Under `'strict-dynamic'` a CSP3 browser
 * *ignores* host expressions entirely, and `'unsafe-inline'` is ignored rather than
 * honoured.
 *
 * **There is deliberately no `https:` fallback.** It used to be here for CSP2-only
 * browsers, which ignore `'strict-dynamic'` — but those browsers then read the policy as
 * "any HTTPS host may serve script", which is close to having no script policy at all,
 * and it is exactly the hole this file exists to close. Every browser that can run this
 * app understands `'strict-dynamic'` (Chrome 52, Firefox 52, Safari 15.4), so the
 * fallback protected nothing real while weakening the policy for anyone whose browser
 * *did* fall back. The cost of dropping it: on such a browser the Google and Turnstile
 * scripts do not load, so sign-in degrades. Losing sign-in on a browser from 2021 is a
 * better outcome than serving it a policy an attacker can walk through.
 *
 * This is why third-party scripts need no entry here: Google Identity Services and
 * Cloudflare Turnstile are both injected by `next/script`, i.e. by an already-trusted
 * script, so `'strict-dynamic'` covers them. What they *do* need is `frame-src` — both
 * render their UI in an iframe.
 *
 * ## Trusted Types, in report-only
 *
 * `CSP_REPORT_ONLY` is shipped as a second header. It requires Trusted Types for the DOM
 * sinks that can execute script (`innerHTML`, `script.src`, `eval`, …) — the sinks that
 * turn injected *content* into injected *script*. It is report-only on purpose: the app
 * is about to start rendering HTML it did not author, and the point right now is to find
 * out what would break before anything is enforced. Violations surface in the console and
 * the devtools Issues panel; wiring a `report-to` endpoint is the next step, and enforcing
 * it is the step after that.
 *
 * ## The nonce has to reach Next
 *
 * `proxy.ts` puts the finished policy on the **request** headers as well as the response.
 * Next reads the nonce out of the request's own CSP header and stamps it onto every
 * script tag it emits (the bootstrap, the flight data, each chunk). Set it only on the
 * response and Next's own scripts are blocked — the page renders and then does nothing.
 *
 * ## `style-src 'unsafe-inline'`
 *
 * Not negligence. React writes `style={{…}}` as a `style` attribute and Next inlines
 * critical CSS, and `style-src` governs both. Nonces cannot cover attributes, so the
 * honest options are this or removing every inline style in the app. Injected CSS is a
 * far smaller prize than injected script, and script is locked down.
 */

const W_API = process.env.NEXT_PUBLIC_W_API_DOMAIN
const DOORMAN = process.env.NEXT_PUBLIC_DOORMAN_DOMAIN
const STATIC = process.env.NEXT_PUBLIC_STATIC_DOMAIN
const POSTHOG = process.env.NEXT_PUBLIC_POSTHOG_HOST

/** Cloudflare Turnstile — the challenge widget's iframe (`turnstile-challenge.tsx`). */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
/** Google Identity Services — the sign-in button's iframe and its token endpoint. */
const GOOGLE_ACCOUNTS_ORIGIN = 'https://accounts.google.com'
/**
 * Google Cloud Storage — where a picked avatar, cover or avatar clip is `PUT`.
 *
 * The upload is **direct to storage**: the API answers with a pre-signed URL on this host and the
 * browser sends the bytes there itself (`shared/lib/api/upload-api.ts`), so it is an XHR target
 * this document really does connect to. Without it, `connect-src` falls through and the request is
 * blocked with *"Connecting to 'https://storage.googleapis.com/…' violates the following Content
 * Security Policy directive"* — which is the entire symptom: no upload, no error the app can see,
 * only a console line, because a CSP refusal never reaches the request's own error handler as
 * anything but a network failure.
 *
 * The **bucket** is not in the URL's host (`storage.googleapis.com/<bucket>/…`), so this cannot be
 * narrowed to Tevi's own storage by origin. The write is still confined to the object the backend
 * signed for, which is the control that matters: without a signature this host accepts nothing.
 */
const GCS_UPLOAD_ORIGIN = 'https://storage.googleapis.com'
/**
 * Firebase Auth's REST hosts, used for the anonymous session (`shared/lib/firebase.ts`).
 * The SDK is bundled, so these are XHR targets only — nothing is loaded as script.
 */
const FIREBASE_ORIGINS = [
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
]
/**
 * Sumsub — the identity-verification flow (`features/identification`). The whole flow is
 * *their* iframe, created by the bundled SDK with `allow="camera; microphone; …"` on it, so
 * this is a `frame-src` entry only: nothing is loaded as script and the uploads go from
 * inside the frame to their own origin, not from this document.
 *
 * The host is the SDK's default base URL, which it derives from the access token rather
 * than from anything we pass — so it is not configurable at our end and does not belong in
 * env. If verification ever renders an empty box, this is the first thing to check: a
 * blocked frame is silent everywhere except the console.
 */
const SUMSUB_ORIGIN = 'https://in.sumsub.com'

/** `https://wapi.tevi.dev` → `wss://wapi.tevi.dev`, for the socket adapter in a later phase. */
function toWebSocketOrigin(origin?: string): string | undefined {
    if (!origin) return undefined
    return origin.replace(/^http/, 'ws')
}

/** Drops blanks and duplicates so a missing optional env cannot emit a stray space. */
function sources(...values: (string | undefined)[]): string {
    return [...new Set(values.filter((v): v is string => Boolean(v)))].join(' ')
}

/**
 * Where `proxy.ts` parks the nonce for components that have to stamp it themselves.
 *
 * Next stamps its own script tags by reading the nonce back out of the CSP header, but it
 * cannot do that for a script some *library* renders. `next-themes` emits one — the
 * blocking snippet that sets the theme class before first paint — and without the nonce
 * our own policy blocks it, which is a white flash on every dark-mode load.
 *
 * Stripped from incoming requests for the same reason the webview headers are: a client
 * must not be able to hand us the nonce it wants to be trusted with.
 */
export const NONCE_HEADER = 'x-tevi-nonce'

/**
 * A fresh 128-bit nonce, base64. Must be unguessable and must never be reused across
 * responses — a predictable or shared nonce is the same as having no CSP at all.
 */
export function generateNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return btoa(String.fromCharCode(...bytes))
}

/**
 * Build the policy for one request.
 *
 * `isDev` loosens exactly two things, both of which are the dev server's own machinery
 * and neither of which ships: Turbopack compiles modules with `eval`, and HMR talks over
 * a plaintext WebSocket to localhost.
 */
export function buildCsp({ nonce, isDev = false }: { nonce: string; isDev?: boolean }): string {
    const directives: [string, string][] = [
        ['default-src', "'self'"],
        [
            'script-src',
            sources(
                "'self'",
                `'nonce-${nonce}'`,
                "'strict-dynamic'",
                isDev ? "'unsafe-eval'" : undefined,
            ),
        ],
        // See the note above — inline styles are structural in React, not a shortcut.
        // Google Identity Services also fetches its button's stylesheet from
        // `accounts.google.com/gsi/style`; without that origin the sign-in button renders
        // unstyled. Found by loading `/login` in a real browser — it is a `style-src`
        // failure, so nothing in the markup or the headers hints at it.
        ['style-src', sources("'self'", "'unsafe-inline'", GOOGLE_ACCOUNTS_ORIGIN)],
        // Images cannot execute, and `next/image` proxies remote art through `/_next/image`
        // on this origin anyway; `https:` keeps the 19 CDN hosts in `next.config.ts` from
        // having to be restated here and drift.
        ['img-src', "'self' blob: data: https:"],
        /**
         * Animated avatars — a Premium creator uploads a short clip and it plays inside
         * the avatar's circle (`images.avatar_video.playback.url`, served from the CDN).
         *
         * This directive is not optional decoration: without it `media-src` falls back to
         * `default-src 'self'` and every one of those clips is blocked, in dev as well as
         * production. The symptom is an avatar that simply never animates — no failed
         * request in the network panel's usual place, no error in the app, only a CSP
         * violation in the console — so it reads as "the feature doesn't work" rather
         * than "the policy refused it".
         *
         * `https:` for the same reason `img-src` uses it: a video cannot execute, and the
         * CDN host list already lives in `next.config.ts` (`remotePatterns`) where it will
         * not drift out of sync with a second copy here. `blob:` is for the upload preview
         * the edit-profile screen will need — it trims a clip client-side and plays the
         * result back from a blob URL before anything is sent.
         */
        ['media-src', "'self' blob: https:"],
        ['font-src', "'self' data:"],
        [
            'connect-src',
            sources(
                "'self'",
                W_API,
                DOORMAN,
                STATIC,
                POSTHOG,
                toWebSocketOrigin(W_API),
                GCS_UPLOAD_ORIGIN,
                GOOGLE_ACCOUNTS_ORIGIN,
                ...FIREBASE_ORIGINS,
                isDev ? 'ws:' : undefined,
            ),
        ],
        ['frame-src', sources("'self'", TURNSTILE_ORIGIN, GOOGLE_ACCOUNTS_ORIGIN, SUMSUB_ORIGIN)],
        // Matches the `X-Frame-Options: SAMEORIGIN` already set in `next.config.ts`.
        // `/app/*` is unaffected: a WebView renders it as the top-level document, not a
        // frame, so no ancestor check applies.
        ['frame-ancestors', "'self'"],
        // Stops an injected `<base>` from re-pointing every relative URL on the page.
        ['base-uri', "'self'"],
        ['form-action', "'self'"],
        ['object-src', "'none'"],
    ]

    // Pointless on http://localhost, and it would break the dev server.
    if (!isDev) directives.push(['upgrade-insecure-requests', ''])

    return directives.map(([name, value]) => (value ? `${name} ${value}` : name)).join('; ')
}

/**
 * The trial policy, sent as `Content-Security-Policy-Report-Only`.
 *
 * Only the directive being trialled — not a copy of the enforced policy. A report-only
 * header that mirrors the real one reports every violation the enforced header already
 * blocked, and the one signal worth reading drowns in it.
 *
 * `require-trusted-types-for 'script'` makes a string assigned to a script-executing DOM
 * sink a violation. Nothing in the app does that today, so this should be silent — which
 * is the point: it establishes the baseline *before* `dangerouslySetInnerHTML` lands, so
 * the first report is a real signal rather than noise nobody can attribute.
 *
 * No `trusted-types` directive yet: that one restricts which policy *names* may be
 * created, and naming them before we know which libraries create any would just invent a
 * second thing to be wrong about. It belongs with enforcement.
 *
 * Static — no nonce — so it does not need rebuilding per request.
 */
export const CSP_REPORT_ONLY = "require-trusted-types-for 'script'"
