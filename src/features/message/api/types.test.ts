import { describe, expect, it } from 'vitest'
import { normalizeConversations, parseChatActionFrame } from './types'

describe('normalizeConversations', () => {
    it('is empty for anything that is not an array', () => {
        expect(normalizeConversations(undefined)).toEqual([])
        expect(normalizeConversations({ results: [] })).toEqual([])
    })

    it('drops a row with no id — it could be neither keyed nor opened', () => {
        expect(normalizeConversations([{ recipient: {} }, { id: 5 }]).map(row => row.id)).toEqual([
            '5',
        ])
    })

    /* One malformed field costs that field, not the list. */
    it('survives wrong types field by field', () => {
        const [row] = normalizeConversations([
            {
                id: 'c',
                stats: { unread_messages: 'lots' },
                my_settings: { muted: 1 },
                latest_message: { id: 1, created_at: 'not a date', images: 'nope', seen_by: 3 },
                recipient: { name: '  ', space_tier: 'x' },
            },
        ])
        expect(row.stats?.unread_messages).toBe(0)
        expect(row.my_settings?.muted).toBe(true)
        expect(row.latest_message).toMatchObject({ created_at: null, images: [], seen_by: {} })
        expect(row.recipient?.name).toBeNull()
    })

    it('normalises created_at to epoch ms from ISO, seconds or ms', () => {
        const iso = '2026-09-28T12:00:00.000Z'
        const ms = Date.parse(iso)
        const rows = normalizeConversations([
            { id: 'a', latest_message: { id: 1, created_at: iso } },
            { id: 'b', latest_message: { id: 1, created_at: ms / 1000 } },
            { id: 'c', latest_message: { id: 1, created_at: ms } },
        ])
        expect(rows.map(row => row.latest_message?.created_at)).toEqual([ms, ms, ms])
    })

    it('treats a missing `active` as inactive, as legacy does', () => {
        const [row] = normalizeConversations([{ id: 'a', recipient: { name: 'Ada' } }])
        expect(row.recipient?.active).toBe(false)
    })
})

describe('parseChatActionFrame', () => {
    it('reads a typing frame', () => {
        expect(parseChatActionFrame({ conversation_id: 9, action: 'TYPING' })).toEqual({
            conversationId: '9',
            action: 'TYPING',
        })
    })

    it('reads an unknown action as NONE, which clears rather than sticks', () => {
        expect(parseChatActionFrame({ conversation_id: 'c', action: 'RECORDING' })?.action).toBe(
            'NONE',
        )
    })

    it('is null without a conversation', () => {
        expect(parseChatActionFrame({ action: 'TYPING' })).toBeNull()
        expect(parseChatActionFrame(null)).toBeNull()
    })
})
