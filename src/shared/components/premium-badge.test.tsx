// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PremiumBadge } from './premium-badge'

/**
 * The badge has two shapes and the difference is an **accessibility** difference, not a visual one —
 * which is exactly the kind a rendered tree can state and a comment cannot.
 *
 * Legacy's `BadgePremium` is a control: the crown pushes `/premium` wherever it appears beside a
 * name. This repo had lost that, and restoring it introduces the failure modes below.
 */
describe('PremiumBadge', () => {
    it('is decorative without an href — an image, or nothing at all', () => {
        const { rerender } = render(<PremiumBadge label="Premium" />)
        expect(screen.getByRole('img', { name: 'Premium' })).toBeTruthy()
        expect(screen.queryByRole('link')).toBeNull()

        /*
         * Unlabelled is the top bar's case: the badge sits inside a button that already carries the
         * name, so a second one would be announced twice inside one stop.
         */
        rerender(<PremiumBadge />)
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('is a link with an href, named by its label and pointing where it was told', () => {
        render(<PremiumBadge href="/premium" label="Premium" />)

        const link = screen.getByRole('link', { name: 'Premium' })
        expect(link.getAttribute('href')).toBe('/premium')
    })

    /**
     * The name belongs to **one** element. Labelling the badge as well would make a screen reader
     * announce "Premium" twice inside a single tab stop, which is why the inner art is hidden rather
     * than merely unlabelled — an `aria-label` on a `<span role="img">` inside a link still gets read.
     */
    it('does not name the art as well as the link', () => {
        render(<PremiumBadge href="/premium" label="Premium" />)

        expect(screen.queryByRole('img')).toBeNull()
        expect(screen.getAllByRole('link')).toHaveLength(1)
    })

    /**
     * The burst is decoration and must never reach the accessibility tree — the badge can be a
     * **link**, and eleven announced children inside one tab stop is the failure that turns a mark
     * into noise. It is also `pointer-events-none`, so none of them can swallow the press.
     */
    it('sparkles by default, and the sparks are hidden from the tree', () => {
        const { container } = render(<PremiumBadge href="/premium" label="Premium" />)

        const layer = container.querySelector('[aria-hidden="true"].pointer-events-none')
        expect(layer).toBeTruthy()
        expect(layer?.children.length).toBeGreaterThan(6)

        // The link is still the only thing in the tree, sparks and all.
        expect(screen.getAllByRole('link')).toHaveLength(1)
        expect(screen.queryByRole('img')).toBeNull()
    })

    /**
     * The escape hatch for a host that clips: the sparks leave the badge's own 24-unit box by
     * design, so a cropping ancestor would turn a burst into stubs. No current host clips — this is
     * the switch, and the test is what keeps `sparkle={false}` meaning something.
     */
    it('draws no sparks when asked not to', () => {
        const { container } = render(<PremiumBadge label="Premium" sparkle={false} />)

        expect(container.querySelector('.pointer-events-none')).toBeNull()
        expect(screen.getByRole('img', { name: 'Premium' })).toBeTruthy()
    })

    /**
     * `docs/TEST_IDS.md`: `shared/` receives a scope and never authors one. The link variant is the
     * outer element, so without this forwarding a caller cannot address the thing it just made
     * clickable.
     */
    it('forwards the caller testid to whichever element is outermost', () => {
        const { rerender } = render(<PremiumBadge data-testid="channel-premium-badge" label="P" />)
        expect(screen.getByTestId('channel-premium-badge').getAttribute('role')).toBe('img')

        rerender(<PremiumBadge data-testid="channel-premium-badge" href="/premium" label="P" />)
        expect(screen.getByTestId('channel-premium-badge').tagName).toBe('A')
    })
})
