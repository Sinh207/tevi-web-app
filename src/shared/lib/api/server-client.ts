import 'server-only'
import { env } from '@shared/config/env'
import { ApiError } from './errors'
import { shouldSignRequest, signUrl } from './interceptors/sign'

/**
 * Server-side API access for RSC / server components — PUBLIC content only
 * (SEO/landing pages). Auth is client-side (localStorage token store, not
 * cookies), so there is no bearer available on the server. It HMAC-signs the
 * URL (WebCrypto works in Node) and does one-shot uncached `fetch`es.
 * For authenticated data, fetch from the client via the browser apiClient.
 */
function unwrapEnvelope(body: unknown): unknown {
    if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
        return (body as { data: unknown }).data
    }
    return body
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

async function request<T>(
    method: string,
    url: URL,
    body?: unknown,
    init?: RequestInit,
): Promise<T> {
    const res = await fetch(url, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        ...init,
    })
    if (!res.ok) {
        throw new ApiError({
            message: `Server request failed (${res.status})`,
            status: res.status,
        })
    }
    return unwrapEnvelope(await res.json()) as T
}

/** Server-side counterpart of createApiModel (read-focused). */
export function createServerApiModel({
    apiBase,
    apiPrefix = '/',
}: {
    apiBase: string
    apiPrefix?: string
}) {
    const base = apiBase.startsWith('http') ? apiBase : `${env.NEXT_PUBLIC_W_API_DOMAIN}${apiBase}`
    const prefix = apiPrefix.endsWith('/') ? apiPrefix : `${apiPrefix}/`
    const full = (path: string) => `${base}${prefix}${path.replace(/^\/+/, '')}`

    return {
        async get<T = unknown>(path: string, params?: Record<string, unknown>, init?: RequestInit) {
            return request<T>('GET', await buildUrl(full(path), params), undefined, init)
        },
        async post<T = unknown>(path: string, body?: unknown, init?: RequestInit) {
            return request<T>('POST', await buildUrl(full(path)), body, init)
        },
    }
}
