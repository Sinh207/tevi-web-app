import { describe, expect, it } from 'vitest'
import { TERMS_OF_USE } from './terms-of-use'
import type { LegalBlock } from './types'

/**
 * Same contract as `privacy-policy.test.ts`: the document is data, and the renderer
 * trusts it in ways that break quietly — section ids are anchor targets *and* React keys
 * *and* the TOC hrefs, and block text is a React key.
 *
 * Two checks are specific to this document. The renderer numbers the sections itself, so
 * a title that still carries its legacy number would print "1. 1. Special Notices"; and
 * the terms are the first document to use sub-headings, which must stay out of the
 * contents rail.
 */

const allBlocks: LegalBlock[] = [
    ...TERMS_OF_USE.intro,
    ...TERMS_OF_USE.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')

describe('TERMS_OF_USE', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(TERMS_OF_USE.sections.map(section => section.id)).toEqual([
            'special-notices',
            'services',
            'account',
            'privacy',
            'use-of-the-services',
            'virtual-items',
            'payment-terms',
            'intellectual-property-rights',
            'terminating-services',
            'disclaimers',
            'governing-law-and-dispute-resolution',
            'request-for-information',
            'modification-of-the-agreement',
            'other-terms',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = TERMS_OF_USE.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of TERMS_OF_USE.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of TERMS_OF_USE.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of TERMS_OF_USE.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('keeps the sub-headings inside their sections, not in the contents rail', () => {
        const subheadings = allBlocks.filter(block => block.kind === 'subheading')
        expect(subheadings.map(block => block.text)).toEqual([
            'i. TEVI',
            'ii. Global access to our Services',
            'A. Governing Law.',
            'B. Agreement to Arbitrate.',
            'C. Class Action Waiver.',
        ])
        // The rail is built from `sections`, so a sub-heading can only reach it by being
        // promoted to one — which would also give it an anchor it is not supposed to have.
        const titles = TERMS_OF_USE.sections.map(section => section.title)
        for (const block of subheadings) {
            expect(titles).not.toContain(block.text)
        }
    })

    it('renders no paragraph twice', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
    })

    it('has no empty copy and no bullet holding a second bullet', () => {
        for (const block of allBlocks) {
            if (block.kind === 'list') {
                expect(block.items.length).toBeGreaterThan(0)
                for (const item of block.items) {
                    expect(item.text.trim()).not.toBe('')
                    expect(item.text).not.toContain('•')
                }
            } else if (block.kind === 'image') {
                expect(block.alt.trim()).not.toBe('')
            } else {
                expect(block.text.trim()).not.toBe('')
            }
        }
    })

    it('states an effective date for the "last updated" line', () => {
        expect(TERMS_OF_USE.effectiveDate).toBe('27 November 2025')
    })
})
