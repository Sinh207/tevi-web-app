import { describe, expect, it } from 'vitest'
import { PRIVACY_POLICY_PREMIUM } from './privacy-premium'
import type { LegalBlock } from './types'

/**
 * Same contract as the other legal documents: this is data the renderer trusts in ways
 * that break quietly — section ids are anchor targets *and* React keys *and* the TOC
 * hrefs, and block text is a React key.
 *
 * Two checks are specific to this document. Legacy wrote every bullet and every numbered
 * item as a `-`/`1.` prefix inside one `<p>` of `<br/>`s, so an item that kept its marker
 * on the way over would render "• - We comply…" or "1. 1. Your consent…"; and the copy
 * carries U+2011 non-breaking hyphens ("industry‑standard", "end‑to‑end") that a
 * well-meaning cleanup would flatten to ASCII, so the ones that matter are pinned.
 */

const allBlocks: LegalBlock[] = [
    ...PRIVACY_POLICY_PREMIUM.intro,
    ...PRIVACY_POLICY_PREMIUM.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')
const lists = allBlocks.filter(block => block.kind === 'list')

describe('PRIVACY_POLICY_PREMIUM', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(PRIVACY_POLICY_PREMIUM.sections.map(section => section.id)).toEqual([
            'terms-and-definitions',
            'general-provisions',
            'legal-grounds-for-processing',
            'what-personal-data-we-use',
            'how-we-keep-your-data-safe',
            'how-we-process-your-personal-data',
            'sharing-of-your-personal-data',
            'your-rights-concerning-your-personal-data',
            'deletion-of-data',
            'cookies-tracking-and-third-party-technologies',
            'transparency-and-updates',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = PRIVACY_POLICY_PREMIUM.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of PRIVACY_POLICY_PREMIUM.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped ASCII anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of PRIVACY_POLICY_PREMIUM.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of PRIVACY_POLICY_PREMIUM.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it('marks the two enumerations ordered, so their numbers survive as numbers', () => {
        const ordered = PRIVACY_POLICY_PREMIUM.sections.filter(section =>
            section.blocks.some(block => block.kind === 'list' && block.ordered),
        )
        expect(ordered.map(section => section.id)).toEqual([
            'legal-grounds-for-processing',
            'how-we-process-your-personal-data',
        ])
    })

    it('renders no paragraph twice', () => {
        const texts = paragraphs.map(block => block.text)
        expect(new Set(texts).size).toBe(texts.length)
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
                // `in` rather than a kind check: block kinds that carry no copy (a figure,
                // say) have nothing to assert here, and this stays true as more are added.
                expect(block.text.trim()).not.toBe('')
            }
        }
    })

    it('keeps a bold lead separated from the text that follows it', () => {
        for (const block of lists) {
            for (const item of block.items) {
                if (item.lead) expect(item.lead).toMatch(/\s$/)
            }
        }
    })

    it('preserves the copy’s non-breaking hyphens', () => {
        const text = allBlocks
            .flatMap(block =>
                block.kind === 'list'
                    ? block.items.map(item => item.text)
                    : 'text' in block
                      ? [block.text]
                      : [],
            )
            .join('\n')
        expect(text).toContain('industry‑standard')
        expect(text).toContain('end‑to‑end')
        expect(text).toContain('non‑premium')
    })

    it('states an effective date for the "last updated" line', () => {
        expect(PRIVACY_POLICY_PREMIUM.effectiveDate).toBe('September 2025')
    })
})
