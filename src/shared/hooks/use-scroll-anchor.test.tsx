// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { windowKeyProps } from './use-render-window'
import { useScrollAnchor } from './use-scroll-anchor'

const ROW = 100

/** Rows stacked from the document top, each `ROW` tall. */
function List({ id, keys }: { id: string; keys: string[] }) {
    const ref = useRef<HTMLDivElement>(null)
    useScrollAnchor(id, ref, true)
    return (
        <div ref={ref}>
            {keys.map(key => (
                <div key={key} {...windowKeyProps(key)} />
            ))}
        </div>
    )
}

let scrollY = 0

function layOut(container: HTMLElement) {
    for (const [index, row] of [...container.querySelectorAll('[data-window-key]')].entries()) {
        Object.defineProperties(row, {
            offsetTop: { configurable: true, value: index * ROW },
            offsetHeight: { configurable: true, value: ROW },
            offsetParent: { configurable: true, value: null },
        })
    }
}

async function scrollTo(y: number) {
    scrollY = y
    window.dispatchEvent(new Event('scroll'))
    await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(null))))
}

beforeEach(() => {
    scrollY = 0
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
        scrollY = options.top ?? 0
    }) as typeof window.scrollTo)
})

afterEach(() => vi.restoreAllMocks())

describe('useScrollAnchor', () => {
    it('lands on the same row after a remount, even when rows were prepended meanwhile', async () => {
        const first = render(<List id="a" keys={['p1', 'p2', 'p3', 'p4', 'p5']} />)
        layOut(first.container)
        // 250px down: `p3` is the first row on screen, its top 50px above the viewport.
        await scrollTo(250)
        first.unmount()

        scrollY = 0
        const second = render(<List id="a" keys={['new1', 'new2', 'p1', 'p2', 'p3', 'p4', 'p5']} />)
        layOut(second.container)
        await act(() => Promise.resolve())

        // `p3` now sits at 400; the same 50px above the viewport is 450.
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 450, behavior: 'instant' })
    })

    it('stays at the top when the reader left from the top', async () => {
        const first = render(<List id="b" keys={['p1', 'p2', 'p3']} />)
        layOut(first.container)
        await scrollTo(150)
        await scrollTo(0)
        first.unmount()

        const second = render(<List id="b" keys={['p1', 'p2', 'p3']} />)
        layOut(second.container)
        await act(() => Promise.resolve())
        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('does nothing when the anchor row is gone', async () => {
        const first = render(<List id="c" keys={['p1', 'p2', 'p3']} />)
        layOut(first.container)
        await scrollTo(150)
        first.unmount()

        const second = render(<List id="c" keys={['q1', 'q2']} />)
        layOut(second.container)
        await act(() => Promise.resolve())
        expect(window.scrollTo).not.toHaveBeenCalled()
    })
})
