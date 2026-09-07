// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMayAnimate } from './use-may-animate'

/**
 * Two things worth pinning, and neither is visible from a call site.
 *
 * The **first render must say `false`** — the server cannot read `matchMedia`, so a hook that
 * answered `true` up front would render one thing on the server and another on the client. Callers
 * lean on this: `ChannelLiveBadge` treats the `false` render as the real first paint and shows a
 * static badge there, rather than a gap that the animation fills a moment later.
 *
 * And the answer **has to keep listening**: somebody who turns reduced motion on while the page is
 * open has been ignored if the loop carries on.
 */
const listeners = new Set<() => void>()

function mockMatchMedia(reduce: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
            matches: reduce,
            addEventListener: (_: string, cb: () => void) => listeners.add(cb),
            removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        })),
    )
}

function Probe({ onRender }: { onRender: (v: boolean) => void }) {
    onRender(useMayAnimate())
    return null
}

afterEach(() => {
    listeners.clear()
    vi.unstubAllGlobals()
})

describe('useMayAnimate', () => {
    it('says no on the first render, then yes once the client has looked', () => {
        mockMatchMedia(false)
        const seen: boolean[] = []

        render(<Probe onRender={v => seen.push(v)} />)

        expect(seen[0]).toBe(false)
        expect(seen.at(-1)).toBe(true)
    })

    it('stays no when the reader asked for less motion', () => {
        mockMatchMedia(true)
        const seen: boolean[] = []

        render(<Probe onRender={v => seen.push(v)} />)

        expect(seen.every(v => v === false)).toBe(true)
    })

    it('says no on a data-saver connection, with no preference expressed', () => {
        mockMatchMedia(false)
        vi.stubGlobal('navigator', { connection: { saveData: true } })
        const seen: boolean[] = []

        render(<Probe onRender={v => seen.push(v)} />)

        expect(seen.at(-1)).toBe(false)
    })
})
