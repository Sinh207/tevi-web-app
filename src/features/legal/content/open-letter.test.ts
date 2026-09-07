import { describe, expect, it } from 'vitest'
import { parseEmphasis } from '../lib/emphasis'
import { getOpenLetter, OPEN_LETTER } from './open-letter'
import type { Letter } from './types'

/**
 * The letter is the one document here that exists three times over, so the failure this
 * file is written against is **drift**: a heading dropped from the Vietnamese version, a
 * fourth bullet added to one language only, a `**` left unclosed after an edit. None of
 * those throw, and none are visible unless somebody reads all three side by side.
 *
 * The English letter is the reference because it is what the other six locales are served
 * (`getOpenLetter`), and because it is the one the team writes first.
 */

const LOCALES = ['en', 'vi', 'id'] as const
const letters = LOCALES.map(locale => [locale, OPEN_LETTER[locale]] as const)

const allText = (letter: Letter): string[] => [
    letter.barTitle,
    letter.title,
    letter.dateline,
    letter.metaDescription,
    letter.signOff,
    ...letter.blocks.flatMap(block => (block.kind === 'list' ? block.items : [block.text])),
]

describe('OPEN_LETTER', () => {
    it('is written in exactly the three languages legacy ships', () => {
        expect(Object.keys(OPEN_LETTER)).toEqual(['en', 'vi', 'id'])
    })

    it.each(letters)('%s fills every field the page renders', (_locale, letter) => {
        for (const text of allText(letter)) expect(text.trim()).not.toBe('')
    })

    it.each(letters)('%s keeps the same block structure as the English letter', (_l, letter) => {
        const shape = (l: Letter) =>
            l.blocks.map(block => `${block.kind}:${block.kind === 'list' ? block.items.length : 1}`)
        expect(shape(letter)).toEqual(shape(OPEN_LETTER.en))
    })

    it.each(letters)('%s closes every emphasis marker it opens', (_locale, letter) => {
        for (const text of allText(letter)) {
            // An odd number of markers means one is unclosed, which `parseEmphasis`
            // deliberately renders as literal asterisks rather than guessing.
            expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0)
            for (const run of parseEmphasis(text)) expect(run.text).not.toContain('**')
        }
    })

    it.each(letters)('%s emphasises something in the two paragraphs that argue', (_l, letter) => {
        const bold = letter.blocks
            .flatMap(block => (block.kind === 'list' ? block.items : [block.text]))
            .flatMap(parseEmphasis)
            .filter(run => run.bold)
        expect(bold.length).toBe(3)
    })

    it.each(letters)('%s signs off with a dash, not a bare name', (_locale, letter) => {
        expect(letter.signOff.startsWith('—')).toBe(true)
    })

    it('dates all three versions the same day, in a form a machine can read', () => {
        // One letter published once. The datelines differ because the languages do; the
        // ISO date feeds `<time dateTime>` and the article's `publishedTime`, and three
        // copies of it would be three chances to disagree.
        for (const [, letter] of letters) {
            expect(letter.publishedAt).toBe(OPEN_LETTER.en.publishedAt)
            expect(letter.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(Number.isNaN(Date.parse(letter.publishedAt))).toBe(false)
        }
    })
})

describe('getOpenLetter', () => {
    it('returns the letter written in that language', () => {
        expect(getOpenLetter('vi')).toBe(OPEN_LETTER.vi)
        expect(getOpenLetter('id')).toBe(OPEN_LETTER.id)
        expect(getOpenLetter('en')).toBe(OPEN_LETTER.en)
    })

    it('falls back to English for the six locales it was not written in', () => {
        // Not an error state: an untranslated letter is still the letter, and there is no
        // per-key fallback here the way `translation.json` has.
        for (const locale of ['ko', 'ms', 'fil', 'ar', 'zh-CN', 'zh-Hant', '', 'de']) {
            expect(getOpenLetter(locale)).toBe(OPEN_LETTER.en)
        }
    })

    it('is not fooled by a property that lives on every object', () => {
        expect(getOpenLetter('toString')).toBe(OPEN_LETTER.en)
        expect(getOpenLetter('constructor')).toBe(OPEN_LETTER.en)
    })
})
