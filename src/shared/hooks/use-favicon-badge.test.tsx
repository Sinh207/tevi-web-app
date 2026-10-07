// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFaviconBadge } from './use-favicon-badge'

function Probe({ on }: { on: boolean }) {
    useFaviconBadge(on)
    return null
}

const BADGED = 'data:image/png;base64,BADGED'

/** jsdom has no image decoding and no canvas — both are stood in for, so the lifecycle is what runs. */
beforeEach(() => {
    document.head.innerHTML = `
        <link rel="icon" href="/favicon.ico" type="image/x-icon">
        <link rel="icon" href="/icon.svg" type="image/svg+xml">`
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined)
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
    }) as unknown as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue(BADGED)
})

afterEach(() => {
    document.head.innerHTML = ''
})

const links = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]

describe('useFaviconBadge', () => {
    it('badges every icon link as a PNG, then puts back exactly what was there', async () => {
        const { rerender } = render(<Probe on />)
        await waitFor(() =>
            expect(links().every(l => l.getAttribute('href') === BADGED)).toBe(true),
        )
        expect(links().map(l => l.getAttribute('type'))).toEqual(['image/png', 'image/png'])

        rerender(<Probe on={false} />)
        expect(links().map(l => [l.getAttribute('href'), l.getAttribute('type')])).toEqual([
            ['/favicon.ico', 'image/x-icon'],
            ['/icon.svg', 'image/svg+xml'],
        ])
    })

    it('leaves no dot behind when the shell unmounts', async () => {
        const { unmount } = render(<Probe on />)
        await waitFor(() => expect(links()[0].getAttribute('href')).toBe(BADGED))
        unmount()
        expect(links()[0].getAttribute('href')).toBe('/favicon.ico')
    })

    it('touches nothing while there is nothing unread', () => {
        render(<Probe on={false} />)
        expect(links().map(l => l.getAttribute('href'))).toEqual(['/favicon.ico', '/icon.svg'])
    })
})
