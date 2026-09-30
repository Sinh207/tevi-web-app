// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatPopupStore } from '../store/chat-popup-store'
import { useOpenConversation } from './use-open-conversation'

const push = vi.fn()
const openLoginDialog = vi.fn()
let authenticated = true

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@features/auth', () => ({
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!authenticated) return openLoginDialog()
            cb(...args)
        },
}))

function setup() {
    const result = {} as { current: (slug: string) => void }
    function Probe() {
        result.current = useOpenConversation()
        return null
    }
    render(<Probe />)
    return result
}

beforeEach(() => {
    vi.clearAllMocks()
    authenticated = true
    useChatPopupStore.setState({ hosted: false, expanded: false, slug: null })
})

describe('useOpenConversation', () => {
    it('opens in the window when one is on screen, and the reader stays on the page', () => {
        useChatPopupStore.setState({ hosted: true })
        const open = setup()
        act(() => open.current('ada'))
        expect(useChatPopupStore.getState()).toMatchObject({ expanded: true, slug: 'ada' })
        expect(push).not.toHaveBeenCalled()
    })

    it('goes to the conversation’s route where there is no window — a phone, or Messages itself', () => {
        const open = setup()
        act(() => open.current('ada'))
        expect(push).toHaveBeenCalledWith('/@ada/messages')
        expect(useChatPopupStore.getState().slug).toBeNull()
    })

    it('asks a guest to sign in and opens nothing', () => {
        authenticated = false
        useChatPopupStore.setState({ hosted: true })
        const open = setup()
        act(() => open.current('ada'))
        expect(openLoginDialog).toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
        expect(useChatPopupStore.getState().slug).toBeNull()
    })
})
