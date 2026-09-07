import { describe, expect, it } from 'vitest'
import { normalizeParty, normalizeTemplateRows, normalizeTransfers } from './types'

describe('normalizeParty', () => {
    it('reads the legacy field names, avatar object included', () => {
        expect(
            normalizeParty({
                id: 1001,
                display_name: '  Ada  ',
                avatar: { thumb: 'https://cdn/a.png' },
            }),
        ).toEqual({ id: '1001', name: 'Ada', avatarUrl: 'https://cdn/a.png' })
    })

    it('accepts a flattened avatar string, so a future backend blanks no faces', () => {
        expect(normalizeParty({ id: '7', avatar: 'https://cdn/a.png' })?.avatarUrl).toBe(
            'https://cdn/a.png',
        )
    })

    it('answers null when there is no id, because the id is the whole point of the lookup', () => {
        expect(normalizeParty({ display_name: 'Ada' })).toBeNull()
        expect(normalizeParty(null)).toBeNull()
    })

    it('keeps a nameless account — the ID is what was typed and is enough to address', () => {
        expect(normalizeParty({ id: 9 })).toEqual({ id: '9', name: '', avatarUrl: null })
    })
})

describe('normalizeTransfers', () => {
    const wire = {
        id: 55,
        amount: '-250',
        fee: '0.00',
        description: ' thanks ',
        created_at: '2026-08-19T10:00:00Z',
        user: { id: 1001, display_name: 'Ada' },
    }

    it('unwraps a paginated page and a bare array alike', () => {
        expect(normalizeTransfers({ results: [wire] })).toHaveLength(1)
        expect(normalizeTransfers([wire])).toHaveLength(1)
        expect(normalizeTransfers({ nothing: true })).toEqual([])
    })

    it('strips the sign, so no view has to remember to', () => {
        expect(normalizeTransfers([wire])[0].stars).toBe(250)
    })

    it('reads a numeric string fee as a number', () => {
        expect(normalizeTransfers([wire])[0].fee).toBe(0)
        expect(normalizeTransfers([{ ...wire, fee: '12' }])[0].fee).toBe(12)
    })

    it('promotes a seconds timestamp, so a receipt is not dated 1970', () => {
        const seconds = normalizeTransfers([{ ...wire, created_at: 1_755_600_000 }])[0]
        const millis = normalizeTransfers([{ ...wire, created_at: 1_755_600_000_000 }])[0]
        expect(seconds.createdAt).toBe(millis.createdAt)
    })

    it('drops a row with no readable timestamp', () => {
        // It cannot be dated, grouped, or asked about — see the note on `Transfer.createdAt`.
        expect(normalizeTransfers([{ ...wire, created_at: null }])).toEqual([])
    })

    it('keeps a row whose user is missing rather than losing the movement', () => {
        const parsed = normalizeTransfers([{ ...wire, user: null }])
        expect(parsed).toHaveLength(1)
        expect(parsed[0].party).toBeNull()
    })
})

describe('normalizeTemplateRows', () => {
    it('reads `errors` as an object keyed by field, which is how the backend sends it', () => {
        const rows = normalizeTemplateRows([
            { user: { id: 1 }, amount: 100, errors: {} },
            { user: { id: 2 }, amount: 0, errors: { amount: 'too low' } },
        ])
        expect(rows[0].errorFields).toEqual([])
        expect(rows[1].errorFields).toEqual(['amount'])
    })

    it('keeps every line, valid or not — the count of bad ones is what the review warns about', () => {
        expect(
            normalizeTemplateRows([{ user: null, amount: 0, errors: { user: 'x' } }]),
        ).toHaveLength(1)
    })

    it('treats an absent `errors` as no errors rather than dropping the line', () => {
        expect(normalizeTemplateRows([{ user: { id: 1 }, amount: 5 }])[0].errorFields).toEqual([])
    })

    it('reads a list-shaped `errors` as errors — the fail-open this used to assert', () => {
        /*
         * The old expectation here was `[]`, which pinned a fail-open on a money path: a row the
         * backend had rejected was planned, counted and posted. Legacy's `Object.keys` rejects an
         * array, so `[]` was also a behaviour change.
         */
        const [row] = normalizeTemplateRows([
            { user: { id: 1 }, amount: 5, errors: ['Receiver is blocked'] },
        ])
        expect(row.errorFields).toHaveLength(1)
    })

    it('keeps a rejected line that carries no `user` at all, so the warning can count it', () => {
        /*
         * zod 4 requires a bare `z.unknown()` key to be *present*, so this row used to fail the parse
         * and be dropped — uncounted, which turned "3 of your lines were unusable" into silence.
         */
        const rows = normalizeTemplateRows([{ amount: 500, errors: { user: 'not found' } }])
        expect(rows).toHaveLength(1)
        expect(rows[0].party).toBeNull()
        expect(rows[0].errorFields).toEqual(['user'])
    })
})
