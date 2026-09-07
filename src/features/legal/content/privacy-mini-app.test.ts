import { describe, expect, it } from 'vitest'
import { PRIVACY_POLICY_MINI_APP } from './privacy-mini-app'
import type { LegalBlock } from './types'

/**
 * Same contract as the other legal documents: this is data the renderer trusts in ways
 * that break quietly — section ids are anchor targets *and* React keys *and* the TOC
 * hrefs, and block text is a React key.
 *
 * Three checks are specific to this document. Its clause numbering ("1.1.", "(a)") is
 * *copy*, unlike the section numbers the renderer draws, so a cleanup that stripped one
 * would silently renumber a legal document; it deliberately contains no list block, since
 * every enumerated item already carries its own marker and a bullet would double it; and
 * it states no effective date, which is a fact about the source rather than an omission —
 * `LegalPageView` reads it and drops the "last updated" line.
 */

const allBlocks: LegalBlock[] = [
    ...PRIVACY_POLICY_MINI_APP.intro,
    ...PRIVACY_POLICY_MINI_APP.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')

describe('PRIVACY_POLICY_MINI_APP', () => {
    it('keeps the eight clauses in the order the document numbers them', () => {
        expect(PRIVACY_POLICY_MINI_APP.sections.map(section => section.id)).toEqual([
            'terms-and-definitions',
            'general-provisions',
            'disclaimers',
            'collection-of-personal-data',
            'processing-of-personal-data',
            'data-protection',
            'rights-and-obligations',
            'changes-to-this-privacy-policy',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = PRIVACY_POLICY_MINI_APP.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of PRIVACY_POLICY_MINI_APP.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped ASCII anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of PRIVACY_POLICY_MINI_APP.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of PRIVACY_POLICY_MINI_APP.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('keeps the clause numbering that lives in the copy', () => {
        // Section n opens on "n.1." — the renderer draws "n." beside the title, and these
        // are the numbers the document cites itself by ("without limiting section 4.1.").
        PRIVACY_POLICY_MINI_APP.sections.forEach((section, index) => {
            const first = section.blocks[0]
            if (section.id === 'changes-to-this-privacy-policy') return
            expect(first.kind).toBe('paragraph')
            expect('text' in first && first.text.startsWith(`${index + 1}.1.`)).toBe(true)
        })
    })

    it('carries no list block — every enumerated item already has its own marker', () => {
        // "(a) delete data sent from User…" under §7 is copy. As a list item it would
        // render "• (a) delete data…", and as an `ordered` one, "1. (a) delete data…".
        expect(allBlocks.some(block => block.kind === 'list')).toBe(false)
        expect(paragraphs.filter(block => block.text.startsWith('(a) ')).length).toBe(5)
    })

    it('closes the introduction with the document’s own second heading', () => {
        const last = PRIVACY_POLICY_MINI_APP.intro.at(-1)
        expect(last).toEqual({
            kind: 'subheading',
            text: 'Bot and Mini App Standard Privacy Policy',
        })
    })

    it('spaces the definition of User — the source reads "1.5.User"', () => {
        const texts = paragraphs.map(block => block.text)
        expect(texts).toContain(
            '1.5. User – The person accessing Third-Party Service via their account on Platform (also “you”).',
        )
    })

    it('renders no paragraph twice', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
    })

    it('has no empty copy', () => {
        for (const block of allBlocks) {
            if ('text' in block) expect(block.text.trim()).not.toBe('')
        }
    })

    it('states no effective date — the source prints none, so the page shows no line', () => {
        expect(PRIVACY_POLICY_MINI_APP.effectiveDate).toBeUndefined()
    })
})
