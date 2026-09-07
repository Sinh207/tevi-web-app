import { describe, expect, it } from 'vitest'
import type { TemplateRow, Transfer, TransferParty } from '../api/types'
import {
    amountProblem,
    fileProblem,
    MAX_TEMPLATE_BYTES,
    parseStars,
    planTransfers,
    readTeviId,
    withKnownParties,
    withoutReceiver,
} from './transfer-rules'

function party(id: string): TransferParty {
    return { id, name: `user ${id}`, avatarUrl: null }
}

function row(over: Partial<TemplateRow> = {}): TemplateRow {
    return { party: party('1001'), amount: 100, errorFields: [], ...over }
}

/** A `File` without a filesystem — `size` is derived from the blob parts. */
function csv(name: string, { size = 10, type = 'text/csv' } = {}): File {
    return new File(['x'.repeat(size)], name, { type })
}

describe('parseStars', () => {
    it('reads a whole number', () => {
        expect(parseStars('250')).toBe(250)
        expect(parseStars('  250  ')).toBe(250)
    })

    it('rejects a decimal rather than rounding it', () => {
        // Rounding would change what leaves the balance — up, half the time.
        expect(parseStars('3.5')).toBeNull()
        expect(parseStars('3.0')).toBeNull()
    })

    it('rejects every state a number field passes through while it is typed into', () => {
        for (const value of ['', ' ', '-', '.', '+5', '1e3', 'abc', '0', '-5', 'Infinity']) {
            expect(parseStars(value)).toBeNull()
        }
    })

    it('rejects a figure too large to be an exact integer', () => {
        expect(parseStars('9007199254740993')).toBeNull()
    })
})

describe('amountProblem', () => {
    it('says nothing about an empty field', () => {
        expect(amountProblem('', 500)).toBeNull()
    })

    it('flags an unusable figure', () => {
        expect(amountProblem('3.5', 500)).toBe('invalid')
    })

    it('flags more than the balance', () => {
        expect(amountProblem('501', 500)).toBe('insufficient')
        expect(amountProblem('500', 500)).toBeNull()
    })

    it('does not accuse a reader whose balance is not known yet', () => {
        // `null` is "we have not been told", which is not "you cannot afford it".
        expect(amountProblem('9999', null)).toBeNull()
    })
})

describe('fileProblem', () => {
    it('accepts a CSV by extension even when the OS reports an Excel MIME type', () => {
        // `.csv` is `application/vnd.ms-excel` on a Windows machine with Excel installed.
        expect(fileProblem(csv('list.csv', { type: 'application/vnd.ms-excel' }))).toBeNull()
    })

    it('accepts a CSV by MIME type even when the name has no extension', () => {
        expect(fileProblem(csv('list', { type: 'text/csv' }))).toBeNull()
    })

    it('refuses anything that is neither', () => {
        expect(fileProblem(csv('list.pdf', { type: 'application/pdf' }))).toBe('wrong-type')
    })

    it('refuses a file over the limit before it is uploaded', () => {
        expect(fileProblem(csv('list.csv', { size: MAX_TEMPLATE_BYTES + 1 }))).toBe('too-large')
    })

    it('checks the size before the type, so the bigger problem is the one reported', () => {
        expect(fileProblem(csv('list.pdf', { size: MAX_TEMPLATE_BYTES + 1 }))).toBe('too-large')
    })
})

describe('planTransfers', () => {
    it('counts a fractional amount as invalid — the screen and the body must agree', () => {
        /*
         * `formatStarAmount` rounds, so `100.5` displayed as "101" while the POST carried `100.5`.
         * Same rule `parseStars` applies to the single-transfer field.
         */
        const plan = planTransfers(
            [row({ party: party('1'), amount: 100.5 }), row({ party: party('2'), amount: 100 })],
            null,
        )
        expect(plan.receivers).toHaveLength(1)
        expect(plan.invalid).toBe(1)
        expect(plan.total).toBe(100)
    })

    it('sums two lines naming the same receiver instead of sending both', () => {
        const plan = planTransfers([row({ amount: 100 }), row({ amount: 250 })], null)
        expect(plan.receivers).toHaveLength(1)
        expect(plan.receivers[0].stars).toBe(350)
        expect(plan.total).toBe(350)
    })

    it('keeps the file order, first appearance winning', () => {
        const plan = planTransfers(
            [
                row({ party: party('b') }),
                row({ party: party('a') }),
                row({ party: party('b'), amount: 1 }),
            ],
            null,
        )
        expect(plan.receivers.map(r => r.party.id)).toEqual(['b', 'a'])
    })

    it('drops and counts the lines the backend rejected', () => {
        const plan = planTransfers([row(), row({ errorFields: ['amount'] })], null)
        expect(plan.receivers).toHaveLength(1)
        expect(plan.invalid).toBe(1)
        expect(plan.total).toBe(100)
    })

    it('drops the reader themself', () => {
        const plan = planTransfers([row({ party: party('me') }), row()], 'me')
        expect(plan.receivers.map(r => r.party.id)).toEqual(['1001'])
        expect(plan.invalid).toBe(1)
    })

    it('drops a line with no receiver, and a line with no usable amount', () => {
        const plan = planTransfers(
            [row({ party: null }), row({ amount: 0 }), row({ amount: -50 })],
            null,
        )
        expect(plan.receivers).toHaveLength(0)
        expect(plan.invalid).toBe(3)
        expect(plan.total).toBe(0)
    })

    it('answers an empty plan for an empty file rather than throwing', () => {
        expect(planTransfers([], null)).toEqual({ receivers: [], invalid: 0, total: 0 })
    })
})

describe('withoutReceiver', () => {
    it('recomputes the total, so the review screen cannot show a stale figure', () => {
        const plan = planTransfers([row({ party: party('a') }), row({ party: party('b') })], null)
        const trimmed = withoutReceiver(plan, 'a')
        expect(trimmed.receivers.map(r => r.party.id)).toEqual(['b'])
        expect(trimmed.total).toBe(100)
    })

    it('keeps the invalid count — removing a receiver does not fix the file', () => {
        const plan = planTransfers([row(), row({ errorFields: ['user'] })], null)
        expect(withoutReceiver(plan, '1001').invalid).toBe(1)
    })
})

describe('readTeviId', () => {
    it('prefers the profile id over the account id', () => {
        expect(readTeviId(1001, 'acc-1')).toBe('1001')
        expect(readTeviId('1001', 'acc-1')).toBe('1001')
    })

    it('falls back to the account id, which is the user id on every ordinary sign-in', () => {
        expect(readTeviId(undefined, '1001')).toBe('1001')
    })

    it('answers null rather than guessing, so nothing is dropped from a bulk list by mistake', () => {
        expect(readTeviId(undefined, null)).toBeNull()
        expect(readTeviId({}, '  ')).toBeNull()
    })
})

describe('withKnownParties', () => {
    function record(over: Partial<Transfer> = {}): Transfer {
        return {
            id: 'TR-1',
            stars: 100,
            fee: 0,
            description: '',
            createdAt: 1,
            party: null,
            ...over,
        }
    }

    /*
     * The bug: `POST transfer-star/` does not echo `user`, so the receipt — the one screen that names
     * who was paid, and the one somebody keeps — showed a transfer ID where the Tevi ID goes and a
     * dash for the name.
     */
    it('fills a receiver the response did not carry', () => {
        const [merged] = withKnownParties([record()], [party('1002884')])
        expect(merged.party).toEqual(party('1002884'))
    })

    it('leaves the server’s own receiver alone', () => {
        const server = party('999')
        const [merged] = withKnownParties([record({ party: server })], [party('1002884')])
        // The payload is the authority wherever it speaks; this only fills silence.
        expect(merged.party).toBe(server)
    })

    it('refuses to align lists of different lengths', () => {
        /*
         * `normalizeTransfers` drops a record with no timestamp, so a three-row batch can come back
         * as two — and a positional merge would then print the second receiver's name against the
         * third receiver's amount. Naming the wrong person on a receipt is worse than naming nobody.
         */
        const rows = [record({ id: 'a' }), record({ id: 'b' })]
        const merged = withKnownParties(rows, [party('1'), party('2'), party('3')])
        expect(merged).toBe(rows)
        expect(merged.every(r => r.party === null)).toBe(true)
    })

    it('keeps a record it did not change, rather than copying it', () => {
        // So a receipt that needed no filling does not re-render on a new object identity.
        const row = record({ party: party('7') })
        expect(withKnownParties([row], [party('7')])[0]).toBe(row)
    })
})
