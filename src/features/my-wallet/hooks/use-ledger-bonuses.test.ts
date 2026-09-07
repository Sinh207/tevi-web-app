import { describe, expect, it } from 'vitest'
import type { TeviCoinBonus } from '../api/tevi-coin-api'
import { isDisplayableBonus } from './use-ledger-bonuses'

/**
 * The rule for **when a Tevi Coin bonus is shown at all** — B83's second answer, given by the product
 * side on 2026-08-28: *status `success` and amount > 0; anything else, do not show it.*
 *
 * Pinned rather than left to the comment, because two of the three cases below shipped **wrong** and
 * neither threw:
 *
 * - a non-`success` row printed its figure anyway, which on a pending bonus tells a creator they have
 *   Star they do not have yet;
 * - `amount: "0"` parses fine and is not `null`, so it reached the row and rendered `+0` — a bonus line
 *   claiming the reward was nothing.
 *
 * Tested as a pure function rather than through the hook: the query, the key and the placeholder are
 * TanStack's behaviour, and what is worth stating here is the *decision*. It is the same function both
 * surfaces go through (`use-wallet-ledger.ts` builds the row, `use-wallet-entry-detail.ts` the sheet),
 * so this is also what stops the two drifting into different opinions.
 */
const bonus = (over: Partial<TeviCoinBonus> = {}): TeviCoinBonus => ({
    id: 'dapp-1',
    billyTxId: 'tx-1',
    amount: 10,
    currency: 'TEVI',
    createdAt: 1_756_959_786_735,
    status: 'success',
    ...over,
})

describe('isDisplayableBonus', () => {
    it('shows a successful, positive bonus', () => {
        expect(isDisplayableBonus(bonus())).toBe(true)
    })

    /** Fractional figures are real — the live payload's siblings carry `"2"`, and `8.5` appears on rows. */
    it('shows a fractional amount', () => {
        expect(isDisplayableBonus(bonus({ amount: 0.5 }))).toBe(true)
    })

    /**
     * The case the gate exists for. A `pending` bonus is a promise, not a balance, and printing it
     * says the reward has landed.
     */
    it('withholds anything that is not success', () => {
        for (const status of ['pending', 'failed', 'processing', 'PENDING', '']) {
            expect(isDisplayableBonus(bonus({ status }))).toBe(false)
        }
    })

    /**
     * `"0"` is not `null`, so it survived the earlier check and rendered `+0`. A zero bonus is the
     * *absence* of a bonus, and the absence of a line is how to say that.
     */
    it('withholds a zero amount rather than printing +0', () => {
        expect(isDisplayableBonus(bonus({ amount: 0 }))).toBe(false)
    })

    /** Not a reward, so it does not belong under a "Bonus" label whatever it is. */
    it('withholds a negative amount', () => {
        expect(isDisplayableBonus(bonus({ amount: -5 }))).toBe(false)
    })

    /**
     * A figure the payload carried but the parser could not read. It would have to print as `+—`: a
     * reward exists and we cannot say how much, which is worse on a money screen than silence.
     */
    it('withholds an unreadable amount', () => {
        expect(isDisplayableBonus(bonus({ amount: null }))).toBe(false)
    })

    /**
     * Both conditions, not either. A pending row with a real figure and a successful row with a zero
     * are each withheld on their own; this states that neither half carries the other.
     */
    it('requires both conditions', () => {
        expect(isDisplayableBonus(bonus({ status: 'pending', amount: 10 }))).toBe(false)
        expect(isDisplayableBonus(bonus({ status: 'success', amount: 0 }))).toBe(false)
    })
})
