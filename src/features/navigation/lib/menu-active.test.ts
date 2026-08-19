import { PASSWORD_SETTINGS_PATH } from '@features/auth'
import { BLOCKED_ACCOUNTS_PATH, SPACE_VISIBILITY_PATH } from '@features/channel'
import { describe, expect, it } from 'vitest'
import { isPathActive, isViewActive } from './menu-active'

describe('isPathActive', () => {
    it('marks the row for the current page', () => {
        expect(isPathActive('/privacy', '/privacy')).toBe(true)
    })

    it('marks the row for a page inside it', () => {
        expect(isPathActive('/settings/space-visibility/edit', SPACE_VISIBILITY_PATH)).toBe(true)
    })

    it('does not match a sibling that merely starts the same', () => {
        // The bare-prefix bug: `/safety` must not claim `/safety-report`.
        expect(isPathActive('/safety-report', '/safety')).toBe(false)
    })

    it('never marks Home from a subtree — `/` is a prefix of everything', () => {
        expect(isPathActive('/privacy', '/')).toBe(false)
        expect(isPathActive('/', '/')).toBe(true)
    })

    it('does not match an unrelated route', () => {
        expect(isPathActive('/terms', '/privacy')).toBe(false)
    })
})

describe('isViewActive', () => {
    it('marks Other settings for each of its own destinations', () => {
        // Taken off `OTHER_SETTINGS_ROWS`, so a row added there is covered without a change here.
        for (const path of ['/privacy', '/terms', '/brand-assets', '/safety', '/moderation']) {
            expect(isViewActive(path, 'other-settings')).toBe(true)
        }
    })

    it('marks Privacy and security for all three of its destinations', () => {
        for (const path of [PASSWORD_SETTINGS_PATH, SPACE_VISIBILITY_PATH, BLOCKED_ACCOUNTS_PATH]) {
            expect(isViewActive(path, 'privacy-security')).toBe(true)
        }
    })

    it('marks a pushing row from a page inside one of its destinations', () => {
        expect(isViewActive('/settings/blocked-accounts/import', 'privacy-security')).toBe(true)
    })

    it('does not cross between the two screens', () => {
        expect(isViewActive('/privacy', 'privacy-security')).toBe(false)
        expect(isViewActive(PASSWORD_SETTINGS_PATH, 'other-settings')).toBe(false)
    })

    it('is false for a route no screen links to, and for the screens that own none', () => {
        expect(isViewActive('/identification', 'other-settings')).toBe(false)
        expect(isViewActive('/privacy', 'language')).toBe(false)
        expect(isViewActive('/privacy', 'appearance')).toBe(false)
        expect(isViewActive('/privacy', 'data-storage')).toBe(false)
        expect(isViewActive('/privacy', 'root')).toBe(false)
    })
})
