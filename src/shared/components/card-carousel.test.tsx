// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardCarousel } from './card-carousel'

/**
 * What survives the move to Embla, and what this file can honestly assert.
 *
 * The previous version of these tests covered `nearestIndex` — the pure helper that decided which
 * slide was parked at the leading edge. Embla owns that now, so the helper and its four cases are
 * gone rather than reimplemented against a library's internals.
 *
 * What is left is this component's own contract, and it is worth pinning because three of the four
 * cases are **branches taken before the engine ever runs**: the empty and single-slide
 * short-circuits, and the dots switch. jsdom reports every element as 0×0, so Embla initialises
 * without a usable measurement — which means anything about *position* (`initialIndex` landing,
 * a drag settling) belongs in a browser and is asserted by the Playwright pass over
 * `/dev/campaign-carousel`, not here.
 */
const slideLabel = (i: number, count: number) => `Slide ${i} of ${count}`

beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    )
    /*
     * Embla watches its viewport with a `ResizeObserver` and its slides with an
     * `IntersectionObserver`, and jsdom has neither — without both stubs the hook throws inside a
     * passive effect before any of this component's markup can be asserted.
     *
     * Two fakes to test five branches is a fair price, and it is also the clearest statement of
     * where the line now falls: everything the engine decides is browser work, and it is asserted
     * in a browser.
     */
    class Observer {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return []
        }
    }
    vi.stubGlobal('ResizeObserver', Observer)
    vi.stubGlobal('IntersectionObserver', Observer)
})

describe('CardCarousel', () => {
    it('renders nothing for no slides', () => {
        const { container } = render(
            // `children` is required, and an empty fragment is what a caller with nothing to show
            // actually passes — a feature maps its list and the list came back empty.
            <CardCarousel label="Promos" slideLabel={slideLabel} testId="promo">
                {null}
            </CardCarousel>,
        )
        expect(container.innerHTML).toBe('')
    })

    /**
     * The common case in production is **exactly one campaign running**, and one card is not a
     * carousel: no group, no dots, no autoplay, and — the point of asserting it — no engine, since
     * the viewport ref is never attached to anything.
     */
    it('returns the lone slide bare when there is only one', () => {
        render(
            <CardCarousel label="Promos" slideLabel={slideLabel} testId="promo">
                <div data-testid="only">One</div>
            </CardCarousel>,
        )
        expect(screen.getByTestId('only')).toBeTruthy()
        expect(screen.queryByTestId('promo')).toBeNull()
        expect(screen.queryAllByTestId('promo-dot')).toHaveLength(0)
    })

    it('announces itself as a carousel of labelled slides', () => {
        render(
            <CardCarousel label="Promos" slideLabel={slideLabel} autoplayMs={0} testId="promo">
                <div>A</div>
                <div>B</div>
                <div>C</div>
            </CardCarousel>,
        )

        const viewport = screen.getByTestId('promo')
        expect(viewport.getAttribute('aria-roledescription')).toBe('carousel')
        expect(viewport.getAttribute('aria-label')).toBe('Promos')

        const slides = screen.getAllByTestId('promo-slide')
        expect(slides).toHaveLength(3)
        // 1-based in the label, 0-based in the attribute — the label is for a reader, `data-index`
        // matches the code a test drives.
        expect(slides.map(s => s.getAttribute('data-index'))).toEqual(['0', '1', '2'])
        expect(slides[1].getAttribute('aria-label')).toBe('Slide 2 of 3')
    })

    it('marks exactly one dot as current', () => {
        render(
            <CardCarousel label="Promos" slideLabel={slideLabel} autoplayMs={0} testId="promo">
                <div>A</div>
                <div>B</div>
            </CardCarousel>,
        )
        const dots = screen.getAllByTestId('promo-dot')
        expect(dots).toHaveLength(2)
        expect(dots.filter(d => d.getAttribute('aria-current') === 'true')).toHaveLength(1)
    })

    /**
     * `dots={false}` has to mean *not in the DOM*, not hidden by CSS: `/premium`'s benefit dialog
     * draws its own set in a lifted footer, and two elements carrying `promo-dot` — one of them
     * invisible — is the duplicate-handle trap `docs/TEST_IDS.md` warns about.
     */
    it('renders no dots at all when the caller draws its own', () => {
        render(
            <CardCarousel
                label="Promos"
                slideLabel={slideLabel}
                autoplayMs={0}
                dots={false}
                testId="promo"
            >
                <div>A</div>
                <div>B</div>
            </CardCarousel>,
        )
        expect(screen.queryAllByTestId('promo-dot')).toHaveLength(0)
        expect(screen.getAllByTestId('promo-slide')).toHaveLength(2)
    })
})
