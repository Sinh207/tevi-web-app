import 'server-only'
import { env } from '@shared/config/env'
import { cookies } from 'next/headers'
import { ApiError } from './errors'
import { shouldSignRequest, signUrl } from './interceptors/sign'

/**
 * Server-side API access for RSC / server components (SEO pages).
 *
 * Unlike the browser client, there is no token store, ETag cache, or refresh
 * loop here — it reads the active account's bearer from the request cookie
 * (`t_uat`), HMAC-signs the URL (WebCrypto works in Node), and does a one-shot
 * `fetch`. Requests are uncached by default so SSR reflects fresh data.
 */
const CK_ACCESS = 't_uat' // SSO cookie contract (see token.ts)

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
    const token = (await cookies()).get(CK_ACCESS)?.value
    const res = await fetch(url, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    return (await res.json()) as T
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
