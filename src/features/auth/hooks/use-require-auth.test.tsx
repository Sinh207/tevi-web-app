// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/auth-store'
import { useRequireAuth } from './use-require-auth'

/**
 * Gating the *action*, not the route.
 *
 * The hook existed with no consumer and its dialog had no renderer, so a guest
 * pressing a guarded control got silence — the action simply did not run and
 * nothing said why. These pin both halves: the callback is withheld, and the
 * prompt that replaces it is actually raised.
 */

vi.mock('../providers/auth-provider', () => ({
    useAuth: () => ({ isAuthenticated: mockAuthenticated }),
}))

let mockAuthenticated = false

function renderGuard(cb: (...args: unknown[]) => void) {
    let guarded: (...args: unknown[]) => void = () => {}
    function Probe() {
        guarded = useRequireAuth()(cb)
        return null
    }
    render(<Probe />)
    return (...args: unknown[]) => act(() => guarded(...args))
}

beforeEach(() => {
    mockAuthenticated = false
    useAuthStore.setState({ isLoginDialogOpen: false })
})

describe('useRequireAuth', () => {
    it('withholds the action from a guest and asks them to sign in', () => {
        const action = vi.fn()
        renderGuard(action)()

        expect(action).not.toHaveBeenCalled()
        expect(useAuthStore.getState().isLoginDialogOpen).toBe(true)
    })

    it('runs the action for a signed-in user, arguments intact', () => {
        mockAuthenticated = true
        const action = vi.fn()

        renderGuard(action)('post-1', 42)

        expect(action).toHaveBeenCalledWith('post-1', 42)
        // No prompt for someone who never needed one.
        expect(useAuthStore.getState().isLoginDialogOpen).toBe(false)
    })
})
