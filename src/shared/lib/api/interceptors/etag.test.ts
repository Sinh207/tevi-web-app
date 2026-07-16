import { describe, expect, it } from 'vitest'
import { generateCacheKey } from './etag'

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
})
