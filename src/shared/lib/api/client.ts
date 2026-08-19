import { env } from '@shared/config/env'
import { eventBus } from '@shared/lib/event-bus'
import { LOCKS, withLock } from '@shared/lib/locks'
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, normalizeApiError } from './errors'
import {
    ANON_SCOPE,
    clearETagScope,
    generateCacheKey,
    getCachedData,
    getStoredEtag,
    recordError,
    recordHit,
    recordMiss,
    recordRequest,
    recordRevalidation,
    storeEtag,
} from './interceptors/etag'
import { shouldSignRequest, signUrl } from './interceptors/sign'
import { isApiUrl } from './origins'
import { getDeviceInfo, getTurnstileHeaders } from './request-context'
import {
    getAccessToken,
    getAccount,
    getActiveAccountId,
    getExpiresAt,
    removeAccount,
    setTokens,
    syncFromStorage,
} from './token'
import { unwrapApiEnvelope, unwrapEnvelope } from './unwrap'

const API_TIMEOUT = 30_000
const MAX_RETRY = 2
const RETRY_DELAY_MS = 1000
const W_API = env.NEXT_PUBLIC_W_API_DOMAIN
const REFRESH_URL = `${W_API}/auth/v1/token/refresh/`

/** Extra per-request options callers may set on the axios config. */
declare module 'axios' {
    export interface AxiosRequestConfig {
        /**
         * Act as this account: its bearer is attached, a 401 refreshes *it*, and its
         * scope namespaces the ETag cache. Normally what you want when "the active
         * account" is not precise enough — the active account can change between the
         * moment a caller decides what to fetch and the moment the request goes out.
         */
        accountId?: string
        /**
         * Pin a one-off bearer that is not in the token store (e.g. revoking tokens
         * the store refused to keep). **Not refreshable**, and never cached: a body
         * we cannot attribute to an account has no scope to be filed under.
         * Prefer `accountId`.
         */
        accessToken?: string
        /**
         * Send `X-Turnstile-*` if a solved challenge is held.
         *
         * Only the handful of endpoints that can answer 406 want these. A Turnstile
         * token is single-use, so broadcasting it onto every credentialed request —
         * as this client used to — let an unrelated background query spend the token
         * before the parked sign-in could replay with it, which reads to the user as
         * an endless loop of challenges.
         */
        turnstile?: boolean
        /**
         * Replay this request on a transport failure even though its method is not
         * idempotent. Only set it on a POST/PATCH the backend deduplicates (an
         * idempotency key, a natural unique constraint) — see the retry rules below.
         */
        retry?: boolean
    }
}

/**
 * Methods that may be sent again on their own.
 *
 * The retry loop used to look only at the status, so **every** method was replayed
 * — a POST that timed out at 30s, or came back 502 from a gateway *after* the
 * backend had already processed it, was sent two more times. On a platform that
 * moves money that is a double charge waiting to happen. A 429 is the one
 * exception that holds for any method: it means the server refused the request,
 * not that it ran it.
 */
const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options', 'put', 'delete'])

/**
 * Bookkeeping the interceptors hang on the config as a request travels through
 * them. Deliberately *not* a module augmentation: these are this file's private
 * state, not options anyone calling `apiClient.get()` should see or set.
 */
interface RequestState {
    /** A 401 refresh has already been attempted for this request. */
    _retry?: boolean
    _retryCount?: number
    /** Which account's bearer this request carries — see `performRefresh`. */
    _accountId?: string | null
    /**
     * Which ETag namespace this request reads and writes, captured once on the way
     * out. Resolving it separately on the request and the response let an account
     * switch in between file one user's body under another's scope. `undefined`
     * means "do not cache this at all" — a request whose identity we cannot name.
     */
    _etagScope?: string
    /** Re-issued after an unusable 304; do not send `If-None-Match` again. */
    _noConditional?: boolean
    /** When the caller's first attempt started, for the total-time retry budget. */
    _startedAt?: number
}
type ClientConfig = InternalAxiosRequestConfig & RequestState

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

/**
 * Nothing from the refresh call escapes as a raw `AxiosError`.
 *
 * Its request body is `{ refresh_token, ...device }`, and an `AxiosError` carries
 * `config.data` — so the one credential the app is most careful never to log is
 * sitting on the error object. `performRefresh` is exported and its promise is
 * reachable through `refreshFlights`, so "both call sites happen to swallow it"
 * is not a guarantee, and `app/error.tsx` already has a TODO to forward errors to
 * RUM. `normalizeApiError` drops `config` and keeps only the response body.
 */
refreshClient.interceptors.response.use(
    response => response,
    error => Promise.reject(normalizeApiError(error)),
)

/** Resolve the absolute request URL. Models pass absolute URLs (createApiModel),
 *  so axios ignores baseURL for the real request — combine only when relative. */
function resolveFullUrl(config: InternalAxiosRequestConfig): string {
    const url = config.url ?? ''
    if (/^https?:\/\//i.test(url)) return url
    const base = (config.baseURL ?? '').replace(/\/+$/, '')
    return `${base}/${url.replace(/^\/+/, '')}`
}

/** Refresh this far ahead of the stated expiry, to cover clock skew and latency. */
const REFRESH_SKEW_MS = 5000

/** Is this account's access token at or past its refresh point? An account with
 *  no stated expiry is never refreshed proactively — the 401 path covers it. */
function isTokenExpired(accountId?: string | null): boolean {
    const expiresAt = accountId ? (getAccount(accountId)?.expires_at ?? null) : getExpiresAt()
    if (!expiresAt) return false
    return Date.now() >= expiresAt - REFRESH_SKEW_MS
}

// ── Single-flight refresh ───────────────────────────────────────────────────

/**
 * One in-flight refresh **per account**, with the result written back to that
 * account by id.
 *
 * A single global promise read the refresh token from whichever account was
 * active when it started and handed the new tokens to whichever was active when
 * it resolved. Switching accounts in that window — or a second account's request
 * 401ing and joining the same flight — moved one user's tokens onto another
 * user's record, which logs both of them into the wrong place.
 */
const refreshFlights = new Map<string, Promise<string>>()

/**
 * `staleToken` is the access token the caller already knows to be dead (the one
 * a 401 came back on). It is what makes the cross-tab lock safe to skip work under:
 * whoever holds the lock re-reads the store, and if the stored token is no
 * longer the failed one, another tab has already refreshed and we take theirs
 * instead of burning a refresh token that may since have been rotated.
 */
export function performRefresh(accountId?: string | null, staleToken?: string): Promise<string> {
    const id = accountId ?? getActiveAccountId()
    if (!id) return Promise.reject(new ApiError({ message: 'No account to refresh' }))

    const inflight = refreshFlights.get(id)
    if (inflight) return inflight

    if (!getAccount(id)?.refresh_token) {
        return Promise.reject(new ApiError({ message: 'No refresh token' }))
    }

    const flight = withLock(LOCKS.refresh(id), async () => {
        // Whatever this tab believed before it queued for the lock is now suspect.
        syncFromStorage()
        const account = getAccount(id)
        if (!account?.refresh_token) throw new ApiError({ message: 'Account is gone' })

        const alreadyDone = staleToken
            ? account.access_token !== staleToken
            : !account.expires_at || account.expires_at - Date.now() > REFRESH_SKEW_MS
        if (alreadyDone) return account.access_token

        const res = await refreshClient.post(REFRESH_URL, {
            refresh_token: account.refresh_token,
            ...getDeviceInfo(),
        })
        const data = unwrapEnvelope(res.data) as {
            access_token?: string
            refresh_token?: string | null
            expires_in?: number | null
        } | null
        if (!data?.access_token) {
            throw new ApiError({ message: 'Refresh response carried no access token' })
        }
        const stored = setTokens(
            {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
            },
            id,
        )
        // The account was removed while the refresh was in the air; replaying the
        // original request with a bearer nobody stored just 401s again.
        if (!stored) throw new ApiError({ message: 'Account is gone' })
        return data.access_token
    }).finally(() => {
        refreshFlights.delete(id)
    })

    refreshFlights.set(id, flight)
    return flight
}

// ── Request interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.request.use(async (rawConfig: InternalAxiosRequestConfig) => {
    const config = rawConfig as ClientConfig
    const fullUrl = resolveFullUrl(config)
    const isRefresh = fullUrl.startsWith(REFRESH_URL)
    // Credentials are for the Tevi API only — never a CDN, a pre-signed upload URL
    // or anything else a model might legitimately be pointed at (see origins.ts).
    const isCredentialed = isApiUrl(fullUrl) && !isRefresh

    config._startedAt ??= Date.now()

    if (isCredentialed) {
        const device = getDeviceInfo()
        if (device.device_id) config.headers.set('device-id', device.device_id)
        // Opt-in, not broadcast: a Turnstile token is single-use (see `turnstile`).
        if (config.turnstile) {
            for (const [k, v] of Object.entries(getTurnstileHeaders())) config.headers.set(k, v)
        }
    }

    // Auth header (+ proactive refresh)
    if (isCredentialed && !config.headers.has('Authorization')) {
        const pinned = config.accessToken
        if (pinned) {
            // A bearer the store does not know: usable, but nothing can refresh it
            // and nothing can say whose cache its response belongs in.
            config.headers.set('Authorization', `Bearer ${pinned}`)
        } else {
            const accountId = config.accountId ?? getActiveAccountId()
            if (isTokenExpired(accountId) && getAccount(accountId)?.refresh_token) {
                try {
                    await performRefresh(accountId)
                } catch {
                    // fall through — response 401 handler will deal with it
                }
            }
            const token = config.accountId
                ? (getAccount(config.accountId)?.access_token ?? null)
                : getAccessToken()
            if (token) {
                config.headers.set('Authorization', `Bearer ${token}`)
                config._accountId = accountId
                config._etagScope = accountId ?? ANON_SCOPE
            }
        }
    }
    // An unauthenticated call to our own API is still cacheable — it just belongs
    // to whoever is not signed in.
    if (isApiUrl(fullUrl) && !config.accessToken) config._etagScope ??= ANON_SCOPE

    // ETag: If-None-Match for GET. Skipped on a replay, which already carries the
    // validator it was given and must not be counted as a second request.
    const isGet = (config.method ?? 'get').toLowerCase() === 'get'
    const isFirstAttempt = !config._retryCount && !config._retry
    if (
        isGet &&
        config._etagScope &&
        !config._noConditional &&
        !config.headers.has('If-None-Match')
    ) {
        if (isFirstAttempt) recordRequest()
        const key = generateCacheKey(fullUrl, config.params)
        const etag = await getStoredEtag(config._etagScope, key)
        if (etag) config.headers.set('If-None-Match', etag)
        else if (isFirstAttempt) recordMiss()
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

/** Longest we will sit on a server's `Retry-After` before giving up on the hint. */
const MAX_RETRY_AFTER_MS = 10_000

/**
 * Longest a caller may be held across *all* attempts, including the waits between
 * them. `MAX_RETRY` bounds how many times we try; this bounds how long that can
 * take, which is the number a loading state actually has to live with.
 */
const MAX_TOTAL_MS = 45_000

/**
 * `Retry-After` in milliseconds, or null when there is nothing usable.
 *
 * RFC 9110 allows both forms — delay-seconds (`120`) and an HTTP-date
 * (`Wed, 21 Oct 2015 07:28:00 GMT`) — and servers use both, so parsing only the integer
 * silently ignores half of them. A hint further out than `MAX_RETRY_AFTER_MS` is dropped
 * rather than honoured: holding a request open for minutes is worse for the caller than
 * failing now and letting them decide.
 */
export function parseRetryAfter(value: unknown): number | null {
    if (typeof value !== 'string' || !value.trim()) return null

    const seconds = Number(value.trim())
    if (Number.isFinite(seconds)) {
        const ms = seconds * 1000
        return ms >= 0 && ms <= MAX_RETRY_AFTER_MS ? ms : null
    }

    const at = Date.parse(value)
    if (Number.isNaN(at)) return null
    const ms = at - Date.now()
    return ms >= 0 && ms <= MAX_RETRY_AFTER_MS ? ms : null
}

/**
 * An account's refresh token was rejected. Drop it and everything of its own.
 *
 * Two rules, both learned the hard way:
 *
 * - **A background account dying changes nothing on screen.** The old code
 *   reloaded the page whenever any account remained — including when the account
 *   that died was not the one being used. A stale token on a second account
 *   would take the whole tab down mid-scroll for no visible reason.
 * - **Never adopt another identity, and never redirect.** `removeAccount` used
 *   to promote the next account, so a dead session silently made you act as a
 *   different real person; the alternative branch bounced you to `/login` from
 *   whatever page you were reading. Now the account is removed without promotion
 *   and `AuthProvider` establishes an anonymous session in place — the other
 *   accounts stay in the switcher for the user to choose deliberately, and each
 *   screen asks for a real sign-in only when an action actually needs one.
 */
function handleDeadAccount(failedId: string | null) {
    // Read before removing — the account is what says whether this was a real
    // session or the anonymous one every visitor carries.
    const account = getAccount(failedId)
    const wasAnonymous = Boolean(account?.user?.anonymous)
    const wasActive = Boolean(failedId) && failedId === getActiveAccountId()

    if (failedId) {
        removeAccount(failedId, { promote: false })
        // Its cached response bodies outlive it otherwise, on a device that may
        // well be shared.
        void clearETagScope(failedId)
    }

    if (!wasActive || typeof window === 'undefined') return
    eventBus.emit('auth:session-expired', { wasAnonymous })
}

apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        const config = response.config as ClientConfig
        const fullUrl = resolveFullUrl(config)
        response.data = unwrapApiEnvelope(fullUrl, response.data)
        // Store ETag on cacheable 200s (payload already unwrapped). The scope is the
        // one captured on the way out, not whoever is active now.
        const etag = response.headers?.etag
        if (etag && config._etagScope && (config.method ?? 'get').toLowerCase() === 'get') {
            storeEtag(
                config._etagScope,
                generateCacheKey(fullUrl, config.params),
                etag,
                response.data,
            )
            // We asked "has it changed?" and it had — neither a hit nor a miss.
            if (config.headers?.has('If-None-Match')) recordRevalidation()
        }
        return response
    },
    async (error: AxiosError) => {
        // An aborted request is not a failure. React Query cancels in-flight queries
        // on unmount and on refetch; retrying one costs two more requests for a screen
        // that is already gone, and counting it would poison the error metric.
        if (axios.isCancel(error)) return Promise.reject(normalizeApiError(error))

        const config = error.config as ClientConfig | undefined
        const status = error.response?.status
        const fullUrl = config ? resolveFullUrl(config) : ''

        // 304 Not Modified → serve cached body as a 200
        if (status === 304 && config?._etagScope) {
            const cached = await getCachedData(
                config._etagScope,
                generateCacheKey(fullUrl, config.params),
            )
            if (cached !== undefined) {
                recordHit()
                return {
                    ...error.response,
                    status: 200,
                    data: cached,
                    config,
                } as AxiosResponse
            }
            // The validator outlived the body it belongs to — memory trimmed, the
            // IndexedDB record expired, or the account scope changed under it. A 304
            // with nothing to serve is not something a caller can act on, so ask again
            // unconditionally rather than surfacing an empty "success".
            if (!config._noConditional) {
                config._noConditional = true
                config.headers?.delete('If-None-Match')
                return apiClient(config)
            }
        }

        // 401 → single-flight refresh + replay. Safe for any method, unlike the retry
        // loop below: a 401 says the request was rejected at the door, so replaying it
        // cannot repeat work the server already did. A request carrying a pinned bearer
        // (`accessToken`) is not the token store's to refresh.
        const isRefreshCall = fullUrl.startsWith(REFRESH_URL)
        const accountId = config?._accountId ?? null
        if (
            status === 401 &&
            config &&
            !config._retry &&
            !config.accessToken &&
            !isRefreshCall &&
            getAccount(accountId)?.refresh_token
        ) {
            config._retry = true
            try {
                // The bearer that just failed — so a tab that already refreshed can be
                // detected and its token reused (see performRefresh).
                const sent = String(config.headers?.get('Authorization') ?? '')
                const token = await performRefresh(accountId, sent.replace(/^Bearer\s+/i, ''))
                config.headers.set('Authorization', `Bearer ${token}`)
                return apiClient(config)
            } catch {
                // Only drop the dead account; other accounts stay signed in.
                handleDeadAccount(accountId ?? getActiveAccountId())
                recordError()
                return Promise.reject(normalizeApiError(error))
            }
        }

        // Retry on network / 5xx / 429, and only for a request that is safe to send
        // twice (see IDEMPOTENT_METHODS). This is the app's ONLY retry loop — TanStack
        // Query treats an ApiError as final so the two do not multiply (query-client.ts).
        const method = (config?.method ?? 'get').toLowerCase()
        const failureIsRetriable =
            !status || status >= 500 || status === 429 || error.code === 'ECONNABORTED'
        const requestIsReplayable =
            IDEMPOTENT_METHODS.has(method) || status === 429 || config?.retry === true
        if (
            failureIsRetriable &&
            requestIsReplayable &&
            config &&
            (config._retryCount ?? 0) < MAX_RETRY
        ) {
            // A 429 usually says when to come back. Backing off on our own schedule
            // instead just spends the next attempt earning another 429.
            const after = parseRetryAfter(error.response?.headers?.['retry-after'])
            const delay = after ?? RETRY_DELAY_MS * ((config._retryCount ?? 0) + 1)
            // Attempt count alone bounded nothing useful: three 30s timeouts either
            // side of two 30s `Retry-After` waits is two and a half minutes of
            // spinner for a screen that has no way to say so. Budget the total.
            const elapsed = Date.now() - (config._startedAt ?? Date.now())
            const remaining = MAX_TOTAL_MS - elapsed
            if (remaining > delay) {
                config._retryCount = (config._retryCount ?? 0) + 1
                await sleep(delay)
                return apiClient(config)
            }
        }

        recordError()
        return Promise.reject(normalizeApiError(error))
    },
)

export { ApiError, unwrapEnvelope }

/**
 * Seam for `client.test.ts` only.
 *
 * The interceptors are the riskiest code in the app, and the only way to exercise
 * them is to feed axios a fake transport. `apiClient` is exported already;
 * `refreshClient` is deliberately private, so it is reachable here rather than by
 * widening its visibility for every caller.
 */
export const __testing = { refreshClient }
