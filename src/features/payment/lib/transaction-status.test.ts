import { describe, expect, it } from 'vitest'
import { transactionStatus, transactionStatusKey } from './transaction-status'

/**
 * The one rule worth pinning: **what an unrecognised status becomes.** Everything else in this file
 * is a lookup table, and a table that is wrong is wrong visibly.
 */
describe('transactionStatus', () => {
    it('reads the vocabulary it knows', () => {
        expect(transactionStatus('succeeded')).toBe('settled')
        expect(transactionStatus('PENDING')).toBe('pending')
        expect(transactionStatus('  Failed ')).toBe('failed')
    })

    it('fails an unknown status to pending — never to settled, and never to failed', () => {
        /*
         * Both of the other guesses are worse when wrong: `settled` tells somebody their money
         * arrived when it may not have, `failed` tells them a charge was refused when it may have
         * gone through. B87 is the question that removes the guess.
         */
        expect(transactionStatus('PROCESSING_3DS')).toBe('pending')
        expect(transactionStatus('')).toBe('pending')
        expect(transactionStatus(null)).toBe('pending')
        expect(transactionStatus(undefined)).toBe('pending')
    })

    it('hands out literal keys, so the i18n guard can see them', () => {
        expect(transactionStatusKey('settled')).toBe('payment_txn_status_settled')
        expect(transactionStatusKey('pending')).toBe('payment_txn_status_pending')
        expect(transactionStatusKey('failed')).toBe('payment_txn_status_failed')
    })
})
