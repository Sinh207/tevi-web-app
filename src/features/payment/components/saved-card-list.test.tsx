// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SavedCard } from '../api/types'
import { SavedCardList } from './saved-card-list'

/**
 * One claim: **the screen admits when its own Default badge is not what checkout will charge.**
 *
 * This list highlights `pickDefaultCard` (the account's record) and `pay-with-card-panel.tsx` opens on
 * `pickPayableCard` (which skips an expired default). Both are deliberate and they disagree, so the
 * warning is the only thing keeping the screen honest — and it is invisible, in the sense that
 * nothing breaks if it silently stops rendering. Hence a test rather than a comment.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) =>
            vars && 'card' in vars ? `${key}:${vars.card}` : key,
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
            last4: id,
            exp_month: month,
            exp_year: year,
            funding: 'credit',
        },
    }) as SavedCard

function renderList(cards: SavedCard[]) {
    vi.setSystemTime(NOW)
    render(
        <SavedCardList
            cards={cards}
            pendingId={null}
            isMutating={false}
            isFull={false}
            onAdd={vi.fn()}
            onSetDefault={vi.fn()}
            onDelete={vi.fn()}
        />,
    )
}

describe('SavedCardList — the expired default', () => {
    it('says nothing when the default card is still payable', () => {
        renderList([card('4242', 5, 2030, true), card('1881', 5, 2024)])
        expect(screen.queryByTestId('payment-default-expired')).toBeNull()
    })

    it('names the card checkout will actually use', () => {
        renderList([card('4242', 5, 2024, true), card('1881', 11, 2030)])
        expect(screen.getByTestId('payment-default-expired')).toBeTruthy()
        expect(screen.getByText('payment_default_expired_fallback:Visa ···· 1881')).toBeTruthy()
    })

    /* A different sentence, because there is nothing to fall back to. */
    it('says so when every saved card is dead', () => {
        renderList([card('4242', 5, 2024, true), card('1881', 1, 2023)])
        expect(screen.getByText('payment_default_expired_none')).toBeTruthy()
    })
})
