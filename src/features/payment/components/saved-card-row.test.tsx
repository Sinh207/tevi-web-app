// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SavedCard } from '../api/types'
import { SavedCardRow } from './saved-card-row'

/**
 * The trailing slot's three states, and only those. Everything else on this row is markup a test can
 * only restate.
 *
 * The one worth pinning is the third: an **expired** card offers no "Set as default". It is a rule
 * two files apart have to agree on — `pickPayableCard` refuses to pre-select such a card at checkout,
 * so a row that still let it be promoted would demote the card that works and change nothing the
 * reader can see until the next charge. A rendered tree is the only place that agreement is visible.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) =>
            vars?.date ? `${key}:${vars.date}` : key,
        currentLanguage: 'en',
    }),
}))

/** Fixed, so "expired" does not depend on when the suite runs. */
const NOW = new Date('2026-08-22T12:00:00Z')

const card = (id: string, month: number, year: number, isDefault = false): SavedCard =>
    ({
        id,
        default: isDefault,
        type: 'card',
        card: {
            brand: 'visa',
            last4: '4242',
            exp_month: month,
            exp_year: year,
            funding: 'credit',
        },
    }) as SavedCard

function renderRow(subject: SavedCard) {
    const onSetDefault = vi.fn()
    const onReplace = vi.fn()
    render(
        <ul>
            <SavedCardRow
                card={subject}
                pending={false}
                busy={false}
                now={NOW}
                onSetDefault={onSetDefault}
                onReplace={onReplace}
                onDelete={vi.fn()}
            />
        </ul>,
    )
    return { onSetDefault, onReplace }
}

describe('SavedCardRow', () => {
    /*
     * Delete used to sit behind a kebab. Pinning that it is reachable *without* opening anything is
     * the assertion that would fail if someone put the menu back — the four below would all still
     * pass, because a menu's items render on open and `queryByTestId` would simply keep finding
     * nothing either way.
     */
    it('puts delete on the row itself, not behind a menu', () => {
        renderRow(card('a', 5, 2030))
        const remove = screen.getByTestId('payment-card-delete')
        expect(remove.tagName).toBe('BUTTON')
        expect(remove.getAttribute('aria-label')).toBe('payment_card_delete_named')
    })

    it('offers "set as default" on a live card that is not the default', () => {
        renderRow(card('a', 5, 2030))
        expect(screen.getByTestId('payment-card-set-default')).toBeTruthy()
    })

    it('shows the badge instead of the button on the default card', () => {
        renderRow(card('a', 5, 2030, true))
        expect(screen.queryByTestId('payment-card-set-default')).toBeNull()
        expect(screen.getByText('payment_card_default_badge')).toBeTruthy()
    })

    it('offers Replace instead of "set as default" on an expired card', () => {
        const { onReplace } = renderRow(card('a', 5, 2024))
        expect(screen.queryByTestId('payment-card-set-default')).toBeNull()
        expect(screen.getByText('payment_card_expired_on:05/2024')).toBeTruthy()

        fireEvent.click(screen.getByTestId('payment-card-replace'))
        expect(onReplace).toHaveBeenCalledTimes(1)
    })

    /*
     * The brand came off `savedCardTitle` and was rendered by nothing — reachable only as the
     * fallback for a payload with no `last4`, which is the one row in ten that would have shown it.
     */
    it('titles the row with the brand and the digits together', () => {
        renderRow(card('a', 5, 2030))
        expect(screen.getByText('Visa ···· 4242')).toBeTruthy()
    })

    /*
     * A card can expire while it *is* the default, and the badge stays: it states what the account
     * records, which is exactly the thing the reader came here to fix. Hiding it would leave the row
     * looking like every other one.
     */
    it('keeps the badge on an expired default card', () => {
        renderRow(card('a', 5, 2024, true))
        expect(screen.getByText('payment_card_default_badge')).toBeTruthy()
        expect(screen.queryByTestId('payment-card-set-default')).toBeNull()
    })
})
