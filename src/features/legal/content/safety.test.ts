import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAFETY_POLICY } from './safety'
import type { LegalBlock } from './types'

/**
 * The document is data, and the renderer trusts it in ways that break quietly: section
 * ids are anchor targets *and* React keys *and* the TOC hrefs, and block text is a React
 * key. All checkable without rendering anything.
 *
 * The interesting case here is the duplication the legacy page shipped — see the note in
 * `safety.ts`. It is pinned rather than asserted away, so that removing it is a decision
 * someone makes about the copy, and *introducing more of it* fails.
 */

const allBlocks: LegalBlock[] = [
    ...SAFETY_POLICY.intro,
    ...SAFETY_POLICY.sections.flatMap(section => section.blocks),
]

const paragraphs = allBlocks.filter(block => block.kind === 'paragraph')

/** Sections whose copy is duplicated in the legacy source, in document order. */
const DUPLICATED_IN = ['safety-philosophy', 'community-guidelines-cgs']

describe('SAFETY_POLICY', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(SAFETY_POLICY.sections.map(section => section.id)).toEqual([
            'community-comes-first',
            'transparency-consistency-trust',
            'safety-is-personal',
            'safety-philosophy',
            'approach-to-safety',
            'community-guidelines-cgs',
            'service-level-safety',
            'channel-level-safety',
            'viewer-level-safety',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = SAFETY_POLICY.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of SAFETY_POLICY.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of SAFETY_POLICY.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('spells the three tiers the way the diagram does', () => {
        const titles = SAFETY_POLICY.sections.map(section => section.title)
        // Legacy's JSX line-wrapping left "Channel - Level Safety" in the heading.
        expect(titles).toContain('Service-Level Safety')
        expect(titles).toContain('Channel-Level Safety')
        expect(titles).toContain('Viewer-Level Safety')
        for (const title of titles) {
            expect(title).not.toMatch(/ - /)
        }
    })

    it('repeats only the Community Guidelines copy, and only in those two sections', () => {
        const counts = new Map<string, string[]>()
        for (const section of SAFETY_POLICY.sections) {
            for (const block of section.blocks) {
                if (block.kind !== 'paragraph') continue
                counts.set(block.text, [...(counts.get(block.text) ?? []), section.id])
            }
        }
        const repeated = [...counts.values()].filter(sections => sections.length > 1)
        expect(repeated).toHaveLength(2)
        for (const sections of repeated) {
            expect(sections).toEqual(DUPLICATED_IN)
        }
    })

    it('renders no sentence twice inside a paragraph — legacy doubled one under Approach to Safety', () => {
        for (const { text } of paragraphs) {
            const sentences = text.split(/(?<=\.)\s+/).map(sentence => sentence.trim())
            expect(new Set(sentences).size).toBe(sentences.length)
        }
    })

    it('illustrates the layered approach with one figure, sized and described', () => {
        const images = allBlocks.filter(block => block.kind === 'image')
        expect(images).toHaveLength(1)
        const [image] = images
        // A repo asset, so a missing file is a red test rather than a broken figure
        // nobody notices — the same trap `manifest.test.ts` guards for the PWA icons.
        expect(image.src).toBe('/legal/approach-to-safety.jpeg')
        expect(existsSync(join(process.cwd(), 'public', image.src))).toBe(true)
        // The declared ratio is what reserves the figure's space before it loads.
        expect(image.width).toBe(1280)
        expect(image.height).toBe(720)
        // The diagram is a picture of text, so the alt has to carry all four tiers.
        for (const tier of [
            'Community Guidelines',
            'service-level',
            'channel-level',
            'viewer-level',
        ])
            expect(image.alt).toContain(tier)
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
        expect(SAFETY_POLICY.effectiveDate).toBe('11 November 2024')
    })
})
