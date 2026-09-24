// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGiftedScores } from '../api/analytics-api'
import type { LiveTopStar } from '../lib/live-message'
import { SEAT_SCORES_DEBOUNCE_MS, useSeatScores } from './use-seat-scores'

/**
 * **The seat tiles' gift totals.** Two claims, both about *when* a request is made:
 *
 * 1. **Only in a room with more than one person on camera.** A solo host has nobody to be ranked
 *    against — legacy draws no chip and asks for nothing.
 * 2. **Debounced on the leaderboard, at legacy's five seconds.** A burst of gifts moves the board
 *    many times a second; one read per frame is the failure this exists to avoid.
 */
const getGiftedScores = vi.hoisted(() => vi.fn())
vi.mock('../api/analytics-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/analytics-api')>('../api/analytics-api')
    return { ...actual, liveAnalyticsApi: { ...actual.liveAnalyticsApi, getGiftedScores } }
})

const star = (id: string, total: number) =>
    ({ user: { id, name: id }, total_stars: total }) as unknown as LiveTopStar

function mount(props: { publisherCount: number; topStars?: LiveTopStar[]; enabled?: boolean }) {
    const seen: { current: Map<string, number> | null } = { current: null }
    function Probe(p: { topStars: LiveTopStar[] }) {
        seen.current = useSeatScores({
            code: 'evt-1',
            publisherCount: props.publisherCount,
            topStars: p.topStars,
            enabled: props.enabled ?? true,
        })
        return null
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrap = (topStars: LiveTopStar[]) => (
        <QueryClientProvider client={client}>
            <Probe topStars={topStars} />
        </QueryClientProvider>
    )
    const view = render(wrap(props.topStars ?? []))
    return { seen, rerender: (t: LiveTopStar[]) => view.rerender(wrap(t)) }
}

beforeEach(() => {
    getGiftedScores.mockReset().mockResolvedValue(new Map([['u1', 120]]))
})

describe('seat scores', () => {
    it('asks for nothing with a single person on camera', async () => {
        const { seen } = mount({ publisherCount: 1 })
        await act(async () => {})
        expect(getGiftedScores).not.toHaveBeenCalled()
        expect(seen.current?.size).toBe(0)
    })

    it('reads each co-host’s total in a multi-guest room', async () => {
        const { seen } = mount({ publisherCount: 3 })
        await waitFor(() => expect(seen.current?.get('u1')).toBe(120))
        expect(getGiftedScores).toHaveBeenCalledTimes(1)
    })

    it('re-reads once, five seconds after the board settles — not once per frame', async () => {
        vi.useFakeTimers()
        const { rerender } = mount({ publisherCount: 3, topStars: [] })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(getGiftedScores).toHaveBeenCalledTimes(1)

        // A burst: three board updates inside the window.
        rerender([star('a', 1)])
        rerender([star('a', 2)])
        rerender([star('a', 3)])
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEAT_SCORES_DEBOUNCE_MS - 1)
        })
        expect(getGiftedScores).toHaveBeenCalledTimes(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1)
        })
        expect(getGiftedScores).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
    })
})

describe('parseGiftedScores', () => {
    it('keys totals by user id, from the envelope or a bare array', () => {
        expect(parseGiftedScores([{ user: { id: 7 }, score: 30 }]).get('7')).toBe(30)
        expect(parseGiftedScores({ data: [{ user: { id: 'u' }, score: '5' }] }).get('u')).toBe(5)
    })

    /**
     * ⚠ Legacy matches `item.user?.id === publisher?.id`, so a row with no user would match a seat
     * with no publisher id and paint somebody else's total on it.
     */
    it('drops a row with no user id rather than keying it on undefined', () => {
        expect(parseGiftedScores([{ score: 99 }, { user: {}, score: 1 }]).size).toBe(0)
    })

    it('reads an unparseable score as zero, not NaN', () => {
        expect(parseGiftedScores([{ user: { id: 'u' }, score: 'lots' }]).get('u')).toBe(0)
    })
})
