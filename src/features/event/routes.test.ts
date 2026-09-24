import { describe, expect, it } from 'vitest'
import { eventPath } from './routes'

describe('eventPath', () => {
    it('is legacy s URL, which every share link and QR already points at', () => {
        expect(eventPath('ada', 'evt-1')).toBe('/@ada/event/evt-1')
    })

    /** Every payload in this app carries the slug without the `@`, so the sigil is added here. */
    it('adds the leading @ and does not double it', () => {
        expect(eventPath('@ada', 'evt-1')).toBe('/@ada/event/evt-1')
    })

    /**
     * Not decoration: a slug is chosen by its owner and a code is minted by the backend, so neither
     * is guaranteed URL-safe — and a raw `#` or `?` would silently truncate the path.
     */
    it('percent-encodes both segments', () => {
        expect(eventPath('a da', 'evt 1')).toBe('/@a%20da/event/evt%201')
        expect(eventPath('a#d', 'e?1')).toBe('/@a%23d/event/e%3F1')
    })
})
