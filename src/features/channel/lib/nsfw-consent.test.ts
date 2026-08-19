// @vitest-environment jsdom
import { STORAGE_KEYS } from '@shared/lib/storage'
import { beforeEach, describe, expect, it } from 'vitest'
import { grantNsfwConsent, hasNsfwConsent, revokeNsfwConsent } from './nsfw-consent'

beforeEach(() => {
    window.localStorage.clear()
})

describe('nsfw consent', () => {
    it('remembers a confirmation per channel', () => {
        expect(hasNsfwConsent('ada', 'acc-1')).toBe(false)
        grantNsfwConsent('ada', 'acc-1')
        expect(hasNsfwConsent('ada', 'acc-1')).toBe(true)
        // Another channel is a separate decision.
        expect(hasNsfwConsent('grace', 'acc-1')).toBe(false)
    })

    /**
     * Two people on one device, or one person with a work and a personal account — neither should
     * inherit the other's answer.
     */
    it('does not let one account inherit another’s consent', () => {
        grantNsfwConsent('ada', 'acc-1')
        expect(hasNsfwConsent('ada', 'acc-2')).toBe(false)
        expect(hasNsfwConsent('ada', null)).toBe(false)
    })

    /** An anonymous visitor gets a real bucket, not a key containing the string `undefined`. */
    it('gives anonymous its own bucket', () => {
        grantNsfwConsent('ada', null)
        expect(hasNsfwConsent('ada', null)).toBe(true)
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.nsfwConfirmed) ?? '{}')
        expect(Object.keys(stored)).toEqual(['anon'])
        expect(JSON.stringify(stored)).not.toContain('undefined')
    })

    it('is idempotent', () => {
        grantNsfwConsent('ada', 'acc-1')
        grantNsfwConsent('ada', 'acc-1')
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.nsfwConfirmed) ?? '{}')
        expect(stored['acc-1']).toEqual(['ada'])
    })

    it('can be revoked', () => {
        grantNsfwConsent('ada', 'acc-1')
        revokeNsfwConsent('ada', 'acc-1')
        expect(hasNsfwConsent('ada', 'acc-1')).toBe(false)
    })

    /**
     * Someone else's data lives at this key — another tab, an older version, a user poking at
     * devtools. Reading it must never throw inside a render.
     */
    it('degrades to nothing rather than throwing on corrupt storage', () => {
        for (const junk of ['not json', '[]', 'null', '{"acc-1":"ada"}', '{"acc-1":[1,2]}']) {
            window.localStorage.setItem(STORAGE_KEYS.nsfwConfirmed, junk)
            expect(() => hasNsfwConsent('ada', 'acc-1'), junk).not.toThrow()
            expect(hasNsfwConsent('ada', 'acc-1'), junk).toBe(false)
        }
    })

    it('ignores an empty slug rather than storing one', () => {
        grantNsfwConsent('', 'acc-1')
        expect(hasNsfwConsent('', 'acc-1')).toBe(false)
        expect(window.localStorage.getItem(STORAGE_KEYS.nsfwConfirmed)).toBeNull()
    })
})
