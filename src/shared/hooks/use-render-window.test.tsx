// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRenderWindow } from './use-render-window'

/**
 * A controllable `IntersectionObserver`.
 *
 * jsdom ships none, and the real one needs layout jsdom does not do — so visibility and height are
 * both fed in by hand. That is not a weaker test than a browser one here: every claim below is
 * about the **arithmetic** the hook does with those two numbers, which is exactly the part a
 * browser would not check.
 */
let observed: Element[] = []
let fire: (entries: { key: string; isIntersecting: boolean; height: number }[]) => void = () => {}

class FakeObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {
        fire = updates => {
            this.callback(
                updates.map(
                    update =>
                        ({
                            target: elementFor(update.key),
                            isIntersecting: update.isIntersecting,
                            boundingClientRect: { height: update.height } as DOMRectReadOnly,
                        }) as unknown as IntersectionObserverEntry,
                ),
                this as unknown as IntersectionObserver,
            )
        }
    }
    observe(element: Element) {
        observed.push(element)
    }
    unobserve(element: Element) {
        observed = observed.filter(candidate => candidate !== element)
    }
    disconnect() {
        observed = []
    }
}

function elementFor(key: string): Element {
    const found = observed.find(element => element.getAttribute('data-window-key') === key)
    if (!found) throw new Error(`nothing observed for ${key}`)
    return found
}

function Row({ hook, id }: { hook: ReturnType<typeof useRenderWindow>; id: string }) {
    const height = hook.heightFor(id)
    return (
        <div
            ref={hook.observe}
            data-window-key={id}
            data-testid={`row-${id}`}
            style={height === null ? undefined : { height }}
        >
            {height === null ? <span data-testid={`body-${id}`}>{id}</span> : null}
        </div>
    )
}

function mount(keys: string[], options?: Parameters<typeof useRenderWindow>[1]) {
    const out = { current: null as ReturnType<typeof useRenderWindow> | null }
    function Probe({ keys }: { keys: string[] }) {
        const hook = useRenderWindow(keys, options)
        out.current = hook
        return (
            <>
                {keys.map(key => (
                    <Row key={key} hook={hook} id={key} />
                ))}
            </>
        )
    }
    const view = render(<Probe keys={keys} />)
    return { out, view, Probe }
}

/** Drain the settle debounce. */
function settle() {
    act(() => {
        vi.advanceTimersByTime(200)
    })
}

const KEYS = Array.from({ length: 30 }, (_, i) => `k${i}`)

beforeEach(() => {
    observed = []
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    vi.useFakeTimers()
})

describe('useRenderWindow', () => {
    it('renders the first rows before anything has been observed', () => {
        const { view } = mount(KEYS, { minimum: 10 })

        // Deterministic on the server and on the first client paint — which is what keeps this from
        // being a hydration mismatch. Legacy picks this number from the user agent.
        expect(view.queryByTestId('body-k0')).not.toBeNull()
        expect(view.queryByTestId('body-k9')).not.toBeNull()
        // Beyond the floor and never measured, so still rendered rather than collapsed to nothing.
        expect(view.queryByTestId('body-k20')).not.toBeNull()
    })

    it('stands a row down only once it has been measured', () => {
        const { view } = mount(KEYS, { minimum: 10, overscan: 2 })

        act(() => fire(KEYS.slice(0, 12).map(key => ({ key, isIntersecting: true, height: 700 }))))
        settle()

        // Scroll on: the first rows leave, carrying their height out with them.
        act(() =>
            fire([
                ...KEYS.slice(0, 12).map(key => ({ key, isIntersecting: false, height: 700 })),
                ...KEYS.slice(20, 23).map(key => ({ key, isIntersecting: true, height: 700 })),
            ]),
        )
        settle()

        expect(view.queryByTestId('body-k0')).toBeNull()
        expect(view.getByTestId('row-k0').style.height).toBe('700px')
        expect(view.queryByTestId('body-k21')).not.toBeNull()
    })

    it('keeps overscan rows either side of what is on screen', () => {
        const { out } = mount(KEYS, { minimum: 4, overscan: 2 })

        act(() => fire(KEYS.map(key => ({ key, isIntersecting: false, height: 700 }))))
        act(() => fire([{ key: 'k10', isIntersecting: true, height: 700 }]))
        settle()

        expect(out.current?.shouldRender('k8')).toBe(true)
        expect(out.current?.shouldRender('k12')).toBe(true)
        expect(out.current?.shouldRender('k7')).toBe(false)
        expect(out.current?.shouldRender('k13')).toBe(false)
    })

    /**
     * The failure mode legacy needs a `closest('[hidden]')` check for: a list inside a hidden tab
     * reports *nothing* intersecting, and a window computed from an empty set would stand every row
     * down — then jump when the tab came back.
     */
    it('falls back to the top of the list when nothing is on screen', () => {
        const { out } = mount(KEYS, { minimum: 6, overscan: 1 })

        act(() => fire(KEYS.map(key => ({ key, isIntersecting: false, height: 700 }))))
        settle()

        expect(out.current?.shouldRender('k0')).toBe(true)
        expect(out.current?.shouldRender('k5')).toBe(true)
    })

    /**
     * A zero height is what a row inside a hidden container reports. Recording it would stand that
     * row down to nothing, which is the jump this hook exists to prevent.
     */
    it('never records a zero measurement', () => {
        const { out, view } = mount(KEYS, { minimum: 2, overscan: 0 })

        act(() => fire(KEYS.map(key => ({ key, isIntersecting: false, height: 0 }))))
        act(() => fire([{ key: 'k20', isIntersecting: true, height: 700 }]))
        settle()

        // k0 is outside the window but has no usable height, so it is rendered rather than collapsed.
        expect(out.current?.shouldRender('k0')).toBe(true)
        expect(view.getByTestId('row-k0').style.height).toBe('')
    })

    /**
     * The whole reason keys are strings. Legacy keys heights by array index, so removing rows
     * re-attaches every height below the cut to the wrong row — which is the same defect that made
     * its *See more* state follow the wrong group after a block.
     *
     * One instance throughout: remounting would hand the hook a fresh height map and prove nothing.
     */
    it('a row keeps its height when rows above it are removed', () => {
        const { out, view, Probe } = mount(KEYS, { minimum: 2, overscan: 0 })

        act(() => fire(KEYS.map(key => ({ key, isIntersecting: false, height: 700 }))))
        act(() => fire([{ key: 'k25', isIntersecting: true, height: 700 }]))
        settle()

        expect(out.current?.heightFor('k5')).toBe(700)

        // Drop the first ten. `k15` was at index 15 and is now at index 5 — under legacy's scheme
        // it would inherit whatever index 5 had measured.
        const shorter = KEYS.slice(10)
        act(() => {
            view.rerender(<Probe keys={shorter} />)
        })
        act(() => fire([{ key: 'k25', isIntersecting: true, height: 700 }]))
        settle()

        expect(out.current?.heightFor('k15')).toBe(700)
        // And the rows that left took their heights with them rather than accumulating forever.
        expect(out.current?.heightFor('k5')).toBe(null)
    })

    it('renders everything when IntersectionObserver is missing', () => {
        vi.stubGlobal('IntersectionObserver', undefined)
        const { out } = mount(KEYS, { minimum: 2 })

        // No observer, so nothing is ever measured, so `shouldRender` answers true for every row —
        // a browser that cannot report visibility gets the list it would have had.
        expect(out.current?.shouldRender('k25')).toBe(true)
    })
})
