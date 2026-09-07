import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { InboxMessage } from '../api/types'
import {
    clearInbox,
    INBOX_FIRST_PAGE,
    INBOX_PAGE_SIZE,
    INBOX_UNREAD_PAGE,
    type InboxPage,
    markInboxAllRead,
    nextInboxCursor,
    removeInboxMessage,
    setInboxRead,
} from './inbox-page'

/**
 * The paging stop condition and the three cache writes.
 *
 * The generic rules are `shared/lib/api/paged-list.ts`'s and are pinned there already, so what is
 * asserted here is this list's own wiring plus the two writes no other list has. Both of those fail
 * *quietly*: a read flag written to the wrong page leaves a row tinted after it was opened, and a
 * write that returns a fresh object for a no-op re-renders every row on the screen on every press.
 */

function message(id: string, read = false): InboxMessage {
    return {
        id,
        message_id: null,
        read,
        created_at: null,
        icon: null,
        category: null,
        content: null,
    } as InboxMessage
}

function data(...pages: InboxPage[]): InfiniteData<InboxPage, PageCursor | null> {
    return { pages, pageParams: pages.map(() => null) }
}

const page = (rows: InboxMessage[], count = rows.length): InboxPage => ({
    results: rows,
    count,
    next: null,
})

describe('cursors', () => {
    it('asks for legacy’s page size on the first page', () => {
        expect(INBOX_FIRST_PAGE).toEqual({ page: ['1'], page_size: [String(INBOX_PAGE_SIZE)] })
    })

    /** One row, not zero: `page_size=0` is a request for the paginator's *default* size on some DRF
     *  configurations and an error on others, and neither is worth discovering on a navbar dot. */
    it('asks for exactly one row for the unread count', () => {
        expect(INBOX_UNREAD_PAGE).toEqual({ page: ['1'], page_size: ['1'] })
    })

    /** `undefined` is what stops TanStack Query; `null` is a legitimate page param and would leave
     *  `hasNextPage` true forever, re-firing the sentinel against a list with nothing left. */
    it('stops on a short page', () => {
        expect(nextInboxCursor(page([message('1')]), INBOX_FIRST_PAGE)).toBeUndefined()
    })

    it('counts on from the cursor that produced a full page', () => {
        const full = page(
            Array.from({ length: INBOX_PAGE_SIZE }, (_, i) => message(String(i))),
            60,
        )
        expect(nextInboxCursor({ ...full, next: undefined }, INBOX_FIRST_PAGE)).toEqual({
            page: ['2'],
            page_size: [String(INBOX_PAGE_SIZE)],
        })
    })

    /** Authoritative and checked first, so an exact multiple of the page size does not cost a
     *  request that comes back empty. */
    it('trusts an explicit next: null over a full page', () => {
        const full = page(
            Array.from({ length: INBOX_PAGE_SIZE }, (_, i) => message(String(i))),
            INBOX_PAGE_SIZE,
        )
        expect(nextInboxCursor(full, INBOX_FIRST_PAGE)).toBeUndefined()
    })
})

describe('setInboxRead', () => {
    it('flips the flag on the row that has it, in whichever page holds it', () => {
        const before = data(page([message('1')]), page([message('2')]))
        const after = setInboxRead(before, '2', true)
        expect(after?.pages[0].results[0].read).toBe(false)
        expect(after?.pages[1].results[0].read).toBe(true)
    })

    it('flips back to unread too', () => {
        const after = setInboxRead(data(page([message('1', true)])), '1', false)
        expect(after?.pages[0].results[0].read).toBe(false)
    })

    /**
     * The **same object** when nothing changes, so `setQueryData` does not re-render every
     * subscriber for a write that wrote nothing. On this screen that is the common case, not an
     * edge one: pressing an already-read notification calls this unconditionally.
     */
    it('returns the same object for a row already in that state, or a row it does not hold', () => {
        const before = data(page([message('1', true)]))
        expect(setInboxRead(before, '1', true)).toBe(before)
        expect(setInboxRead(before, 'nope', false)).toBe(before)
        expect(setInboxRead(undefined, '1', true)).toBeUndefined()
    })

    /** `count` is the server's total and a read notification is still a notification. */
    it('leaves the total alone', () => {
        const after = setInboxRead(data(page([message('1')], 57)), '1', true)
        expect(after?.pages[0].count).toBe(57)
    })
})

describe('markInboxAllRead', () => {
    it('marks every loaded row across every page', () => {
        const after = markInboxAllRead(
            data(page([message('1'), message('2', true)]), page([message('3')])),
        )
        expect(after?.pages.flatMap(p => p.results).every(row => row.read)).toBe(true)
    })

    it('keeps the rows — a read notification is still a notification', () => {
        const after = markInboxAllRead(data(page([message('1'), message('2')])))
        expect(after?.pages[0].results).toHaveLength(2)
        expect(after?.pages[0].count).toBe(2)
    })

    it('returns the same object when everything is already read', () => {
        const before = data(page([message('1', true)]))
        expect(markInboxAllRead(before)).toBe(before)
    })
})

describe('removeInboxMessage', () => {
    it('drops the row and takes the total down with it', () => {
        const after = removeInboxMessage(data(page([message('1'), message('2')], 57)), '1')
        expect(after?.pages[0].results.map(row => row.id)).toEqual(['2'])
        expect(after?.pages[0].count).toBe(56)
    })

    it('returns the same object for a row it does not hold', () => {
        const before = data(page([message('1')]))
        expect(removeInboxMessage(before, 'nope')).toBe(before)
    })
})

describe('clearInbox', () => {
    /**
     * Keeps **one** page rather than emptying the array: dropping every page puts the query back
     * into `isLoading` and flashes the skeleton over a list that is about to be repopulated.
     */
    it('collapses to a single empty page', () => {
        const after = clearInbox(data(page([message('1')], 57), page([message('2')], 57)))
        expect(after?.pages).toHaveLength(1)
        expect(after?.pages[0]).toEqual({ results: [], count: 0, next: null })
        expect(after?.pageParams).toHaveLength(1)
    })
})
