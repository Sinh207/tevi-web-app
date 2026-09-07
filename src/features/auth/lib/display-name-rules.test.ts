import { describe, expect, it } from 'vitest'
import { firstBrokenRule, toDisplayNameRules } from './display-name-rules'

/** A row in the shape `GET v1/me/display-name-validation-rule/` actually answers. */
const row = (code: string, regex: string, message = `${code} failed`) => ({
    code,
    type: 'RegexValidator',
    message,
    metadata: { regex },
})

const SENSITIVE = '^((?!(tevi|admin|manager)).)*$'
const CHARACTERS = "^[\\w\\s.@\\-_']+$"

describe('toDisplayNameRules', () => {
    it('reads the rows the endpoint sends', () => {
        const rules = toDisplayNameRules([
            row('sensitive', SENSITIVE),
            row('invalid_characters', CHARACTERS),
        ])
        expect(rules.map(r => r.code)).toEqual(['sensitive', 'invalid_characters'])
        expect(rules[0]?.message).toBe('sensitive failed')
    })

    /*
     * Every failure mode has to land on `[]`, because `[]` is the behaviour this app had before
     * these rules existed: debounce, ask the server, report what it says. Anything that throws
     * here would take down a form over a convenience.
     */
    it('answers [] for a body it cannot read', () => {
        expect(toDisplayNameRules(null)).toEqual([])
        expect(toDisplayNameRules({ results: [] })).toEqual([])
        expect(toDisplayNameRules('nope')).toEqual([])
    })

    it('drops a row missing anything it needs', () => {
        expect(
            toDisplayNameRules([
                { code: 'x', message: 'm' }, // no regex
                { code: 'y', metadata: { regex: '^a$' } }, // no message
                { message: 'm', metadata: { regex: '^a$' } }, // no code
                row('z', '^a$', '   '), // blank message is a rejection nobody can act on
            ]),
        ).toEqual([])
    })

    /*
     * The patterns are written for Python's `re` and compiled by JavaScript's engine. A
     * possessive quantifier or a named group in the wrong dialect throws — and the rule is
     * dropped, not propagated, so the cost is one round trip rather than a broken screen.
     */
    it('drops a regex JavaScript cannot compile', () => {
        expect(toDisplayNameRules([row('bad', '(?P<name>a)')])).toEqual([])
        expect(
            toDisplayNameRules([row('bad', '(?P<n>a)'), row('good', '^a$')]).map(r => r.code),
        ).toEqual(['good'])
    })
})

describe('firstBrokenRule', () => {
    const rules = toDisplayNameRules([
        row('sensitive', SENSITIVE),
        row('invalid_characters', CHARACTERS),
    ])

    it('names the rule that rejected the value', () => {
        expect(firstBrokenRule('tevi admin', rules)?.code).toBe('sensitive')
        expect(firstBrokenRule('sinh!!', rules)?.code).toBe('invalid_characters')
    })

    it('returns null for a value no local rule catches', () => {
        expect(firstBrokenRule('Sinh Phan', rules)).toBeNull()
    })

    /*
     * ⚠ `null` is "no local rule caught it", never "valid" — the server still checks reserved
     * words and uniqueness. With no rules loaded (a failed fetch, an anonymous visitor) every
     * value passes locally, which is exactly the old behaviour.
     */
    it('passes everything when no rules are loaded', () => {
        expect(firstBrokenRule('tevi admin', [])).toBeNull()
    })

    // Blank is "nothing typed yet", which the form already treats as no error — running a
    // `^…+$` pattern against it would contradict that on the first render.
    it('treats a blank value as nothing to say', () => {
        expect(firstBrokenRule('', rules)).toBeNull()
        expect(firstBrokenRule('   ', rules)).toBeNull()
    })
})
