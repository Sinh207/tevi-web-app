// @vitest-environment jsdom
import { clearPreviewQuota, previewsLeft, spendPreview } from '@shared/lib/preview-quota'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveKeys } from '../api/live-api'
import type { LivePreviewState } from './use-live-preview'
import { PREVIEW_SECONDS, useLivePreview } from './use-live-preview'

/**
 * **The free ten-second look, and the three ways it quietly goes wrong.**
 *
 * Every claim here costs the reader something real and none of them throws:
 *
 * 1. **A preview spent on a request nobody watched.** The backend counts the *call*, so a retry or
 *    a focus refetch is a look the reader loses without seeing anything.
 * 2. **A countdown that starts before the stream does.** The paywall then appears over a frame the
 *    reader never got — on a slow connection, over a black rectangle.
 * 3. **A layout fetched for a preview that was refused**, which is a second request made on behalf
 *    of somebody who is being told no.
 */
const getPreview = vi.hoisted(() => vi.fn())
const getRoom = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('../api/live-api', async () => {
    const actual = await vi.importActual<typeof import('../api/live-api')>('../api/live-api')
    return { ...actual, liveApi: { getPreview, getRoom, getPlayback: vi.fn() } }
})

const PLAYBACK = {
    is_preview: true,
    live_channel: 'room-1',
    viewer_token: 'tok',
    viewer_id: 'u1',
    alternative_playlist: [{ protocol: 'flv', url: 'https://cdn/x.flv' }],
}
const ROOM = {
    layout: { layout: 'P1', spotlight: false, spotlight_uid: null, spotlightUid: null },
    publishers: [
        {
            id: 'u1',
            name: 'Ada',
            avatar: null,
            audio: true,
            video: true,
            is_host: true,
            verified_tick_badge: null,
        },
    ],
}

function probe({ enabled = true, seeded = false }: { enabled?: boolean; seeded?: boolean } = {}) {
    const seen: { current: LivePreviewState | null } = { current: null }
    function Probe() {
        seen.current = useLivePreview({ code: 'evt-1', enabled })
        return null
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    /*
     * `seeded` puts both payloads straight into the cache, so the hook is ready on its first
     * render and **no request is made**.
     *
     * That is what the countdown cases need. Resolving a real query under fake timers does not
     * work: TanStack walks a chain of microtasks *and* `setTimeout(0)` hops, so faking the clock
     * stalls it and not faking the clock means a genuine ten-second test. Seeding sidesteps the
     * whole question — the fetching behaviour is already pinned by the cases above, and these are
     * about the timer.
     */
    if (seeded) {
        client.setQueryData(liveKeys.preview('evt-1', 'acc-1'), PLAYBACK)
        client.setQueryData(liveKeys.room('evt-1', 'acc-1'), ROOM)
    }
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return seen
}

/**
 * Flush the query promise chains **without moving the clock**.
 *
 * Under fake timers the two requests resolve over several microtask turns, and
 * `advanceTimersByTimeAsync` would spend countdown seconds getting there — which is precisely the
 * thing these cases measure. Pumping microtasks alone separates "the stream arrived" from "time
 * passed".
 */
/**
 * Fake **only the clock the countdown uses.**
 *
 * Vitest's default `toFake` also replaces `queueMicrotask`, which is what TanStack Query schedules
 * its state transitions on — fake those and the two requests never resolve, so the countdown has
 * nothing to count for and every case here fails identically for the wrong reason.
 */
function useCountdownTimers() {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
}

beforeEach(() => {
    window.localStorage.clear()
    getPreview.mockReset().mockResolvedValue(PLAYBACK)
    getRoom.mockReset().mockResolvedValue(ROOM)
})

afterEach(() => {
    vi.useRealTimers()
    clearPreviewQuota()
})

describe('the quota gate', () => {
    it('asks for a preview and spends one look', async () => {
        const seen = probe()
        await waitFor(() => expect(seen.current?.playback).toBeTruthy())
        expect(getPreview).toHaveBeenCalledTimes(1)
        expect(previewsLeft('evt-1')).toBe(2)
    })

    /** A fourth attempt costs no round trip and no backend-side count. */
    it('requests nothing once the device has spent all three', async () => {
        spendPreview('evt-1')
        spendPreview('evt-1')
        spendPreview('evt-1')

        const seen = probe()
        await waitFor(() => expect(seen.current?.isExhausted).toBe(true))
        expect(getPreview).not.toHaveBeenCalled()
        expect(getRoom).not.toHaveBeenCalled()
    })

    /*
     * The caller decides. A reader who can already watch has no use for a preview, and requesting
     * one on their behalf would spend a look they did not need.
     */
    it('requests nothing when the caller has not asked for a preview', async () => {
        probe({ enabled: false })
        await Promise.resolve()
        expect(getPreview).not.toHaveBeenCalled()
        expect(previewsLeft('evt-1')).toBe(3)
    })

    /**
     * ⚠ A network failure must not take a look. The backend charges for calls it *served*; a
     * request that never landed is not a preview anybody watched.
     */
    it('spends nothing when the request fails', async () => {
        getPreview.mockRejectedValue(new Error('offline'))
        const seen = probe()
        await waitFor(() => expect(seen.current?.isLoading).toBe(false))
        expect(previewsLeft('evt-1')).toBe(3)
    })

    /**
     * `isExhausted` is read **once per mount**. Reading it live would flip it true the instant the
     * third look started, hiding the very preview the reader had just been granted.
     */
    it('does not report the current look as the one that exhausted the quota', async () => {
        spendPreview('evt-1')
        spendPreview('evt-1')
        const seen = probe()

        await waitFor(() => expect(seen.current?.playback).toBeTruthy())
        expect(previewsLeft('evt-1')).toBe(0)
        expect(seen.current?.isExhausted).toBe(false)
    })
})

describe('the two requests', () => {
    /* No layout is fetched on behalf of somebody who is being refused. */
    it('does not ask who is on camera when the preview is refused', async () => {
        getPreview.mockResolvedValue(null)
        const seen = probe()
        await waitFor(() => expect(seen.current?.isLoading).toBe(false))
        expect(getRoom).not.toHaveBeenCalled()
    })

    it('asks who is on camera once the stream is in hand', async () => {
        const seen = probe()
        await waitFor(() => expect(seen.current?.publishers.length).toBe(1))
        expect(seen.current?.layout?.layout).toBe('P1')
    })
})

describe('the countdown', () => {
    /**
     * It starts when there is something to watch, not on mount.
     *
     * A reader on a slow connection must get ten seconds of stream, not ten seconds minus however
     * long the fetch took — and the other direction is worse than it sounds: a countdown that
     * finishes before the first frame shows the paywall over a stream nobody saw.
     */
    it('does not run while the stream is still being fetched', async () => {
        useCountdownTimers()
        getPreview.mockReturnValue(new Promise(() => {}))

        const seen = probe()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000)
        })
        expect(seen.current?.secondsLeft).toBe(PREVIEW_SECONDS)
        expect(seen.current?.isPlaying).toBe(false)
    })

    it('counts down once the stream is on screen', async () => {
        useCountdownTimers()
        const seen = probe({ seeded: true })
        expect(seen.current?.isPlaying).toBe(true)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000)
        })
        expect(seen.current?.secondsLeft).toBe(PREVIEW_SECONDS - 3)
    })

    it('runs out and reports the look as complete', async () => {
        useCountdownTimers()
        const seen = probe({ seeded: true })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(PREVIEW_SECONDS * 1000)
        })

        expect(seen.current?.secondsLeft).toBe(0)
        expect(seen.current?.isComplete).toBe(true)
        expect(seen.current?.isPlaying).toBe(false)
    })

    /* Once it has finished it stays finished — the interval is cleared, not left ticking to -1. */
    it('does not keep counting past zero', async () => {
        useCountdownTimers()
        const seen = probe({ seeded: true })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(PREVIEW_SECONDS * 1000 + 30_000)
        })
        expect(seen.current?.secondsLeft).toBe(0)
    })

    /*
     * A room with nobody on camera is not something to count down over — the seat grid would be
     * empty. `ready` gates on publishers, not only on the playback payload.
     */
    it('does not run for a room with nobody on camera', async () => {
        useCountdownTimers()
        getRoom.mockResolvedValue({ layout: ROOM.layout, publishers: [] })
        const seen = probe()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000)
        })
        expect(seen.current?.secondsLeft).toBe(PREVIEW_SECONDS)
        expect(seen.current?.isPlaying).toBe(false)
    })
})
