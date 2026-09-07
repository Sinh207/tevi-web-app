import { beforeEach, describe, expect, it } from 'vitest'
import {
    ANON_SCOPE,
    CACHE_TTL,
    cacheDecision,
    clearETagCache,
    clearETagScope,
    generateCacheKey,
    getCachedData,
    getStoredEtag,
    invalidateETagCache,
    storeEtag,
} from './etag'

describe('generateCacheKey', () => {
    const url = 'https://wapi.tevi.dev/core/v1/feed/'

    it('strips the volatile HMAC `verify` from the URL query', () => {
        const withVerify = `${url}?verify=1712-abc&page=2`
        expect(generateCacheKey(withVerify)).toBe(generateCacheKey(`${url}?page=2`))
    })

    it('strips `verify` from the params object too (request/response parity)', () => {
        const reqKey = generateCacheKey(url, { page: 2 })
        const resKey = generateCacheKey(url, { page: 2, verify: '1712-abc' })
        expect(reqKey).toBe(resKey)
    })

    it('is order-independent for params', () => {
        expect(generateCacheKey(url, { a: 1, b: 2 })).toBe(generateCacheKey(url, { b: 2, a: 1 }))
    })

    it('drops empty/null params', () => {
        expect(generateCacheKey(url, { a: 1, b: '', c: null, d: undefined })).toBe(
            generateCacheKey(url, { a: 1 }),
        )
    })

    it('differs when a meaningful param changes', () => {
        expect(generateCacheKey(url, { page: 1 })).not.toBe(generateCacheKey(url, { page: 2 }))
    })

    it('keys on the host too — same path on two services is not the same body', () => {
        expect(generateCacheKey('https://a.tevi.dev/v1/me/')).not.toBe(
            generateCacheKey('https://b.tevi.dev/v1/me/'),
        )
    })

    it('keeps structured params distinguishable', () => {
        // Template-stringifying turned every object into `[object Object]`, so two
        // different filters on the same route shared one key — and one filter's 304
        // served the other's body.
        expect(generateCacheKey(url, { filter: { a: 1 } })).not.toBe(
            generateCacheKey(url, { filter: { a: 2 } }),
        )
        expect(generateCacheKey(url, { ids: [1, 2] })).not.toBe(
            generateCacheKey(url, { ids: [2, 1] }),
        )
    })

    it('encodes param values, so one param cannot forge another', () => {
        expect(generateCacheKey(url, { a: '1&b=2' })).not.toBe(
            generateCacheKey(url, { a: '1', b: '2' }),
        )
    })
})

/**
 * There is no IndexedDB under Vitest, so `openDB()` resolves null and these run
 * against the memory tier alone — which is also what a browser with storage
 * disabled gets.
 */
describe('etag store', () => {
    beforeEach(async () => {
        await clearETagCache()
    })

    it('round-trips an etag and its body', async () => {
        storeEtag(ANON_SCOPE, 'k', 'W/"abc"', { id: 1 })
        await expect(getStoredEtag(ANON_SCOPE, 'k')).resolves.toBe('W/"abc"')
        await expect(getCachedData(ANON_SCOPE, 'k')).resolves.toEqual({ id: 1 })
    })

    it('refuses to cache a body over the size cap', async () => {
        storeEtag(ANON_SCOPE, 'big', 'W/"big"', { blob: 'x'.repeat(300_000) })
        // Not even the validator — an ETag with no body behind it makes the next
        // 304 unusable.
        await expect(getStoredEtag(ANON_SCOPE, 'big')).resolves.toBeNull()
        await expect(getCachedData(ANON_SCOPE, 'big')).resolves.toBeUndefined()
    })

    it('refuses a body it cannot serialise', async () => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        storeEtag(ANON_SCOPE, 'circular', 'W/"c"', circular)
        await expect(getStoredEtag(ANON_SCOPE, 'circular')).resolves.toBeNull()
    })

    it('does not serve an expired entry', async () => {
        storeEtag(ANON_SCOPE, 'stale', 'W/"old"', { id: 1 }, { ttlMs: -1 })
        await expect(getStoredEtag(ANON_SCOPE, 'stale')).resolves.toBeNull()
        await expect(getCachedData(ANON_SCOPE, 'stale')).resolves.toBeUndefined()
    })

    it('clearETagScope drops the entries of one account', async () => {
        storeEtag(ANON_SCOPE, 'k', 'W/"abc"', { id: 1 })
        await clearETagScope(null)
        await expect(getStoredEtag(ANON_SCOPE, 'k')).resolves.toBeNull()
    })

    it('never serves one account the body cached for another', async () => {
        storeEtag('acct-a', 'k', 'W/"a"', { who: 'a' })
        storeEtag('acct-b', 'k', 'W/"b"', { who: 'b' })

        await expect(getCachedData('acct-a', 'k')).resolves.toEqual({ who: 'a' })
        await expect(getCachedData('acct-b', 'k')).resolves.toEqual({ who: 'b' })

        // Dropping one account leaves the other's cache intact.
        await clearETagScope('acct-a')
        await expect(getStoredEtag('acct-a', 'k')).resolves.toBeNull()
        await expect(getStoredEtag('acct-b', 'k')).resolves.toBe('W/"b"')
    })
})

/**
 * `invalidateETagCache` is what a write calls when it knows a resource changed behind a validator
 * that will not admit it — `my-subscriptions/` after a membership settles (**B72**).
 *
 * It dropped the memory tier alone, which read as working and was not: IndexedDB kept the record and
 * handed the same ETag back on the next request, so the caller got its stale body anyway. There is
 * no IndexedDB under Vitest (see above), so what is pinned here is the key arithmetic — which
 * entries are in range and which are not. The IDB delete uses the same prefix.
 */
describe('invalidateETagCache', () => {
    const LIST = 'https://api.test/billy/v3/subscription/my-subscriptions/'

    beforeEach(async () => {
        await clearETagCache()
    })

    it('drops every query variant of the resource, not just the one in hand', async () => {
        const active = generateCacheKey(LIST, { status: 'active', channel_id: 'ch_1' })
        const expired = generateCacheKey(LIST, { status: 'expired', page: 2 })
        storeEtag('acct-a', active, 'W/"1"', { results: [] })
        storeEtag('acct-a', expired, 'W/"2"', { results: [] })

        await invalidateETagCache('acct-a', LIST)

        // A purchase does not respect whichever filters this client last read through.
        await expect(getStoredEtag('acct-a', active)).resolves.toBeNull()
        await expect(getStoredEtag('acct-a', expired)).resolves.toBeNull()
    })

    it('leaves the other accounts, and the neighbouring paths, alone', async () => {
        const mine = generateCacheKey(LIST, { status: 'active' })
        const theirs = generateCacheKey(LIST, { status: 'active' })
        // `…/packages/` shares no prefix with `…/my-subscriptions/?` — the `?` is the boundary, and
        // without it a path that merely starts with the same characters would be caught too.
        const packages = generateCacheKey(
            'https://api.test/billy/v3/subscription/channel/ada/packages/',
        )
        storeEtag('acct-a', mine, 'W/"1"', { results: [] })
        storeEtag('acct-b', theirs, 'W/"2"', { results: [] })
        storeEtag('acct-a', packages, 'W/"3"', { results: [] })

        await invalidateETagCache('acct-a', LIST)

        await expect(getStoredEtag('acct-a', mine)).resolves.toBeNull()
        await expect(getStoredEtag('acct-b', theirs)).resolves.toBe('W/"2"')
        await expect(getStoredEtag('acct-a', packages)).resolves.toBe('W/"3"')
    })

    it('drops one exact request when params are given', async () => {
        const active = generateCacheKey(LIST, { status: 'active' })
        const expired = generateCacheKey(LIST, { status: 'expired' })
        storeEtag('acct-a', active, 'W/"1"', { results: [] })
        storeEtag('acct-a', expired, 'W/"2"', { results: [] })

        await invalidateETagCache('acct-a', LIST, { status: 'active' })

        await expect(getStoredEtag('acct-a', active)).resolves.toBeNull()
        await expect(getStoredEtag('acct-a', expired)).resolves.toBe('W/"2"')
    })
})

/**
 * The disk tier is opt-in, and this is what pins the default.
 *
 * Asserted through `cacheDecision` rather than through `storeEtag`'s effects,
 * because there is no IndexedDB under Vitest: the write is unobservable here, so a
 * regression that put every body back on disk would pass a test written against
 * `getCachedData`. The decision is the part that can be guarded.
 */
describe('persistence is opt-in', () => {
    beforeEach(async () => {
        await clearETagCache()
    })

    it('does not persist by default — a body lives no longer than the tab', () => {
        expect(cacheDecision({ id: 1 })?.persist).toBe(false)
        expect(cacheDecision({ id: 1 }, {})?.persist).toBe(false)
        // A TTL is not consent: asking for a long life still does not ask for disk.
        expect(cacheDecision({ id: 1 }, { ttlMs: CACHE_TTL.day })?.persist).toBe(false)
    })

    it('persists only on an explicit `true`', () => {
        expect(cacheDecision({ id: 1 }, { persist: true })?.persist).toBe(true)
        expect(cacheDecision({ id: 1 }, { persist: false })?.persist).toBe(false)
    })

    it('still refuses an oversized body, however it was asked', () => {
        expect(cacheDecision({ blob: 'x'.repeat(300_000) }, { persist: true })).toBeNull()
    })

    it('honours a shorter TTL than the 24h default', () => {
        const dflt = cacheDecision({ id: 1 })
        const hour = cacheDecision({ id: 1 }, { ttlMs: CACHE_TTL.hour })
        expect(dflt?.rec.expiresAt).toBeGreaterThan(hour?.rec.expiresAt ?? Number.NaN)
    })

    it('a memory-only body is still revalidated within the session', async () => {
        // Opting out of disk must not opt out of conditional GETs: the memory tier is
        // what a client-side navigation reads, and that is most navigations.
        storeEtag(ANON_SCOPE, 'mem', 'W/"m"', { id: 1 })
        await expect(getStoredEtag(ANON_SCOPE, 'mem')).resolves.toBe('W/"m"')
        await expect(getCachedData(ANON_SCOPE, 'mem')).resolves.toEqual({ id: 1 })
    })

    it('reads the memory tier the same whether or not the caller persists', async () => {
        // The `persist` gate is about the *disk* tier on both sides. If it leaked into
        // the memory read, opting into persistence would break revalidation on the
        // very endpoints that asked for more caching, not less.
        storeEtag(ANON_SCOPE, 'both', 'W/"b"', { id: 1 }, { persist: true })
        await expect(getStoredEtag(ANON_SCOPE, 'both', { persist: true })).resolves.toBe('W/"b"')
        await expect(getStoredEtag(ANON_SCOPE, 'both')).resolves.toBe('W/"b"')
        await expect(getCachedData(ANON_SCOPE, 'both', { persist: true })).resolves.toEqual({
            id: 1,
        })
    })

    it('CACHE_TTL.day is the default TTL, not a second copy of it', () => {
        // Two literals for 24h is how they drift. `DEFAULT_TTL_MS` is derived from
        // this, so a default with no `ttlMs` and an explicit `CACHE_TTL.day` land on
        // the same expiry.
        const implicit = cacheDecision({ id: 1 })
        const explicit = cacheDecision({ id: 1 }, { ttlMs: CACHE_TTL.day })
        expect(implicit?.rec.expiresAt).toBe(explicit?.rec.expiresAt)
    })
})
