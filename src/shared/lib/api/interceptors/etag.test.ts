import { beforeEach, describe, expect, it } from 'vitest'
import {
    ANON_SCOPE,
    clearETagCache,
    clearETagScope,
    generateCacheKey,
    getCachedData,
    getStoredEtag,
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
        storeEtag(ANON_SCOPE, 'stale', 'W/"old"', { id: 1 }, -1)
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
