import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { createServerApiModel } from './server-client'

/** `vitest.config.ts` pins this. Anything else is "another host" as far as unwrapping goes. */
const W_API = 'https://wapi.tevi.dev'
const INTERNAL = 'http://tevi-channel/tevi-channel'

/**
 * A **factory**, not a value. A `Response` body can only be read once, so handing the same
 * instance to `mockResolvedValue` makes the second call in a test fail with "Body is
 * unusable" — which looks like a bug in the client and is not.
 */
function jsonResponse(body: unknown, status = 200) {
    return () =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** The URL the model actually requested, with the HMAC `?verify=` stripped for comparison. */
function requestedUrl(call = 0): URL {
    const url = new URL(String(fetchMock.mock.calls[call][0]))
    url.searchParams.delete('verify')
    return url
}

describe('createServerApiModel — envelope unwrapping', () => {
    it('unwraps the W_API envelope by origin, with no flag needed', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: { slug: 'ada' } }))
        const api = createServerApiModel({ apiBase: `${W_API}/core` })
        await expect(api.get('v3/channel/channels/ada/')).resolves.toEqual({ slug: 'ada' })
    })

    /**
     * The bug this option exists for. The in-cluster service wraps in `{ data }` exactly
     * like the gateway, but its origin does not match `NEXT_PUBLIC_W_API_DOMAIN`, so the
     * origin-scoped rule leaves the envelope on. The caller then reads `channel.slug` off
     * `{ data: { slug } }` and every field is `undefined` — no error, no clue.
     */
    it('leaves an internal host wrapped without the flag — the trap', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: { slug: 'ada' } }))
        const api = createServerApiModel({ apiBase: INTERNAL })
        await expect(api.get('v3/channel/channels/ada/')).resolves.toEqual({
            data: { slug: 'ada' },
        })
    })

    it('unwraps an internal host when told to', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: { slug: 'ada' } }))
        const api = createServerApiModel({ apiBase: INTERNAL, unwrapEnvelope: true })
        await expect(api.get('v3/channel/channels/ada/')).resolves.toEqual({ slug: 'ada' })
    })

    it('applies the flag to POST as well as GET', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: { ok: true } }))
        const api = createServerApiModel({ apiBase: INTERNAL, unwrapEnvelope: true })
        await expect(api.post('v1/thing/', { a: 1 })).resolves.toEqual({ ok: true })
    })

    it('passes a body that is already flat straight through', async () => {
        fetchMock.mockImplementation(jsonResponse([1, 2, 3]))
        const api = createServerApiModel({ apiBase: INTERNAL, unwrapEnvelope: true })
        await expect(api.get('v1/list/')).resolves.toEqual([1, 2, 3])
    })
})

describe('createServerApiModel — signing and caching', () => {
    it('signs a W_API url and not an internal one', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: null }))

        await createServerApiModel({ apiBase: `${W_API}/core` }).get('v1/x/')
        expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.has('verify')).toBe(true)

        // `?verify=` is a speed bump on the public gateway; inside the cluster it is noise.
        await createServerApiModel({ apiBase: INTERNAL }).get('v1/x/')
        expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.has('verify')).toBe(false)
    })

    it('is no-store by default and revalidates when the model says so', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: null }))

        await createServerApiModel({ apiBase: INTERNAL }).get('v1/x/')
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })

        await createServerApiModel({ apiBase: INTERNAL, revalidate: 60 }).get('v1/x/')
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ next: { revalidate: 60 } })
        expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('cache')
    })

    /** A POST is never cached, whatever the model's window says. */
    it('never puts a revalidate window on a POST', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: null }))
        await createServerApiModel({ apiBase: INTERNAL, revalidate: 60 }).post('v1/x/', {})
        expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('next')
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
    })

    it('drops empty params and keeps the rest', async () => {
        fetchMock.mockImplementation(jsonResponse({ data: null }))
        await createServerApiModel({ apiBase: INTERNAL }).get('v1/x/', {
            page: 2,
            q: '',
            missing: null,
            zero: 0,
        })
        const params = requestedUrl().searchParams
        expect(params.get('page')).toBe('2')
        expect(params.get('zero')).toBe('0')
        expect(params.has('q')).toBe(false)
        expect(params.has('missing')).toBe(false)
    })
})

describe('createServerApiModel — failures', () => {
    it('normalises an HTTP error into ApiError with the backend message', async () => {
        fetchMock.mockImplementation(jsonResponse({ message: 'Not here', code: 404 }, 404))
        const api = createServerApiModel({ apiBase: INTERNAL })
        await expect(api.get('v1/x/')).rejects.toMatchObject({
            name: 'ApiError',
            status: 404,
            message: 'Not here',
            code: '404',
        })
    })

    it('flags a transport failure as a network error, not a status', async () => {
        fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND tevi-channel'))
        const api = createServerApiModel({ apiBase: INTERNAL })
        const error = await api.get('v1/x/').catch((e: unknown) => e)
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).isNetwork).toBe(true)
        expect((error as ApiError).status).toBeUndefined()
    })

    it('treats an empty body as a valid answer rather than malformed JSON', async () => {
        fetchMock.mockImplementation(() => new Response(null, { status: 204 }))
        const api = createServerApiModel({ apiBase: INTERNAL })
        await expect(api.get('v1/x/')).resolves.toBeUndefined()
    })

    it('rejects a non-JSON 200 — an HTML error page is not a payload', async () => {
        fetchMock.mockImplementation(() => new Response('<html>502</html>', { status: 200 }))
        const api = createServerApiModel({ apiBase: INTERNAL })
        await expect(api.get('v1/x/')).rejects.toMatchObject({
            message: 'Malformed JSON from server',
        })
    })
})
