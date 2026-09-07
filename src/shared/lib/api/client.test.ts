// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __testing, apiClient } from './client'
import { ApiError } from './errors'
import { clearETagCache } from './interceptors/etag'
import { clearTurnstileTokens, setTurnstileTokens } from './request-context'
import {
    addOrUpdateAccount,
    clearTokens,
    getAccounts,
    getActiveAccountId,
    setActiveAccount,
} from './token'

/**
 * The interceptors, exercised over a fake transport.
 *
 * Everything below is behaviour that only exists inside `client.ts` — credential
 * scoping, the retry rules, refresh-and-replay, the ETag round trip — and none of
 * it is reachable from a unit test of a pure function. Injecting an adapter is
 * axios's own seam for this and needs no extra dependency.
 */

const API = 'https://wapi.tevi.dev'

interface Reply {
    status?: number
    data?: unknown
    headers?: Record<string, string>
}

/** Records every request, and answers them from a queue of scripted replies. */
function scriptAdapter(replies: Reply[] | ((n: number) => Reply)) {
    const seen: InternalAxiosRequestConfig[] = []
    const adapter: AxiosAdapter = config => {
        const n = seen.length
        seen.push(config)
        const reply = typeof replies === 'function' ? replies(n) : (replies[n] ?? replies.at(-1))
        const { status = 200, data = {}, headers = {} } = reply ?? {}
        const response = {
            status,
            statusText: '',
            data,
            headers,
            config,
        } as unknown as AxiosResponse
        if (status >= 200 && status < 300) return Promise.resolve(response)
        return Promise.reject(
            new AxiosError(
                `Request failed with status code ${status}`,
                undefined,
                config,
                {},
                response,
            ),
        )
    }
    return { adapter, seen }
}

function useAdapter(replies: Reply[] | ((n: number) => Reply)) {
    const script = scriptAdapter(replies)
    apiClient.defaults.adapter = script.adapter
    return script
}

function signIn(id = 'u1', opts: { anonymous?: boolean } = {}) {
    addOrUpdateAccount({
        id,
        access_token: `at-${id}`,
        refresh_token: `rt-${id}`,
        expires_in: 3600,
        user: { id, anonymous: opts.anonymous },
    })
}

beforeEach(async () => {
    localStorage.clear()
    clearTokens()
    await clearETagCache()
    apiClient.defaults.adapter = undefined
    __testing.refreshClient.defaults.adapter = undefined
})

afterEach(() => {
    vi.useRealTimers()
})

describe('credentials', () => {
    it('sends the bearer to the Tevi API', async () => {
        signIn()
        const { seen } = useAdapter([{ data: { data: { ok: true } } }])

        await apiClient.get(`${API}/core/v1/feed/`)

        expect(seen[0].headers.get('Authorization')).toBe('Bearer at-u1')
    })

    it('never sends credentials to any other host', async () => {
        signIn()
        const { seen } = useAdapter([{ data: { data: [1] }, headers: {} }])

        // A pre-signed upload URL, a payment provider, a mistyped host — all of these
        // reach `apiClient` as absolute URLs, and none of them may see the token.
        await apiClient.post('https://storage.googleapis.com/bucket/x', { a: 1 })

        expect(seen[0].headers.get('Authorization')).toBeFalsy()
        expect(seen[0].headers.get('device-id')).toBeFalsy()
    })

    it('leaves a W_API body alone when the caller says it is not enveloped', async () => {
        signIn()
        /*
         * The real `payment/v3/stripe/callback/` body: flat, and carrying a `data` field of its own.
         * Unwrapped by origin it becomes `null` — a settled donation with no `type`, which the success
         * dialog printed as the Star copy. `enveloped: false` is how an endpoint that does not wrap
         * says so.
         */
        const body = { code: '7147573649', type: 'direct_donation', data: null }
        useAdapter([{ data: body, headers: {} }])

        const res = await apiClient.post(
            `${API}/paymee/payment/v3/stripe/callback/`,
            {},
            {
                enveloped: false,
            },
        )

        expect(res.data).toEqual(body)
    })

    it('does not sign or unwrap a foreign response', async () => {
        signIn()
        // A body that *looks* like a Tevi envelope but belongs to someone else.
        useAdapter([{ data: { data: [1, 2], cursor: 'next' } }])

        const res = await apiClient.get('https://payments.example/charges')

        expect(res.data).toEqual({ data: [1, 2], cursor: 'next' })
        expect(res.config.params?.verify).toBeUndefined()
    })
})

/**
 * The one serialiser decision the instance makes, and it is load-bearing for every paginated list
 * in the app.
 *
 * `PageCursor` is `Record<string, string[]>` by design, so a repeatable param survives a cursor
 * round-trip — which means axios receives array-valued params on **every** list request. Its
 * default emits `page[]=1`; DRF reads `query_params.get('page')`, gets `None`, and serves page 1
 * with the paginator's default size. Nothing errors: `nextPagedCursor` counts up, gets a full page
 * back every time, and the list appends the same twenty rows on every scroll forever.
 *
 * Asserted on the built URI rather than on a mocked serialiser, because the failure is in the bytes
 * that leave the process.
 */
describe('query params', () => {
    it('repeats an array key instead of bracketing it', async () => {
        const script = useAdapter([{ status: 200 }])
        await apiClient.get(`${API}/core/v3/list/`, {
            params: { page: ['2'], page_size: ['20'], media_type: ['image', 'video'] },
        })
        const uri = apiClient.getUri(script.seen[0])
        expect(uri).toContain('page=2')
        expect(uri).toContain('page_size=20')
        expect(uri).toContain('media_type=image')
        expect(uri).toContain('media_type=video')
        expect(uri).not.toContain('%5B%5D')
        expect(uri).not.toContain('[]')
    })

    /** A scalar is untouched — `false` in particular, which `filterParams` keeps and the unread
     *  count depends on (`read=false`). */
    it('leaves scalars alone', async () => {
        const script = useAdapter([{ status: 200 }])
        await apiClient.get(`${API}/notification/v1/inbox/messages/`, {
            params: { page: '1', read: false },
        })
        const uri = apiClient.getUri(script.seen[0])
        expect(uri).toContain('page=1')
        expect(uri).toContain('read=false')
    })
})

describe('retry rules', () => {
    it('replays an idempotent request, honouring Retry-After', async () => {
        const { seen } = useAdapter([
            { status: 429, headers: { 'retry-after': '0' } },
            { status: 429, headers: { 'retry-after': '0' } },
            { data: { data: 'ok' } },
        ])

        await expect(apiClient.get(`${API}/core/v1/feed/`)).resolves.toMatchObject({ data: 'ok' })
        expect(seen).toHaveLength(3) // original + MAX_RETRY
    })

    it('gives up after MAX_RETRY and rejects with an ApiError', async () => {
        const { seen } = useAdapter([{ status: 429, headers: { 'retry-after': '0' } }])

        await expect(apiClient.get(`${API}/core/v1/feed/`)).rejects.toBeInstanceOf(ApiError)
        expect(seen).toHaveLength(3)
    })

    it('NEVER replays a POST on a 5xx — the server may have processed it', async () => {
        const { seen } = useAdapter([{ status: 502 }])

        await expect(
            apiClient.post(`${API}/core/v1/tips/`, { amount: 100 }),
        ).rejects.toBeInstanceOf(ApiError)
        expect(seen).toHaveLength(1)
    })

    it('does replay a POST on 429 — the server refused it rather than running it', async () => {
        const { seen } = useAdapter([
            { status: 429, headers: { 'retry-after': '0' } },
            { data: { data: 'ok' } },
        ])

        await apiClient.post(`${API}/core/v1/tips/`, { amount: 100 })

        expect(seen).toHaveLength(2)
    })

    // Real timers, so this one pays the interceptor's 1s backoff for the single retry.
    it('replays a non-idempotent request when the caller opts in', async () => {
        const { seen } = useAdapter([{ status: 503 }, { data: { data: 'ok' } }])

        const res = await apiClient.post(`${API}/core/v1/idempotent/`, {}, { retry: true })

        expect(res.data).toBe('ok')
        expect(seen).toHaveLength(2)
    })

    it('does not retry a request the caller aborted', async () => {
        let calls = 0
        apiClient.defaults.adapter = () => {
            calls++
            return Promise.reject(new CanceledError())
        }

        await expect(apiClient.get(`${API}/core/v1/feed/`)).rejects.toMatchObject({
            isCanceled: true,
        })
        expect(calls).toBe(1)
    })
})

describe('401 handling', () => {
    it('refreshes once, replays the request, and keeps the new token', async () => {
        signIn()
        const { seen } = useAdapter([{ status: 401 }, { data: { data: 'ok' } }])
        __testing.refreshClient.defaults.adapter = (config =>
            Promise.resolve({
                status: 200,
                statusText: '',
                headers: new AxiosHeaders(),
                config,
                data: { data: { access_token: 'at-new', refresh_token: 'rt-new', expires_in: 60 } },
            } as AxiosResponse)) as AxiosAdapter

        await expect(apiClient.get(`${API}/core/v1/feed/`)).resolves.toMatchObject({ data: 'ok' })

        expect(seen).toHaveLength(2)
        expect(seen[1].headers.get('Authorization')).toBe('Bearer at-new')
        expect(getAccounts()[0].access_token).toBe('at-new')
    })

    it('drops the account and drops to anonymous when the refresh fails', async () => {
        signIn('u1')
        useAdapter([{ status: 401 }])
        __testing.refreshClient.defaults.adapter = (() =>
            Promise.reject(new AxiosError('nope'))) as AxiosAdapter
        const expired = vi.fn()
        eventBus.on('auth:session-expired', expired)

        await expect(apiClient.get(`${API}/core/v1/feed/`)).rejects.toBeInstanceOf(ApiError)

        expect(getAccounts()).toHaveLength(0)
        expect(expired).toHaveBeenCalledWith({ wasAnonymous: false })
        eventBus.off('auth:session-expired', expired)
    })

    it('never promotes another account, and says nothing when a background one dies', async () => {
        signIn('u1')
        signIn('u2') // u2 is active, so the request below goes out as u2
        const seen: InternalAxiosRequestConfig[] = []
        // The adapter holds the request open so the account can be switched while it is
        // genuinely in flight — the request interceptor is async, and assuming it had
        // already run would make this test race its own setup.
        let answer!: () => void
        const inFlight = new Promise<void>(resolve => {
            answer = resolve
        })
        apiClient.defaults.adapter = config => {
            seen.push(config)
            return inFlight.then(() =>
                Promise.reject(
                    new AxiosError('unauthorised', undefined, config, {}, {
                        status: 401,
                        data: {},
                        headers: {},
                        config,
                    } as unknown as AxiosResponse),
                ),
            )
        }
        __testing.refreshClient.defaults.adapter = (() =>
            Promise.reject(new AxiosError('nope'))) as AxiosAdapter
        const expired = vi.fn()
        eventBus.on('auth:session-expired', expired)

        const pending = apiClient.get(`${API}/core/v1/feed/`)
        await vi.waitFor(() => expect(seen).toHaveLength(1))
        // The user switches to u1 before the answer comes back, so u2 dying is now a
        // background event: nothing on screen is u2.
        setActiveAccount('u1')
        answer()
        await expect(pending).rejects.toBeInstanceOf(ApiError)

        expect(seen[0].headers.get('Authorization')).toBe('Bearer at-u2')
        expect(getAccounts().map(a => a.id)).toEqual(['u1'])
        expect(getActiveAccountId()).toBe('u1') // u1 untouched, still the one in use
        expect(expired).not.toHaveBeenCalled()
        eventBus.off('auth:session-expired', expired)
    })
})

describe('ETag round trip', () => {
    it('stores the unwrapped body and serves it back on a 304', async () => {
        const { seen } = useAdapter([
            { data: { data: { v: 1 } }, headers: { etag: 'W/"1"' } },
            { status: 304 },
        ])

        const first = await apiClient.get(`${API}/core/v1/feed/`)
        const second = await apiClient.get(`${API}/core/v1/feed/`)

        expect(first.data).toEqual({ v: 1 })
        // The 304 arrives as a rejection from axios and comes back out as a 200.
        expect(second.status).toBe(200)
        expect(second.data).toEqual({ v: 1 })
        expect(seen[1].headers.get('If-None-Match')).toBe('W/"1"')
    })

    it('re-asks unconditionally when a 304 arrives with nothing cached', async () => {
        const { seen } = useAdapter([
            { data: { data: { v: 1 } }, headers: { etag: 'W/"1"' } },
            { status: 304 },
            { data: { data: { v: 2 } } },
        ])

        await apiClient.get(`${API}/core/v1/feed/`)
        await clearETagCache() // the body outlived its validator

        await expect(apiClient.get(`${API}/core/v1/feed/`)).resolves.toMatchObject({
            data: { v: 2 },
        })
        expect(seen[2].headers.get('If-None-Match')).toBeFalsy()
    })

    it('never serves one account the body cached for another', async () => {
        signIn('a')
        useAdapter([{ data: { data: { who: 'a' } }, headers: { etag: 'W/"a"' } }])
        await apiClient.get(`${API}/core/v1/me/`)

        signIn('b')
        const { seen } = useAdapter([{ data: { data: { who: 'b' } } }])
        await apiClient.get(`${API}/core/v1/me/`)

        // Same URL, different account → b must not inherit a's validator, or the
        // server would answer 304 and b would be shown a's body.
        expect(seen[0].headers.get('If-None-Match')).toBeFalsy()
    })

    /**
     * The inverse of the test above, and the reason it needs its own flag rather than riding on
     * `persist`: a body the backend does not vary by bearer should be fetched once per device, not
     * once per account. Without `shared`, two accounts on one device each paid for the same 18KB
     * country list — the query layer had already keyed that data globally while this layer had not.
     */
    it('serves a shared body across an account switch, and only when asked', async () => {
        signIn('a')
        useAdapter([{ data: { data: { list: ['VN'] } }, headers: { etag: 'W/"c"' } }])
        await apiClient.get(`${API}/billy/v5/countries/`, { cache: { shared: true } })

        signIn('b')
        const asB = useAdapter([{ status: 304 }])
        const res = await apiClient.get(`${API}/billy/v5/countries/`, { cache: { shared: true } })

        expect(asB.seen[0].headers.get('If-None-Match')).toBe('W/"c"')
        expect(res.data).toEqual({ list: ['VN'] })
    })

    it('does not share a body the caller did not mark shared', async () => {
        signIn('a')
        useAdapter([{ data: { data: { who: 'a' } }, headers: { etag: 'W/"a"' } }])
        await apiClient.get(`${API}/billy/v5/ledger/`)

        signIn('b')
        const asB = useAdapter([{ data: { data: { who: 'b' } } }])
        await apiClient.get(`${API}/billy/v5/ledger/`)

        expect(asB.seen[0].headers.get('If-None-Match')).toBeFalsy()
    })

    it('files the response under the account that made the request, not the active one', async () => {
        signIn('a')
        signIn('b')
        setActiveAccount('a')

        // Pin the request to b while a is active — the scope has to follow the pin,
        // and it has to be the same on the way out and on the way back.
        useAdapter([{ data: { data: { who: 'b' } }, headers: { etag: 'W/"b"' } }])
        await apiClient.get(`${API}/core/v1/me/`, { accountId: 'b' })

        const asA = useAdapter([{ data: { data: { who: 'a' } } }])
        await apiClient.get(`${API}/core/v1/me/`)
        expect(asA.seen[0].headers.get('If-None-Match')).toBeFalsy()

        const asB = useAdapter([{ status: 304 }])
        const res = await apiClient.get(`${API}/core/v1/me/`, { accountId: 'b' })
        expect(asB.seen[0].headers.get('If-None-Match')).toBe('W/"b"')
        expect(res.data).toEqual({ who: 'b' })
    })

    it('does not cache a response it cannot attribute to an account', async () => {
        // A pinned one-off bearer belongs to no account in the store, so there is no
        // scope to file its body under — caching it would put it in the anonymous
        // bucket the next visitor reads.
        const first = useAdapter([{ data: { data: { v: 1 } }, headers: { etag: 'W/"1"' } }])
        await apiClient.get(`${API}/core/v1/me/`, { accessToken: 'one-off' })
        expect(first.seen[0].headers.get('If-None-Match')).toBeFalsy()

        const second = useAdapter([{ data: { data: { v: 2 } } }])
        await apiClient.get(`${API}/core/v1/me/`, { accessToken: 'one-off' })
        expect(second.seen[0].headers.get('If-None-Match')).toBeFalsy()
    })
})

describe('acting as a named, non-active account', () => {
    /** An account whose access token expired a while ago. */
    function signInExpired(id: string) {
        addOrUpdateAccount({
            id,
            access_token: `stale-${id}`,
            refresh_token: `rt-${id}`,
            expires_in: -3600,
            user: { id },
        })
    }

    it('renews the named account from its own refresh token before the call', async () => {
        signInExpired('b')
        signIn('a') // 'a' is active; 'b' is the one sitting in the switcher
        __testing.refreshClient.defaults.adapter = scriptAdapter([
            { data: { data: { access_token: 'fresh-b', expires_in: 3600 } } },
        ]).adapter
        const { seen } = useAdapter([{ data: { data: {} } }])

        await apiClient.post(`${API}/auth/v1/logout/`, {}, { accountId: 'b' })

        // Presenting the stored-but-expired token would just 401 and the session
        // would stay alive server-side — which is what a user removing an account
        // from the switcher believes they just ended.
        expect(seen[0].headers.get('Authorization')).toBe('Bearer fresh-b')
        expect(getActiveAccountId()).toBe('a')
        expect(
            getAccounts()
                .map(x => x.id)
                .sort(),
        ).toEqual(['a', 'b'])
    })

    it('drops only that account when its refresh token is rejected', async () => {
        signInExpired('b')
        signIn('a')
        const expired = vi.fn()
        eventBus.on('auth:session-expired', expired)
        __testing.refreshClient.defaults.adapter = scriptAdapter([{ status: 401 }]).adapter
        // Proactive refresh fails, so the dead token still goes out and the server
        // rejects it — the 401 path is what actually retires the account.
        useAdapter([{ status: 401 }])

        await expect(
            apiClient.post(`${API}/auth/v1/logout/`, {}, { accountId: 'b' }),
        ).rejects.toBeInstanceOf(ApiError)

        // The session was already dead server-side, so there is nothing to revoke —
        // the account is simply gone, and 'a' is untouched and still active.
        expect(getAccounts().map(x => x.id)).toEqual(['a'])
        expect(getActiveAccountId()).toBe('a')
        // A background account dying changes nothing on screen.
        expect(expired).not.toHaveBeenCalled()
        eventBus.off('auth:session-expired', expired)
    })

    it("never lets a named account borrow the active one's bearer", async () => {
        signIn('b')
        signIn('a')
        const { seen } = useAdapter([{ data: { data: {} } }])

        await apiClient.get(`${API}/core/v1/feed/`, { accountId: 'b' })

        expect(seen[0].headers.get('Authorization')).toBe('Bearer at-b')
    })
})

describe('Turnstile headers', () => {
    beforeEach(() => {
        setTurnstileTokens({ token: 'solved', challenge: 'ch-1' })
    })
    afterEach(() => {
        clearTurnstileTokens()
    })

    it('rides only on requests that opted in', async () => {
        signIn()
        const { seen } = useAdapter([{ data: { data: {} } }])

        await apiClient.post(`${API}/auth/v1/user-login/login/`, {}, { turnstile: true })

        expect(seen[0].headers.get('X-Turnstile-Token')).toBe('solved')
        expect(seen[0].headers.get('X-Turnstile-Challenge')).toBe('ch-1')
    })

    it('is withheld from every other credentialed request', async () => {
        signIn()
        const { seen } = useAdapter([{ data: { data: {} } }])

        // A background query running while a challenge is held used to carry — and
        // could spend — the single-use token, so the parked sign-in replayed into
        // another 406 and the user saw an endless loop of challenges.
        await apiClient.get(`${API}/core/v1/feed/`)

        expect(seen[0].headers.get('X-Turnstile-Token')).toBeFalsy()
        expect(seen[0].headers.get('X-Turnstile-Challenge')).toBeFalsy()
    })
})
