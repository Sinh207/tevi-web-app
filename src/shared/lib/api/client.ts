import { env } from '@shared/config/env'
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, normalizeApiError } from './errors'
import {
    generateCacheKey,
    getCachedData,
    getStoredEtag,
    recordError,
    recordHit,
    recordRequest,
    storeEtag,
} from './interceptors/etag'
import { shouldSignRequest, signUrl } from './interceptors/sign'
import { getDeviceInfo, getTurnstileHeaders } from './request-context'
import {
    clearTokens,
    getAccessToken,
    getActiveAccountId,
    getExpiresAt,
    getRefreshToken,
    removeAccount,
    setTokens,
} from './token'

const API_TIMEOUT = 30_000
const MAX_RETRY = 2
const RETRY_DELAY_MS = 1000
const STORAGE_HOST = 'https://storage.googleapis.com'
const W_API = env.NEXT_PUBLIC_W_API_DOMAIN
const REFRESH_URL = `${W_API}/auth/v1/token/refresh/`

/** Extra per-request options carried on the axios config. */
declare module 'axios' {
    export interface AxiosRequestConfig {
        /** Pin a one-off bearer (e.g. fetch /me for a freshly-added account). */
        accessToken?: string
        _retry?: boolean
        _retryCount?: number
    }
}

// Models build absolute URLs via createApiModel, so no baseURL is needed;
// GET de-duplication is handled by TanStack Query, not this axios layer.
export const apiClient = axios.create({
    timeout: API_TIMEOUT,
    headers: { Accept: 'application/json' },
})

/** Bare instance for the refresh call — no auth/etag interceptors (avoids
 *  recursion), but still HMAC-signed + device-id'd since it hits W_API. */
const refreshClient = axios.create({
    baseURL: W_API,
    timeout: API_TIMEOUT,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

refreshClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const url = resolveFullUrl(config)
    const device = getDeviceInfo()
    if (device.device_id) config.headers.set('device-id', device.device_id)
    if (shouldSignRequest(url)) {
        const verify = await signUrl(url)
        if (verify) config.params = { ...(config.params ?? {}), verify }
    }
    return config
})

/** Resolve the absolute request URL. Models pass absolute URLs (createApiModel),
 *  so axios ignores baseURL for the real request — combine only when relative. */
function resolveFullUrl(config: InternalAxiosRequestConfig): string {
    const url = config.url ?? ''
    if (/^https?:\/\//i.test(url)) return url
    const base = (config.baseURL ?? '').replace(/\/+$/, '')
    return `${base}/${url.replace(/^\/+/, '')}`
}

function isTokenExpired(): boolean {
    const expiresAt = getExpiresAt()
    if (!expiresAt) return false
    return Date.now() >= expiresAt - 5000 // 5s skew
}

// ── Single-flight refresh ───────────────────────────────────────────────────
let refreshPromise: Promise<string> | null = null

export function performRefresh(): Promise<string> {
    if (refreshPromise) return refreshPromise
    const refresh_token = getRefreshToken()
    if (!refresh_token) return Promise.reject(new Error('No refresh token'))

    refreshPromise = refreshClient
        .post(REFRESH_URL, { refresh_token, ...getDeviceInfo() })
        .then(res => {
            const data = res.data?.data ?? res.data
            setTokens({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
            })
            return data.access_token as string
        })
        .finally(() => {
            refreshPromise = null
        })

    return refreshPromise
}

// ── Request interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const fullUrl = resolveFullUrl(config)
    const isRefresh = fullUrl.includes(REFRESH_URL)
    const isStorage = fullUrl.startsWith(STORAGE_HOST)

    // Device + turnstile headers
    const device = getDeviceInfo()
    if (device.device_id) config.headers.set('device-id', device.device_id)
    for (const [k, v] of Object.entries(getTurnstileHeaders())) config.headers.set(k, v)

    // Auth header (+ proactive refresh)
    if (!isStorage && !isRefresh && !config.headers.has('Authorization')) {
        const pinned = config.accessToken
        if (pinned) {
            config.headers.set('Authorization', `Bearer ${pinned}`)
        } else {
            if (isTokenExpired() && getRefreshToken()) {
                try {
                    await performRefresh()
                } catch {
                    // fall through — response 401 handler will deal with it
                }
            }
            const token = getAccessToken()
            if (token) config.headers.set('Authorization', `Bearer ${token}`)
        }
    }

    // ETag: If-None-Match for GET
    if ((config.method ?? 'get').toLowerCase() === 'get' && shouldSignRequest(fullUrl)) {
        recordRequest()
        const key = generateCacheKey(fullUrl, config.params)
        const etag = await getStoredEtag(key)
        if (etag) config.headers.set('If-None-Match', etag)
    }

    // HMAC signing (append ?verify=)
    if (shouldSignRequest(fullUrl)) {
        const verify = await signUrl(fullUrl)
        if (verify) config.params = { ...(config.params ?? {}), verify }
    }

    return config
})

// ── Response interceptor ────────────────────────────────────────────────────
function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms))
}

apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        // Store ETag on cacheable 200s
        const etag = response.headers?.etag
        const fullUrl = resolveFullUrl(response.config as InternalAxiosRequestConfig)
        if (etag && (response.config.method ?? 'get').toLowerCase() === 'get') {
            const key = generateCacheKey(fullUrl, response.config.params)
            storeEtag(key, etag, response.data)
        }
        return response
    },
    async (error: AxiosError) => {
        const config = error.config as InternalAxiosRequestConfig | undefined
        const status = error.response?.status

        // 304 Not Modified → serve cached body as a 200
        if (status === 304 && config) {
            const fullUrl = resolveFullUrl(config)
            const cached = await getCachedData(generateCacheKey(fullUrl, config.params))
            if (cached !== undefined) {
                recordHit()
                return {
                    ...error.response,
                    status: 200,
                    data: cached,
                    config,
                } as AxiosResponse
            }
        }

        // 401 → single-flight refresh + replay
        const isRefreshCall = (config?.url ?? '').includes('token/refresh')
        if (status === 401 && config && !config._retry && !isRefreshCall && getRefreshToken()) {
            config._retry = true
            try {
                const token = await performRefresh()
                config.headers.set('Authorization', `Bearer ${token}`)
                return apiClient(config)
            } catch {
                // Only drop the dead account; other accounts stay signed in.
                const failed = getActiveAccountId()
                if (failed) removeAccount(failed)
                if (typeof window !== 'undefined') {
                    if (!getActiveAccountId()) {
                        clearTokens()
                        if (window.location.pathname !== '/login') {
                            window.localStorage.setItem('tevi.session_lost', '1')
                            window.location.assign('/login')
                        }
                    } else {
                        window.location.reload()
                    }
                }
                recordError()
                return Promise.reject(normalizeApiError(error))
            }
        }

        // Retry on network / 5xx / 429
        const retriable =
            !status || status >= 500 || status === 429 || error.code === 'ECONNABORTED'
        if (retriable && config && (config._retryCount ?? 0) < MAX_RETRY) {
            config._retryCount = (config._retryCount ?? 0) + 1
            await sleep(RETRY_DELAY_MS * config._retryCount)
            return apiClient(config)
        }

        recordError()
        return Promise.reject(normalizeApiError(error))
    },
)

export { ApiError }
