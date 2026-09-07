import { z } from 'zod'

/**
 * One rule the backend enforces on a display name, in the shape a caller can act on.
 *
 * `code` is the contract (`sensitive`, `invalid_characters`, …) and `message` is the sentence to
 * show — English in every locale, which is the same trade `validate-display-name/`'s own 400 body
 * already makes on this exact field (`docs/API_ERRORS.md`).
 */
export interface DisplayNameRule {
    code: string
    message: string
    test: RegExp
}

/**
 * `GET v1/me/display-name-validation-rule/` answers a bare **array** — no envelope of its own
 * beyond the `{ data }` the client has already unwrapped. Parsed `looseObject` per row because the
 * shape is not in a schema and a row carrying more than this is normal.
 */
const rulesSchema = z.array(
    z.looseObject({
        code: z.unknown().optional(),
        message: z.unknown().optional(),
        metadata: z.looseObject({ regex: z.unknown().optional() }).optional(),
    }),
)

/**
 * A rule's regex is a string from the server and goes straight into `new RegExp`, which throws on
 * anything Python accepts and JavaScript does not. A rule that cannot be compiled is **dropped**,
 * not fatal: the server still validates before submit, so the cost of losing one is a round trip,
 * where a throw here would take the whole form down.
 */
function compile(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern)
    } catch {
        return null
    }
}

/**
 * The rules out of whatever the endpoint answered — never throwing, never guessing.
 *
 * A body this parser cannot read comes back `[]`, which is exactly the "no local rules" state the
 * caller already has to handle (the rules have not loaded yet, or the request failed). So every
 * failure mode collapses onto one behaviour: ask the server, as this app did before.
 */
export function toDisplayNameRules(body: unknown): DisplayNameRule[] {
    const parsed = rulesSchema.safeParse(body)
    if (!parsed.success) return []

    const rules: DisplayNameRule[] = []
    for (const row of parsed.data) {
        const { code, message, metadata } = row
        if (typeof code !== 'string' || typeof message !== 'string') continue
        if (typeof metadata?.regex !== 'string') continue
        const test = compile(metadata.regex)
        // A rule with no message is a rejection the reader cannot act on, so it is no better
        // than no rule at all.
        if (!test || !message.trim()) continue
        rules.push({ code, message: message.trim(), test })
    }
    return rules
}

/**
 * The first rule `value` breaks, or `null`.
 *
 * ⚠ **`null` does not mean valid.** It means no *local* rule caught it, and
 * `validate-display-name/` is still the authority — it checks things no regex can. This exists to
 * fail fast on the input that is obviously wrong, not to decide the answer.
 *
 * A blank value is nobody's business here: the form treats it as "nothing typed yet" rather than
 * as an error, and running a `^…$` pattern against `''` would contradict that.
 */
export function firstBrokenRule(value: string, rules: DisplayNameRule[]): DisplayNameRule | null {
    if (!value.trim()) return null
    return rules.find(rule => !rule.test.test(value)) ?? null
}
