import { describe, expect, it } from 'vitest'
import { toIdentityState, toSubmissions } from './identity-state'

describe('toIdentityState', () => {
    it('is unverified with nothing to go on', () => {
        expect(toIdentityState(undefined)).toBe('unverified')
        expect(toIdentityState(null)).toBe('unverified')
        expect(toIdentityState([])).toBe('unverified')
    })

    it('is verified on an approved LEVEL_2 submission', () => {
        expect(toIdentityState([{ level: 'LEVEL_2', status: 'APPROVED' }])).toBe('verified')
    })

    it('ignores case and stray whitespace on both fields', () => {
        expect(toIdentityState([{ level: ' level_2 ', status: 'approved' }])).toBe('verified')
    })

    // The whole point of keying on the level: LEVEL_1 is a lighter check that does not
    // unlock withdrawals, so an approved one must not read as a verified identity.
    it('does not count an approved LEVEL_1', () => {
        expect(toIdentityState([{ level: 'LEVEL_1', status: 'APPROVED' }])).toBe('unverified')
    })

    it('is pending while Sumsub still has the submission', () => {
        expect(toIdentityState([{ level: 'LEVEL_2', status: 'PENDING' }])).toBe('pending')
        expect(toIdentityState([{ level: 'LEVEL_2', status: 'on_hold' }])).toBe('pending')
    })

    // Approval wins: starting a second submission does not un-verify an account.
    it('prefers an approval over a later pending submission', () => {
        expect(
            toIdentityState([
                { level: 'LEVEL_2', status: 'APPROVED' },
                { level: 'LEVEL_2', status: 'PENDING' },
            ]),
        ).toBe('verified')
    })

    // A status we do not recognise is far more likely to be a terminal failure spelled
    // unfamiliarly than a new kind of waiting — so it shows the intro, which offers a way
    // forward, rather than stranding the person on "waiting for approval".
    it('falls through to unverified on a rejected or unknown status', () => {
        expect(toIdentityState([{ level: 'LEVEL_2', status: 'REJECTED' }])).toBe('unverified')
        expect(toIdentityState([{ level: 'LEVEL_2', status: 'WHAT_IS_THIS' }])).toBe('unverified')
        expect(toIdentityState([{ level: 'LEVEL_2', status: null }])).toBe('unverified')
    })
})

describe('toSubmissions', () => {
    it('reads the paginated rows', () => {
        expect(toSubmissions({ results: [{ level: 'LEVEL_2' }] })).toHaveLength(1)
    })

    it('treats a missing or malformed body as no submissions', () => {
        expect(toSubmissions(undefined)).toEqual([])
        expect(toSubmissions({})).toEqual([])
        expect(toSubmissions({ results: null })).toEqual([])
    })
})
