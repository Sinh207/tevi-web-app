import { describe, expect, it } from 'vitest'
import { TERMS_MINI_APP } from './terms-mini-app'
import type { LegalBlock } from './types'

/**
 * Same contract as the other legal documents: this is data the renderer trusts in ways
 * that break quietly — section ids are anchor targets *and* React keys *and* the TOC
 * hrefs, and block text is a React key.
 *
 * Three checks are specific to this document. The webview source repeats one paragraph of
 * §1 verbatim and the older `tevi_web` build does not, so the de-duplication is pinned
 * rather than left to whoever next reads the two side by side; the sub-clause numbering is
 * copy (and inconsistently punctuated, "3.1" against "3.2."), so it is asserted exactly;
 * and the document states no effective date, which `LegalPageView` reads to drop the
 * "last updated" line.
 */

const allBlocks: LegalBlock[] = [
    ...TERMS_MINI_APP.intro,
    ...TERMS_MINI_APP.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')
const lists = allBlocks.filter(block => block.kind === 'list')

describe('TERMS_MINI_APP', () => {
    it('keeps the seven clauses in the order the document numbers them', () => {
        expect(TERMS_MINI_APP.sections.map(section => section.id)).toEqual([
            'acceptance-of-ma-terms',
            'mini-apps',
            'payment',
            'privacy',
            'disclaimers',
            'modification-of-tmaf',
            'changes-to-ma-terms',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = TERMS_MINI_APP.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of TERMS_MINI_APP.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped ASCII anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of TERMS_MINI_APP.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "2." left on a title', () => {
        for (const { title } of TERMS_MINI_APP.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('keeps the sub-clause headings, punctuation slips and all', () => {
        const subheadings = allBlocks
            .filter(block => block.kind === 'subheading')
            .map(block => block.text)
        expect(subheadings).toEqual([
            // "3.1" has no full stop and "3.2." does; both are the source's.
            '3.1 Payment Information',
            '3.2. Payment-Related Disputes',
            '4.1. Data We Share',
            '4.2. Data You Share',
            '5.1 Indemnity',
            '5.2 Conflicts of Rules',
        ])
    })

    it('states the "for clarity" sentence once — the webview source has it twice', () => {
        const occurrences = paragraphs.filter(block =>
            block.text.includes('For clarity, your continued access to and use of TMAF'),
        )
        expect(occurrences.length).toBe(1)
    })

    it('renders no paragraph twice', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
    })

    it('never repeats a bullet inside one list — the text is that list item’s key', () => {
        for (const block of lists) {
            const texts = block.items.map(item => item.text)
            expect(new Set(texts).size).toBe(texts.length)
        }
    })

    it('has no empty copy and no item still carrying its legacy marker', () => {
        for (const block of allBlocks) {
            if (block.kind === 'list') {
                expect(block.items.length).toBeGreaterThan(0)
                for (const item of block.items) {
                    expect(item.text.trim()).not.toBe('')
                    expect(item.text).not.toContain('•')
                    expect(item.text).not.toMatch(/^([-–—]\s|\d+\.\s)/)
                }
            } else if ('text' in block) {
                expect(block.text.trim()).not.toBe('')
            }
        }
    })

    it('states no effective date — the source prints none, so the page shows no line', () => {
        expect(TERMS_MINI_APP.effectiveDate).toBeUndefined()
    })
})
