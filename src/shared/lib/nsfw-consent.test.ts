// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearNsfwConsent,
    grantNsfwConsent,
    hasNsfwConsent,
    revokeNsfwConsent,
} from './nsfw-consent'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('nsfw consent', () => {
    it('remembers one space for one account', () => {
        grantNsfwConsent('ada', 'acct-1')

        expect(hasNsfwConsent('ada', 'acct-1')).toBe(true)
        // Per space: agreeing to one creator is not agreeing to every creator.
        expect(hasNsfwConsent('grace', 'acct-1')).toBe(false)
        // Per account: this app holds up to ten at once, and consent is a person's answer.
        expect(hasNsfwConsent('ada', 'acct-2')).toBe(false)
    })

    it('answers no without an account, and files nothing', () => {
        // The bootstrap window. A consent written under a placeholder cannot be read back under the
        // real id, so it is not written at all — `useNsfwGate` holds it until the id arrives.
        grantNsfwConsent('ada', '')

        expect(hasNsfwConsent('ada', '')).toBe(false)
        expect(localStorage.length).toBe(0)
    })

    it('forgets an answer that has gone stale', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        grantNsfwConsent('ada', 'acct-1')

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 89 * DAY)
        expect(hasNsfwConsent('ada', 'acct-1')).toBe(true)

        // "Yes, I am over 18", answered once, should not still answer for a device a year later.
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 91 * DAY)
        expect(hasNsfwConsent('ada', 'acct-1')).toBe(false)
    })

    it('does not grow without bound — expired entries go on the next write', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        grantNsfwConsent('old', 'acct-1')

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 100 * DAY)
        grantNsfwConsent('new', 'acct-1')

        const stored = JSON.parse(localStorage.getItem('tevi.channel.nsfw_confirmed') ?? '{}')
        expect(Object.keys(stored['acct-1'])).toEqual(['new'])
    })

    it('caps one account at 200, keeping the most recent', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        for (let i = 0; i < 205; i++) {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + i * 1000)
            grantNsfwConsent(`space-${i}`, 'acct-1')
        }

        const stored = JSON.parse(localStorage.getItem('tevi.channel.nsfw_confirmed') ?? '{}')
        expect(Object.keys(stored['acct-1'])).toHaveLength(200)
        expect(hasNsfwConsent('space-204', 'acct-1')).toBe(true)
        expect(hasNsfwConsent('space-0', 'acct-1')).toBe(false)
    })

    it('drops one account without touching another — what sign-out relies on', () => {
        grantNsfwConsent('ada', 'acct-1')
        grantNsfwConsent('ada', 'acct-2')

        clearNsfwConsent('acct-1')

        expect(hasNsfwConsent('ada', 'acct-1')).toBe(false)
        expect(hasNsfwConsent('ada', 'acct-2')).toBe(true)
    })

    it('revokes one space', () => {
        grantNsfwConsent('ada', 'acct-1')
        grantNsfwConsent('grace', 'acct-1')

        revokeNsfwConsent('ada', 'acct-1')

        expect(hasNsfwConsent('ada', 'acct-1')).toBe(false)
        expect(hasNsfwConsent('grace', 'acct-1')).toBe(true)
    })

    it('treats a corrupt or legacy-shaped record as nothing confirmed', () => {
        // Legacy stored a bare array of slugs. Reading it as a map must not throw.
        localStorage.setItem('tevi.channel.nsfw_confirmed', JSON.stringify(['ada']))
        expect(hasNsfwConsent('ada', 'acct-1')).toBe(false)

        localStorage.setItem('tevi.channel.nsfw_confirmed', '{ not json')
        expect(hasNsfwConsent('ada', 'acct-1')).toBe(false)
    })
})
