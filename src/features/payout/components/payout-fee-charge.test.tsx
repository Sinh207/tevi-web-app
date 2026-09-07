// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PayoutFeeCharge } from './payout-fee-charge'

/**
 * The three states a fee row's value can take, on the two screens that account for the gap between
 * gross and net. They are shared (`PayoutRequestSummary`, `PayoutDetailRows`) and none of them had
 * direct coverage: the waived path is pinned end-to-end by `payout-request.spec.ts`, but the other
 * two only by whichever fixture happened to produce them.
 *
 * Small, and worth it because each state is a **claim about money**: what came off, what would have,
 * and "we do not know" — and the last is the one that must never render as a `0`.
 */
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe('PayoutFeeCharge', () => {
    it('signs a live charge negatively', () => {
        render(<PayoutFeeCharge charge="1,272,884 VND" isWaived={false} />)
        expect(screen.getByText('-1,272,884 VND')).toBeTruthy()
        expect(screen.queryByText('payout_fee_free')).toBeNull()
    })

    /**
     * **A dash, never a `0`.** A zero is a claim that nothing was charged; the absence of a subtotal
     * means the client does not know what was. On a breakdown that has to add up, those are different
     * statements and only one of them is true here.
     */
    it('shows a dash when there is no charge to show', () => {
        const { container } = render(<PayoutFeeCharge charge={null} isWaived={false} />)
        expect(container.textContent).toBe('—')
        expect(container.textContent).not.toContain('0')
    })

    /**
     * A waived fee shows **both halves**: what it would have cost, struck through, and *Free*. Only
     * the figure hides the discount; only the word hides its size.
     */
    it('strikes the pre-waiver figure through and names it free', () => {
        const { container } = render(<PayoutFeeCharge charge="1,272,884 VND" isWaived={true} />)
        const struck = [...container.querySelectorAll('span')].find(el =>
            el.className.includes('line-through'),
        )
        expect(struck?.textContent).toBe('-1,272,884 VND')
        expect(screen.getByText('payout_fee_free')).toBeTruthy()
    })

    /**
     * A waiver with no figure still says *Free* rather than falling through to a dash — the fee was
     * forgiven whether or not its size is known, and that is the half the reader needs.
     */
    it('still says free when the pre-waiver figure is unknown', () => {
        const { container } = render(<PayoutFeeCharge charge={null} isWaived={true} />)
        expect(screen.getByText('payout_fee_free')).toBeTruthy()
        expect(container.textContent).not.toContain('—')
    })
})
