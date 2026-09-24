// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * **The studio covers the site, so the site must stop taking focus.** Pinned: the shell is `inert`
 * while the studio is up and not after; the studio itself is outside the shell (otherwise `inert`
 * would reach it too); and an `inert` somebody else set is left alone.
 */
vi.mock('@features/channel', () => ({}))
const { StudioPortal } = await import('./event-studio-screen')

function Page({ open }: { open: boolean }) {
    return (
        <div data-app-shell>
            <button type="button">navbar</button>
            {open && (
                <StudioPortal>
                    <main data-testid="studio">stage</main>
                </StudioPortal>
            )}
        </div>
    )
}

afterEach(() => document.body.replaceChildren())

describe('StudioPortal', () => {
    it('makes the shell inert while the studio is up, and puts the studio outside it', () => {
        const view = render(<Page open />)
        const shell = document.querySelector('[data-app-shell]')
        const studio = document.querySelector('[data-testid="studio"]')
        expect(shell?.hasAttribute('inert')).toBe(true)
        expect(studio).not.toBeNull()
        expect(shell?.contains(studio as Node)).toBe(false)

        view.rerender(<Page open={false} />)
        expect(shell?.hasAttribute('inert')).toBe(false)
    })

    it('leaves an inert it did not set', () => {
        const view = render(<Page open={false} />)
        const shell = document.querySelector('[data-app-shell]') as HTMLElement
        shell.setAttribute('inert', '')
        view.rerender(<Page open />)
        view.rerender(<Page open={false} />)
        expect(shell.hasAttribute('inert')).toBe(true)
    })
})
