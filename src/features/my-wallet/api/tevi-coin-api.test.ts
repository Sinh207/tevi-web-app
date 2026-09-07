import { describe, expect, it } from 'vitest'
import { normalizeTeviCoinBonuses } from './tevi-coin-api'

/**
 * Parsed against the **live payload** the product side supplied when it answered B83, trimmed to three
 * rows. Kept verbatim rather than tidied: the two traps in it (`amount` as a string, `created_at` as
 * epoch *seconds* while billy sends ms) are only visible in the real thing.
 *
 * Note the envelope is already off — `client.ts` unwraps `{ data }` for W_API, and `dapp-wallet` is a
 * path on W_API. So what a model sees is the inner object.
 */
const LIVE = {
    results: [
        {
            id: '019912f6-c6ee-7892-ae1b-26bdfdffd7f3',
            type: 'deposit',
            created_at: 1756959786.734602,
            amount: '10',
            currency: 'TEVI',
            status: 'success',
            network: null,
            sender_address: '0xf6d11fd5b2b4bc682744eace00165a1db1d62597e3bfc638e33b4a4247165cfd',
            sender_id: -7,
            recipient_address: '0x40fef6bc80655822040d7abff3f83297c8ec82ea5385264e8b23008c3d4637e6',
            recipient_id: null,
            pair_transaction_currency: null,
            pair_transaction_amount: null,
            billy_tx_id: '050f97bf-f6f8-4d0b-9478-5906a87ab496',
        },
        {
            id: '019912d9-7453-78f1-a044-b8d810a5edbd',
            type: 'deposit',
            created_at: 1756957865.04364,
            amount: '2',
            currency: 'TEVI',
            status: 'success',
            billy_tx_id: '40a747cd-c58a-4ceb-b554-91924c111f22',
        },
        {
            id: '01989b94-3d1c-7eb0-985d-45394c2b14cd',
            type: 'deposit',
            created_at: 1754956840.220704,
            amount: '2',
            currency: 'TEVI',
            status: 'success',
            billy_tx_id: '4c89bfe8-142f-4970-818b-1e3b55f20d1c',
        },
    ],
}

describe('normalizeTeviCoinBonuses', () => {
    it('reads the live payload', () => {
        const rows = normalizeTeviCoinBonuses(LIVE)
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({
            id: '019912f6-c6ee-7892-ae1b-26bdfdffd7f3',
            billyTxId: '050f97bf-f6f8-4d0b-9478-5906a87ab496',
            amount: 10,
            currency: 'TEVI',
            status: 'success',
        })
    })

    /** `"10"`, not `10` — every figure on this wire is a string. */
    it('parses the string amount to a number', () => {
        const [row] = normalizeTeviCoinBonuses(LIVE)
        expect(row.amount).toBe(10)
        expect(typeof row.amount).toBe('number')
    })

    /**
     * The trap worth a test of its own. `1756959786.734602` is epoch **seconds**; billy's `created_at`
     * on the rows this joins to is epoch **ms**. Read as ms it would be 1970-01-21, and nothing throws.
     *
     * September 2025 — the same movement billy dates, which is the whole point of the join.
     */
    it('converts epoch seconds to ms, the opposite unit from billy', () => {
        const [row] = normalizeTeviCoinBonuses(LIVE)
        expect(row.createdAt).toBe(1_756_959_786_735)
        expect(new Date(row.createdAt as number).getUTCFullYear()).toBe(2025)
    })

    /** Unjoinable, so it must not reach the map — it would file a figure under `undefined`. */
    it('drops a row with no billy_tx_id', () => {
        const rows = normalizeTeviCoinBonuses({
            results: [{ id: 'a', amount: '5' }, LIVE.results[1]],
        })
        expect(rows).toHaveLength(1)
        expect(rows[0].billyTxId).toBe('40a747cd-c58a-4ceb-b554-91924c111f22')
    })

    /**
     * An unreadable amount is `null`, never `0`: this figure is printed as `+N` beside a coin mark, and
     * `+0` is a claim that the bonus was nothing rather than that we could not read it.
     */
    it('reads an unusable amount as null rather than zero', () => {
        const [row] = normalizeTeviCoinBonuses({
            results: [{ billy_tx_id: 'b', amount: 'not a number' }],
        })
        expect(row.amount).toBeNull()
    })

    /** A missing `created_at` is `null`, not the epoch. */
    it('reads a missing timestamp as null', () => {
        const [row] = normalizeTeviCoinBonuses({ results: [{ billy_tx_id: 'c', amount: '1' }] })
        expect(row.createdAt).toBeNull()
    })

    it('survives a payload it does not recognise', () => {
        expect(normalizeTeviCoinBonuses(null)).toEqual([])
        expect(normalizeTeviCoinBonuses({})).toEqual([])
        expect(normalizeTeviCoinBonuses({ results: 'nope' })).toEqual([])
    })

    /** `looseObject` — the dApp team's payload grows on their schedule, and an addition is not an error. */
    it('keeps parsing when the payload gains a field', () => {
        const rows = normalizeTeviCoinBonuses({
            results: [{ ...LIVE.results[0], something_new: { nested: true } }],
        })
        expect(rows[0].amount).toBe(10)
    })
})
