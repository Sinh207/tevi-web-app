import { describe, expect, it } from 'vitest'
import { formatConversationTime } from './conversation-time'

/* Local-time construction on purpose: "yesterday" and "this year" are calendar questions in the
   reader's own zone, and the formatter asks them that way. */
const NOW = new Date(2026, 8, 28, 12, 0, 0).getTime()
const MIN = 60_000
const HOUR = 60 * MIN

describe('formatConversationTime', () => {
    it('is empty for no time', () => {
        expect(formatConversationTime(null, 'en', NOW)).toBe('')
    })

    it('says now for under a minute, and for a clock slightly ahead of ours', () => {
        expect(formatConversationTime(NOW - 20_000, 'en', NOW)).toBe('now')
        expect(formatConversationTime(NOW + 5_000, 'en', NOW)).toBe('now')
    })

    it('counts minutes, then hours', () => {
        expect(formatConversationTime(NOW - 5 * MIN, 'en', NOW)).toBe('5 min. ago')
        expect(formatConversationTime(NOW - 3 * HOUR, 'en', NOW)).toBe('3 hr. ago')
    })

    /* Legacy's "minutes ago" key is translated as *seconds* in every locale; Intl has the unit. */
    it('says minutes in Vietnamese, not seconds', () => {
        expect(formatConversationTime(NOW - 40 * MIN, 'vi', NOW)).toContain('phút')
    })

    it('says yesterday for the calendar day before, once 24 hours have passed', () => {
        const yesterday = new Date(2026, 8, 27, 9, 0, 0).getTime()
        expect(formatConversationTime(yesterday, 'en', NOW)).toBe('yesterday')
    })

    it('names the weekday within a week, then the date', () => {
        const tuesday = new Date(2026, 8, 22, 9, 0, 0).getTime()
        expect(formatConversationTime(tuesday, 'en', NOW)).toBe('Tue')
        const march = new Date(2026, 2, 4, 9, 0, 0).getTime()
        expect(formatConversationTime(march, 'en', NOW)).toBe('Mar 4')
        const lastYear = new Date(2024, 2, 4, 9, 0, 0).getTime()
        expect(formatConversationTime(lastYear, 'en', NOW)).toBe('3/4/2024')
    })

    it('falls back to English for a locale tag Intl rejects', () => {
        expect(formatConversationTime(NOW - 5 * MIN, 'not a locale!', NOW)).toBe('5 min. ago')
    })
})
