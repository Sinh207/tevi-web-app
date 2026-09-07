// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SavedCard } from '../api/types'
import { PayWithCardPanel } from './pay-with-card-panel'

/**
 * One thing, and it is the one a lib test cannot reach: **which row the panel opens on**, and whether
 * an unusable row can be pressed. `pickPayableCard` is tested on its own; this pins that the panel
 * actually asks it, and that the radio and the submit agree with the answer.
 *
 * Stripe's bindings are stubbed because they require an `<Elements>` ancestor — mounting a real one
 * means a real Stripe instance, which is a script from another origin. `useElements` returning a
 * stand-in is enough: the panel only passes it through.
 */

vi.mock('@stripe/react-stripe-js', () => ({
    useElements: () => ({ submit: vi.fn() }),
    /*
     * `onReady` is forwarded, because the panel's second scroll pass hangs off it — Stripe mounts an
     * iframe and the form has no height until then. A stub that swallowed it would let the pass that
     * actually lands correctly go untested.
     */
    PaymentElement: ({ onReady }: { onReady?: () => void }) => (
        <div data-testid="payment-element">
            <button type="button" data-testid="element-ready" onClick={() => onReady?.()}>
                ready
            </button>
        </div>
    ),
    AddressElement: () => <div data-testid="address-element" />,
}))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) =>
            vars?.date ? `${key}:${vars.date}` : key,
        currentLanguage: 'en',
    }),
}))

const card = (id: string, month: number, year: number, isDefault = false): SavedCard =>
    ({
        id,
        default: isDefault,
        type: 'card',
        card: {
            brand: 'visa',
            last4: id.padStart(4, '0'),
            exp_month: month,
            exp_year: year,
            funding: 'credit',
        },
    }) as SavedCard

/** Fixed so "expired" does not depend on when the suite runs. */
const NOW = new Date('2026-08-22T12:00:00Z')

function renderPanel(cards: SavedCard[]) {
    vi.setSystemTime(NOW)
    const onPay = vi.fn()
    render(<PayWithCardPanel cards={cards} amountLabel="$10.29" isBusy={false} onPay={onPay} />)
    return { onPay, radios: () => screen.getAllByRole('radio') as HTMLInputElement[] }
}

describe('PayWithCardPanel — expired cards', () => {
    it('does not open on an expired default, and will not let it be pressed', () => {
        vi.useFakeTimers()
        try {
            const { radios, onPay } = renderPanel([
                card('1', 1, 2024, true), // expired, and the account default
                card('2', 9, 2027),
            ])

            const [expired, good, newMethod] = radios()
            expect(expired.disabled).toBe(true)
            expect(expired.checked).toBe(false)
            // The usable card is where the panel opened, not the new-method form.
            expect(good.checked).toBe(true)
            expect(newMethod.checked).toBe(false)

            // The row says why, in the error colour's own key.
            expect(screen.getByText('payment_card_expired_on:01/2024')).toBeTruthy()
            expect(screen.getByText('payment_card_expired_badge')).toBeTruthy()
            // "Expired" takes the trailing slot from "Default" — one label, on the row that matters.
            expect(screen.queryByText('payment_card_default_badge')).toBeNull()
            expect(onPay).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('opens on the new-method form when nothing saved can be paid with', () => {
        vi.useFakeTimers()
        try {
            const { radios } = renderPanel([card('1', 1, 2024, true), card('2', 2, 2025)])

            const rows = radios()
            expect(rows.slice(0, 2).every(row => row.disabled)).toBe(true)
            // The last radio is "use a new payment method" — the only thing left that can pay.
            expect(rows[rows.length - 1]?.checked).toBe(true)
            expect(screen.getByTestId('payment-element')).toBeTruthy()
        } finally {
            vi.useRealTimers()
        }
    })

    it('keeps a card valid through the whole of its expiry month', () => {
        vi.useFakeTimers()
        try {
            const { radios } = renderPanel([card('1', 8, 2026, true)])
            expect(radios()[0]?.disabled).toBe(false)
            expect(radios()[0]?.checked).toBe(true)
            expect(screen.getByText('payment_card_expires:08/2026')).toBeTruthy()
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('PayWithCardPanel — revealing the new-method form', () => {
    const NOW_VALID = new Date('2026-08-22T12:00:00Z')

    /** jsdom has no layout, so `scrollIntoView` is not implemented — this is the seam. */
    function withScrollSpy() {
        const scrollIntoView = vi.fn()
        Element.prototype.scrollIntoView = scrollIntoView
        return scrollIntoView
    }

    it('scrolls the row into view when the reader picks a new method', () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW_VALID)
        const scrollIntoView = withScrollSpy()
        try {
            render(
                <PayWithCardPanel
                    cards={[card('1', 9, 2027, true), card('2', 10, 2027)]}
                    amountLabel="$10.29"
                    isBusy={false}
                    onPay={vi.fn()}
                />,
            )
            // Opened on a usable saved card, so nothing has scrolled yet.
            expect(scrollIntoView).not.toHaveBeenCalled()

            const radios = screen.getAllByRole('radio') as HTMLInputElement[]
            fireEvent.click(radios[radios.length - 1] as HTMLInputElement)

            expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })

            // Second pass, once Stripe reports the iframe laid out: a single scroll lands short by
            // exactly the height of the form.
            scrollIntoView.mockClear()
            fireEvent.click(screen.getByTestId('element-ready'))
            expect(scrollIntoView).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not scroll when the panel opened on the form by itself', () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW_VALID)
        const scrollIntoView = withScrollSpy()
        try {
            // Every saved card expired, so the form is the only thing that can pay — and there is
            // nothing above it worth scrolling past.
            render(
                <PayWithCardPanel
                    cards={[card('1', 1, 2024, true)]}
                    amountLabel="$10.29"
                    isBusy={false}
                    onPay={vi.fn()}
                />,
            )
            fireEvent.click(screen.getByTestId('element-ready'))
            expect(scrollIntoView).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('jumps rather than glides when the reader asked for less motion', () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW_VALID)
        const scrollIntoView = withScrollSpy()
        const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
        vi.stubGlobal('matchMedia', matchMedia)
        try {
            render(
                <PayWithCardPanel
                    cards={[card('1', 9, 2027, true)]}
                    amountLabel="$10.29"
                    isBusy={false}
                    onPay={vi.fn()}
                />,
            )
            const radios = screen.getAllByRole('radio') as HTMLInputElement[]
            fireEvent.click(radios[radios.length - 1] as HTMLInputElement)

            expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
        } finally {
            vi.unstubAllGlobals()
            vi.useRealTimers()
        }
    })
})
