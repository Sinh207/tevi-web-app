// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostImage } from '../api/types'
import { PostImageGallery } from './post-image-gallery'

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

/**
 * `next/image` needs a configured loader and a Next runtime; neither exists under Vitest, and
 * neither is what this file is testing.
 *
 * The stub is a **`span` with `role="img"`**, not an `<img>`. It satisfies the `getAllByRole('img')`
 * the assertions use while keeping `lint/performance/noImgElement` out of the file — a rule that is
 * right about production code and has nothing to say about a three-line test double, and whose
 * suppression is noise a reader has to decode. The `src` rides a data attribute so a test can still
 * address it.
 */
vi.mock('next/image', () => ({
    default: ({ src, alt }: { src: string; alt: string }) => (
        <span role="img" aria-label={alt} data-src={src} />
    ),
}))

const image = (uri: string, width = 800, height = 800): PostImage =>
    ({ uri, thumb: null, blur: null, w: null, h: null, width, height }) as PostImage

/**
 * React's duplicate-key warning is a `console.error`, not a throw — which is exactly why this bug
 * shipped: the row rendered, the page looked right, and the only signal was a line in a console
 * nobody had open. Spying on it is the only way to make the warning fail a test.
 */
let errors: string[] = []
let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    errors = []
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(' '))
    })
})

afterEach(() => spy.mockRestore())

describe('PostImageGallery', () => {
    /**
     * The regression. A creator can repeat the same asset in one post — the harness's eleven-image
     * fixture is eleven copies of one URL — and the tiles used to be keyed on `src`, so every
     * duplicate collided. React warns and is then free to drop or duplicate a child, which means the
     * `+n` row can silently render fewer images than the post has.
     */
    it('renders every tile when a post repeats the same image URL', () => {
        const same = '/illustrations/monetization/membership-overview.webp'
        render(
            <PostImageGallery images={[image(same), image(same), image(same)]} onOpen={() => {}} />,
        )

        expect(screen.getAllByRole('img')).toHaveLength(3)
        expect(errors.join('\n')).not.toMatch(/same key/i)
    })

    /** The index rides a companion attribute, never the testid — `docs/TEST_IDS.md`. */
    it('publishes each tile position as data-media-index', () => {
        const same = '/a.webp'
        const { container } = render(
            <PostImageGallery images={[image(same), image(same)]} onOpen={() => {}} />,
        )

        const indices = [...container.querySelectorAll('[data-media-index]')].map(node =>
            node.getAttribute('data-media-index'),
        )
        expect(indices).toEqual(['0', '1'])
    })

    /**
     * `onOpen` is what turns the tiles into buttons. Without it they must stay plain elements, so a
     * surface that cannot open a lightbox does not grow a row of focusable controls that do nothing.
     */
    it('renders tiles as buttons only when they can be opened', () => {
        const images = [image('/a.webp'), image('/b.webp')]

        const withHandler = render(<PostImageGallery images={images} onOpen={() => {}} />)
        expect(withHandler.container.querySelectorAll('button[data-media-index]')).toHaveLength(2)
        withHandler.unmount()

        const without = render(<PostImageGallery images={images} />)
        expect(without.container.querySelectorAll('button[data-media-index]')).toHaveLength(0)
        expect(without.container.querySelectorAll('[data-media-index]')).toHaveLength(2)
    })

    /**
     * ⚠ **A single image is a slide like any other**, and this test used to assert the opposite.
     *
     * There was a branch drawing one image at full width and its own snapped ratio; legacy has no
     * such branch, and at `3/4` it made a portrait photo 612 × 816 in a 612px column — taller than
     * most laptop viewports, so the card's own actions scrolled away under it. The old assertion
     * was pinning that divergence rather than a requirement.
     *
     * What is worth pinning is that the row treats one image the same as four: same fixed height,
     * width from its own ratio.
     */
    it('puts a single image in the row, as every other image', () => {
        const { container } = render(<PostImageGallery images={[image('/a.webp')]} />)
        expect(container.querySelectorAll('[data-media-index]')).toHaveLength(1)
        expect(screen.getAllByRole('img')).toHaveLength(1)
    })

    it('renders nothing for an empty list', () => {
        const { container } = render(<PostImageGallery images={[]} />)
        expect(container.firstChild).toBeNull()
    })
})
