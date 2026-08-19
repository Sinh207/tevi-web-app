import { describe, expect, it } from 'vitest'
import { unwrapApiEnvelope, unwrapEnvelope } from './unwrap'

describe('unwrapEnvelope', () => {
    it('unwraps the backend `{ data: payload }` envelope', () => {
        expect(unwrapEnvelope({ data: { access_token: 'x' }, code: 200 })).toEqual({
            access_token: 'x',
        })
    })

    it('unwraps even without sibling envelope fields', () => {
        expect(unwrapEnvelope({ data: { id: 1 } })).toEqual({ id: 1 })
    })

    it('passes through arrays and primitives untouched', () => {
        expect(unwrapEnvelope([1, 2, 3])).toEqual([1, 2, 3])
        expect(unwrapEnvelope('ok')).toBe('ok')
        expect(unwrapEnvelope(null)).toBeNull()
    })

    it('passes through objects with no `data` key', () => {
        expect(unwrapEnvelope({ access_token: 'x' })).toEqual({ access_token: 'x' })
    })
})

describe('unwrapApiEnvelope', () => {
    const body = { data: [1, 2], cursor: 'next' }

    it('unwraps responses from the Tevi API', () => {
        expect(unwrapApiEnvelope('https://wapi.tevi.dev/core/v1/feed/', body)).toEqual([1, 2])
    })

    it('leaves every other host alone — its `data` is its own payload', () => {
        expect(unwrapApiEnvelope('https://storage.googleapis.com/bucket/x', body)).toEqual(body)
        expect(unwrapApiEnvelope('https://payments.example/charges', body)).toEqual(body)
    })
})
