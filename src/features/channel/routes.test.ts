import { describe, expect, it } from 'vitest'
import { channelBasePath, parseChannelIntent } from './routes'

const intent = (pathname: string, query = '') =>
    parseChannelIntent(pathname, new URLSearchParams(query))

describe('parseChannelIntent', () => {
    it('reads the path form', () => {
        expect(intent('/@ada/direct-donation')).toBe('direct_donation')
        expect(intent('/@ada/membership')).toBe('become_a_member')
    })

    /**
     * Next hands the route segment over percent-encoded, and `%40ada` is also a URL a person can
     * legitimately type. The old `proxy.ts` rule matched only `@`, so this spelling used to 404.
     */
    it('accepts a percent-encoded @', () => {
        expect(intent('/%40ada/direct-donation')).toBe('direct_donation')
        expect(channelBasePath('/%40ada/membership')).toBe('/%40ada')
    })

    /** Legacy's tier id. The link still opens the one offer the space has; refusing it gains nothing. */
    it('accepts and ignores a trailing membership id', () => {
        expect(intent('/@ada/membership/12')).toBe('become_a_member')
        expect(intent('/@ada/membership/does-not-exist')).toBe('become_a_member')
    })

    it('reads legacy’s query form', () => {
        expect(intent('/@ada', 'action=direct_donation')).toBe('direct_donation')
        expect(intent('/@ada', 'action=become_a_member')).toBe('become_a_member')
        expect(intent('/@ada', 'action=custom_profile')).toBe('custom_profile')
    })

    it('lets the path win over a stray query', () => {
        expect(intent('/@ada/direct-donation', 'action=become_a_member')).toBe('direct_donation')
    })

    it('ignores an unknown action word', () => {
        expect(intent('/@ada', 'action=delete_everything')).toBeNull()
        expect(intent('/@ada', 'action=')).toBeNull()
    })

    /**
     * A space's other sub-pages own their own routes, and a stray `?action=` on one of them is not
     * the space page's business — nothing there is listening for it.
     */
    it('ignores other channel sub-pages', () => {
        expect(intent('/@ada/earnings-report')).toBeNull()
        expect(intent('/@ada/earnings-report', 'action=direct_donation')).toBeNull()
        expect(intent('/@ada/membership/12/extra')).toBeNull()
    })

    it('is null off the channel namespace', () => {
        expect(intent('/settings/custom-profile', 'action=custom_profile')).toBeNull()
        expect(intent('/', 'action=direct_donation')).toBeNull()
    })
})

describe('channelBasePath', () => {
    it('walks back to the space', () => {
        expect(channelBasePath('/@ada/direct-donation')).toBe('/@ada')
        expect(channelBasePath('/@ada/membership/12')).toBe('/@ada')
        expect(channelBasePath('/@ada')).toBe('/@ada')
    })

    it('is null off the channel namespace', () => {
        expect(channelBasePath('/settings')).toBeNull()
    })
})
