import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from './proxy'

/**
 * `proxy` runs **before route resolution**, which is what makes a wrong entry in it invisible: the
 * page compiles, the URL answers, and a different screen comes back. That happened — the legacy
 * redirect for `/my-wallet/transaction-history` was written when no such route existed, so the day
 * the page shipped it was silently shadowed and served `/my-wallet` under the new URL's address.
 *
 * So the cases pinned here are the ones where a redirect and a real route share a path. This is not
 * a test of the whole proxy: the webview header contract has its own tests in
 * `shared/config/webview.test.ts`, and CSP has `shared/config/csp.test.ts`.
 */
function get(url: string) {
    // A document request — `withCsp` only builds a policy for one, and `Sec-Fetch-Dest` is what it
    // reads. It makes no difference to a redirect, but it keeps these requests shaped like the real
    // ones rather than like fetches.
    return new NextRequest(new URL(url, 'https://tevi.com'), {
        headers: { 'sec-fetch-dest': 'document' },
    })
}

/** Where a response sends the reader, or `null` when it lets the request through. */
function redirectTarget(response: Response): string | null {
    if (response.status < 300 || response.status >= 400) return null
    const location = response.headers.get('location')
    return location ? new URL(location).pathname + new URL(location).search : null
}

describe('proxy — the ledger paths', () => {
    it('serves /my-wallet/transaction-history rather than redirecting it', () => {
        // The regression. A redirect here shadows the page that owns this address.
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history')))).toBeNull()
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history/')))).toBeNull()
    })

    it('keeps serving it when the query is anything but the Star ledger', () => {
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?type=payout')))).toBeNull()
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=usd')))).toBeNull()
    })

    it('still moves the Star half to /my-star, and drops the query that chose it', () => {
        // Legacy's Star ledger has no page of its own — it is a section of `/my-star` — so this half
        // is a genuine move. `?currency=tvs` is exactly what the new address encodes, hence no query.
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=tvs')))).toBe(
            '/my-star',
        )
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=TVS')))).toBe(
            '/my-star',
        )
    })

    it('leaves /my-wallet itself alone', () => {
        // The design narrowed this address rather than moving it, and the mobile apps link to it.
        expect(redirectTarget(proxy(get('/my-wallet')))).toBeNull()
    })
})
