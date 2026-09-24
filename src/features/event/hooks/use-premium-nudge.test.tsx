// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREMIUM_NUDGE_DELAY_MS, PREMIUM_NUDGE_SECONDS, usePremiumNudge } from './use-premium-nudge'

/**
 * **Legacy's `subscribePremium` timing** — five seconds after a charge, ten seconds on screen, and
 * never for somebody who already has Premium.
 */
type Props = {
    chargedAt: number | null
    feeNoticeShown: boolean
    isPremium: boolean
    enabled: boolean
}
const base: Props = { chargedAt: null, feeNoticeShown: false, isPremium: false, enabled: true }

function mount(initial: Props) {
    const seen: { current: ReturnType<typeof usePremiumNudge> | null } = { current: null }
    function Probe(p: Props) {
        seen.current = usePremiumNudge(p)
        return null
    }
    const view = render(<Probe {...initial} />)
    return { seen, rerender: (p: Props) => view.rerender(<Probe {...p} />) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the Premium card', () => {
    it('opens five seconds after a paid chat line, not before', () => {
        const { seen, rerender } = mount(base)
        rerender({ ...base, chargedAt: 1 })
        act(() => void vi.advanceTimersByTime(PREMIUM_NUDGE_DELAY_MS - 1))
        expect(seen.current?.isOpen).toBe(false)
        act(() => void vi.advanceTimersByTime(1))
        expect(seen.current?.isOpen).toBe(true)
        expect(seen.current?.secondsLeft).toBe(PREMIUM_NUDGE_SECONDS)
    })

    it('opens after the sustained fee is taken too', () => {
        const { seen, rerender } = mount(base)
        rerender({ ...base, feeNoticeShown: true })
        act(() => void vi.advanceTimersByTime(PREMIUM_NUDGE_DELAY_MS))
        expect(seen.current?.isOpen).toBe(true)
    })

    it('counts down and closes itself', () => {
        const { seen, rerender } = mount(base)
        rerender({ ...base, chargedAt: 1 })
        act(() => void vi.advanceTimersByTime(PREMIUM_NUDGE_DELAY_MS))
        act(() => void vi.advanceTimersByTime(3000))
        expect(seen.current?.secondsLeft).toBe(PREMIUM_NUDGE_SECONDS - 3)
        act(() => void vi.advanceTimersByTime((PREMIUM_NUDGE_SECONDS - 3) * 1000))
        expect(seen.current?.isOpen).toBe(false)
    })

    it('never shows to a Premium reader', () => {
        const premium = { ...base, isPremium: true }
        const { seen, rerender } = mount(premium)
        rerender({ ...premium, chargedAt: 1 })
        act(() => void vi.advanceTimersByTime(PREMIUM_NUDGE_DELAY_MS * 2))
        expect(seen.current?.isOpen).toBe(false)
    })

    it('can be closed early', () => {
        const { seen, rerender } = mount(base)
        rerender({ ...base, chargedAt: 1 })
        act(() => void vi.advanceTimersByTime(PREMIUM_NUDGE_DELAY_MS))
        act(() => seen.current?.close())
        expect(seen.current?.isOpen).toBe(false)
    })
})
