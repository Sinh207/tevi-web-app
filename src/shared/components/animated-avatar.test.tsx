// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnimatedAvatar } from './animated-avatar'

/**
 * The broken-image fallback — three claims a comment cannot hold.
 *
 * - **A still that fails to load becomes the placeholder**, not the browser's broken-image glyph on
 *   a white disc. And the placeholder glyph rather than the initials: initials mean "no picture",
 *   and this person has one that did not arrive.
 * - **The failure belongs to one URL.** A new `thumb` on the same instance is tried, not inherited
 *   as broken.
 * - **The name survives the fallback**, so a broken avatar is still announced as whose it is.
 */

// The still is all this tests; motion and visibility are other files' business.
vi.mock('@shared/hooks/use-may-animate', () => ({ useMayAnimate: () => false }))
vi.mock('@shared/hooks/use-in-view', () => ({ useInView: () => [() => undefined, false] }))

const THUMB = 'https://cdn.tevi.test/avatars/ada.jpg'
const OTHER = 'https://cdn.tevi.test/avatars/ada-2.jpg'

function avatar(container: HTMLElement) {
    return container.querySelector('[data-slot="avatar"]') as HTMLElement
}

describe('AnimatedAvatar — a still that fails to load', () => {
    it('falls back to the placeholder, not the initials', () => {
        const { container } = render(<AnimatedAvatar thumb={THUMB} alt="Ada" initials="AD" />)
        expect(avatar(container).dataset.type).toBe('image')

        fireEvent.error(screen.getByRole('img', { name: 'Ada' }))

        expect(avatar(container).dataset.type).toBe('placeholder')
        expect(container.querySelector('[data-slot="avatar-placeholder"]')).not.toBeNull()
        expect(container.querySelector('[data-slot="avatar-initials"]')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
    })

    it('keeps the name on the placeholder, and stays decorative when it had none', () => {
        const { container, rerender } = render(<AnimatedAvatar thumb={THUMB} alt="Ada" />)
        fireEvent.error(screen.getByRole('img', { name: 'Ada' }))
        expect(screen.getByRole('img', { name: 'Ada' }).dataset.slot).toBe('avatar-placeholder')

        rerender(<AnimatedAvatar thumb={OTHER} alt="" />)
        fireEvent.error(container.querySelector('img') as HTMLImageElement)
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('tries a new picture rather than carrying the old failure onto it', () => {
        const { container, rerender } = render(<AnimatedAvatar thumb={THUMB} alt="Ada" />)
        fireEvent.error(screen.getByRole('img', { name: 'Ada' }))
        expect(avatar(container).dataset.type).toBe('placeholder')

        rerender(<AnimatedAvatar thumb={OTHER} alt="Ada" />)
        expect(avatar(container).dataset.type).toBe('image')
        expect(container.querySelector('img')).not.toBeNull()
    })

    it('still shows initials when there is no picture at all', () => {
        const { container } = render(<AnimatedAvatar thumb={null} alt="Ada" initials="AD" />)
        expect(avatar(container).dataset.type).toBe('initials')
    })
})
