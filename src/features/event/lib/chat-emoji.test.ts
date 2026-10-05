import { describe, expect, it } from 'vitest'
import {
    CHAT_EMOJI,
    EMOJI_SUGGESTION_LIMIT,
    findColonQuery,
    foldForSearch,
    searchChatEmoji,
} from './chat-emoji'

describe('findColonQuery', () => {
    it('opens on a bare colon at the start or after a space', () => {
        expect(findColonQuery(':', 1)).toEqual({ start: 0, query: '' })
        expect(findColonQuery('hi :', 4)).toEqual({ start: 3, query: '' })
    })

    it('carries what is typed after the colon, up to the caret', () => {
        expect(findColonQuery('so :fi', 6)).toEqual({ start: 3, query: 'fi' })
        // The caret, not the end of the text, bounds the query.
        expect(findColonQuery('so :fire is', 6)).toEqual({ start: 3, query: 'fi' })
    })

    it('never opens inside a word — times, links, labels', () => {
        expect(findColonQuery('10:30', 5)).toBeNull()
        expect(findColonQuery('https://x', 9)).toBeNull()
        expect(findColonQuery('Note:', 5)).toBeNull()
    })

    it('closes the moment the query stops being a word', () => {
        expect(findColonQuery(':)', 2)).toBeNull()
        expect(findColonQuery(':fire ', 6)).toBeNull()
    })

    it('reads Vietnamese letters as letters', () => {
        expect(findColonQuery(':cười', 5)).toEqual({ start: 0, query: 'cười' })
    })
})

describe('searchChatEmoji', () => {
    it('offers the popular row for an empty query', () => {
        expect(searchChatEmoji('')).toEqual(CHAT_EMOJI.slice(0, EMOJI_SUGGESTION_LIMIT))
    })

    it('ranks an exact name, then a prefix, then a substring', () => {
        const chars = searchChatEmoji('heart').map(e => e.char)
        expect(chars[0]).toBe('❤️')
        expect(chars).toContain('😍') // heart_eyes
    })

    it('finds by Vietnamese keyword, accents or not', () => {
        expect(searchChatEmoji('cuoi')[0].char).toBe('😂')
        expect(searchChatEmoji('cười')[0].char).toBe('😂')
        expect(searchChatEmoji('CƯỜI')[0].char).toBe('😂')
    })

    it('treats a hyphen as the underscore shortcodes use', () => {
        expect(searchChatEmoji('broken-heart')[0].char).toBe('💔')
    })

    it('returns nothing for a query nothing matches', () => {
        expect(searchChatEmoji('zzzz')).toEqual([])
    })
})

describe('foldForSearch', () => {
    it('folds đ, which NFD does not decompose', () => {
        expect(foldForSearch('Đẹp')).toBe('dep')
    })
})
