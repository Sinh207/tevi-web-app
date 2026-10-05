// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

type Status = 'connected' | 'disconnected' | 'error' | 'connecting' | 'idle'
let emit: (status: Status) => void = () => undefined

vi.mock('@shared/lib/socket/user-room-client', () => ({
    onUserRoomStatus: (listener: (status: Status) => void) => {
        emit = listener
        return () => undefined
    },
}))

const { useSocketReconnect } = await import('./use-socket-reconnect')

function Probe({ onBack }: { onBack: () => void }) {
    useSocketReconnect(onBack)
    return null
}

describe('useSocketReconnect', () => {
    it('fires after a drop, never on the first connect', () => {
        const onBack = vi.fn()
        render(<Probe onBack={onBack} />)

        act(() => emit('connected'))
        expect(onBack).not.toHaveBeenCalled()

        act(() => emit('disconnected'))
        act(() => emit('connected'))
        expect(onBack).toHaveBeenCalledTimes(1)

        act(() => emit('error'))
        act(() => emit('connecting'))
        act(() => emit('connected'))
        expect(onBack).toHaveBeenCalledTimes(2)
    })
})
