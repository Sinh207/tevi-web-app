import { describe, expect, it } from 'vitest'
import type { Transfer, TransferParty } from '../api/types'
import { partyLines, pdfDate, pdfText, receiptRows } from './transfer-pdf'

/**
 * The *contents* of the receipt, which is the half worth pinning: what a document says is a product
 * decision, where the ink lands is not. Nothing here loads jsPDF — `saveTransferPdf` is the only function
 * that touches it, and it draws rather than decides.
 *
 * `pdfText` gets the most cases because it is the one function that can quietly corrupt a document: the
 * standard PDF fonts are Latin-1, so anything it lets through untranslated renders as a hole in a receipt
 * somebody may hand to support.
 */

function transfer(over: Partial<Transfer> = {}): Transfer {
    return {
        id: 'TR-1',
        stars: 250,
        fee: 0,
        description: '',
        createdAt: Date.UTC(2026, 7, 18, 9, 20),
        party: null,
        ...over,
    }
}

function party(over: Partial<TransferParty> = {}): TransferParty {
    return { id: '1002884', name: 'Ada', avatarUrl: null, ...over }
}

describe('pdfText', () => {
    it('keeps Latin-1 as it is', () => {
        expect(pdfText('Ada Lovelace')).toBe('Ada Lovelace')
        expect(pdfText('Ångström & Co')).toBe('Angstrom & Co')
    })

    it('transliterates Vietnamese rather than dropping it', () => {
        // The case that matters most for this product: a hole where a name should be is worse than
        // an accent-stripped name.
        expect(pdfText('Nguyễn Văn Được')).toBe('Nguyen Van Duoc')
    })

    it('substitutes the letters NFD cannot reach', () => {
        // `Đ` is a letter of its own, not an accented `D` — `NFD` leaves it whole and the Latin-1 filter
        // would drop it. This is the case the substitution table exists for.
        expect(pdfText('Đường')).toBe('Duong')
        expect(pdfText('Łukasz')).toBe('Lukasz')
    })

    it('keeps typographic punctuation readable in a message', () => {
        expect(pdfText('it’s a “gift” — thanks…')).toBe('it\'s a "gift" - thanks...')
    })

    it('drops what the standard font cannot draw at all', () => {
        expect(pdfText('김민준')).toBe('')
        expect(pdfText('محمد')).toBe('')
        expect(pdfText('Ada 김')).toBe('Ada')
    })

    it('answers an empty string for nothing at all, never "undefined"', () => {
        expect(pdfText(undefined)).toBe('')
        expect(pdfText(null)).toBe('')
        expect(pdfText('   ')).toBe('')
    })
})

describe('receiptRows', () => {
    it("prints legacy's five fields, in its order", () => {
        const rows = receiptRows(transfer({ description: 'thanks', fee: 5 }))
        expect(rows.map(row => row.label)).toEqual([
            'Transfer ID',
            'Transfer time',
            'Message',
            'Star transferred',
            'Transfer fee',
        ])
    })

    it('omits the message row when there is no message', () => {
        expect(receiptRows(transfer()).map(row => row.label)).not.toContain('Message')
    })

    it('formats the figures, and prints a real zero fee', () => {
        const rows = receiptRows(transfer({ stars: 12_000, fee: 0 }))
        expect(rows.find(row => row.label === 'Star transferred')?.value).toBe('12,000')
        expect(rows.find(row => row.label === 'Transfer fee')?.value).toBe('0')
    })

    it('never leaves a value blank', () => {
        // A blank value in a document reads as data loss rather than as an absent field.
        for (const row of receiptRows(transfer({ id: '' }))) expect(row.value).not.toBe('')
    })
})

describe('partyLines', () => {
    it('prints the ID and the name', () => {
        expect(partyLines(party())).toEqual([
            { label: 'Tevi ID', value: '1002884' },
            { label: 'Username', value: 'Ada' },
        ])
    })

    it('drops the name it cannot draw, and keeps the ID', () => {
        // The fallback the whole sanitiser depends on: an ID is digits and always renders.
        expect(partyLines(party({ name: '김민준' }))).toEqual([
            { label: 'Tevi ID', value: '1002884' },
        ])
    })

    it('falls back to the transfer id when the payload carried no party', () => {
        expect(partyLines(null, 'TR-9')).toEqual([{ label: 'Tevi ID', value: 'TR-9' }])
    })

    it('prints a dash rather than an empty field when there is neither', () => {
        expect(partyLines(null)).toEqual([{ label: 'Tevi ID', value: '-' }])
    })
})

describe('pdfDate', () => {
    it('prints a date the standard font can draw', () => {
        const printed = pdfDate(Date.UTC(2026, 7, 18, 9, 20))
        expect(printed).toMatch(/2026/)
        // Latin-1 only — the whole point of not using the reader's locale here.
        expect(printed).toMatch(/^[ -ÿ]+$/)
    })
})
