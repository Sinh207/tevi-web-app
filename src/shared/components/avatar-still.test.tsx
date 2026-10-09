// @vitest-environment jsdom
import { Icon } from '@shared/ui/icon'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarStill } from './avatar-still'

/**
 * The fallback rule eight call sites now share instead of each assembling `Avatar` + `<Image>`:
 * picture → picture; no picture → initials (if given) or placeholder; **broken** picture →
 * placeholder. And the two props whose whole point is conditional: the custom glyph, and the
 * image-only plate.
 */

const SRC = 'https://cdn.tevi.test/a.jpg'

function avatar(container: HTMLElement) {
    return container.querySelector('[data-slot="avatar"]') as HTMLElement
}

describe('AvatarStill', () => {
    it('shows the picture while it loads', () => {
        const { container } = render(<AvatarStill src={SRC} size="large" px={48} initials="AD" />)
        expect(avatar(container).dataset.type).toBe('image')
        expect(container.querySelector('img')).not.toBeNull()
    })

    it('shows the initials when there is no picture, and the placeholder without them', () => {
        const { container, rerender } = render(
            <AvatarStill src={null} size="large" px={48} initials="AD" />,
        )
        expect(avatar(container).dataset.type).toBe('initials')

        rerender(<AvatarStill src={null} size="large" px={48} />)
        expect(avatar(container).dataset.type).toBe('placeholder')
    })

    it('shows the placeholder — not the initials — when the picture fails', () => {
        const { container } = render(<AvatarStill src={SRC} size="large" px={48} initials="AD" />)
        fireEvent.error(container.querySelector('img') as HTMLImageElement)

        expect(avatar(container).dataset.type).toBe('placeholder')
        expect(container.querySelector('[data-slot="avatar-initials"]')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
    })

    it('draws the caller’s glyph, and the plate only under a picture', () => {
        const { container } = render(
            <AvatarStill
                src={SRC}
                size="xl"
                px={64}
                imageClassName="bg-white"
                glyph={<Icon name="grid-square" size={24} />}
            />,
        )
        expect(avatar(container).className).toContain('bg-white')

        fireEvent.error(container.querySelector('img') as HTMLImageElement)
        expect(avatar(container).className).not.toContain('bg-white')
        expect(container.querySelector('use')?.getAttribute('href')).toContain('grid-square')
    })
})
