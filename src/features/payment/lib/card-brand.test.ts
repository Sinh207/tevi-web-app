import { describe, expect, it } from 'vitest'
import type { SavedCard } from '../api/types'
import {
    cardBrandName,
    cardExpiry,
    composeCardName,
    isCardExpired,
    isCardPayable,
    maskedCardNumber,
    pickPayableCard,
    savedCardTitle,
} from './card-brand'

function card(
    overrides: Partial<SavedCard['card']> | null,
    type: string | null = 'card',
): SavedCard {
    return {
        id: 'pm_1',
        default: false,
        type,
        card: overrides
            ? { brand: null, last4: null, exp_month: 0, exp_year: 0, funding: null, ...overrides }
            : null,
    } as SavedCard
}

describe('cardBrandName', () => {
    it('names the brands there is copy for', () => {
        expect(cardBrandName('visa')).toBe('Visa')
        expect(cardBrandName('amex')).toBe('American Express')
        expect(cardBrandName('MasterCard')).toBe('Mastercard')
    })

    it('prettifies a brand that ships after this client', () => {
        expect(cardBrandName('cartes_bancaires')).toBe('Cartes Bancaires')
    })

    it('is null when there is no brand to print', () => {
        expect(cardBrandName(null)).toBeNull()
        expect(cardBrandName('   ')).toBeNull()
    })
})

describe('composeCardName', () => {
    it("is one group of dots, not the row mask's four", () => {
        expect(composeCardName('Visa', '4242')).toBe('Visa ···· 4242')
    })

    /* A wallet has no digits at all; `Visa ···· ` would name nothing. */
    it('falls back to the bare label when there are no digits', () => {
        expect(composeCardName('Apple Pay', null)).toBe('Apple Pay')
        expect(composeCardName('Visa', undefined)).toBe('Visa')
    })
})

describe('maskedCardNumber', () => {
    it('masks in four groups, and answers null rather than a mask with nothing behind it', () => {
        // Four groups is what makes it read as a card number rather than as a fragment — legacy's
        // `**** **** **** 4242`, with a dot that a screen reader pronounces sensibly.
        expect(maskedCardNumber('4242')).toBe('···· ···· ···· 4242')
        expect(maskedCardNumber(null)).toBeNull()
    })
})

describe('cardExpiry', () => {
    it('pads the month', () => {
        expect(cardExpiry(5, 2027)).toBe('05/2027')
        expect(cardExpiry(12, 2027)).toBe('12/2027')
    })

    it('never prints half a date', () => {
        expect(cardExpiry(5, null)).toBeNull()
        expect(cardExpiry(0, 2027)).toBeNull()
        expect(cardExpiry(13, 2027)).toBeNull()
    })
})

describe('isCardExpired', () => {
    it('a card is valid all through its expiry month', () => {
        expect(isCardExpired(12, 2026, new Date('2026-12-31T23:59:59Z'))).toBe(false)
        expect(isCardExpired(12, 2026, new Date('2027-01-01T00:00:00Z'))).toBe(true)
    })

    it('says nothing about a card with no expiry', () => {
        expect(isCardExpired(null, 2026, new Date('2030-01-01Z'))).toBe(false)
    })
})

describe('savedCardTitle', () => {
    it('prefers the brand', () => {
        expect(savedCardTitle(card({ brand: 'visa' }))).toEqual({ text: 'Visa' })
    })

    it('falls back to the method type for a wallet with no card block', () => {
        expect(savedCardTitle(card(null, 'link'))).toEqual({ text: 'Link' })
    })

    it('answers a key only when nothing came off the wire', () => {
        expect(savedCardTitle(card(null, null))).toEqual({ key: 'payment_card_unknown' })
    })
})

describe('isCardPayable / pickPayableCard', () => {
    const NOW = new Date('2026-08-22T00:00:00Z')
    const card = (id: string, month: number, year: number, isDefault = false): SavedCard =>
        ({
            id,
            default: isDefault,
            type: 'card',
            card: { brand: 'visa', last4: id, exp_month: month, exp_year: year, funding: 'credit' },
        }) as SavedCard

    it('refuses a card past its expiry — paying with one is a guaranteed decline', () => {
        expect(isCardPayable(card('1', 1, 2024), NOW)).toBe(false)
        expect(isCardPayable(card('2', 8, 2026), NOW)).toBe(true) // valid all through its month
        expect(isCardPayable(card('3', 12, 2030), NOW)).toBe(true)
    })

    it('treats a method with no expiry as payable — unknown is not dead', () => {
        expect(
            isCardPayable({ id: 'w', default: false, type: 'link', card: null } as SavedCard, NOW),
        ).toBe(true)
    })

    it('never starts a checkout on an expired card, even when it is the default', () => {
        /*
         * The bug this pins: the panel seeded on `default ?? first`, so an account whose default card
         * had expired opened the checkout pre-selected on a card that could only decline.
         */
        const cards = [card('expired', 1, 2024, true), card('good', 9, 2027)]
        expect(pickPayableCard(cards, NOW)?.id).toBe('good')
    })

    it('prefers the default when the default is usable', () => {
        const cards = [card('other', 9, 2027), card('default', 10, 2027, true)]
        expect(pickPayableCard(cards, NOW)?.id).toBe('default')
    })

    it('answers null when nothing saved can be paid with — the panel opens on a new method', () => {
        expect(pickPayableCard([card('a', 1, 2024), card('b', 2, 2025)], NOW)).toBeNull()
        expect(pickPayableCard([], NOW)).toBeNull()
    })
})
