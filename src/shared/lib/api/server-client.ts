import 'server-only'
import { env } from '@shared/config/env'
import { ApiError } from './errors'
import { shouldSignRequest, signUrl } from './interceptors/sign'
import { unwrapApiEnvelope, unwrapEnvelope } from './unwrap'

/**
 * Server-side API access for RSC / server components — PUBLIC content only
 * (SEO/landing pages). Auth is client-side (localStorage token store, not
 * cookies), so there is no bearer available on the server. It HMAC-signs the
 * URL (WebCrypto works in Node) and does one-shot uncached `fetch`es.
 * For authenticated data, fetch from the client via the browser apiClient.
 */

/**
 * A render waits on this, so it cannot wait forever.
 *
 * `fetch` has no default timeout: an upstream that accepts the connection and
 * then goes quiet holds the RSC render — and the user's blank page — until the
 * platform's own limit kills the whole request. Failing at 10s lets the page
 * render its error boundary instead.
 */
const SERVER_TIMEOUT_MS = 10_000

interface ServerErrorBody {
    code?: string | number
    error?: string
    message?: string
}

async function buildUrl(absUrl: string, params?: Record<string, unknown>) {
    const url = new URL(absUrl)
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v != null && v !== '') url.searchParams.set(k, String(v))
        }
    }
    if (shouldSignRequest(url.toString())) {
        const verify = await signUrl(url.toString())
        if (verify) url.searchParams.set('verify', verify)
    }
    return url
}

/** Read the backend's error envelope so the failure says what went wrong. */
async function toApiError(res: Response): Promise<ApiError> {
    let body: ServerErrorBody | undefined
    try {
        body = (await res.json()) as ServerErrorBody
    } catch {
        // HTML error page / empty body — the status is all we have.
    }
    return new ApiError({
        message: body?.message || body?.error || `Server request failed (${res.status})`,
        status: res.status,
        code: body?.code != null ? String(body.code) : undefined,
        data: body,
    })
}

/**
 * `no-store` unless the caller asked for caching.
 *
 * Blanket `no-store` meant every render of a public page went to W_API — the
 * backend's latency became the page's TTFB and nothing was ever shared between
 * visitors, on exactly the content (landing, legal, profiles) that changes least.
 * Callers opt into ISR with `revalidate`, per model or per call.
 *
 * `cache` and `next.revalidate` are mutually exclusive in Next, so the default is
 * dropped the moment either is supplied rather than merged into a conflict.
 */
function cachePolicy(init: RequestInit | undefined, revalidate: number | undefined) {
    if (init && ('cache' in init || 'next' in init)) return {}
    if (revalidate !== undefined) return { next: { revalidate } }
    return { cache: 'no-store' as const }
}

/**
 * The model's own settings, kept as one object rather than trailing positional arguments.
 * `revalidate?: number` and `forceUnwrap?: boolean` sitting side by side is a bug waiting
 * to be written — a call that skips `init` slides the flag into the cache window and
 * nothing complains, because both positions accept a falsy value.
 */
interface RequestOptions {
    init?: RequestInit
    revalidate?: number
    forceUnwrap?: boolean
}

async function request<T>(
    method: string,
    url: URL,
    body?: unknown,
    { init, revalidate, forceUnwrap }: RequestOptions = {},
): Promise<T> {
    const { headers: initHeaders, ...rest } = init ?? {}
    let res: Response
    try {
        res = await fetch(url, {
            ...cachePolicy(init, revalidate),
            signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
            // Callers may override the cache mode or pass `next: { revalidate }`,
            // but not the method/body/headers this function is constructing.
            ...rest,
            method,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...initHeaders,
            },
            body: body ? JSON.stringify(body) : undefined,
        })
    } catch (error) {
        throw new ApiError({
            message: error instanceof Error ? error.message : 'Unable to reach server',
            isNetwork: true,
        })
    }

    if (!res.ok) throw await toApiError(res)

    // 204 and other empty bodies are valid answers; `res.json()` throws on them.
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new ApiError({ message: 'Malformed JSON from server', status: res.status })
    }
    return (forceUnwrap ? unwrapEnvelope(parsed) : unwrapApiEnvelope(url.toString(), parsed)) as T
}

/**
 * Server-side counterpart of createApiModel (read-focused).
 *
 * `revalidate` (seconds) sets the default ISR window for this model's GETs — the
 * right place for it, since "how stale may this be" is a property of the content,
 * not of each call site. Omit it and GETs stay uncached. A POST is never cached.
 *
 * ⚠ `revalidate` writes to Next's Data Cache, which in a container is the pod's own
 * filesystem (`output: 'standalone'`, no `cacheHandler`). So N replicas hold N caches,
 * and on an ephemeral or read-only filesystem the cache degrades to nothing — silently,
 * with no error. Worth knowing before treating the number as a guarantee: it bounds
 * upstream traffic *per pod*, not per cluster.
 *
 * `unwrapEnvelope: true` forces `{ data: … }` unwrapping regardless of origin. Needed for
 * the **in-cluster services**: unwrapping is normally scoped to `NEXT_PUBLIC_W_API_DOMAIN`
 * (only Tevi's gateway wraps, and another host's `data` field is its own payload), but an
 * internal service is Tevi too and wraps identically — it just doesn't match the public
 * origin. Without the flag the caller silently receives `{ data: channel }` where it
 * expected `channel`, and every field reads as `undefined`. Legacy hits the same wall and
 * unwraps by hand (`services/seo.js`: `json?.data`). Do not widen `origins.ts` to fix this
 * — that module is axios-free and shared with the browser, so teaching it about a
 * server-only host would break the client build.
 */
export function createServerApiModel({
    apiBase,
    apiPrefix = '/',
    revalidate,
    unwrapEnvelope: forceUnwrap,
}: {
    apiBase: string
    apiPrefix?: string
    revalidate?: number
    unwrapEnvelope?: boolean
}) {
    const base = apiBase.startsWith('http') ? apiBase : `${env.NEXT_PUBLIC_W_API_DOMAIN}${apiBase}`
    const prefix = apiPrefix.endsWith('/') ? apiPrefix : `${apiPrefix}/`
    const full = (path: string) => `${base}${prefix}${path.replace(/^\/+/, '')}`

    return {
        async get<T = unknown>(path: string, params?: Record<string, unknown>, init?: RequestInit) {
            return request<T>('GET', await buildUrl(full(path), params), undefined, {
                init,
                revalidate,
                forceUnwrap,
            })
        },
        async post<T = unknown>(path: string, body?: unknown, init?: RequestInit) {
            // No `revalidate` — a POST is never cached.
            return request<T>('POST', await buildUrl(full(path)), body, { init, forceUnwrap })
        },
    }
}
