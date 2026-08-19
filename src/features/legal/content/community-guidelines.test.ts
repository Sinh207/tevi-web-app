import { describe, expect, it } from 'vitest'
import { COMMUNITY_GUIDELINES } from './community-guidelines'
import type { LegalBlock } from './types'

/**
 * Same contract as the other documents: it is data, and the renderer trusts it in ways
 * that break quietly — section ids are anchor targets *and* React keys *and* the TOC
 * hrefs. All checkable without rendering anything.
 *
 * Two checks are specific to this document. It is the one with repeated copy *inside* a
 * section ("For example, you may not:" three times under Authenticity), which is why
 * `blockKey` carries the block's position; that repetition is pinned here so the reason
 * for the position survives, and so introducing more of it is a decision rather than an
 * accident. And it is by far the most sub-headed document — 30-odd `subheading` blocks
 * against six sections — so the check that they stay out of the contents rail matters
 * more here than anywhere else.
 */

const allBlocks: LegalBlock[] = [
    ...COMMUNITY_GUIDELINES.intro,
    ...COMMUNITY_GUIDELINES.sections.flatMap(section => section.blocks),
]

/** The copy legacy repeats verbatim, and the sections it repeats it in. */
const REPEATED = [{ text: 'For example, you may not:', section: 'authenticity', times: 3 }]

describe('COMMUNITY_GUIDELINES', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(COMMUNITY_GUIDELINES.sections.map(section => section.id)).toEqual([
            'introduction',
            'safety',
            'civility-and-respect',
            'illegal-activity',
            'sensitive-content',
            'authenticity',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = COMMUNITY_GUIDELINES.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of COMMUNITY_GUIDELINES.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of COMMUNITY_GUIDELINES.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of COMMUNITY_GUIDELINES.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('keeps every sub-heading inside its section, not in the contents rail', () => {
        const subheadings = allBlocks.filter(block => block.kind === 'subheading')
        // Legacy's `h2[id]` scrape produced six entries; each policy under them was a
        // `StyledSubTitle` with no id, and none of them may be promoted to a section.
        expect(subheadings.length).toBeGreaterThan(20)
        const titles = COMMUNITY_GUIDELINES.sections.map(section => section.title)
        for (const block of subheadings) {
            expect(titles).not.toContain(block.text)
            expect(block.text.trim()).toBe(block.text)
        }
    })

    it('opens each section on a sub-heading, so no copy is orphaned above one', () => {
        // Every section but the introduction is a run of named policies; a paragraph
        // before the first sub-heading would be copy belonging to nothing.
        for (const section of COMMUNITY_GUIDELINES.sections) {
            if (section.id === 'introduction') continue
            expect(section.blocks[0]?.kind).toBe('subheading')
        }
    })

    it('repeats only the copy legacy repeats, only where it repeats it', () => {
        const counts = new Map<string, string[]>()
        for (const section of COMMUNITY_GUIDELINES.sections) {
            for (const block of section.blocks) {
                if (block.kind !== 'paragraph') continue
                counts.set(block.text, [...(counts.get(block.text) ?? []), section.id])
            }
        }
        const repeated = [...counts].filter(([, sections]) => sections.length > 1)
        expect(repeated).toHaveLength(REPEATED.length)
        for (const { text, section, times } of REPEATED) {
            expect(counts.get(text)).toEqual(Array<string>(times).fill(section))
        }
    })

    it("never repeats a bullet inside one list — the text is that list item's key", () => {
        for (const block of allBlocks) {
            if (block.kind !== 'list') continue
            const texts = block.items.map(item => item.text)
            expect(new Set(texts).size).toBe(texts.length)
        }
    })

    it('has no empty copy and no bullet holding a second bullet', () => {
        for (const block of allBlocks) {
            if (block.kind === 'image') {
                expect(block.alt.trim()).not.toBe('')
            } else if (block.kind === 'list') {
                expect(block.items.length).toBeGreaterThan(0)
                for (const item of block.items) {
                    expect(item.text.trim()).not.toBe('')
                    expect(item.text).not.toContain('•')
                }
            } else {
                expect(block.text.trim()).not.toBe('')
            }
        }
    })

    it('states an effective date for the "last updated" line', () => {
        expect(COMMUNITY_GUIDELINES.effectiveDate).toBe('11 November 2024')
    })
})
