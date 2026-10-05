import { describe, expect, it } from 'vitest'
import { normalizeConversations } from '../api/types'
import {
    type ConversationData,
    cursorFromNextUrl,
    markConversationSeen,
    removeConversation,
} from './conversation-page'

function data(...pages: { id: string; unread?: number }[][]): ConversationData {
    return {
        pageParams: pages.map((_, index) => (index === 0 ? null : { cursor: String(index) })),
        pages: pages.map(rows => ({
            results: normalizeConversations(
                rows.map(row => ({ id: row.id, stats: { unread_messages: row.unread ?? 0 } })),
            ),
            next: undefined,
            count: rows.length,
        })),
    }
}

describe('cursorFromNextUrl', () => {
    it('replays the query string of a relative next_url, as legacy does', () => {
        expect(
            cursorFromNextUrl(
                '/messenger/v2/rpc/get_recent_conversations/?limit=20&filter=ALL&cursor=abc%3D',
            ),
        ).toEqual({ limit: '20', filter: 'ALL', cursor: 'abc=' })
    })

    it('reads an absolute next_url the same way — only the query matters', () => {
        expect(cursorFromNextUrl('https://api.tevi.com/x?cursor=2')).toEqual({ cursor: '2' })
    })

    /*
     * The one that matters: an empty query replayed is the *first* page again, so a list whose
     * last `next_url` carries no parameters would re-request page one forever.
     */
    it.each([null, undefined, '', '   ', '/messenger/v2/rpc/get_recent_conversations/', 42])(
        'is the last page for %j',
        value => {
            expect(cursorFromNextUrl(value)).toBeUndefined()
        },
    )
})

describe('removeConversation', () => {
    it('takes the row out of whichever page holds it, and the count with it', () => {
        const next = removeConversation(data([{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]), 'c')
        expect(next?.pages.map(page => page.results.map(row => row.id))).toEqual([['a', 'b'], []])
        expect(next?.pages[1].count).toBe(0)
    })

    it('returns the same object when the row is not loaded', () => {
        const before = data([{ id: 'a' }])
        expect(removeConversation(before, 'zzz')).toBe(before)
    })
})

describe('markConversationSeen', () => {
    it('zeroes one row and leaves the rest', () => {
        const next = markConversationSeen(
            data([
                { id: 'a', unread: 3 },
                { id: 'b', unread: 2 },
            ]),
            'a',
        )
        expect(next?.pages[0].results.map(row => row.stats?.unread_messages)).toEqual([0, 2])
    })

    it('returns the same object for a row that is already read', () => {
        const before = data([{ id: 'a', unread: 0 }])
        expect(markConversationSeen(before, 'a')).toBe(before)
    })
})
