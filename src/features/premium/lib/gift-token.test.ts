// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { decodeGiftToken, encodeGiftToken } from './gift-token'

/**
 * The token is the **only** thing that survives a hosted-redirect checkout, and every rule this
 * module enforces is one that fails silently when it is missing: an expired token shows "Premium
 * Delivered" to somebody who bought nothing, an unchecked handle prints whatever was typed into the
 * address bar with an `@` in front of it, and a legacy payload arriving mid-cutover drops the reader
 * on the picker with their gift unacknowledged.
 *
 * `jsdom`, because `btoa`/`atob` are browser globals — the module runs only in a browser by
 * construction (it is read in an effect off `window.location`).
 */

const HOUR = 60 * 60 * 1000

/** Legacy's own payload shape, encoded the way legacy encodes it. */
function legacyToken(body: unknown): string {
    return btoa(encodeURIComponent(JSON.stringify(body)))
}

describe('encodeGiftToken', () => {
    it('round-trips a recipient and a duration', () => {
        const token = encodeGiftToken({ slug: 'ada', name: 'Ada Lovelace', days: 365 })
        expect(token).not.toBeNull()
        expect(decodeGiftToken(token)).toEqual({ slug: 'ada', name: 'Ada Lovelace', plan: 'year' })
    })

    it('survives a display name outside Latin-1', () => {
        // The reason `encodeURIComponent` runs before `btoa`: `btoa('日')` throws, and a throw here
        // would surface as an unhandled error one line before a charge.
        const token = encodeGiftToken({ slug: 'yuki', name: '雪の女王 🎁', days: 90 })
        expect(decodeGiftToken(token)?.name).toBe('雪の女王 🎁')
    })

    it('refuses a handle it cannot vouch for, so the caller cannot charge', () => {
        // A `null` is what stops the checkout. Each of these would otherwise reach the success
        // screen as text printed after an `@`.
        for (const slug of ['', '   ', 'a b', '<script>', '../../etc', 'x'.repeat(65)]) {
            expect(encodeGiftToken({ slug })).toBeNull()
        }
    })

    it('omits a duration it has no card for, rather than inventing one', () => {
        const token = encodeGiftToken({ slug: 'ada', days: 100 })
        expect(decodeGiftToken(token)?.plan).toBeNull()
    })

    it('caps a display name', () => {
        const token = encodeGiftToken({ slug: 'ada', name: 'n'.repeat(200) })
        expect(decodeGiftToken(token)?.name).toHaveLength(64)
    })

    it('reports an absent name as null rather than as an empty string', () => {
        // The hero falls back to the handle on `null`; `''` would render an empty gold ring.
        expect(decodeGiftToken(encodeGiftToken({ slug: 'ada', name: '  ' }))?.name).toBeNull()
    })
})

describe('decodeGiftToken', () => {
    it('is null for anything that is not one of ours', () => {
        for (const token of [null, undefined, '', 'not-base64!!', btoa('{"v":1}'), btoa('[]')]) {
            expect(decodeGiftToken(token)).toBeNull()
        }
    })

    it('expires, which legacy never does', () => {
        const token = encodeGiftToken({ slug: 'ada', days: 365 })
        const minted = Date.now()
        // Inside the window: a reader who paid on their phone and came back after lunch.
        expect(decodeGiftToken(token, minted + 23 * HOUR)).not.toBeNull()
        // Past it: a bookmarked success URL is an ordinary arrival, not a second congratulation.
        expect(decodeGiftToken(token, minted + 25 * HOUR)).toBeNull()
    })

    it('tolerates a little clock skew and no more', () => {
        const token = encodeGiftToken({ slug: 'ada' })
        const minted = Date.now()
        expect(decodeGiftToken(token, minted - 60_000)).not.toBeNull()
        expect(decodeGiftToken(token, minted - 10 * 60_000)).toBeNull()
    })

    it('rejects a version it does not know', () => {
        expect(decodeGiftToken(legacyToken({ v: 2, s: 'ada', t: Date.now() }))).toBeNull()
    })

    it('reads a token minted by the legacy app, minus the duration', () => {
        /*
         * The cutover is big-bang, so a gift can be *started* on the legacy app and *return* here.
         * `packages_info.name` is a server-written English string, which cannot be localised — hence
         * `plan: null` and a success sentence that names only the recipient.
         */
        const token = legacyToken({
            channel_info: { name: 'Ada Lovelace', slug: 'ada', images: { thumb: 'https://x/y' } },
            packages_info: { name: '12 Months' },
            timestamp: Date.now(),
        })
        expect(decodeGiftToken(token)).toEqual({ slug: 'ada', name: 'Ada Lovelace', plan: null })
    })

    it('treats a legacy token with no timestamp as fresh', () => {
        // Refusing a token this client did not mint, for a field it did not control, would turn a
        // real settled gift into a picker screen.
        const token = legacyToken({ channel_info: { slug: 'ada' } })
        expect(decodeGiftToken(token)).toEqual({ slug: 'ada', name: null, plan: null })
    })

    it('applies the handle rule to a legacy token too', () => {
        expect(decodeGiftToken(legacyToken({ channel_info: { slug: 'a b' } }))).toBeNull()
    })

    it('survives a gateway that turned its `+` back into a space', () => {
        /*
         * The token is written with `URLSearchParams.set` (`+` → `%2B`) and read with `.get()`, so
         * the round trip is correct on its own. A payment gateway that decodes and re-serialises the
         * redirect target loosely breaks it: `%2B` becomes a literal `+`, the next parser reads that
         * as a space, and `atob` throws on a gift that really did settle.
         *
         * Simulated exactly: take a real token, force a `+` into it, then damage it the way that
         * chain would. A space cannot occur in base64, so restoring it is unambiguous.
         */
        const payload = { v: 1, s: 'ada', n: 'Ada Lovelace', d: 365, t: Date.now() }
        const raw = btoa(encodeURIComponent(JSON.stringify(payload)))
        // Not all payloads produce one, so this asserts the *repair* rather than hoping for a `+`.
        const damaged = raw.replace(/\+/g, ' ')
        expect(decodeGiftToken(damaged)).toEqual({
            slug: 'ada',
            name: 'Ada Lovelace',
            plan: 'year',
        })

        // And the URL-safe alphabet, for the same reason.
        const urlSafe = raw.replace(/\+/g, '-').replace(/\//g, '_')
        expect(decodeGiftToken(urlSafe)).toEqual({
            slug: 'ada',
            name: 'Ada Lovelace',
            plan: 'year',
        })
    })

    it('never surfaces an image URL, however the token carried one', () => {
        // Rule 1 in the module's note: `next/image` validates hosts and *throws* on one it does not
        // know, so an attacker-supplied thumb would take the page down rather than merely mislead.
        const decoded = decodeGiftToken(
            legacyToken({
                channel_info: { slug: 'ada', images: { thumb: 'https://evil.example/x.png' } },
            }),
        )
        expect(JSON.stringify(decoded)).not.toContain('evil.example')
        expect(Object.keys(decoded ?? {})).toEqual(['slug', 'name', 'plan'])
    })
})
