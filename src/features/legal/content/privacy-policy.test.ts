import { describe, expect, it } from 'vitest'
import { PRIVACY_POLICY } from './privacy-policy'
import type { LegalBlock } from './types'

/**
 * The document is data, and the renderer trusts it in ways that break quietly:
 * section ids are anchor targets *and* React keys *and* the TOC hrefs, block text is a
 * React key, and the legacy copy this was ported from shipped duplicated blocks. All of
 * that is checkable without rendering anything.
 */

const allBlocks: LegalBlock[] = [
    ...PRIVACY_POLICY.intro,
    ...PRIVACY_POLICY.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')

describe('PRIVACY_POLICY', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(PRIVACY_POLICY.sections.map(section => section.id)).toEqual([
            'what-information-do-we-collect',
            'account-provided-information',
            'collected-information-for-legitimate-interests',
            'how-we-use-your-information',
            'how-we-share-your-information',
            'international-data-transfers',
            'links-to-other-websites-or-application',
            'data-security',
            'your-choices',
            'your-rights',
            'retention-of-your-information',
            'changes-and-updates-to-this-privacy-policy',
            'no-sale-of-personal-information',
            'no-discrimination',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = PRIVACY_POLICY.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of PRIVACY_POLICY.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of PRIVACY_POLICY.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('renders no paragraph twice — the legacy page printed three of them in both places', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
    })

    it('lists each right once, including "Right to withdraw consent"', () => {
        const rights = PRIVACY_POLICY.sections.find(section => section.id === 'your-rights')
        const leads = rights?.blocks.flatMap(block =>
            block.kind === 'paragraph' && block.lead ? [block.lead] : [],
        )
        expect(leads).toContain('Right to withdraw consent - ')
        expect(new Set(leads).size).toBe(leads?.length)
    })

    it('has no empty copy and no bullet holding a second bullet', () => {
        for (const block of allBlocks) {
            if (block.kind === 'list') {
                expect(block.items.length).toBeGreaterThan(0)
                for (const item of block.items) {
                    expect(item.text.trim()).not.toBe('')
                    // Legacy glued "• Information regarding your access…" onto the
                    // device-identifiers bullet; a bullet character means it happened again.
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
        expect(PRIVACY_POLICY.effectiveDate).toBe('11 November 2024')
    })
})
