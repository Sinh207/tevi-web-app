import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it, vi } from 'vitest'
import { redeemAcrossServices } from './redeem-sequence'

const rejected = (status: number) => () => Promise.reject(new ApiError({ message: 'no', status }))

describe('redeemAcrossServices', () => {
    it('returns the first service that accepts the code', async () => {
        const second = vi.fn()
        const result = await redeemAcrossServices([
            () => Promise.resolve({ kind: 'premium' as const }),
            second,
        ])

        expect(result).toEqual({ kind: 'premium' })
        // The guarantee this function exists for: a consumed code is never offered again.
        expect(second).not.toHaveBeenCalled()
    })

    it('moves on when a service refuses the code', async () => {
        const result = await redeemAcrossServices([
            rejected(400),
            () => Promise.resolve({ kind: 'star' as const, stars: 100 }),
        ])

        expect(result).toEqual({ kind: 'star', stars: 100 })
    })

    /** A 200 that describes no redemption is a refusal, not a success — see `toGiftOutcome`. */
    it('moves on when a service answers without a redemption', async () => {
        const result = await redeemAcrossServices([
            () => Promise.resolve(null),
            () => Promise.resolve({ kind: 'other' as const }),
        ])

        expect(result).toEqual({ kind: 'other' })
    })

    it('is invalid only once every service has refused', async () => {
        expect(await redeemAcrossServices([rejected(400), rejected(404)])).toEqual({
            kind: 'invalid',
        })
    })

    /**
     * The failure legacy cannot express: the code may well be fine, and saying it is not would be
     * a claim about somebody's gift card that nothing here can support.
     */
    it('rethrows a failure that says nothing about the code, without trying the next service', async () => {
        const second = vi.fn()
        await expect(redeemAcrossServices([rejected(502), second])).rejects.toBeInstanceOf(ApiError)
        expect(second).not.toHaveBeenCalled()
    })
})
