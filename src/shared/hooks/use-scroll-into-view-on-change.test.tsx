// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollIntoViewOnChange } from './use-scroll-into-view-on-change'

/**
 * Three behaviours, and two of them are "do nothing" — which is the half a hook like this gets wrong.
 *
 * - a mount is not a change, so it must not fight the browser's scroll restoration on a back nav;
 * - an element already in view has not lost the reader's place, so moving the page would be the
 *   surprise rather than the fix;
 * - when it *does* move, it lands the element under the sticky chrome rather than at `0`.
 */

const scrollTo = vi.fn()

function Probe({ top, keyValue, offset }: { top: number; keyValue: unknown; offset: number }) {
    const ref = { current: { getBoundingClientRect: () => ({ top }) } as HTMLElement }
    useScrollIntoViewOnChange(ref, keyValue, offset)
    return null
}

beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'scrollY', { value: 1000, writable: true, configurable: true })
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
})

describe('useScrollIntoViewOnChange', () => {
    it('does nothing on mount', () => {
        render(<Probe top={-500} keyValue="all" offset={60} />)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it('scrolls the element under the sticky offset when the key changes', () => {
        const view = render(<Probe top={-500} keyValue="all" offset={60} />)
        view.rerender(<Probe top={-500} keyValue="payout" offset={60} />)

        // 1000 + (-500) - 60 — the element's document position, minus the chrome above it. Landing at
        // `0` instead would park the panel's header behind the bar.
        expect(scrollTo).toHaveBeenCalledWith({ top: 440, behavior: 'auto' })
    })

    it('leaves the page alone when the element is still in view', () => {
        const view = render(<Probe top={200} keyValue="all" offset={60} />)
        view.rerender(<Probe top={200} keyValue="payout" offset={60} />)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it('treats an element exactly at the offset as in view', () => {
        const view = render(<Probe top={60} keyValue="all" offset={60} />)
        view.rerender(<Probe top={60} keyValue="payout" offset={60} />)
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not re-scroll while the key stays put', () => {
        const view = render(<Probe top={-500} keyValue="all" offset={60} />)
        view.rerender(<Probe top={-500} keyValue="payout" offset={60} />)
        view.rerender(<Probe top={-500} keyValue="payout" offset={60} />)
        expect(scrollTo).toHaveBeenCalledTimes(1)
    })
})
