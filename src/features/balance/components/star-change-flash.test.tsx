// @vitest-environment jsdom

import { eventBus } from '@shared/lib/event-bus'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StarChangeFlash } from './star-change-flash'

/**
 * The three things this component exists to get right, all of which legacy's `starSpendAnimation` gets
 * wrong — and none of which is visible in a screenshot.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => `${key}:${vars?.amount ?? ''}`,
        currentLanguage: 'en',
    }),
}))

function emit(delta: number) {
    act(() => {
        eventBus.emit('balance:star-changed', { delta })
    })
}

beforeEach(() => {
    eventBus.all.clear()
})

describe('before anything happens', () => {
    it('renders nothing', () => {
        const { container } = render(<StarChangeFlash />)
        // It sits inside the Star pill on every route, so an idle render must add no box at all.
        expect(container.firstChild).toBeNull()
    })
})

describe('a spend', () => {
    it('draws the amount it moved by, signed', () => {
        render(<StarChangeFlash />)
        emit(-120)
        expect(screen.getByText('-120')).toBeTruthy()
    })

    it('announces itself once, as information rather than an alert', () => {
        render(<StarChangeFlash />)
        emit(-120)
        const status = screen.getByRole('status')
        expect(status.textContent).toBe('balance_star_spent:120')
    })
})

describe('a top-up', () => {
    it('flashes too — legacy drops it', () => {
        render(<StarChangeFlash />)
        // Legacy guards with `if (!amount || amount <= 0) return null`, and a credit's delta is
        // negative in its arithmetic, so adding money is silent there.
        emit(500)
        expect(screen.getByText('+500')).toBeTruthy()
        expect(screen.getByRole('status').textContent).toBe('balance_star_added:500')
    })
})

describe('a movement of zero', () => {
    it('is not drawn — the emitter filters it, and nothing here invents one', () => {
        render(<StarChangeFlash />)
        emit(0)
        // `0` is signed as a credit by `> 0`, so if a zero ever reached here it would read `+0`.
        expect(screen.queryByText('+0')).toBeNull()
        expect(screen.queryByText('-0')).toBeNull()
    })
})

describe('a second movement inside the first animation', () => {
    it('replaces the element so the animation restarts', () => {
        render(<StarChangeFlash />)
        emit(-120)
        const first = screen.getByText('-120')

        emit(-30)
        const second = screen.getByText('-30')

        // CSS does not restart an animation already running on the same node, so the element has to be
        // a different one. Legacy has no `key` and shows the first amount frozen.
        expect(second).not.toBe(first)
        expect(screen.queryByText('-120')).toBeNull()
    })
})

/**
 * ## Not covered here, and why
 *
 * **The element removing itself on `animationend`.** Verified by hand in a browser; not assertable in
 * this harness — React does not dispatch `onAnimationEnd` under the jsdom this repo runs, with a plain
 * `Event`, with `fireEvent.animationEnd`, or with an `AnimationEvent` polyfill (all three tried). The
 * behaviour is real and the alternative designs are worse: a timer would reintroduce exactly the
 * two-clocks bug this component exists to avoid, and leaving the element mounted forever would leave
 * its announcement in the DOM for a screen reader to find long after the fact.
 *
 * What *is* covered is the part that would silently rot: the `key`, which is the difference between a
 * second spend restarting the animation and legacy's frozen first amount.
 */
