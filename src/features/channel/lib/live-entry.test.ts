import { describe, expect, it } from 'vitest'
import { isExternalArrival } from './live-entry'

const ORIGIN = 'https://tevi.com'
const at = (referrer: string, slug = 'ada') => isExternalArrival({ referrer, origin: ORIGIN, slug })

describe('isExternalArrival', () => {
    it('is external with no referrer — a pasted link, a QR, an app that strips it', () => {
        expect(at('')).toBe(true)
    })

    it('is external from another site', () => {
        expect(at('https://twitter.com/someone/status/1')).toBe(true)
        expect(at('https://tevi.com.evil.io/@ada')).toBe(true)
    })

    it('is **not** external when the reader just came back from this space', () => {
        // The case this exists for: pressing back out of the live must not throw them into it
        // again, which is a loop with no way out but closing the tab.
        expect(at('https://tevi.com/@ada')).toBe(false)
        expect(at('https://tevi.com/@ada/event/65556762')).toBe(false)
        expect(at('https://tevi.com/@ada?tab=media')).toBe(false)
    })

    it('matches the space whatever case or encoding the referrer used', () => {
        expect(at('https://tevi.com/@Ada')).toBe(false)
        expect(at('https://tevi.com/%40ada/event/1')).toBe(false)
        expect(at('https://tevi.com/@ada', '@ada')).toBe(false)
    })

    it('does not mistake a different space for this one', () => {
        expect(at('https://tevi.com/@adalovelace')).toBe(true)
        expect(at('https://tevi.com/@ada-2')).toBe(true)
    })

    it('treats our own other pages as external — the sharp edge of the rule', () => {
        expect(at('https://tevi.com/')).toBe(true)
        expect(at('https://tevi.com/search')).toBe(true)
    })

    it('does not throw on a referrer that is not a URL, or on a broken escape', () => {
        expect(at('not a url')).toBe(true)
        // `decodeURIComponent` throws on a lone `%` sequence; the path is still this space's.
        expect(at('https://tevi.com/@ada/event/%E0%A4%A')).toBe(false)
    })
})
