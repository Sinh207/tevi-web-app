import { describe, expect, it } from 'vitest'
import { MODERATION_POLICY } from './moderation'
import type { LegalBlock } from './types'

/**
 * Same contract as the other documents: it is data, and the renderer trusts it in ways that
 * break quietly — section ids are anchor targets *and* React keys *and* the TOC hrefs.
 *
 * Two checks are specific to this one. Legacy set "Block users" with the same styled
 * component as its section headings but gave it no id, so it was never an anchor; if it ever
 * gets promoted to a section the contents rail grows an entry legacy never had, which is
 * what the sub-heading check pins. And the two sentences legacy left trailing off ("…and
 * select.", "…and choose.") are pinned as-is, so completing them is a decision someone makes
 * about the copy rather than a silent rewrite of an enforcement policy.
 */

const allBlocks: LegalBlock[] = [
    ...MODERATION_POLICY.intro,
    ...MODERATION_POLICY.sections.flatMap(section => section.blocks),
]

describe('MODERATION_POLICY', () => {
    it('keeps the legacy anchor ids — external links and the app point at them', () => {
        expect(MODERATION_POLICY.sections.map(section => section.id)).toEqual([
            'chat-filters',
            'transparency-consistency-trust',
            'managing-harrassments',
            'chat-bans',
            'file-a-user-report',
        ])
    })

    it('has a unique id and a title per section', () => {
        const ids = MODERATION_POLICY.sections.map(section => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of MODERATION_POLICY.sections) {
            expect(section.title.trim()).not.toBe('')
            expect(section.blocks.length).toBeGreaterThan(0)
        }
    })

    it('uses id-shaped anchors so `href="#id"` and `getElementById` agree', () => {
        for (const { id } of MODERATION_POLICY.sections) {
            expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        }
    })

    it('leaves the numbering to the renderer — no "1." left on a title', () => {
        for (const { title } of MODERATION_POLICY.sections) {
            expect(title).not.toMatch(/^\d+\./)
        }
    })

    it("keeps legacy's misspelled heading and its matching anchor", () => {
        // Both are load-bearing: the id is linked from outside the app, and the title is
        // the copy. Fixing either is a content change, not a typo fix.
        const section = MODERATION_POLICY.sections.find(s => s.id === 'managing-harrassments')
        expect(section?.title).toBe('Managing Harrassments')
    })

    it('opens on an intro paragraph — legacy set it above the first heading', () => {
        expect(MODERATION_POLICY.intro).toHaveLength(1)
        expect(MODERATION_POLICY.intro[0]?.kind).toBe('paragraph')
    })

    it('keeps "Block users" a sub-heading, out of the contents rail', () => {
        const subheadings = allBlocks.filter(block => block.kind === 'subheading')
        expect(subheadings.map(block => block.text)).toEqual(['Block users'])
        const titles = MODERATION_POLICY.sections.map(section => section.title)
        for (const block of subheadings) {
            expect(titles).not.toContain(block.text)
            expect(block.text.trim()).toBe(block.text)
        }
    })

    it('pins the two sentences legacy left unfinished', () => {
        const texts = allBlocks.flatMap(block => (block.kind === 'paragraph' ? [block.text] : []))
        expect(texts).toContain('To block a user, click their username in your chat and select.')
        expect(texts).toContain(
            'To mute a user, simply click on their username within the chat and choose.',
        )
    })

    it('carries the reporting tip as a bold lead, not a hyphen bullet', () => {
        const leads = allBlocks.flatMap(block =>
            block.kind === 'paragraph' && block.lead ? [block.lead] : [],
        )
        expect(leads).toEqual(['Reporting Tip: '])
        for (const block of allBlocks) {
            // The lead renders straight against the text, so it has to carry its own
            // trailing space — and no paragraph may re-draw a bullet with a hyphen.
            if (block.kind !== 'paragraph') continue
            if (block.lead) expect(block.lead).toMatch(/ $/)
            expect(block.text).not.toMatch(/^-\s/)
        }
    })

    it('never repeats a paragraph — nothing here is boilerplate', () => {
        const texts = allBlocks.flatMap(block => (block.kind === 'paragraph' ? [block.text] : []))
        expect(new Set(texts).size).toBe(texts.length)
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
        expect(MODERATION_POLICY.effectiveDate).toBe('11 November 2024')
    })
})
