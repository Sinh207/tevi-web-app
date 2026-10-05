import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { protectedChannelOf } from './protected-channel'

const body = {
    code: 'CHN0009',
    success: false,
    message: 'Protected channel',
    data: {
        id: '1eaa3561',
        name: 'Test app',
        slug: 'sinhpn11',
        images: { cover: null, thumb: null },
        privacy: 'protected',
        is_followed: false,
        follow_requested: false,
        lives: [],
    },
}

const refusal = (status: number, data: unknown, code = 'CHN0009') =>
    new ApiError({ message: 'x', status, code, data })

describe('protectedChannelOf', () => {
    it('reads the space out of a 422 CHN0009', () => {
        const channel = protectedChannelOf(refusal(422, body))
        expect(channel?.slug).toBe('sinhpn11')
        expect(channel?.privacy).toBe('protected')
    })

    it('ignores another code, another status, or a body with no readable channel', () => {
        expect(protectedChannelOf(refusal(422, body, 'CHN0006'))).toBeNull()
        expect(protectedChannelOf(refusal(403, body))).toBeNull()
        expect(protectedChannelOf(refusal(422, { code: 'CHN0009' }))).toBeNull()
        expect(protectedChannelOf(new Error('x'))).toBeNull()
    })
})
