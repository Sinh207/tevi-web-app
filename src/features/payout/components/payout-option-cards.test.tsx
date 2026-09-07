// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayoutOption } from '../api/payout-request-api'
import { PayoutOptionCards } from './payout-option-cards'

/**
 * **When the Premium offer may open on its own**, which is the one thing about these cards that happens
 * without a press — and therefore the one thing a reader cannot undo by not pressing.
 *
 * Rendered rather than probed because the claim is about an effect firing on mount, and the two states
 * differ by a dialog existing. An e2e cannot pin it: the case where the offer must *not* open is a
 * screen that is redirecting, so by the time a spec can assert anything the whole tree has unmounted
 * and the dialog is absent either way. Measured — the e2e passed with the gate deleted.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const channel = { isPremium: false, isLoading: false }
vi.mock('@features/channel', () => ({ useMyChannel: () => channel }))

/** Both speeds, Fast **locked** — the state the offer exists for. */
const OPTIONS: PayoutOption[] = [
    {
        id: 'saving',
        kind: 'saving',
        percentFeeRate: 0,
        flatFeeAmount: 0,
        durationDays: 15,
        isActive: true,
    },
    {
        id: 'fast',
        kind: 'fast',
        percentFeeRate: 5,
        flatFeeAmount: 0,
        durationDays: 1,
        isActive: true,
    },
]

const show = (canOffer?: boolean, onSelect = vi.fn()) => {
    const view = render(
        <PayoutOptionCards
            options={OPTIONS}
            selectedId="saving"
            onSelect={onSelect}
            canOffer={canOffer}
        />,
    )
    return { ...view, onSelect }
}

afterEach(cleanup)

describe('PayoutOptionCards — the automatic Premium offer', () => {
    it('opens on arrival for an account without Premium', () => {
        show(true)
        expect(screen.queryByTestId('payout-request-premium-dialog')).not.toBeNull()
    })

    /**
     * **Withheld while there is no withdraw method.** The screen is on its way to `setup-payouts`
     * (`hasNoMethod` → `router.replace`), and the *options* list resolves before the *configs* do — so
     * the sheet opened over a redirect, `z-50`, covering the screen the reader was being sent to.
     */
    it('stays shut when there is no withdraw method', () => {
        show(false)
        expect(screen.queryByTestId('payout-request-premium-dialog')).toBeNull()
    })

    /** The cards themselves still render — only the *automatic* offer is gated. */
    it('still draws both cards either way', () => {
        show(false)
        expect(screen.getAllByTestId('payout-request-option').length).toBe(2)
    })

    /** Default is to offer, so the gate has to be opted out of rather than into. */
    it('offers by default', () => {
        show(undefined)
        expect(screen.queryByTestId('payout-request-premium-dialog')).not.toBeNull()
    })
})

/**
 * **The `?` in the Fast card's corner opens *What is Premium?* and nothing else.**
 *
 * The claim worth pinning is not that a dialog appears — it is that only *one* does. The button sits
 * inside the `<label>` that is the whole card, so a label forwards the press to its radio as a
 * **default action**; without `PayoutHelpButton`'s `preventDefault` a single press on a locked Fast card
 * opens this explainer *and* fires `onChange`, which raises the Premium sell. Two dialogs, one press,
 * and the failure is invisible to anything that only asserts the explainer is there.
 *
 * `canOffer={false}` so the *automatic* offer is not already up — otherwise the sell being on screen
 * proves nothing about the press.
 */
describe('PayoutOptionCards — the Fast card help button', () => {
    it('opens the explainer without also selecting the option or raising the sell', () => {
        const { onSelect } = show(false)
        expect(screen.queryByTestId('payout-premium-help-panel')).toBeNull()

        fireEvent.click(screen.getByTestId('payout-premium-help'))

        expect(screen.queryByTestId('payout-premium-help-panel')).not.toBeNull()
        expect(screen.queryByTestId('payout-request-premium-dialog')).toBeNull()
        expect(onSelect).not.toHaveBeenCalled()
    })

    /** Only Fast carries it — legacy hangs none off Saving, whose card has nothing to explain. */
    it('draws exactly one, on Fast', () => {
        show(false)
        expect(screen.getAllByTestId('payout-premium-help').length).toBe(1)
    })
})
