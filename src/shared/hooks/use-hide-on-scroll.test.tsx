// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useHideOnScroll } from './use-hide-on-scroll'

let hidden: boolean | undefined

function Probe({ enabled = true }: { enabled?: boolean }) {
    hidden = useHideOnScroll({ enabled })
    return null
}

/** jsdom does not scroll, so the position and the page height are stated outright. */
function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    act(() => {
        window.dispatchEvent(new Event('scroll'))
    })
}

beforeEach(() => {
    hidden = undefined
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
        value: 5000,
        configurable: true,
    })
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('useHideOnScroll', () => {
    it('hides on a scroll down and shows again on a scroll up', () => {
        render(<Probe />)
        expect(hidden).toBe(false)

        scrollTo(400)
        expect(hidden).toBe(true)

        scrollTo(380)
        expect(hidden).toBe(false)
    })

    it('ignores movement inside the dead zone, so a resting finger cannot flicker it', () => {
        render(<Probe />)
        scrollTo(400)
        expect(hidden).toBe(true)

        scrollTo(395)
        scrollTo(401)
        scrollTo(396)
        expect(hidden).toBe(true)
    })

    it('is always shown near the top of the page', () => {
        render(<Probe />)
        scrollTo(400)
        expect(hidden).toBe(true)

        scrollTo(40)
        expect(hidden).toBe(false)
    })

    it('ignores the overscroll bounce at the bottom, which reads as an upward scroll', () => {
        render(<Probe />)
        scrollTo(4300) // max is 5000 - 700
        expect(hidden).toBe(true)

        scrollTo(4360) // past max: rubber band
        scrollTo(4300) // the bounce back
        expect(hidden).toBe(true)
    })

    it('stays shown when disabled — the desktop case', () => {
        render(<Probe enabled={false} />)
        scrollTo(400)
        expect(hidden).toBe(false)
    })
})
