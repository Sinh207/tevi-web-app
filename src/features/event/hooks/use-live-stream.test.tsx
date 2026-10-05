// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { liveKeys } from '../api/live-api'
import type { LiveStreamState } from './use-live-stream'
import { useLiveStream } from './use-live-stream'

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('../api/live-api', async () => {
    const actual = await vi.importActual<typeof import('../api/live-api')>('../api/live-api')
    return {
        ...actual,
        liveApi: { getPlayback: vi.fn(() => new Promise(() => {})), getRoom: vi.fn() },
    }
})

const PLAYBACK = {
    is_preview: false,
    live_channel: 'room-1',
    viewer_token: 'tok',
    viewer_id: 'u1',
    alternative_playlist: [{ protocol: 'flv', url: 'https://cdn/x.flv' }],
}
const ROOM = {
    layout: { layout: 'P1', spotlight: false, spotlight_uid: null, spotlightUid: null },
    publishers: [{ id: 'u1', name: 'Ada', avatar: null, audio: true, video: true, is_host: true }],
}

/**
 * ⚠ **A switched-off stream must stop playing.** A disabled query keeps its data, and a stream
 * turned off by a mid-watch lock kept reporting `isPlaying` from the cache: the stage fell back to
 * it when the preview ran out, so the reader kept watching behind the paywall — and every swap
 * between the two remounted the player.
 */
describe('useLiveStream', () => {
    function mount(enabled: boolean) {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(liveKeys.playback('evt-1', 'acc-1'), PLAYBACK)
        client.setQueryData(liveKeys.room('evt-1', 'acc-1'), ROOM)
        const seen: { current: LiveStreamState | null } = { current: null }
        function Probe({ on }: { on: boolean }) {
            seen.current = useLiveStream({ code: 'evt-1', enabled: on })
            return null
        }
        const view = render(
            <QueryClientProvider client={client}>
                <Probe on={enabled} />
            </QueryClientProvider>,
        )
        const set = (on: boolean) =>
            view.rerender(
                <QueryClientProvider client={client}>
                    <Probe on={on} />
                </QueryClientProvider>,
            )
        return { seen, set }
    }

    it('plays while enabled', () => {
        const { seen } = mount(true)
        expect(seen.current?.isPlaying).toBe(true)
    })

    it('stops playing the moment it is switched off, though the cache still holds the stream', () => {
        const { seen, set } = mount(true)
        set(false)
        expect(seen.current?.isPlaying).toBe(false)
        expect(seen.current?.playback).toBeNull()
        expect(seen.current?.publishers).toEqual([])
    })
})
