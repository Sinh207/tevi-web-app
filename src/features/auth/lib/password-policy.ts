import type { TranslationKey } from '@shared/i18n/settings'
/**
 * What counts as an acceptable password, in one place.
 *
 * The rules are legacy's, character for character (`containers/settingPassword/hooks/
 * useCreatePassword.js` and `useChangePassword.js`), because **the backend is the one
 * enforcing them and we have not been told what it enforces** — a client that is stricter
 * than the server only refuses passwords the server would take, and a client that is looser
 * produces a 400 the user cannot act on. Matching legacy keeps the web app agreeing with the
 * mobile apps and with whatever the API does today. See B7 in `docs/BACKEND_QUESTIONS.md`.
 *
 * ## Three checks, where legacy shows two
 *
 * Legacy's second rule is really two: it requires a digit *and* one of `# ? ! @`, and it
 * separately rejects any character outside `A–Z a–z 0–9 # ? ! @` — with both folded into one
 * line that says only "At least 1 number, 1 special character (# ? ! @)". So someone typing
 * `Password1$` watches a requirement they have satisfied stay grey, with nothing on screen
 * explaining that the `$` is what did it.
 *
 * The accepted set here is **identical** to legacy's; it is only reported honestly. That is
 * the whole difference.
 *
 * ## Deliberately not a strength meter
 *
 * With a fixed 4-character symbol allowlist there is very little entropy left for a meter to
 * measure, and a bar that says "strong" is a claim about resistance to an offline attack that
 * no client-side heuristic can make. The UI shows *requirements met*, which is a fact.
 */

/** Legacy's `minLength`, checked here rather than left to the input. */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Legacy's `maxLength={64}` on the field. Enforced in this module too: the attribute stops
 * typing but not a paste on every browser, and it is not on the change-password field's
 * *current* password at all.
 */
export const PASSWORD_MAX_LENGTH = 64

/** The only symbols the policy admits. Kept as a string so the copy can name them. */
export const PASSWORD_SYMBOLS = '#?!@'

/** Anything outside this set fails `charset` — letters, digits and the four symbols. */
const ALLOWED = /^[a-zA-Z0-9#?!@]*$/
const HAS_DIGIT = /[0-9]/
const HAS_SYMBOL = /[#?!@]/

/** One boolean per rule, in the order the checklist renders them. */
export type PasswordChecks = {
    /** 8–64 characters. */
    length: boolean
    /** At least one digit and at least one of `# ? ! @`. */
    complexity: boolean
    /** No character outside letters, digits and `# ? ! @`. */
    charset: boolean
}

/** Every rule's translation key, so the checklist and the tests name them once. */
export const PASSWORD_RULE_KEYS: Record<keyof PasswordChecks, string> = {
    length: 'password_rule_length',
    complexity: 'password_rule_complexity',
    charset: 'password_rule_charset',
}

/**
 * Grade a candidate password.
 *
 * An empty string fails everything — including `charset`, which it technically satisfies.
 * That is intentional: the checklist would otherwise show one rule already met before a
 * single character is typed, which reads as progress nobody made.
 */
export function checkPassword(value: string): PasswordChecks {
    if (!value) return { length: false, complexity: false, charset: false }

    return {
        length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
        complexity: HAS_DIGIT.test(value) && HAS_SYMBOL.test(value),
        charset: ALLOWED.test(value),
    }
}

export function isPasswordValid(value: string): boolean {
    return Object.values(checkPassword(value)).every(Boolean)
}

/** How many rules are satisfied — what the progress bar reports. */
export function passwordScore(checks: PasswordChecks): number {
    return Object.values(checks).filter(Boolean).length
}

/** Rules there are. `passwordScore(...) === PASSWORD_RULE_COUNT` ⇒ valid. */
export const PASSWORD_RULE_COUNT = Object.keys(PASSWORD_RULE_KEYS).length

/**
 * Why a **confirm** field is not yet acceptable, or `null` when it is.
 *
 * Returns a translation key rather than a boolean so the caller does not re-derive the
 * reason, and stays quiet while the confirmation is still being typed: a mismatch error that
 * appears on the first character and clears on the last is noise, so it is only reported once
 * the confirmation is at least as long as the password it is confirming.
 */
export function confirmationErrorKey(
    password: string,
    confirmation: string,
): TranslationKey | null {
    if (!confirmation || confirmation.length < password.length) return null
    return confirmation === password ? null : 'password_error_mismatch'
}
