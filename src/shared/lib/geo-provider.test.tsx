// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountryProvider, fetchCountry, useCountry } from './geo-provider'

/**
 * The two claims this file exists for:
 *
 * 1. **Every HTTP failure is `null`, not a throw.** A 4xx, a 5xx, an HTML error page from a proxy
 *    that never reached the app, a timeout — all of them are ordinary answers here, because the
 *    country only prefills a form. Getting this wrong means an unhandled rejection in a query on
 *    every page load behind a misconfigured ingress.
 * 2. **A country resolved during the document render costs no request.** That is the whole point of
 *    reading the header in `(web)/layout.tsx`, and a regression would be invisible: the screen would
 *    still work, one request later.
 */

afterEach(() => {
    vi.unstubAllGlobals()
})

function stubFetch(implementation: () => Promise<unknown> | never) {
    const spy = vi.fn(implementation as () => Promise<Response>)
    vi.stubGlobal('fetch', spy)
    return spy
}

/** A `Response` as far as `fetchCountry` reads one. */
function response({
    ok = true,
    status = 200,
    json = async () => ({ country: 'VN' }),
}: {
    ok?: boolean
    status?: number
    json?: () => Promise<unknown>
} = {}) {
    return { ok, status, json } as unknown as Response
}

describe('fetchCountry', () => {
    it('reads and normalises the country', async () => {
        stubFetch(async () => response({ json: async () => ({ ip: '1.2.3.4', country: 'vn' }) }))
        await expect(fetchCountry()).resolves.toBe('VN')
    })

    it('answers null for a code that means unknown', async () => {
        stubFetch(async () => response({ json: async () => ({ country: 'XX' }) }))
        await expect(fetchCountry()).resolves.toBeNull()
    })

    it('answers null for 4xx and 5xx', async () => {
        for (const status of [401, 404, 429, 500, 502, 503]) {
            stubFetch(async () => response({ ok: false, status }))
            await expect(fetchCountry()).resolves.toBeNull()
        }
    })

    it('answers null for a body that is not JSON', async () => {
        // What a proxy's HTML error page does to `res.json()` — and it is thrown *after* `ok`, so a
        // status check alone does not cover it.
        stubFetch(async () =>
            response({
                json: async () => {
                    throw new SyntaxError('Unexpected token <')
                },
            }),
        )
        await expect(fetchCountry()).resolves.toBeNull()
    })

    it('answers null when the request itself fails', async () => {
        stubFetch(async () => {
            throw new DOMException('The operation was aborted.', 'TimeoutError')
        })
        await expect(fetchCountry()).resolves.toBeNull()

        stubFetch(async () => {
            throw new TypeError('Failed to fetch')
        })
        await expect(fetchCountry()).resolves.toBeNull()
    })

    it('sends no credentials — the answer is the connection’s, not the account’s', async () => {
        const spy = stubFetch(async () => response())
        await fetchCountry()
        expect(spy).toHaveBeenCalledWith(
            '/api/client-ip',
            expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
        )
    })
})

function renderProvider(country?: string | null) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let read: ReturnType<typeof useCountry> | undefined
    function Probe() {
        read = useCountry()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <CountryProvider country={country}>
                <Probe />
            </CountryProvider>
        </QueryClientProvider>,
    )
    return { read: () => read as ReturnType<typeof useCountry> }
}

describe('CountryProvider', () => {
    it('uses the server-rendered country and asks nobody', async () => {
        const spy = stubFetch(async () => response())
        const { read } = renderProvider('vn')

        expect(read().country).toBe('VN')
        expect(read().isKnown).toBe(true)
        // The point of reading the header in the layout: zero requests on a normal visit.
        expect(spy).not.toHaveBeenCalled()
    })

    it('asks once when the document render came back empty', async () => {
        const spy = stubFetch(async () => response({ json: async () => ({ country: 'ID' }) }))
        const { read } = renderProvider(null)

        await waitFor(() => expect(read().country).toBe('ID'))
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('settles on null rather than a guess when nothing can say', async () => {
        // Legacy defaults to `US` here, which prefills the wrong country and says nothing about it.
        stubFetch(async () => response({ ok: false, status: 500 }))
        const { read } = renderProvider(undefined)

        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().country).toBeNull()
    })

    it('ignores a header value that is not a country', async () => {
        const spy = stubFetch(async () => response({ json: async () => ({ country: 'US' }) }))
        const { read } = renderProvider('T1')

        // Tor's `T1` is not an answer, so the fallback runs exactly as if the header were absent.
        await waitFor(() => expect(read().country).toBe('US'))
        expect(spy).toHaveBeenCalledTimes(1)
    })
})
