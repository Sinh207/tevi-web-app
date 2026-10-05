// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePlayback, LivePublisher } from '../api/live-types'

const destroy = vi.fn()
const createLivePlayer = vi.fn(async () => ({ destroy, on: vi.fn(), muted: true }))

vi.mock('@byteplus/veplayer/live/style', () => ({}))
vi.mock('@byteplus/veplayer/live', () => ({
    createLivePlayer,
    register: vi.fn(),
    live: { setLicenseConfig: vi.fn(async () => {}) },
}))
vi.mock('@byteplus/veplayer-plugin', () => ({ rtm: {}, flv: {}, hlsjs: {} }))

const { EventStudioPlayer } = await import('./event-studio-player')

const MOUNT = 'player-p7'

/** A fresh object every call, as a refetch or a re-render hands the player. */
function playback(url = 'https://cdn.test/a.flv'): LivePlayback {
    return {
        is_preview: false,
        live_channel: null,
        viewer_token: null,
        viewer_id: null,
        alternative_playlist: [
            { protocol: 'hls', url: 'https://cdn.test/a.m3u8' },
            { protocol: 'flv', url },
        ],
    } as LivePlayback
}

function publisher(avatar: string): LivePublisher {
    return {
        id: 'p7',
        name: 'Host',
        avatar,
        audio: true,
        video: true,
        is_host: true,
        verified_tick_badge: null,
    }
}

/** Let the effect's dynamic imports and awaits settle. */
async function flush() {
    await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve()
    })
}

describe('EventStudioPlayer', () => {
    beforeEach(() => {
        const node = document.createElement('div')
        node.id = MOUNT
        document.body.append(node)
    })
    afterEach(() => {
        cleanup()
        document.getElementById(MOUNT)?.remove()
        createLivePlayer.mockClear()
        destroy.mockClear()
    })

    it('keeps one player across re-renders that carry the same stream', async () => {
        const { rerender } = render(
            <EventStudioPlayer
                playback={playback()}
                publisher={publisher('a.jpg')}
                mountId={MOUNT}
            />,
        )
        await flush()
        expect(createLivePlayer).toHaveBeenCalledTimes(1)

        // A new playback object (fresh `fallbacks` array) and a new avatar URL from a room refetch:
        // neither is a new stream, and either one used to rebuild the player.
        for (const avatar of ['a.jpg', 'b.jpg', 'c.jpg']) {
            rerender(
                <EventStudioPlayer
                    playback={playback()}
                    publisher={publisher(avatar)}
                    mountId={MOUNT}
                />,
            )
            await flush()
        }

        expect(createLivePlayer).toHaveBeenCalledTimes(1)
        expect(destroy).not.toHaveBeenCalled()
    })

    it('rebuilds the player when the stream itself changes', async () => {
        const { rerender } = render(
            <EventStudioPlayer
                playback={playback()}
                publisher={publisher('a.jpg')}
                mountId={MOUNT}
            />,
        )
        await flush()

        rerender(
            <EventStudioPlayer
                playback={playback('https://cdn.test/b.flv')}
                publisher={publisher('a.jpg')}
                mountId={MOUNT}
            />,
        )
        await flush()

        expect(createLivePlayer).toHaveBeenCalledTimes(2)
        expect(destroy).toHaveBeenCalledTimes(1)
        expect(createLivePlayer).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: 'https://cdn.test/b.flv',
                fallbackUrls: ['https://cdn.test/b.flv', 'https://cdn.test/a.m3u8'],
            }),
        )
    })

    it('follows the seat to a new node if one replaces it, without rebuilding the player', async () => {
        const { rerender } = render(
            <EventStudioPlayer
                playback={playback()}
                publisher={publisher('a.jpg')}
                mountId={MOUNT}
            />,
        )
        await flush()
        const oldNode = document.getElementById(MOUNT)
        const host = oldNode?.firstElementChild
        expect(host).toBeTruthy()

        // The grid re-keys the seat: the old node goes, a new one with the same id arrives.
        oldNode?.remove()
        const newNode = document.createElement('div')
        newNode.id = MOUNT
        document.body.append(newNode)

        rerender(
            <EventStudioPlayer
                playback={playback()}
                publisher={publisher('a.jpg')}
                mountId={MOUNT}
            />,
        )
        await flush()

        expect(newNode.firstElementChild).toBe(host)
        expect(createLivePlayer).toHaveBeenCalledTimes(1)
        expect(destroy).not.toHaveBeenCalled()
    })
})
