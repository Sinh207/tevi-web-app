import { describe, expect, it } from 'vitest'
import { TERMS_PREMIUM } from './terms-premium'
import type { LegalBlock } from './types'

/**
 * Same contract as `terms-of-use.test.ts`: the document is data, and the renderer trusts
 * it in ways that break quietly — section ids are anchor targets *and* React keys *and*
 * the TOC hrefs, and block text is a React key.
 *
 * Two checks are specific to this document. Legacy wrote its bullets as `-` prefixes
 * inside one paragraph, so a bullet that kept its dash on the way over would render
 * "• - Send spam"; and legacy's own "Third‑Party" anchor id carried a U+2011 that a
 * fragment cannot hold un-encoded, so ids are asserted to be plain ASCII.
 */

const allBlocks: LegalBlock[] = [
    ...TERMS_PREMIUM.intro,
    ...TERMS_PREMIUM.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')

describe('TERMS_PREMIUM', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(TERMS_PREMIUM.sections.map(section => section.id)).toEqual([
            'introduction',
            'use-of-service-prohibited-conduct',
            'payment-subscription-premium-service',
            'cancellation-refunds',
            'changes-premium-services-pricing',
            'availability-software-requirements',
            // Legacy spelled this one with a non-breaking hyphen; see the note on the
            // document. The title still has it, the anchor must not.
            'third-party-purchases-terms',
            'termination',
            'no-liability-for-certain-losses',
            'changes-to-terms',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = TERMS_PREMIUM.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of TERMS_PREMIUM.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped ASCII anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of TERMS_PREMIUM.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of TERMS_PREMIUM.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('keeps the sub-headings inside their sections, not in the contents rail', () => {
        const subheadings = allBlocks.filter(block => block.kind === 'subheading')
        expect(subheadings.map(block => block.text)).toEqual([
            '3.1 Subscription and Payment',
            '3.2. Taxes & Conversion Rates',
            '4.1 Cancelling a Subscription',
            '4.2. Refunds & Effective Cancellation',
        ])
        // The rail is built from `sections`, so a sub-heading can only reach it by being
        // promoted to one — which would also give it an anchor it is not supposed to have.
        const titles = TERMS_PREMIUM.sections.map(section => section.title)
        for (const block of subheadings) {
            expect(titles).not.toContain(block.text)
        }
    })

    it('renders no paragraph twice', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
    })

    it('has no empty copy and no bullet still carrying its legacy dash', () => {
        for (const block of allBlocks) {
            if (block.kind === 'list') {
                expect(block.items.length).toBeGreaterThan(0)
                for (const item of block.items) {
                    expect(item.text.trim()).not.toBe('')
                    expect(item.text).not.toContain('•')
                    expect(item.text).not.toMatch(/^[-–—]\s/)
                }
            } else if (block.kind !== 'image') {
                expect(block.text.trim()).not.toBe('')
            }
        }
    })

    it('states an effective date for the "last updated" line', () => {
        expect(TERMS_PREMIUM.effectiveDate).toBe('September 2025')
    })
})
