import { describe, expect, it } from 'vitest'
import { parseEmphasis } from './emphasis'

/**
 * The open letter's only piece of logic, and it runs over copy nobody re-reads after it
 * lands. The failures worth pinning are the quiet ones: a marker that survives into the
 * rendered text (readers see literal asterisks), a run that comes back empty (an empty
 * `<strong>` between two sentences), and text that changes on the way through — the whole
 * contract is that concatenating the runs gives back the copy without its markers.
 */
describe('parseEmphasis', () => {
    it('returns one plain run for copy with no markers', () => {
        expect(parseEmphasis('We choose the creators. Every time.')).toEqual([
            { text: 'We choose the creators. Every time.', bold: false },
        ])
    })

    it('splits a bold run out of the middle of a sentence', () => {
        expect(parseEmphasis('Soon you will see **active followers**: a truer number.')).toEqual([
            { text: 'Soon you will see ', bold: false },
            { text: 'active followers', bold: true },
            { text: ': a truer number.', bold: false },
        ])
    })

    it('emits no empty run when the copy opens or closes on the marker', () => {
        expect(parseEmphasis('**A new system is live.**')).toEqual([
            { text: 'A new system is live.', bold: true },
        ])
        expect(parseEmphasis('**Bold.** And the rest.')).toEqual([
            { text: 'Bold.', bold: true },
            { text: ' And the rest.', bold: false },
        ])
    })

    it('handles more than one bold run in a paragraph', () => {
        expect(parseEmphasis('**one** and **two**')).toEqual([
            { text: 'one', bold: true },
            { text: ' and ', bold: false },
            { text: 'two', bold: true },
        ])
    })

    it('leaves a malformed marker as literal text rather than eating the copy', () => {
        // An unclosed marker, and an empty one. Both are typos in a letter; neither may
        // silently delete a sentence.
        expect(parseEmphasis('**unclosed and on it goes')).toEqual([
            { text: '**unclosed and on it goes', bold: false },
        ])
        expect(parseEmphasis('empty **** marker')).toEqual([
            { text: 'empty **** marker', bold: false },
        ])
    })

    it('preserves the copy minus its markers', () => {
        const text = 'Let there be **no confusion** about where we stand.'
        expect(
            parseEmphasis(text)
                .map(run => run.text)
                .join(''),
        ).toBe(text.replaceAll('**', ''))
    })

    it('returns nothing for an empty string', () => {
        expect(parseEmphasis('')).toEqual([])
    })
})
