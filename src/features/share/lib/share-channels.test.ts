import { describe, expect, it, vi } from 'vitest'
import {
    SHARE_CHANNEL_BY_ID,
    SHARE_CHANNELS,
    type ShareTargetContext,
    visibleShareChannels,
} from './share-channels'
import { spaceShareContext } from './share-context'

/**
 * The two things in this table that no reader can check by eye: the **wire enum**, which disagrees
 * with three of the product names, and the **encoding**, which legacy gets wrong in the one place it
 * matters.
 *
 * Neither fails loudly. A wrong `share_channel` mints a perfectly good link and files the press
 * under a channel no report groups by; an unencoded URL truncates at the first `&` and hands over a
 * link that 404s. Both are only ever noticed by somebody reading a dashboard a week later.
 */
const CTX: ShareTargetContext = {
    subject: 'Check this out',
    redirectUri: 'https://tevi.com/@ada',
    appId: 'fb-app-1',
}

describe('share channels', () => {
    it('sends the backend enum, not the product name', () => {
        expect(SHARE_CHANNEL_BY_ID.x.wire).toBe('twitter')
        expect(SHARE_CHANNEL_BY_ID['qr-code'].wire).toBe('direct_link')
        expect(SHARE_CHANNEL_BY_ID['copy-link'].wire).toBe('copy_link')
    })

    it('encodes the shared URL into every target', () => {
        // A URL with a query string of its own, which is what breaks an interpolated target: the
        // `&` ends the host's own parameter and everything after it is silently dropped.
        const url = 'https://tevi.com/@ada/s/aB1?ref=x&utm=y'
        for (const spec of SHARE_CHANNELS) {
            if (!spec.target) continue
            const target = spec.target(url, CTX)
            expect(target).toContain(encodeURIComponent(url))
            expect(target).not.toContain(url)
        }
    })

    it('carries the email subject encoded and separate from the link', () => {
        const target = SHARE_CHANNEL_BY_ID.email.target?.('https://tevi.com/@ada', {
            ...CTX,
            subject: 'Xem cái này nhé',
        })
        expect(target).toContain(`su=${encodeURIComponent('Xem cái này nhé')}`)
        expect(target).toContain(`body=${encodeURIComponent('https://tevi.com/@ada')}`)
    })

    /**
     * Messenger is the row legacy ships **dead**: `dialog/send` with `app_id=` empty is Meta's error
     * page, not a share sheet. Both halves of the fix are asserted here because neither shows up as
     * a failure — a wrong `app_id` looks like a working button until it is pressed, and a row that
     * quietly disappears looks like a design decision.
     */
    it('sends a real app id to Messenger, and returns the reader to the page they shared from', () => {
        const target = SHARE_CHANNEL_BY_ID.messenger.target?.('https://tv.link/x', {
            ...CTX,
            redirectUri: 'https://tevi.com/@ada',
        })
        expect(target).toContain('app_id=fb-app-1')
        expect(target).toContain(`redirect_uri=${encodeURIComponent('https://tevi.com/@ada')}`)
        expect(target).not.toContain('app_id=&')
    })

    it('offers Messenger where an app id is configured, and drops it where there is none', async () => {
        // `vitest.config.ts` sets the id, so the configured branch is the ambient one.
        expect(visibleShareChannels().map(spec => spec.id)).toContain('messenger')

        vi.resetModules()
        vi.doMock('@shared/config/env', () => ({ env: { NEXT_PUBLIC_FACEBOOK_CLIENT_ID: '' } }))
        const unconfigured = await import('./share-channels')
        expect(unconfigured.visibleShareChannels().map(spec => spec.id)).not.toContain('messenger')
        // Exactly that row, and nothing else moves with it.
        expect(unconfigured.visibleShareChannels()).toHaveLength(SHARE_CHANNELS.length - 1)
        vi.doUnmock('@shared/config/env')
        vi.resetModules()
    })

    it('draws the rows in legacy order', () => {
        expect(SHARE_CHANNELS.map(spec => spec.id)).toEqual([
            'copy-link',
            'qr-code',
            'telegram',
            'facebook',
            'x',
            'messenger',
            'email',
        ])
    })

    /**
     * Messenger and Facebook are one channel on the wire, so they share a minted link — which is
     * legacy's behaviour and the backend's enum, not an oversight here.
     */
    it('files Messenger under Facebook, because the enum has no messenger', () => {
        expect(SHARE_CHANNEL_BY_ID.messenger.wire).toBe(SHARE_CHANNEL_BY_ID.facebook.wire)
    })

    it('handles copy and QR in the app, and every other row as a destination', () => {
        const inApp = SHARE_CHANNELS.filter(spec => spec.target === null).map(spec => spec.id)
        expect(inApp).toEqual(['copy-link', 'qr-code'])
    })

    it('gives every row a label key and a sprite glyph', () => {
        for (const spec of SHARE_CHANNELS) {
            expect(spec.labelKey.startsWith('share_')).toBe(true)
            expect(spec.glyph).toBeTruthy()
        }
        // The lookup is derived from the array, so a row added to one is present in the other.
        expect(Object.keys(SHARE_CHANNEL_BY_ID)).toHaveLength(SHARE_CHANNELS.length)
    })
})

/**
 * A context is either complete or absent, because a half-filled one is a `422` from `POST v1/links`
 * — and legacy's version builds exactly that, then relies on a truthiness test three files away to
 * quietly send the share down the other endpoint.
 */
describe('spaceShareContext', () => {
    it('names the space', () => {
        expect(spaceShareContext({ id: 42, slug: 'ada' })).toEqual({
            contentType: 'space',
            contentId: '42',
            creatorId: 'ada',
            sourceScreen: 'space',
        })
    })

    it('answers null when the channel has no id, rather than an unsendable body', () => {
        expect(spaceShareContext({ slug: 'ada' })).toBeNull()
        expect(spaceShareContext({ id: null, slug: 'ada' })).toBeNull()
        expect(spaceShareContext({ id: '', slug: 'ada' })).toBeNull()
    })

    it('keeps a space with no handle — attribution is optional, the mint is not', () => {
        expect(spaceShareContext({ id: 'abc' })?.creatorId).toBeNull()
    })
})
