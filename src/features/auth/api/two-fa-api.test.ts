import { describe, expect, it } from 'vitest'
import { passcodeRecordOf, recoveryEmailOf } from './two-fa-api'

/**
 * The address `POST recover/` answers with, which the recovery step prints so the reader knows **which
 * inbox to open**. Nothing is authorised or addressed on it — it is display only — but a *wrong* one is
 * worse than the generic sentence it replaces, which is what these cases are about.
 *
 * The field is in no schema, so the spelling is read three ways and every miss has to degrade to
 * `null`, never to a blank where an address should be.
 */
describe('recoveryEmailOf', () => {
    it('reads the field however it is spelled', () => {
        expect(recoveryEmailOf({ recovery_email: 'a@tevi.com' })).toBe('a@tevi.com')
        expect(recoveryEmailOf({ email: 'b@tevi.com' })).toBe('b@tevi.com')
        expect(recoveryEmailOf({ data: { recovery_email: 'c@tevi.com' } })).toBe('c@tevi.com')
        expect(recoveryEmailOf({ data: { email: 'd@tevi.com' } })).toBe('d@tevi.com')
    })

    /** `recovery_email` wins: it is the specific field, where `email` could be the account's login. */
    it('prefers the specific field', () => {
        expect(recoveryEmailOf({ email: 'login@tevi.com', recovery_email: 'rec@tevi.com' })).toBe(
            'rec@tevi.com',
        )
    })

    it('trims', () => {
        expect(recoveryEmailOf({ recovery_email: '  a@tevi.com \n' })).toBe('a@tevi.com')
    })

    /**
     * **Must look like an address.** The point of printing it is that the reader recognises an inbox —
     * a `true`, an id or a sentence next to "we sent a code to" does none of that, and the generic line
     * is the better answer.
     */
    it('refuses anything that is not one', () => {
        for (const body of [
            {},
            null,
            undefined,
            'a@tevi.com',
            { recovery_email: true },
            { recovery_email: 12345 },
            { recovery_email: '' },
            { recovery_email: '   ' },
            // No `@` — an id, a masked value, a status word.
            { recovery_email: 'sent' },
            { recovery_email: 'a***v.com' },
            // Longer than an address can be.
            { recovery_email: `${'x'.repeat(250)}@tevi.com` },
        ]) {
            expect(recoveryEmailOf(body)).toBeNull()
        }
    })

    /** A body carrying more than this is normal — `looseObject`, not `strictObject`. */
    it('ignores everything else in the body', () => {
        expect(
            recoveryEmailOf({
                success: true,
                ttl: 30,
                recovery_email: 'a@tevi.com',
                extra: [1, 2],
            }),
        ).toBe('a@tevi.com')
    })
})

/**
 * What `GET v1/two-fa/passcode/` is read for, and **the shape is unverified** (B92) — nothing in
 * either app has ever called it, and `two-fa/` is absent from the OpenAPI schema. So the parser's
 * whole job is to degrade rather than throw or guess, and these are the cases that says so.
 *
 * The hint is the reason the call exists: it is what the settings panel prints and what the passcode
 * dialog shows under the boxes, which is what stands between "I have forgotten it" and an email
 * round trip.
 */
describe('passcodeRecordOf', () => {
    it('reads the hint however it is spelled', () => {
        expect(passcodeRecordOf({ passcode_hint: 'mum' }).hint).toBe('mum')
        expect(passcodeRecordOf({ hint: 'mum' }).hint).toBe('mum')
        expect(passcodeRecordOf({ data: { passcode_hint: 'mum' } }).hint).toBe('mum')
        expect(passcodeRecordOf({ data: { hint: 'mum' } }).hint).toBe('mum')
    })

    /** `passcode_hint` wins: it is the specific field, where a bare `hint` could be anything. */
    it('prefers the specific field', () => {
        expect(passcodeRecordOf({ hint: 'other', passcode_hint: 'mum' }).hint).toBe('mum')
    })

    it('trims', () => {
        expect(passcodeRecordOf({ passcode_hint: '  mum \n' }).hint).toBe('mum')
    })

    /**
     * A hint is **free text the account wrote about its own passcode**, so it is deliberately *not*
     * validated the way the address is — "🎂" and "the usual" are both good hints. Only two things
     * disqualify one: nothing there, or so much of it that it cannot be a hint.
     */
    it('takes any non-blank text, including an emoji', () => {
        expect(passcodeRecordOf({ passcode_hint: '🎂' }).hint).toBe('🎂')
        expect(passcodeRecordOf({ passcode_hint: '2019' }).hint).toBe('2019')
    })

    it('refuses a blank, a non-string and a paste', () => {
        for (const value of ['', '   ', true, 42, null, {}, 'x'.repeat(201)]) {
            expect(passcodeRecordOf({ passcode_hint: value }).hint).toBeNull()
        }
    })

    /** Nothing here may throw: a body this client cannot read is a missing hint, not an error. */
    it('degrades to a record of nulls', () => {
        for (const body of [{}, null, undefined, 'nope', 42, []]) {
            expect(passcodeRecordOf(body)).toEqual({ hint: null, recoveryEmail: null })
        }
    })

    /**
     * The address goes through `recoveryEmailOf`, spelling rules and all — one reader for it rather
     * than two that can drift apart. So it inherits the "must look like an address" rule tested above.
     */
    it('reads the recovery address with the same rules as recover/', () => {
        expect(passcodeRecordOf({ recovery_email: 'rec@tevi.com' }).recoveryEmail).toBe(
            'rec@tevi.com',
        )
        expect(passcodeRecordOf({ recovery_email: 'not-an-address' }).recoveryEmail).toBeNull()
    })

    it('reads both fields from one body', () => {
        expect(passcodeRecordOf({ passcode_hint: 'mum', email: 'rec@tevi.com' })).toEqual({
            hint: 'mum',
            recoveryEmail: 'rec@tevi.com',
        })
    })
})
