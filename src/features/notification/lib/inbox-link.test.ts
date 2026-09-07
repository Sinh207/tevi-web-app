import { describe, expect, it } from 'vitest'
import type { InboxMessage } from '../api/types'
import { resolveInboxTarget } from './inbox-link'

/**
 * The press rule, pinned — and it is the part of this feature most worth pinning, because every
 * one of its failures is silent. A row that should have opened in-app opens a new tab instead; a
 * `javascript:` URL from the notification service reaches an `href`; a transaction row becomes a
 * link to somewhere the reader cannot use it. None of those throw.
 *
 * `NEXT_PUBLIC_BASE_URL` is `https://tevi.dev` in `vitest.config.ts`'s `test.env`, which is also
 * one of the two literals the resolver carries — so the tests below use a **third** host
 * (`https://preview.tevi.io`) whenever they need to prove the configured base is what is being
 * read, and not one of the hard-coded pair.
 */

/** A message carrying just the fields the rule reads. */
function message(fields: {
    category?: string | null
    type?: string | null
    url?: string | null
}): InboxMessage {
    return {
        id: '1',
        message_id: null,
        read: false,
        created_at: null,
        icon: null,
        category: fields.category ?? null,
        content: {
            title: null,
            body: null,
            payload: { clickable_url: fields.url ?? null, type: fields.type ?? null },
        },
    } as InboxMessage
}

describe('resolveInboxTarget', () => {
    it('sends a URL on our own origin to an internal path, keeping query and hash', () => {
        expect(
            resolveInboxTarget(
                message({ category: 'post', url: 'https://tevi.com/@ada/post/7?ref=push#top' }),
            ),
        ).toEqual({ kind: 'internal', href: '/@ada/post/7?ref=push#top' })
    })

    /**
     * The fix to legacy's `system` arm, which calls `window.open(url, '_blank')` unconditionally —
     * so a system notification pointing at our own site left the SPA for a page the app already
     * has. The origin check has no business being decided by the category.
     */
    it('treats a Tevi URL as internal for every category, not only the two legacy checks', () => {
        for (const category of ['system', 'creator_activity', 'post', 'something_new', null]) {
            expect(resolveInboxTarget(message({ category, url: 'https://tevi.com/@ada' }))).toEqual(
                { kind: 'internal', href: '/@ada' },
            )
        }
    })

    it('sends anything else to an external target, normalised', () => {
        expect(
            resolveInboxTarget(message({ category: 'post', url: 'https://example.com/x' })),
        ).toEqual({ kind: 'external', href: 'https://example.com/x' })
    })

    /**
     * The one that matters most. `clickable_url` is chosen by whichever service sent the
     * notification, so it is a user-controlled `href` sink: `javascript:` there runs as the reader,
     * on our origin, with their session. `safeExternalUrl`'s allow-list is what stops it, and this
     * asserts the resolver actually goes through it rather than reading the field directly.
     */
    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
    ])('refuses %s and falls back to app-only', url => {
        expect(resolveInboxTarget(message({ category: 'post', url }))).toEqual({
            kind: 'app-only',
        })
    })

    it('reads the configured base as our own origin, not just the two legacy hosts', () => {
        // `test.env` pins NEXT_PUBLIC_BASE_URL to https://tevi.dev.
        expect(
            resolveInboxTarget(message({ category: 'post', url: 'https://tevi.dev/x' })),
        ).toEqual({ kind: 'internal', href: '/x' })
    })

    /** A `startsWith` check on the base URL would accept this hostname. The parse is what does not. */
    it('does not mistake a lookalike hostname for our origin', () => {
        expect(
            resolveInboxTarget(
                message({ category: 'post', url: 'https://tevi.com.evil.example/x' }),
            ),
        ).toEqual({ kind: 'external', href: 'https://tevi.com.evil.example/x' })
    })

    describe('money', () => {
        it('opens a `common` row like any other', () => {
            expect(
                resolveInboxTarget(
                    message({
                        category: 'money',
                        type: 'common',
                        url: 'https://tevi.com/my-wallet',
                    }),
                ),
            ).toEqual({ kind: 'internal', href: '/my-wallet' })
        })

        /**
         * A transaction's destination is a native receipt screen. It stays app-only **even with a
         * URL**, which is why the category is decided before the URL is read — legacy ignores the
         * URL here too, and a stray one is not evidence that a web route exists.
         */
        it.each(['transaction', 'money', 'anything-else', null])(
            'keeps type=%s app-only even when a URL is present',
            type => {
                expect(
                    resolveInboxTarget(
                        message({ category: 'money', type, url: 'https://tevi.com/x' }),
                    ),
                ).toEqual({ kind: 'app-only' })
            },
        )
    })

    describe('system', () => {
        /** Legacy checks `mcn_invitation` only when there is *no* URL, so an invitation that
         *  carried one would open somewhere that cannot answer it. */
        it('keeps an MCN invitation app-only even when a URL is present', () => {
            expect(
                resolveInboxTarget(
                    message({
                        category: 'system',
                        type: 'mcn_invitation',
                        url: 'https://tevi.com/mcn',
                    }),
                ),
            ).toEqual({ kind: 'app-only' })
        })

        it('opens any other system notification normally', () => {
            expect(
                resolveInboxTarget(
                    message({ category: 'system', type: 'notice', url: 'https://help.example/a' }),
                ),
            ).toEqual({ kind: 'external', href: 'https://help.example/a' })
        })
    })

    it.each([null, '', '   '])('falls back to app-only for %o', url => {
        expect(resolveInboxTarget(message({ category: 'post', url }))).toEqual({ kind: 'app-only' })
    })
})
