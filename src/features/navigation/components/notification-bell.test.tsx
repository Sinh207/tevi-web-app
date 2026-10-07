// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './notification-bell'

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

/** jsdom has neither `matchMedia` (read by `useMayAnimate`) nor Web Animations. */
let reduceMotion = false
const animate = vi.fn()

beforeEach(() => {
    reduceMotion = false
    animate.mockClear()
    window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: reduceMotion,
        addEventListener: () => {},
        removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate']
})

afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})

describe('NotificationBell', () => {
    it('shows the count, and 99+ past ninety-nine', () => {
        const { container, rerender } = render(<NotificationBell count={3} />)
        expect(container.textContent).toBe('3')
        rerender(<NotificationBell count={120} />)
        expect(container.textContent).toBe('99+')
    })

    it('shows no badge at zero', () => {
        const { container } = render(<NotificationBell count={0} />)
        expect(container.textContent).toBe('')
    })

    /*
     * The rule the motion rests on: the bell rings for **news** — a count going up while the page
     * is open — and for nothing else.
     */
    it('does not ring on the first answer, only when the count goes up', () => {
        const { rerender } = render(<NotificationBell count={2} />)
        expect(animate).not.toHaveBeenCalled()

        rerender(<NotificationBell count={3} />)
        expect(animate).toHaveBeenCalledTimes(1)

        rerender(<NotificationBell count={1} />) // read some: not news
        expect(animate).toHaveBeenCalledTimes(1)
    })

    it('never rings under reduced motion', () => {
        reduceMotion = true
        const { rerender } = render(<NotificationBell count={1} />)
        rerender(<NotificationBell count={5} />)
        expect(animate).not.toHaveBeenCalled()
    })
})
