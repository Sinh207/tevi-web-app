import { describe, expect, it } from 'vitest'
import { isOwnReply, normalizeReplies, normalizeReply, type Reply } from '../api/reply-types'
import { replyMenuVisibility, replyReactionCost } from './reply-access'

/**
 * Built from the **measured** payload — one real row off `wapi.tevi.dev`, trimmed. The point of
 * going through the parser is that a fixture cannot assert a shape the parser would never produce,
 * which is precisely how the previous reading (a reply is a post) survived.
 */
function reply(overrides: Record<string, unknown> = {}): Reply {
    const parsed = normalizeReply({
        id: 'r1',
        post_id: 'p1',
        parent_id: null,
        text: 'nice',
        owner: { id: '3544332405', display_name: 'Testing123' },
        owner_channel: { id: 'ch-1', slug: 'h6h6h6', name: 'Testing123' },
        post_channel: {
            id: 'ch-1',
            slug: 'h6h6h6',
            owner_id: 3544332405,
            paid_interaction_enabled: true,
            paid_interaction_cost: 1,
        },
        reaction_count: 0,
        reply_count: 3,
        ...overrides,
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

/** A stranger's reply under a stranger's post — the only case where anybody pays. */
const STRANGER = {
    owner: { id: '999', display_name: 'Someone' },
    post_channel: {
        id: 'ch-1',
        owner_id: '111',
        paid_interaction_enabled: true,
        paid_interaction_cost: 5,
    },
}

describe('the reply schema', () => {
    /**
     * The whole reason this file exists. A reply's author is `owner_channel`; parsed as a post it
     * has no `channel` at all, which is why every row rendered anonymous.
     */
    it('reads the author from owner_channel, not channel', () => {
        const parsed = reply()
        expect(parsed.owner_channel?.slug).toBe('h6h6h6')
        expect((parsed as Record<string, unknown>).channel).toBeUndefined()
    })

    it('keeps post_id and parent_id apart — the second is what makes a reply a child', () => {
        expect(reply().parent_id).toBe(null)
        expect(reply({ parent_id: 'r1' }).parent_id).toBe('r1')
    })

    it('normalises the numeric owner_id the services disagree about', () => {
        expect(reply().post_channel?.owner_id).toBe('3544332405')
    })

    it('drops a row that will not parse rather than the page', () => {
        expect(normalizeReplies([{ id: 'ok' }, null, 42]).map(r => r.id)).toEqual(['ok'])
        expect(normalizeReplies(undefined)).toEqual([])
    })
})

describe('isOwnReply — derived, because the payload carries no is_owner', () => {
    it('compares across the string/number split (B11)', () => {
        expect(isOwnReply(reply(), 3544332405)).toBe(true)
        expect(isOwnReply(reply(), '3544332405')).toBe(true)
    })

    it('is false for anybody else, and for a guest', () => {
        expect(isOwnReply(reply(), '999')).toBe(false)
        expect(isOwnReply(reply(), null)).toBe(false)
    })

    /** A row with no owner is owned by nobody — never by whoever is reading it. */
    it('is false when the row carries no owner', () => {
        expect(isOwnReply(reply({ owner: null }), '3544332405')).toBe(false)
    })
})

describe('replyReactionCost — legacy applies four exemptions and so does this', () => {
    it('charges a stranger on a charging space', () => {
        expect(replyReactionCost(reply(STRANGER), { userId: '42', isPremiumReader: false })).toBe(5)
    })

    it('exempts a Premium reader', () => {
        expect(replyReactionCost(reply(STRANGER), { userId: '42', isPremiumReader: true })).toBe(
            null,
        )
    })

    it("exempts the reply's own author", () => {
        expect(replyReactionCost(reply(STRANGER), { userId: '999', isPremiumReader: false })).toBe(
            null,
        )
    })

    /** A creator reading their own post's replies must not be charged to acknowledge each one. */
    it("exempts the post's owner", () => {
        expect(replyReactionCost(reply(STRANGER), { userId: '111', isPremiumReader: false })).toBe(
            null,
        )
    })

    it('is free where the space does not charge, and where the price is zero', () => {
        const off = {
            ...STRANGER,
            post_channel: { ...STRANGER.post_channel, paid_interaction_enabled: false },
        }
        const zero = {
            ...STRANGER,
            post_channel: { ...STRANGER.post_channel, paid_interaction_cost: 0 },
        }
        expect(replyReactionCost(reply(off), { userId: '42', isPremiumReader: false })).toBe(null)
        expect(replyReactionCost(reply(zero), { userId: '42', isPremiumReader: false })).toBe(null)
    })

    /**
     * The price is the **parent post's** space, never the author's own — crediting `owner_channel`
     * would pay whoever wrote the reply out of the reader's balance.
     */
    it('ignores the author channel entirely', () => {
        const row = reply({
            ...STRANGER,
            owner_channel: {
                id: 'other',
                slug: 'other',
                paid_interaction_enabled: true,
                paid_interaction_cost: 99,
            },
        })
        expect(replyReactionCost(row, { userId: '42', isPremiumReader: false })).toBe(5)
    })
})

describe('replyMenuVisibility', () => {
    it('offers Delete to the author', () => {
        expect(replyMenuVisibility(reply(STRANGER), { userId: '999' }).delete).toBe(true)
    })

    /** Moderation on one's own page — legacy renders the row for the post owner too. */
    it("offers Delete to the post's owner", () => {
        expect(replyMenuVisibility(reply(STRANGER), { userId: '111' }).delete).toBe(true)
    })

    it('offers nothing to anybody else, or to a guest', () => {
        expect(replyMenuVisibility(reply(STRANGER), { userId: '42' }).delete).toBe(false)
        expect(replyMenuVisibility(reply(STRANGER), { userId: null }).delete).toBe(false)
    })

    it('offers nothing on a deleted reply, even to its author', () => {
        expect(
            replyMenuVisibility(reply({ ...STRANGER, deleted: true }), { userId: '999' }).delete,
        ).toBe(false)
    })
})
