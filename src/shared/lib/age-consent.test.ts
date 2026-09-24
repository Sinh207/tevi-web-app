// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAgeConsent, grantAgeConsent, hasAgeConsent } from './age-consent'
import { STORAGE_KEYS } from './storage'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('age consent', () => {
    it('remembers one event for one account', () => {
        grantAgeConsent('evt-1', 'acct-1')

        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(true)
        /*
         * **Per event, and this is the whole reason it is not keyed by space.** A creator can host
         * an 18+ stream on Friday and a family one on Saturday, so an answer about one broadcast
         * must not carry to the next.
         */
        expect(hasAgeConsent('evt-2', 'acct-1')).toBe(false)
    })

    /**
     * Per account, because this app holds up to ten at once and an age confirmation is a person's
     * answer, not a device's. Legacy writes one unregistered key per account and a literal
     * `undefined_…` key for a guest, which is a bucket every visitor on the device inherits.
     */
    it('does not leak between accounts', () => {
        grantAgeConsent('evt-1', 'acct-1')
        expect(hasAgeConsent('evt-1', 'acct-2')).toBe(false)
    })

    it('is idempotent — confirming twice just refreshes the timestamp', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        grantAgeConsent('evt-1', 'acct-1')
        vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
        grantAgeConsent('evt-1', 'acct-1')
        // 89 days after the *second* grant, which is 148 days after the first.
        vi.setSystemTime(new Date('2026-03-01T00:00:00Z').getTime() + 89 * DAY)
        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(true)
    })

    /**
     * The TTL is a product call, not only hygiene: an answer given once should not still stand a
     * year later on a browser that may have changed hands.
     */
    it('expires after ninety days', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        grantAgeConsent('evt-1', 'acct-1')

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 89 * DAY)
        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(true)

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 91 * DAY)
        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(false)
    })

    /** Pruned on **write**, so reading stays a parse and nothing runs on a timer. */
    it('drops expired entries the next time the account writes', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        grantAgeConsent('old', 'acct-1')

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 91 * DAY)
        grantAgeConsent('new', 'acct-1')

        const record = JSON.parse(localStorage.getItem(STORAGE_KEYS.ageConfirmed) ?? '{}')
        expect(Object.keys(record['acct-1'])).toEqual(['new'])
    })

    /**
     * `forgetAccount`'s call. Signing out on a shared device must not leave one person's answer
     * about their age standing for the next — which is the whole reason this module is in `shared/`
     * rather than in `features/event`.
     */
    it('forgets one account without touching another', () => {
        grantAgeConsent('evt-1', 'acct-1')
        grantAgeConsent('evt-1', 'acct-2')

        clearAgeConsent('acct-1')

        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(false)
        expect(hasAgeConsent('evt-1', 'acct-2')).toBe(true)
    })

    it('is a no-op for an account that never confirmed anything', () => {
        expect(() => clearAgeConsent('nobody')).not.toThrow()
    })

    /**
     * `accountId` is required and not nullable: an answer filed under a placeholder could never be
     * read back. `useAgeGate` holds a guest's answer in state instead.
     */
    it('refuses to write or read without both an event and an account', () => {
        grantAgeConsent('evt-1', '')
        expect(localStorage.getItem(STORAGE_KEYS.ageConfirmed)).toBeNull()
        expect(hasAgeConsent('evt-1', '')).toBe(false)
        expect(hasAgeConsent('', 'acct-1')).toBe(false)
    })

    /** Corrupt or foreign JSON degrades to "nothing confirmed" rather than throwing. */
    it('survives a garbage store', () => {
        for (const value of ['not json', '[]', '"a string"', '{"acct-1":"nope"}', 'null']) {
            localStorage.setItem(STORAGE_KEYS.ageConfirmed, value)
            expect(hasAgeConsent('evt-1', 'acct-1'), value).toBe(false)
        }
        // And a write over the garbage still lands.
        grantAgeConsent('evt-1', 'acct-1')
        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(true)
    })

    it('ignores a non-numeric timestamp rather than treating it as fresh', () => {
        localStorage.setItem(
            STORAGE_KEYS.ageConfirmed,
            JSON.stringify({ 'acct-1': { 'evt-1': 'yesterday' } }),
        )
        expect(hasAgeConsent('evt-1', 'acct-1')).toBe(false)
    })
})
