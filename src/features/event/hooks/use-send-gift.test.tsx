// @vitest-environment jsdom

import { ApiError } from '@shared/lib/api/errors'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeGiftPackages } from '../api/gift-types'
import { eventDetailSchema } from '../api/types'
import { type SendGiftState, useSendGift } from './use-send-gift'

/**
 * **Sending a gift**, and the four claims a comment cannot pin.
 *
 * 1. **The charge comes first and the announcement second** — and the announcement is *awaited*.
 *    Legacy fires `post_message` without checking it, so a gift that charged and never reached the
 *    room is invisible to everybody including the sender.
 * 2. **`422 EC0001` opens the purchase sheet**, it is not printed as a sentence. The balance was
 *    checked before the press, so reaching that code means it moved underneath the reader.
 * 3. **The frame carries the *package's* quantity**, not a press counter — the `x10` a room sees.
 * 4. **The balance is invalidated, never written** from the send response, which carries balances.
 */
const send = vi.hoisted(() => vi.fn())
const requestLiveRoom = vi.hoisted(() => vi.fn())
const invalidateQueries = vi.hoisted(() => vi.fn())
/** Stands in for the shortfall guard: by default it lets the press through. */
const requireStars = vi.hoisted(() => vi.fn())
/** The balance the hook sees: known and enough, unless a test says otherwise. */
const balance = vi.hoisted(() => ({ isKnown: true, enough: true }))

vi.mock('@features/auth', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        activeId: 'acc-1',
        currentUser: { id: 'acc-1', display_name: 'Ada Lovelace' },
    }),
}))
vi.mock('@features/balance', async () => {
    const actual = await vi.importActual<typeof import('@features/balance')>('@features/balance')
    return {
        ...actual,
        useRequireStars: () => requireStars,
        useBalance: () => ({ isKnown: balance.isKnown, hasEnoughStars: () => balance.enough }),
    }
})
vi.mock('@features/channel', () => ({
    useMyChannel: () => ({
        myChannel: {
            id: 'ch-me',
            name: 'Ada',
            slug: 'ada',
            images: { thumb: 'https://cdn/ada.png' },
            verified_tick_badge: null,
        },
    }),
}))
vi.mock('@shared/lib/socket/live-room-client', () => ({ requestLiveRoom }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock('../api/gift-api', async () => {
    const actual = await vi.importActual<typeof import('../api/gift-api')>('../api/gift-api')
    return { ...actual, giftApi: { send, getPackages: vi.fn() } }
})

const event = (fields: Record<string, unknown> = {}) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        status: 'LIVE',
        host: 42,
        channel: { id: 'ch-1', slug: 'bo', name: "Bo's space" },
        ...fields,
    })

const pkg = (over: Record<string, unknown> = {}) =>
    normalizeGiftPackages({
        results: [
            {
                id: 12,
                quantity: 10,
                price: '99.00',
                product: {
                    name: 'Rose',
                    images: {
                        thumb: 'https://cdn/rose.png',
                        anim_background: 'https://cdn/bg.png',
                        animation: 'https://cdn/rose.svga',
                    },
                },
                ...over,
            },
        ],
    })[0]

function mount(opts: { isConnected?: boolean; event?: ReturnType<typeof event> } = {}) {
    const seen: { current: SendGiftState | null } = { current: null }
    function Probe() {
        seen.current = useSendGift({
            event: opts.event ?? event(),
            isConnected: opts.isConnected ?? true,
        })
        return null
    }
    render(<Probe />)
    return seen
}

beforeEach(() => {
    send.mockReset().mockResolvedValue(undefined)
    requestLiveRoom.mockReset().mockResolvedValue(undefined)
    invalidateQueries.mockReset()
    // The default guard runs the press: `useRequireStars` returns a handler, which the hook calls.
    requireStars.mockReset().mockImplementation((_cost: number, cb: () => void) => () => cb())
    balance.isKnown = true
    balance.enough = true
})

describe('canSend', () => {
    it('is true with a code, a host and a wire', () => {
        expect(mount().current?.canSend).toBe(true)
    })

    /** A gift announced into a closed socket is a charge the room never hears about. */
    it('is false while the wire is down', () => {
        expect(mount({ isConnected: false }).current?.canSend).toBe(false)
    })

    /** No host id means nobody to pay — legacy posts `recipient_id: undefined` instead. */
    it('is false when the payload names no host', () => {
        const seen = mount({ event: event({ host: null }) })
        expect(seen.current?.canSend).toBe(false)
    })
})

describe('sending', () => {
    it('charges billy with the package, the host and the broadcast', async () => {
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(send).toHaveBeenCalled())
        expect(send).toHaveBeenCalledWith({
            packageId: 12,
            recipientId: '42',
            eventCode: 'evt-1',
            channelId: 'ch-1',
            accountId: 'acc-1',
        })
    })

    it('sends to the chosen co-host rather than the host', async () => {
        const seen = mount()
        act(() =>
            seen.current?.send(pkg(), {
                id: '77',
                name: 'Cam',
                avatar: null,
                audio: true,
                video: true,
                is_host: false,
                verified_tick_badge: null,
            }),
        )
        await waitFor(() => expect(send).toHaveBeenCalled())
        expect(send.mock.calls[0][0].recipientId).toBe('77')
    })

    /** ⚠ The ordering: the room is told only after the money has moved. */
    it('announces the gift to the room after the charge, never before', async () => {
        const order: string[] = []
        send.mockImplementation(async () => {
            order.push('charge')
        })
        requestLiveRoom.mockImplementation(async () => {
            order.push('announce')
        })
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(order).toEqual(['charge', 'announce']))
    })

    it('does not announce a gift the charge refused', async () => {
        send.mockRejectedValue(new Error('nope'))
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(seen.current?.errorKey).toBe('event_gift_send_failed'))
        expect(requestLiveRoom).not.toHaveBeenCalled()
    })

    /** The `x10` the room sees is the package's own quantity, not how many times it was pressed. */
    it('puts the package quantity on the frame, as a string', async () => {
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(requestLiveRoom).toHaveBeenCalled())
        const [command, frame] = requestLiveRoom.mock.calls[0]
        expect(command).toBe('post_message')
        expect(frame).toMatchObject({
            type: 'cmd',
            msg: '/give_gift',
            gift_amount: '10',
            gift_data: {
                id: '12',
                name: 'Rose',
                thumb: 'https://cdn/rose.png',
                anim_background: 'https://cdn/bg.png',
                animation: 'https://cdn/rose.svga',
            },
        })
    })

    /** A sentence ending in "to" says nothing — the space's own name is the fallback. */
    it("names the broadcast's space when nobody was picked", async () => {
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(requestLiveRoom).toHaveBeenCalled())
        expect(requestLiveRoom.mock.calls[0][1].gift_data.recipient_name).toBe("Bo's space")
    })

    /** The reader appears in a live room as their space, which is legacy's own fallback chain. */
    it('announces the sender as their space, not their account', async () => {
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(requestLiveRoom).toHaveBeenCalled())
        expect(requestLiveRoom.mock.calls[0][1].user).toMatchObject({
            id: 'acc-1',
            name: 'Ada',
            avatar: 'https://cdn/ada.png',
            channel_slug: 'ada',
            is_host: false,
        })
    })

    it('marks the sender as the host when the broadcast is their own', async () => {
        const seen = mount({ event: event({ host: 'acc-1' }) })
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(requestLiveRoom).toHaveBeenCalled())
        expect(requestLiveRoom.mock.calls[0][1].user.is_host).toBe(true)
    })

    /**
     * The charge landed and the announcement did not. The reader's Star is gone and the room looks
     * as though nothing happened — they are the only person who can be told.
     */
    it('reports a gift that charged but never reached the room', async () => {
        requestLiveRoom.mockRejectedValue(new Error('socket gone'))
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(seen.current?.errorKey).toBe('event_gift_announce_failed'))
        // …and the balance is still re-read, because the money did move.
        expect(invalidateQueries).toHaveBeenCalled()
    })

    /** The send response carries balances and is discarded — `features/balance` owns that figure. */
    it('invalidates the balance rather than writing the response into it', async () => {
        send.mockResolvedValue({ balances: [{ amount: '1', amount_currency: 'TVS' }] })
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(invalidateQueries).toHaveBeenCalled())
        expect(invalidateQueries.mock.calls[0][0].queryKey).toEqual(['balance'])
    })
})

describe('a balance that ran out between the press and the charge', () => {
    it('raises Not enough Stars rather than printing a dead end', async () => {
        send.mockRejectedValue(
            new ApiError({ message: 'no', status: 422, data: { code: 'EC0001' } }),
        )
        const seen = mount()
        act(() => seen.current?.send(pkg()))

        await waitFor(() => expect(seen.current?.notEnough.open).toBe(true))
        expect(seen.current?.errorKey).toBeNull()
    })

    it('treats any other 422 as an ordinary failure', async () => {
        send.mockRejectedValue(
            new ApiError({ message: 'no', status: 422, data: { code: 'SOMETHING_ELSE' } }),
        )
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(seen.current?.errorKey).toBe('event_gift_send_failed'))
    })
})

describe('Not enough Stars', () => {
    /* Legacy's `notEnoughStars`: a known short balance is told so before anything is sent. */
    it('opens the dialog instead of charging when the balance cannot cover the gift', () => {
        balance.enough = false
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        expect(seen.current?.notEnough.open).toBe(true)
        expect(send).not.toHaveBeenCalled()
        // Straight past the sheet no longer: the guard is not even asked.
        expect(requireStars).not.toHaveBeenCalled()
    })

    it('closes', () => {
        balance.enough = false
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        act(() => seen.current?.notEnough.close())
        expect(seen.current?.notEnough.open).toBe(false)
    })

    it('leaves a balance that is not known yet to the guard', () => {
        balance.isKnown = false
        balance.enough = false
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        expect(seen.current?.notEnough.open).toBe(false)
        expect(requireStars).toHaveBeenCalled()
    })
})

describe('the guard in front of the press', () => {
    /** A guest, or a reader who cannot afford it, never reaches the charge. */
    it('does not charge when the guard diverts', () => {
        requireStars.mockImplementation(() => () => {})
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        expect(send).not.toHaveBeenCalled()
    })

    it('guards on this gift’s own price', () => {
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        expect(requireStars.mock.calls[0][0]).toBe(99)
    })

    /** One gift at a time: a second press while one is in flight is a second charge. */
    it('refuses a second press while one is in flight', async () => {
        let release: () => void = () => {}
        send.mockImplementation(() => new Promise<void>(resolve => (release = () => resolve())))
        const seen = mount()
        act(() => seen.current?.send(pkg()))
        await waitFor(() => expect(seen.current?.pendingId).toBe(12))

        act(() => seen.current?.send(pkg()))
        expect(send).toHaveBeenCalledTimes(1)

        await act(async () => {
            release()
        })
        await waitFor(() => expect(seen.current?.pendingId).toBeNull())
    })
})
