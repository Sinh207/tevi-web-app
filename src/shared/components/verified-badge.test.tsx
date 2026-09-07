// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VerifiedBadge } from './verified-badge'
import { VerifiedBadgeDialog } from './verified-badge-dialog'

/**
 * The three claims a comment cannot hold.
 *
 * - **The image is the fact.** An unverified account still sends `verified_tick_badge` — `{}`, or
 *   `{ image: null }` — so a component that gated on the object would put a tick on everybody. This
 *   is the rule the eight call sites used to each own a copy of, which is why it is worth a test now
 *   that they share one.
 * - **Decorative and interactive differ in who carries the name.** Both shapes are announced exactly
 *   once: as an image with an `alt`, or as a button with an `aria-label` over presentational art.
 *   Labelling both would read "Verified, Verified" inside a single tab stop.
 * - **The panel opens.** The dialog is behind `next/dynamic`, so "pressing the tick shows it" is a
 *   claim about a lazy boundary landing, not about JSX.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
// `next/link` wants App Router context, which a component test has no business standing up.
vi.mock('next/link', () => ({
    default: ({ children, ...props }: { children: React.ReactNode }) => (
        <a {...props}>{children}</a>
    ),
}))

const ART = 'https://cdn.tevi.test/badges/blue-tick.png'

describe('VerifiedBadge', () => {
    it('draws nothing without art — the object is not the fact', () => {
        const { container, rerender } = render(<VerifiedBadge image={null} />)
        expect(container.firstChild).toBeNull()

        rerender(<VerifiedBadge image={undefined} />)
        expect(container.firstChild).toBeNull()

        rerender(<VerifiedBadge image="" />)
        expect(container.firstChild).toBeNull()
    })

    it('is a plain image by default, named once', () => {
        render(<VerifiedBadge image={ART} />)

        expect(screen.getByRole('img', { name: 'channel_verified' })).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })

    /**
     * A row in a long list already holds a `t()`; passing it saves a translation lookup per tile and
     * is how `SearchFollowingStrip` has always drawn this mark.
     */
    it('takes the caller label when it has one', () => {
        render(<VerifiedBadge image={ART} label="Verified" />)

        expect(screen.getByRole('img', { name: 'Verified' })).toBeTruthy()
    })

    it('is a button when interactive, and the art beneath it is silent', () => {
        render(<VerifiedBadge image={ART} interactive />)

        const button = screen.getByRole('button', { name: 'channel_verified' })
        expect(button.getAttribute('aria-haspopup')).toBe('dialog')
        // Not a second announcement of the same word: `alt=""` is presentational.
        expect(screen.queryByRole('img')).toBeNull()
    })

    /**
     * `docs/TEST_IDS.md`: `shared/` receives a scope and never authors one. The button is the outer
     * element in the interactive shape, so without this forwarding a caller cannot address the thing
     * it just made pressable.
     */
    it('forwards the caller testid to whichever element is outermost', () => {
        const { rerender } = render(
            <VerifiedBadge image={ART} data-testid="channel-verified-badge" />,
        )
        expect(screen.getByTestId('channel-verified-badge').tagName).toBe('IMG')

        rerender(<VerifiedBadge image={ART} interactive data-testid="channel-verified-badge" />)
        expect(screen.getByTestId('channel-verified-badge').tagName).toBe('BUTTON')
    })

    it('opens the panel when pressed', async () => {
        render(<VerifiedBadge image={ART} interactive data-testid="channel-verified-badge" />)

        fireEvent.click(screen.getByRole('button', { name: 'channel_verified' }))

        // `waitFor`, not a bare `getBy`: the dialog is a `next/dynamic` chunk, so it lands later.
        await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
        expect(screen.getByText('channel_verified_dialog_heading')).toBeTruthy()
    })
})

describe('VerifiedBadgeDialog', () => {
    it('says what the tick means, and offers a way out', () => {
        render(
            <VerifiedBadgeDialog
                open
                onOpenChange={() => {}}
                image={ART}
                testId="channel-verified-badge"
            />,
        )

        expect(screen.getByTestId('channel-verified-badge-title').textContent).toBe(
            'channel_verified_dialog_title',
        )
        expect(screen.getByTestId('channel-verified-badge-close')).toBeTruthy()
    })

    /**
     * **A link with nowhere to go is worse than no link.** `shared/` may not import a feature, so the
     * address arrives from the caller — and when it does not, the sentence has to end rather than
     * print a dead *Learn more*.
     */
    it('prints Learn more only with somewhere to send the reader', () => {
        const { rerender } = render(
            <VerifiedBadgeDialog open onOpenChange={() => {}} image={ART} />,
        )
        expect(screen.queryByRole('link')).toBeNull()

        rerender(
            <VerifiedBadgeDialog
                open
                onOpenChange={() => {}}
                image={ART}
                learnMoreHref="/@support/messages"
            />,
        )
        expect(
            screen.getByRole('link', { name: 'channel_verified_learn_more' }).getAttribute('href'),
        ).toBe('/@support/messages')
    })
})
