import { describe, expect, it } from 'vitest'
import type { MessagePage } from '../api/message-api'
import { normalizeMessages } from '../api/types'
import {
    flattenThread,
    formatDayLabel,
    groupByDay,
    isOwnMessage,
    mergeNewest,
    removeMessage,
    splitLinks,
    type ThreadData,
    upsertMessage,
} from './message-thread'

const T0 = new Date(2026, 8, 28, 10, 0, 0).getTime()

function msgs(...rows: { id: string; at: number; text?: string }[]) {
    return normalizeMessages(
        rows.map(row => ({ id: row.id, created_at: row.at, text: row.text ?? row.id })),
    )
}

function thread(...pages: ReturnType<typeof msgs>[]): ThreadData {
    return {
        pages: pages.map((results, index) => ({
            results,
            next: index < pages.length - 1 ? { cursor: String(index + 1) } : undefined,
        })),
        pageParams: pages.map((_, index) => (index === 0 ? null : { cursor: String(index) })),
    }
}

describe('flattenThread', () => {
    it('orders oldest first across pages, whatever order each page came in', () => {
        const data = thread(
            msgs({ id: 'c', at: T0 + 3 }, { id: 'd', at: T0 + 4 }),
            msgs({ id: 'b', at: T0 + 2 }, { id: 'a', at: T0 + 1 }),
        )
        expect(flattenThread(data).map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('keeps one copy per id — the newer page wins', () => {
        const data = thread(
            msgs({ id: 'x', at: T0, text: 'edited' }),
            msgs({ id: 'x', at: T0, text: 'original' }),
        )
        const flat = flattenThread(data)
        expect(flat).toHaveLength(1)
        expect(flat[0].text).toBe('edited')
    })
})

describe('upsertMessage', () => {
    it('replaces a loaded message in place (an edit)', () => {
        const data = thread(msgs({ id: 'a', at: T0, text: 'old' }))
        const [edited] = msgs({ id: 'a', at: T0, text: 'new' })
        expect(flattenThread(upsertMessage(data, edited)).map(m => m.text)).toEqual(['new'])
    })

    /* The same message arriving twice — this client's own send, then the socket — is one row. */
    it('is idempotent by id', () => {
        const [sent] = msgs({ id: 'n', at: T0 + 9 })
        const once = upsertMessage(thread(msgs({ id: 'a', at: T0 })), sent)
        const twice = upsertMessage(once, sent)
        expect(flattenThread(twice).map(m => m.id)).toEqual(['a', 'n'])
    })

    it('starts a thread when nothing is loaded yet', () => {
        const [first] = msgs({ id: 'a', at: T0 })
        expect(flattenThread(upsertMessage(undefined, first)).map(m => m.id)).toEqual(['a'])
    })
})

describe('mergeNewest', () => {
    /* Replacing page one wholesale would drop messages that fell off the fresh page but are still
       newer than page two's cursor — a hole in the middle of the conversation. */
    it('folds a fresh newest page in without opening a gap', () => {
        const data = thread(
            msgs({ id: 'b', at: T0 + 2 }, { id: 'c', at: T0 + 3 }),
            msgs({ id: 'a', at: T0 + 1 }),
        )
        const fresh: MessagePage = {
            results: msgs({ id: 'c', at: T0 + 3, text: 'seen' }, { id: 'd', at: T0 + 4 }),
            next: undefined,
        }
        const merged = flattenThread(mergeNewest(data, fresh))
        expect(merged.map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
        expect(merged.find(m => m.id === 'c')?.text).toBe('seen')
    })

    it('keeps the older pages and their cursors untouched', () => {
        const data = thread(msgs({ id: 'b', at: T0 + 2 }), msgs({ id: 'a', at: T0 + 1 }))
        const next = mergeNewest(data, {
            results: msgs({ id: 'c', at: T0 + 3 }),
            next: { cursor: 'z' },
        })
        expect(next?.pages[1]).toBe(data?.pages[1])
        expect(next?.pages[0].next).toEqual(data?.pages[0].next)
    })
})

describe('removeMessage', () => {
    it('drops the message from whichever page holds it', () => {
        const data = thread(msgs({ id: 'b', at: T0 + 2 }), msgs({ id: 'a', at: T0 + 1 }))
        expect(flattenThread(removeMessage(data, 'a')).map(m => m.id)).toEqual(['b'])
    })

    it('returns the same object when the id is not loaded', () => {
        const data = thread(msgs({ id: 'a', at: T0 }))
        expect(removeMessage(data, 'zzz')).toBe(data)
    })
})

describe('isOwnMessage', () => {
    const [mine] = normalizeMessages([{ id: 'm', sender: { alias: 11, channel_slug: 'me' } }])
    const [theirs] = normalizeMessages([{ id: 't', sender: { alias: 22, channel_slug: 'them' } }])

    it('decides by alias when both sides have one', () => {
        expect(isOwnMessage(mine, { alias: '11', slug: null })).toBe(true)
        expect(isOwnMessage(theirs, { alias: '11', slug: 'them' })).toBe(false)
    })

    /* Legacy's only rule, and the one that fails for an account with no space yet. */
    it('falls back to the space slug when the alias is unknown', () => {
        expect(isOwnMessage(mine, { alias: null, slug: 'me' })).toBe(true)
        expect(isOwnMessage(mine, { alias: null, slug: null })).toBe(false)
    })
})

describe('groupByDay', () => {
    it('groups by the reader’s calendar day, in order', () => {
        const days = groupByDay(
            msgs(
                { id: 'a', at: new Date(2026, 8, 27, 23, 50).getTime() },
                { id: 'b', at: new Date(2026, 8, 28, 0, 10).getTime() },
                { id: 'c', at: new Date(2026, 8, 28, 9, 0).getTime() },
            ),
        )
        expect(days.map(day => day.messages.map(m => m.id))).toEqual([['a'], ['b', 'c']])
    })
})

describe('formatDayLabel', () => {
    it('says today and yesterday, then the date', () => {
        const now = new Date(2026, 8, 28, 12).getTime()
        expect(formatDayLabel(new Date(2026, 8, 28, 8).getTime(), 'en', now)).toBe('Today')
        expect(formatDayLabel(new Date(2026, 8, 27, 8).getTime(), 'en', now)).toBe('Yesterday')
        expect(formatDayLabel(new Date(2026, 2, 4, 8).getTime(), 'en', now)).toBe('March 4, 2026')
    })
})

describe('splitLinks', () => {
    it('finds http(s) links and leaves the rest as text', () => {
        expect(splitLinks('see https://tevi.com/@ada now')).toEqual([
            { kind: 'text', value: 'see ' },
            { kind: 'link', value: 'https://tevi.com/@ada', href: 'https://tevi.com/@ada' },
            { kind: 'text', value: ' now' },
        ])
    })

    it('does not swallow the full stop that ends the sentence', () => {
        const parts = splitLinks('Go to https://example.com.')
        expect(parts[1]).toMatchObject({ kind: 'link', href: 'https://example.com' })
        expect(parts[2]).toEqual({ kind: 'text', value: '.' })
    })

    /* Only http(s) is ever a link; everything else stays inert text. */
    it('never links javascript: or data:', () => {
        expect(
            splitLinks('javascript:alert(1) data:text/html,x').every(p => p.kind === 'text'),
        ).toBe(true)
    })
})
