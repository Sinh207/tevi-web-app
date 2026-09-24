// @vitest-environment jsdom

import { LiveRoomError } from '@shared/lib/socket/live-room'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { type LiveChatState, MAX_LINES, useLiveChat } from './use-live-chat'
import type { LiveRoomState } from './use-live-room'

/**
 * **The transcript, and the one control on this screen that costs money.**
 *
 * Three claims worth the file:
 *
 * 1. **A reconnect replaces the history rather than appending it.** Appending duplicates
 *    everything already on screen; not re-asking at all leaves a permanent hole where the wifi
 *    blinked. Legacy asks once, on mount.
 * 2. **A refused history is not an empty chat.** Legacy's `if (err_code === 0)` has no `else`, so
 *    a refusal blanks the transcript for as long as the reader stays.
 * 3. **Paid chat is checked before posting and reported when the charge fails.** The message is
 *    already public by then — legacy fires the purchase and ignores the result, so neither the
 *    reader nor the creator learns that no Star moved.
 */
const request = vi.hoisted(() => vi.fn())
const purchaseChatMessage = vi.hoisted(() => vi.fn())
const balance = vi.hoisted(() => ({ state: { star: 100, isKnown: true } }))
/** The app's Star-shortfall path — raises the purchase sheet rather than printing a dead end. */
const requireStars = vi.hoisted(() => vi.fn())
/** The leaderboard's entry read — see the note on `topStarsQuery` in the hook. */
const getTopStars = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({ useAuth: () => ({ isAuthenticated: true, activeId: 'acc-1' }) }))
vi.mock('@features/balance', () => ({
    useBalance: () => balance.state,
    useRequireStars: () => requireStars,
}))
vi.mock('@shared/lib/socket/live-room-client', () => ({ requestLiveRoom: request }))
vi.mock('../api/analytics-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/analytics-api')>('../api/analytics-api')
    return { ...actual, liveAnalyticsApi: { ...actual.liveAnalyticsApi, getTopStars } }
})
vi.mock('../api/unlock-api', async () => {
    const actual = await vi.importActual<typeof import('../api/unlock-api')>('../api/unlock-api')
    return { ...actual, unlockApi: { purchaseChatMessage, purchase: vi.fn() } }
})

const event = (fields: Record<string, unknown> = {}) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        status: 'LIVE',
        channel: { id: 'ch-1', slug: 'ada' },
        ...fields,
    })

/** A room whose `subscribe` hands every channel's handler back to the test. */
function makeRoom(isConnected = true) {
    const handlers = new Map<string, (payload: unknown) => void>()
    const room: LiveRoomState = {
        status: isConnected ? 'connected' : 'idle',
        isConnected,
        subscribe: (channel, handler) => {
            handlers.set(channel, handler)
            return () => handlers.delete(channel)
        },
    }
    return { room, handlers }
}

function mount(opts: { paidChat?: boolean; isConnected?: boolean; allowChat?: boolean } = {}) {
    const { room, handlers } = makeRoom(opts.isConnected ?? true)
    const seen: { current: LiveChatState | null } = { current: null }
    function Probe() {
        seen.current = useLiveChat({
            event: event({ paid_chat: opts.paidChat, allow_chat: opts.allowChat }),
            room,
        })
        return null
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return { seen, handlers, view, room }
}

const comment = (text: string) => ({ type: 'msg', msg: text, user: { id: 'u1', name: 'Ada' } })

beforeEach(() => {
    request.mockReset().mockResolvedValue([])
    getTopStars.mockReset().mockResolvedValue([])
    purchaseChatMessage.mockReset().mockResolvedValue(undefined)
    /*
     * ⚠ The mock has to **return a handler**, because that is what the hook does with it.
     * `useRequireStars` follows `useRequireAuth`'s shape: it builds a guarded callback rather than
     * acting. A mock returning `undefined` passes an assertion on the call's arguments and hides
     * whether the result was ever invoked — which is exactly how the missing `()` in `send` shipped.
     */
    requireStars.mockReset().mockImplementation((_cost: number, cb: () => void) => () => cb())
    balance.state = { star: 100, isKnown: true }
})

describe('the transcript', () => {
    it('loads the history once the wire is up', async () => {
        request.mockResolvedValue([comment('one'), comment('two')])
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.lines).toHaveLength(2))
        expect(request).toHaveBeenCalledWith('get_message_history')
    })

    it('asks for nothing while the wire is down', () => {
        mount({ isConnected: false })
        expect(request).not.toHaveBeenCalled()
    })

    /**
     * ⚠ A refused history leaves whatever is on screen and lets live frames accumulate. Legacy
     * blanks it, permanently, in a room that is otherwise working.
     */
    it('does not blank the chat when the history is refused', async () => {
        request.mockRejectedValue(new Error('refused'))
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('msg')).toBe(true))

        act(() => handlers.get('msg')?.(comment('live line')))
        expect(seen.current?.lines).toHaveLength(1)
    })

    it('appends live frames after the history', async () => {
        request.mockResolvedValue([comment('history')])
        const { seen, handlers } = mount()
        await waitFor(() => expect(seen.current?.lines).toHaveLength(1))

        act(() => handlers.get('msg')?.(comment('live')))
        expect(seen.current?.lines).toHaveLength(2)
        expect(seen.current?.lines.at(-1)).toMatchObject({ text: 'live' })
    })

    /** Unbounded, a three-hour broadcast is a tab full of avatars. Legacy has no cap. */
    it('caps the list', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('msg')).toBe(true))

        act(() => {
            for (let i = 0; i < MAX_LINES + 50; i++) handlers.get('msg')?.(comment(`line ${i}`))
        })
        expect(seen.current?.lines).toHaveLength(MAX_LINES)
        expect(seen.current?.lines.at(-1)).toMatchObject({ text: `line ${MAX_LINES + 49}` })
    })
})

describe('chat switched off', () => {
    /**
     * ⚠ **`allow_chat` is the creator's own switch and it was missing entirely.** Without it the
     * composer stayed enabled on a broadcast with chat off: the reader types, presses send, and
     * gets a generic failure for something that was never going to work.
     */
    it('disables the composer when the creator has turned chat off', async () => {
        const { seen } = mount({ allowChat: false })
        await waitFor(() => expect(seen.current?.isChatOff).toBe(true))
        expect(seen.current?.canSend).toBe(false)
    })

    it('sends nothing even when asked directly', async () => {
        const { seen } = mount({ allowChat: false })
        await waitFor(() => expect(seen.current?.isChatOff).toBe(true))
        request.mockClear()
        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(request).not.toHaveBeenCalled()
    })

    /**
     * ⚠ **On unless the payload says otherwise.** The flag is recent, so an older payload that
     * omits it must not silence the room — and `z.coerce.boolean().catch(true)`, which is what
     * this was written as first, cannot express that: `catch` fires on a parse *error* and
     * coercion never errors, so `Boolean(undefined)` was a successful `false`.
     */
    it('leaves chat on when the payload does not mention it', async () => {
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.canSend).toBe(true))
        expect(seen.current?.isChatOff).toBe(false)
    })
})

describe('the pinned message', () => {
    it('is fetched when the wire comes up', async () => {
        request.mockImplementation(cmd =>
            cmd === 'get_pinned_message'
                ? Promise.resolve({ message: 'read the rules', user_name: 'sinhpn' })
                : Promise.resolve([]),
        )
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.pinned?.message).toBe('read the rules'))
    })

    /** ⚠ An empty frame is the host **unpinning** — it must clear, not be ignored. */
    it('clears when the host takes the pin down', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('pinned_message')).toBe(true))

        act(() => handlers.get('pinned_message')?.({ message: 'hi', user_name: 'sinhpn' }))
        expect(seen.current?.pinned).toBeTruthy()

        act(() => handlers.get('pinned_message')?.(null))
        expect(seen.current?.pinned).toBeNull()
    })

    /* The reader's dismissal is local — the host's pin is still up for everybody else. */
    it('can be dismissed by the reader', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('pinned_message')).toBe(true))
        act(() => handlers.get('pinned_message')?.({ message: 'hi', user_name: 'x' }))

        act(() => seen.current?.dismissPinned())
        expect(seen.current?.pinned).toBeNull()
    })
})

describe('being muted', () => {
    /**
     * ⚠ `isBlocked` alone disables the box **with nothing to say why**, which is what this
     * shipped as. Legacy shows a ten-second notice at the same moment.
     */
    it('says why, for ten seconds, and stays disabled after', async () => {
        vi.useFakeTimers()
        const { seen, handlers } = mount()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })

        act(() => handlers.get('block_chat')?.({}))
        expect(seen.current?.justMuted).toBe(true)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_001)
        })
        expect(seen.current?.justMuted).toBe(false)
        expect(seen.current?.isBlocked).toBe(true)
        vi.useRealTimers()
    })
})

describe('somebody walking in', () => {
    /**
     * ⚠ **A toast, not a transcript line, and only on `join`.**
     *
     * The channel carries leaves too, and legacy filters `action === 'join'`. Without the filter
     * every departure also announces itself as an arrival; without the toast the transcript
     * becomes a wall of "X has entered" with the conversation pushed off the top. This shipped
     * doing both, and a real broadcast is where it showed.
     */
    it('shows one arrival at a time and never adds a line', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('attendance')).toBe(true))

        act(() => handlers.get('attendance')?.({ action: 'join', user: { id: 'u9', name: 'Ada' } }))
        expect(seen.current?.arrival?.name).toBe('Ada')
        expect(seen.current?.lines).toHaveLength(0)
    })

    it('ignores a departure', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('attendance')).toBe(true))

        act(() =>
            handlers.get('attendance')?.({ action: 'leave', user: { id: 'u9', name: 'Ada' } }),
        )
        expect(seen.current?.arrival).toBeNull()
        expect(seen.current?.lines).toHaveLength(0)
    })

    it('clears itself after three seconds', async () => {
        vi.useFakeTimers()
        const { seen, handlers } = mount()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        act(() => handlers.get('attendance')?.({ action: 'join', user: { id: 'u9', name: 'Ada' } }))
        expect(seen.current?.arrival).toBeTruthy()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3001)
        })
        expect(seen.current?.arrival).toBeNull()
        vi.useRealTimers()
    })
})

describe('the head count', () => {
    it('is absent until a frame arrives, never zero', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('ccu')).toBe(true))
        expect(seen.current?.ccu).toBeNull()

        act(() => handlers.get('ccu')?.({ ccu: 1234 }))
        expect(seen.current?.ccu).toBe(1234)
    })

    /* A malformed frame must not blank a figure that was correct a second ago. */
    it('ignores a frame with no usable number', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(handlers.has('ccu')).toBe(true))
        act(() => handlers.get('ccu')?.({ ccu: 10 }))
        act(() => handlers.get('ccu')?.({ ccu: 'lots' }))
        expect(seen.current?.ccu).toBe(10)
    })
})

describe('being blocked', () => {
    it('stops the reader typing, and lets them again', async () => {
        const { seen, handlers } = mount()
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        act(() => handlers.get('block_chat')?.({}))
        expect(seen.current?.isBlocked).toBe(true)
        expect(seen.current?.canSend).toBe(false)

        act(() => handlers.get('unblock_chat')?.({}))
        expect(seen.current?.canSend).toBe(true)
    })
})

describe('sending', () => {
    it('posts a trimmed message', async () => {
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        await act(async () => {
            await seen.current?.send('  hello  ')
        })
        expect(request).toHaveBeenCalledWith('post_message', { type: 'msg', msg: 'hello' })
    })

    it('sends nothing for an empty draft', async () => {
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.canSend).toBe(true))
        request.mockClear()

        await act(async () => {
            await seen.current?.send('   ')
        })
        expect(request).not.toHaveBeenCalled()
    })

    it('reports a refused post', async () => {
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.canSend).toBe(true))
        request.mockRejectedValue(new Error('nope'))

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(seen.current?.errorKey).toBe('event_studio_chat_send_failed')
    })
})

describe('paid chat', () => {
    it('charges a Star after the message posts', async () => {
        const { seen } = mount({ paidChat: true })
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(purchaseChatMessage).toHaveBeenCalledWith({
            eventCode: 'evt-1',
            channelId: 'ch-1',
            accountId: 'acc-1',
        })
    })

    it('does not charge in a free chat', async () => {
        const { seen } = mount({ paidChat: false })
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(purchaseChatMessage).not.toHaveBeenCalled()
    })

    /**
     * The balance is checked **before** posting — the only part of this ordering the client can
     * get right on its own. Posting first and failing to bill is the alternative.
     */
    /**
     * ⚠ **Not a dead end.** This shipped printing "you don't have enough Star" and stopping,
     * which tells the reader they cannot act and offers no way to change that.
     * `useRequireStars` is the app's existing answer everywhere else money is short.
     */
    it('opens the Star purchase sheet instead of refusing with a sentence', async () => {
        let diverted = false
        requireStars.mockImplementation(() => () => {
            diverted = true
        })
        balance.state = { star: 0, isKnown: true }
        const { seen } = mount({ paidChat: true })
        await waitFor(() => expect(request).toHaveBeenCalled())
        request.mockClear()

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(request).not.toHaveBeenCalled()
        expect(requireStars).toHaveBeenCalledWith(1, expect.any(Function))
        // …and the guard it built was **run**. Asserting only the arguments above is what let the
        // sheet quietly never open: the handler was constructed and thrown away.
        expect(diverted).toBe(true)
    })

    /* A free chat never consults the balance at all. */
    it('does not reach for Star in a free chat', async () => {
        balance.state = { star: 0, isKnown: true }
        const { seen } = mount({ paidChat: false })
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(requireStars).not.toHaveBeenCalled()
        expect(request).toHaveBeenCalledWith('post_message', { type: 'msg', msg: 'hi' })
    })

    /* An unknown balance is not a zero one, but it is not permission to spend either. */
    it('refuses while the balance is still unknown', async () => {
        balance.state = { star: 0, isKnown: false }
        const { seen } = mount({ paidChat: true })
        await waitFor(() => expect(request).toHaveBeenCalled())
        expect(seen.current?.canSend).toBe(false)
    })

    /**
     * ⚠ **The one legacy never tells anybody.** The message is already in front of the room, so
     * all this can do is say the Star did not move — but saying nothing leaves the reader
     * believing they paid and the creator believing they were paid.
     */
    it('says so when the message posted but the charge failed', async () => {
        purchaseChatMessage.mockRejectedValue(new Error('declined'))
        const { seen } = mount({ paidChat: true })
        await waitFor(() => expect(seen.current?.canSend).toBe(true))

        await act(async () => {
            await seen.current?.send('hi')
        })
        expect(seen.current?.errorKey).toBe('event_studio_chat_charge_failed')
    })
})

/**
 * **Arrivals are a queue, and that is the whole claim.**
 *
 * This replaced whichever toast was on screen with the newest one, so in a room people are
 * actually joining only the last arrival of any burst was ever announced — every earlier one was
 * overwritten inside its three seconds. Legacy queues them (`Attendance`), and the notice is
 * worthless if it can silently skip people.
 */
describe('arrivals', () => {
    const joins = (name: string) => ({ action: 'join', user: { id: name, name } })

    it('shows them one at a time, in order, instead of overwriting', async () => {
        vi.useFakeTimers()
        try {
            const { seen, handlers } = mount()
            await vi.waitFor(() => expect(handlers.get('attendance')).toBeDefined())

            act(() => {
                handlers.get('attendance')?.(joins('Ada'))
                handlers.get('attendance')?.(joins('Bo'))
            })
            expect(seen.current?.arrival?.name).toBe('Ada')

            act(() => void vi.advanceTimersByTime(3_000))
            expect(seen.current?.arrival?.name).toBe('Bo')

            act(() => void vi.advanceTimersByTime(3_000))
            expect(seen.current?.arrival).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    /* A door-opening wave is not worth twenty-five minutes of toasts — see `MAX_ARRIVAL_QUEUE`. */
    it('drops the backlog rather than running minutes behind', async () => {
        vi.useFakeTimers()
        try {
            const { seen, handlers } = mount()
            await vi.waitFor(() => expect(handlers.get('attendance')).toBeDefined())

            act(() => {
                for (let i = 0; i < 20; i++) handlers.get('attendance')?.(joins(`u${i}`))
            })
            // The first is on screen; three more may wait, and the rest are gone.
            act(() => void vi.advanceTimersByTime(3_000 * 4))
            expect(seen.current?.arrival).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })
})

/**
 * **A refused post is how most mutes are learned.**
 *
 * `block_chat` only reaches a reader who is in the room when the host presses it. Somebody muted
 * before they arrived hears nothing, and without this the composer keeps inviting messages the
 * room refuses one at a time. Legacy reads `err_code === 403` off the ack for exactly this.
 */
describe('a refused message', () => {
    it('disables the box on a 403 rather than printing a generic failure', async () => {
        const { seen } = mount()
        await vi.waitFor(() => expect(seen.current).not.toBeNull())
        request.mockRejectedValueOnce(new LiveRoomError('muted', 403))

        await act(async () => {
            await seen.current?.send('hello')
        })

        expect(seen.current?.isBlocked).toBe(true)
        expect(seen.current?.errorKey).toBeNull()
    })

    it('still says so on any other refusal', async () => {
        const { seen } = mount()
        await vi.waitFor(() => expect(seen.current).not.toBeNull())
        request.mockRejectedValueOnce(new LiveRoomError('nope', 500))

        await act(async () => {
            await seen.current?.send('hello')
        })

        expect(seen.current?.isBlocked).toBe(false)
        expect(seen.current?.errorKey).toBe('event_studio_chat_send_failed')
    })
})

describe('the gift leaderboard', () => {
    /**
     * ⚠ The board has an HTTP source, and this hook was built as though it did not: it waited for a
     * `top_stars` frame, and a room nobody has gifted in never sends one. Legacy reads the board on
     * entry and treats the socket as an update.
     */
    it('reads the board on entry, without waiting for the socket', async () => {
        getTopStars.mockResolvedValue([{ user: { id: 'u9', name: 'Zed' }, total_stars: 50 }])
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.topStars).toHaveLength(1))
        expect(getTopStars).toHaveBeenCalledWith(expect.objectContaining({ code: 'evt-1' }))
        expect(seen.current?.isLoadingTopStars).toBe(false)
    })

    /** An empty board is the empty state, not an endless skeleton. */
    it('lands on the empty state when nobody has gifted yet', async () => {
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.isLoadingTopStars).toBe(false))
        expect(seen.current?.topStars).toEqual([])
    })

    /** A failed read is not "loading" either — it falls through to the same empty state. */
    it('does not hold a skeleton when the read fails', async () => {
        getTopStars.mockRejectedValue(new Error('502'))
        const { seen } = mount()
        await waitFor(() => expect(seen.current?.isLoadingTopStars).toBe(false))
        expect(seen.current?.topStars).toEqual([])
    })

    /** The socket is the fresher of the two, so a frame outranks the entry read. */
    it('lets a socket frame replace the board read on entry', async () => {
        getTopStars.mockResolvedValue([{ user: { id: 'u9', name: 'Zed' }, total_stars: 50 }])
        const { seen, handlers } = mount()
        await waitFor(() => expect(seen.current?.topStars).toHaveLength(1))
        act(() =>
            handlers.get('top_stars')?.({
                data: [
                    { user: { id: 'u1', name: 'Ada' }, total_stars: 90 },
                    { user: { id: 'u9', name: 'Zed' }, total_stars: 50 },
                ],
            }),
        )
        expect(seen.current?.topStars).toHaveLength(2)
    })
})
