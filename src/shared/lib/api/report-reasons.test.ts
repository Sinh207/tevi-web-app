import { describe, expect, it } from 'vitest'
import { normalizeReasons, reasonLabelKey } from './report-reasons'

describe('normalizeReasons', () => {
    it('keeps the backend’s order — a moderation list is ranked, not alphabetical', () => {
        const rows = normalizeReasons([
            { type: 'CHANNEL_SPAM', text: 'Spam' },
            { type: 'CHANNEL_SEXUAL_CONTENT', text: 'Sexual content' },
        ])
        expect(rows.map(r => r.type)).toEqual(['CHANNEL_SPAM', 'CHANNEL_SEXUAL_CONTENT'])
    })

    /**
     * A row with no `type` could be displayed but not *submitted*, so it is dropped: a radio that
     * cannot be chosen is worse than a shorter list. The list itself survives — one odd reason must
     * not turn into "this cannot be reported".
     */
    it('drops a row that could not be filed, and keeps the rest', () => {
        const rows = normalizeReasons([
            { type: 'CHANNEL_SPAM', text: 'Spam' },
            { text: 'no type at all' },
            { type: '', text: 'blank type' },
            { type: 'CHANNEL_OTHER', text: 'Other' },
        ])
        expect(rows.map(r => r.type)).toEqual(['CHANNEL_SPAM', 'CHANNEL_OTHER'])
    })

    it('answers an empty list for a body that is not an array', () => {
        expect(normalizeReasons(undefined)).toEqual([])
        expect(normalizeReasons(null)).toEqual([])
        expect(normalizeReasons({ results: [] })).toEqual([])
    })

    it('keeps a reason whose wording is missing — the id is what gets filed', () => {
        const [row] = normalizeReasons([{ type: 'CHANNEL_SPAM' }])
        expect(row).toEqual({ type: 'CHANNEL_SPAM', text: '' })
    })

    it('keeps unknown fields, since the backend ships more than this shape models', () => {
        const [row] = normalizeReasons([{ type: 'CHANNEL_SPAM', text: 'Spam', order: 3 }])
        expect(row).toMatchObject({ type: 'CHANNEL_SPAM', order: 3 })
    })
})

describe('reasonLabelKey', () => {
    it('strips the surface namespace, because the copy is not namespaced', () => {
        expect(
            reasonLabelKey('CHANNEL_SEXUAL_CONTENT', {
                keyPrefix: 'channel_report_reason',
                stripPrefix: ['CHANNEL_'],
            }),
        ).toBe('channel_report_reason_sexual_content')
    })

    /**
     * B111: the post and comment lists are expected to namespace their ids differently. Taking a
     * list means one surface whose endpoint is inconsistent needs no second function.
     */
    it('accepts several namespaces for one surface', () => {
        const options = { keyPrefix: 'post_report_reason', stripPrefix: ['POST_', 'REPLY_'] }
        expect(reasonLabelKey('POST_SPAM', options)).toBe('post_report_reason_spam')
        expect(reasonLabelKey('REPLY_SPAM', options)).toBe('post_report_reason_spam')
    })

    it('leaves an id that carries no known namespace alone', () => {
        expect(
            reasonLabelKey('SOMETHING_NEW', {
                keyPrefix: 'post_report_reason',
                stripPrefix: ['POST_'],
            }),
        ).toBe('post_report_reason_something_new')
    })

    it('needs no stripPrefix at all', () => {
        expect(reasonLabelKey('SPAM', { keyPrefix: 'post_report_reason' })).toBe(
            'post_report_reason_spam',
        )
    })
})
