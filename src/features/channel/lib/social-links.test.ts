import { describe, expect, it } from 'vitest'
import { detectPlatform, isRepeatablePlatform, isWebLink, SOCIAL_ICON } from './social-links'

const AVAILABLE = ['x', 'youtube', 'tiktok', 'telegram', 'spotify', 'website', 'custom_link']

describe('detectPlatform', () => {
    it('recognises the host people actually paste', () => {
        expect(detectPlatform('https://x.com/ada', AVAILABLE)).toBe('x')
        expect(detectPlatform('https://www.tiktok.com/@ada', AVAILABLE)).toBe('tiktok')
        expect(detectPlatform('https://t.me/ada', AVAILABLE)).toBe('telegram')
    })

    /** One entry covers every subdomain — `open.spotify.com`, `m.youtube.com`, `music.…`. */
    it('matches a subdomain of a known host', () => {
        expect(detectPlatform('https://open.spotify.com/artist/1', AVAILABLE)).toBe('spotify')
        expect(detectPlatform('https://m.youtube.com/@ada', AVAILABLE)).toBe('youtube')
    })

    /** Twitter's old host is the same platform, and the DS draws one mark for both. */
    it('folds twitter.com into x', () => {
        expect(detectPlatform('https://twitter.com/ada', AVAILABLE)).toBe('x')
        expect(SOCIAL_ICON.twitter).toBe(SOCIAL_ICON.x)
    })

    /**
     * The guard that keeps the picker honest: a detection the server did not offer would set the
     * `<select>` to a value it has no option for, which renders as blank.
     */
    it('is null when the backend does not offer that platform', () => {
        expect(detectPlatform('https://github.com/ada', AVAILABLE)).toBeNull()
    })

    it('is null for an unknown host or an unparseable value', () => {
        expect(detectPlatform('https://ada.dev', AVAILABLE)).toBeNull()
        expect(detectPlatform('not a url', AVAILABLE)).toBeNull()
        expect(detectPlatform('', AVAILABLE)).toBeNull()
    })

    /** A lookalike host must not be claimed: `x.com.evil.example` is not X. */
    it('does not match a host that merely contains a known one', () => {
        expect(detectPlatform('https://x.com.evil.example/ada', AVAILABLE)).toBeNull()
        expect(detectPlatform('https://notx.com/ada', AVAILABLE)).toBeNull()
    })
})

describe('isRepeatablePlatform', () => {
    it('allows several generic links and only those', () => {
        expect(isRepeatablePlatform('website')).toBe(true)
        expect(isRepeatablePlatform('custom_link')).toBe(true)
        expect(isRepeatablePlatform('x')).toBe(false)
    })

    it('is the web-link rule, not a second list to keep in step', () => {
        for (const platform of ['website', 'custom_link', 'x', 'youtube']) {
            expect(isRepeatablePlatform(platform)).toBe(isWebLink(platform))
        }
    })
})
