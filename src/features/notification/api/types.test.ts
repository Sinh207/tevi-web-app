import { describe, expect, it } from 'vitest'
import {
    type InboxMessage,
    inboxBody,
    inboxTitle,
    normalizeInboxMessages,
    normalizeInboxTypes,
    toInboxSettings,
} from './types'

/**
 * The boundary parse, pinned.
 *
 * Two of these are the failures this schema exists for and neither would throw:
 *
 * - `created_at` arriving as a **number**. The channel service answers epoch milliseconds as a JSON
 *   number, a string-only schema silently returned `null` for it, and a profile row dropped itself
 *   — for every channel, forever, with no error anywhere (see `nullableTimestamp` in
 *   `features/channel/api/types.ts`). This service has never been checked, so every form is
 *   accepted and every form is asserted.
 * - A row with **no id**. Every control on the row posts that id, so a row without one renders two
 *   buttons that 400. Legacy keys its rows `id || message_id` while sending only `id`, which means
 *   it renders exactly those rows.
 */
describe('normalizeInboxMessages', () => {
    it('returns an empty array for anything that is not a list', () => {
        for (const input of [null, undefined, {}, 'nope', 0]) {
            expect(normalizeInboxMessages(input)).toEqual([])
        }
    })

    it('drops a row with no usable id', () => {
        expect(normalizeInboxMessages([{ read: true }, { id: '', message_id: '' }])).toEqual([])
    })

    /** The only evidence `message_id` exists is legacy's row key. Preferred *after* `id`. */
    it('falls back to message_id, and prefers id when both are there', () => {
        expect(normalizeInboxMessages([{ message_id: 'm1' }])[0].id).toBe('m1')
        expect(normalizeInboxMessages([{ id: 'i1', message_id: 'm1' }])[0].id).toBe('i1')
    })

    it('normalises a numeric id to a string', () => {
        expect(normalizeInboxMessages([{ id: 42 }])[0].id).toBe('42')
    })

    it.each([
        ['epoch milliseconds', 1660516880264, '2022-08-14T22:41:20.264Z'],
        ['epoch seconds', 1660516880, '2022-08-14T22:41:20.000Z'],
        ['epoch as a string', '1660516880264', '2022-08-14T22:41:20.264Z'],
        ['an ISO string', '2022-08-14T22:41:20.264Z', '2022-08-14T22:41:20.264Z'],
    ])('reads created_at as %s', (_label, value, expected) => {
        expect(normalizeInboxMessages([{ id: '1', created_at: value }])[0].created_at).toBe(
            expected,
        )
    })

    it.each([null, '', 'not a date', 0, -1, {}])('nulls an unusable created_at (%o)', value => {
        expect(normalizeInboxMessages([{ id: '1', created_at: value }])[0].created_at).toBeNull()
    })

    /** `read` decides the tint, the dot and which way the kebab's first item reads. It must be a
     *  real boolean at the call site, never `undefined`. */
    it.each([
        [true, true],
        ['yes', true],
        [1, true],
        [undefined, false],
        [null, false],
        [false, false],
        ['', false],
    ])('coerces read=%o to %s', (value, expected) => {
        expect(normalizeInboxMessages([{ id: '1', read: value }])[0].read).toBe(expected)
    })

    /** A notification with neither title nor body is still a dated row the reader may want to
     *  clear, so it is kept and the row draws what it has. */
    it('keeps a row with no content at all', () => {
        const rows = normalizeInboxMessages([{ id: '1' }])
        expect(rows).toHaveLength(1)
        expect(inboxTitle(rows[0])).toBeNull()
        expect(inboxBody(rows[0])).toBeNull()
    })

    it('blanks whitespace-only text rather than rendering it', () => {
        const rows = normalizeInboxMessages([
            { id: '1', content: { title: '   ', body: 'Real body' } },
        ])
        expect(inboxTitle(rows[0])).toBeNull()
        expect(inboxBody(rows[0])).toBe('Real body')
    })

    /**
     * `looseObject`, so a field the platform adds tomorrow reaches a call site that asks for it
     * rather than being deleted here. This payload is the one most likely to grow — every new
     * notification kind arrives through it.
     */
    it('keeps unknown fields', () => {
        const rows = normalizeInboxMessages([{ id: '1', space_tier: { level: 3 } }])
        expect((rows[0] as InboxMessage & { space_tier?: unknown }).space_tier).toEqual({
            level: 3,
        })
    })

    it('keeps category and payload.type as open strings', () => {
        const rows = normalizeInboxMessages([
            {
                id: '1',
                category: 'a_category_this_client_has_never_seen',
                content: { payload: { type: 'a_type_it_has_not_either' } },
            },
        ])
        expect(rows[0].category).toBe('a_category_this_client_has_never_seen')
        expect(rows[0].content?.payload?.type).toBe('a_type_it_has_not_either')
    })
})

describe('normalizeInboxTypes', () => {
    it('drops a type with no id and keeps the rest', () => {
        const types = normalizeInboxTypes([
            { id: '', turn_on: true },
            { id: 't1', turn_on: true },
        ])
        expect(types.map(type => type.id)).toEqual(['t1'])
    })

    it('reads turn_on as a real boolean', () => {
        const types = normalizeInboxTypes([{ id: 't1' }, { id: 't2', turn_on: true }])
        expect(types.map(type => type.turn_on)).toEqual([false, true])
    })
})

/**
 * The read side spells the flag `turn_on` and the write side spells it `active`. That asymmetry is
 * the service's, and this is the one place it is translated — pinned here because a rename in either
 * direction would produce a Save that silently writes nothing.
 */
describe('toInboxSettings', () => {
    it('renames turn_on to active', () => {
        expect(
            toInboxSettings(normalizeInboxTypes([{ id: 't1', turn_on: true }, { id: 't2' }])),
        ).toEqual([
            { id: 't1', active: true },
            { id: 't2', active: false },
        ])
    })
})
