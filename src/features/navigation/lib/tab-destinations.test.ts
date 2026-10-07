import { describe, expect, it } from 'vitest'
import { isOwnSpacePath, isTabDestination, TAB_PATHS } from './tab-destinations'

/**
 * The rule a route group would normally enforce for free, pinned instead — because this one
 * cannot be a route group (see the module) and so has nothing structural stopping it from
 * drifting.
 */

const MINE = '/@ada'

describe('isTabDestination', () => {
    it('covers the tab destinations that are plain URLs', () => {
        for (const path of TAB_PATHS) {
            expect(isTabDestination(path, null)).toBe(true)
        }
        expect(TAB_PATHS).toContain('/')
        expect(TAB_PATHS).toContain('/my-space')
    })

    it('keeps the bar on your own channel — where My Space actually lands', () => {
        // `/my-space` is a redirect. If this were false the bar would flash on for the
        // redirect and off again the moment it resolved.
        expect(isTabDestination(MINE, MINE)).toBe(true)
    })

    it("drops it on somebody else's channel", () => {
        expect(isTabDestination('/@grace', MINE)).toBe(false)
    })

    it('drops it while the answer is unknown, rather than guessing yes', () => {
        // No account, no channel, or the fetch has not landed. Appearing late beats
        // appearing on a stranger's page and then vanishing.
        expect(isTabDestination(MINE, null)).toBe(false)
    })

    it('matches the handle case-insensitively', () => {
        expect(isTabDestination('/@ADA', MINE)).toBe(true)
        expect(isTabDestination(MINE, '/@ADA')).toBe(true)
    })

    it('leaves every sub-page alone', () => {
        for (const path of [
            '/settings/password',
            '/identification',
            '/privacy',
            '/terms',
            '/brand-assets',
        ]) {
            expect(isTabDestination(path, MINE)).toBe(false)
        }
    })

    it('does not treat a nested path under a destination as one', () => {
        // Prefix matching would put the bar back on every sub-page under `/@ada`.
        expect(isTabDestination('/@ada/settings', MINE)).toBe(false)
        expect(isTabDestination('/my-space/edit', MINE)).toBe(false)
    })
})

describe('isOwnSpacePath', () => {
    it('is the reader’s own space and its pages, and /my-space', () => {
        expect(isOwnSpacePath('/my-space', null)).toBe(true)
        expect(isOwnSpacePath('/@me', '/@me')).toBe(true)
        expect(isOwnSpacePath('/@Me', '/@me')).toBe(true)
        expect(isOwnSpacePath('/@me/post/abc', '/@me')).toBe(true)
    })

    // The bug this exists for: every space lit My Space.
    it('is not somebody else’s space', () => {
        expect(isOwnSpacePath('/@someone', '/@me')).toBe(false)
        expect(isOwnSpacePath('/@someone', null)).toBe(false)
        // A slug that merely starts with yours is a different space.
        expect(isOwnSpacePath('/@meow', '/@me')).toBe(false)
    })
})
