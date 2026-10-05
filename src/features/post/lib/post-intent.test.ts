import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import { postIntent, postUnlockPrice } from './post-intent'

/**
 * Every fixture goes through the parser rather than being hand-typed.
 *
 * A hand-typed object can assert a shape the parser would never produce, which is how a test ends
 * up pinning a state the real payload cannot reach — and this file's whole subject is *which of
 * four dialogs opens*, where being wrong is silent: the reader is simply offered the thing they
 * cannot buy.
 */
function fixture(overrides: Record<string, unknown>): Post {
    const parsed = normalizePost({ id: 'p1', reply_allowed: true, can_reply: true, ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

/** A locked post: gated, `viewer: 'STARGAZERS'`, and the flag the backend sets alongside it. */
const locked = (extra: Record<string, unknown>) =>
    fixture({ viewer: 'STARGAZERS', need_unlock_package: true, ...extra })

describe('postIntent', () => {
    it('answers none for an ordinary open post', () => {
        expect(postIntent(fixture({ text: 'hello' }))).toBe('none')
    })

    it('opens the membership page when membership is the only way in', () => {
        expect(postIntent(locked({ required_packages: [{ id: 't1' }] }))).toBe('become-a-member')
    })

    it('opens the purchase confirmation when Star is the only way in', () => {
        expect(postIntent(locked({ product_id: 'prod-1', price: 500 }))).toBe('purchase')
    })

    it('offers both routes when both exist', () => {
        expect(
            postIntent(
                locked({ product_id: 'prod-1', price: 500, required_packages: [{ id: 't1' }] }),
            ),
        ).toBe('choose')
    })

    /**
     * The regression `isLocked` exists for: `need_unlock_package` describes the **post** and stays
     * true after the reader has paid. Read without `viewer`, a paying member is offered the paywall
     * for content they already own.
     */
    it('answers none for a gated post the reader has already paid for', () => {
        const purchased = fixture({
            product_id: 'prod-1',
            price: 500,
            viewer: 'MEMBER',
            need_unlock_package: true,
        })
        expect(postIntent(purchased)).toBe('none')
    })

    /**
     * Legacy's **fourth** branch, and the one a reimplementation drops: the post is fully readable
     * and only the *replies* are sold. The way in is the same membership page.
     */
    it('offers membership when the post is open but replying is members-only', () => {
        const post = fixture({ reply_allowed_user: 'PAID_USERS', can_reply: false })
        expect(postIntent(post)).toBe('become-a-member')
    })

    /** The wire has been seen sending both spellings; a case mismatch must not lose the offer. */
    it('matches reply_allowed_user case-insensitively', () => {
        expect(postIntent(fixture({ reply_allowed_user: 'paid_users', can_reply: false }))).toBe(
            'become-a-member',
        )
    })

    it('stays none when paid replies are restricted but the reader may already reply', () => {
        expect(postIntent(fixture({ reply_allowed_user: 'PAID_USERS', can_reply: true }))).toBe(
            'none',
        )
    })

    /**
     * A restriction with no way past it — followers-only, say — is a refusal, not an offer. Sending
     * that reader to a membership page would sell them something that does not unlock anything.
     */
    it('stays none for a reply restriction membership cannot lift', () => {
        expect(postIntent(fixture({ reply_allowed_user: 'FOLLOWERS', can_reply: false }))).toBe(
            'none',
        )
    })

    /** The locked branch wins over the reply branch: the body is the bigger obstacle. */
    it('prefers the paywall over the reply restriction when both apply', () => {
        const post = locked({
            product_id: 'prod-1',
            price: 500,
            reply_allowed_user: 'PAID_USERS',
            can_reply: false,
        })
        expect(postIntent(post)).toBe('purchase')
    })
})

describe('postUnlockPrice', () => {
    it('gives the price on the two intents that spend Star', () => {
        expect(postUnlockPrice(locked({ product_id: 'p', price: 500 }))).toBe(500)
        expect(
            postUnlockPrice(
                locked({ product_id: 'p', price: 300, required_packages: [{ id: 't' }] }),
            ),
        ).toBe(300)
    })

    it('gives null when the route in is a membership', () => {
        expect(postUnlockPrice(locked({ required_packages: [{ id: 't1' }] }))).toBeNull()
    })

    it('gives null for an open post', () => {
        expect(postUnlockPrice(fixture({ text: 'hi' }))).toBeNull()
    })

    /**
     * `0` is not a price. A gated post carrying one is a payload this client cannot act on honestly
     * — the confirmation would say "unlock for 0" — so it answers `null` and the dialog refuses to
     * render rather than charging an amount nobody agreed to.
     */
    it('treats a zero or missing price as no price at all', () => {
        expect(postUnlockPrice(locked({ product_id: 'p', price: 0 }))).toBeNull()
        expect(postUnlockPrice(locked({ product_id: 'p' }))).toBeNull()
    })
})
