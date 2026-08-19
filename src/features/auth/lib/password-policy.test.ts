import { describe, expect, it } from 'vitest'
import {
    checkPassword,
    confirmationErrorKey,
    isPasswordValid,
    PASSWORD_MAX_LENGTH,
    PASSWORD_RULE_COUNT,
    passwordScore,
} from './password-policy'

/**
 * The acceptance set is legacy's, and this file is what pins it: the rules live in one
 * module precisely so a "small tidy-up" of the regex cannot quietly start rejecting
 * passwords the mobile apps accept.
 */

const VALID = 'Passw0rd!'

describe('checkPassword', () => {
    it('accepts a password meeting all three rules', () => {
        expect(checkPassword(VALID)).toEqual({ length: true, complexity: true, charset: true })
        expect(isPasswordValid(VALID)).toBe(true)
    })

    it('fails every rule on an empty string, including the one it technically satisfies', () => {
        // `charset` is vacuously true for '' — reported false so the checklist does not
        // show progress before a character is typed.
        expect(checkPassword('')).toEqual({ length: false, complexity: false, charset: false })
    })

    it('needs 8 characters', () => {
        expect(checkPassword('Pas0rd!').length).toBe(false)
        expect(checkPassword('Pass0rd!').length).toBe(true)
    })

    it('rejects a password longer than the max the field allows', () => {
        const long = `${'a1!'.repeat(30)}` // 90 chars, well over 64
        expect(long.length).toBeGreaterThan(PASSWORD_MAX_LENGTH)
        expect(checkPassword(long).length).toBe(false)
        // …and exactly at the limit is still fine.
        expect(checkPassword(`${'a'.repeat(62)}1!`).length).toBe(true)
    })

    it('needs both a digit and one of the four symbols', () => {
        expect(checkPassword('Password!').complexity).toBe(false)
        expect(checkPassword('Password1').complexity).toBe(false)
        expect(checkPassword('Password1?').complexity).toBe(true)
    })

    it('accepts each of the four symbols and nothing else', () => {
        for (const symbol of ['#', '?', '!', '@']) {
            expect(isPasswordValid(`Passw0rd${symbol}`)).toBe(true)
        }
        // The rule legacy folds into its complexity line, reported on its own here.
        const rejected = checkPassword('Passw0rd!$')
        expect(rejected.complexity).toBe(true)
        expect(rejected.charset).toBe(false)
        expect(isPasswordValid('Passw0rd!$')).toBe(false)
    })

    it('rejects whitespace, which the allowlist excludes', () => {
        expect(checkPassword('Passw 0rd!').charset).toBe(false)
    })
})

describe('passwordScore', () => {
    it('counts satisfied rules and tops out at the rule count', () => {
        expect(passwordScore(checkPassword(''))).toBe(0)
        expect(passwordScore(checkPassword('abcdefgh'))).toBe(2) // length + charset
        expect(passwordScore(checkPassword(VALID))).toBe(PASSWORD_RULE_COUNT)
    })
})

describe('confirmationErrorKey', () => {
    it('stays quiet while the confirmation is still shorter than the password', () => {
        expect(confirmationErrorKey(VALID, '')).toBeNull()
        expect(confirmationErrorKey(VALID, 'Passw')).toBeNull()
    })

    it('reports a mismatch once the confirmation is long enough to be judged', () => {
        expect(confirmationErrorKey(VALID, 'Passw0rd?')).toBe('password_error_mismatch')
        expect(confirmationErrorKey(VALID, `${VALID}x`)).toBe('password_error_mismatch')
    })

    it('is silent on a match', () => {
        expect(confirmationErrorKey(VALID, VALID)).toBeNull()
    })
})
