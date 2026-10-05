import { describe, expect, it } from 'vitest'
import { normalizePost, normalizePosts } from './types'

describe('normalizePost', () => {
    it('parses a minimal post', () => {
        const post = normalizePost({ id: 42 })
        expect(post?.id).toBe('42')
        expect(post?.text).toBe(null)
        expect(post?.reaction_count).toBe(0)
        expect(post?.required_packages).toEqual([])
    })

    /**
     * The discipline this whole file exists for: one field the backend nulls for the first time
     * must cost that field, never the post.
     */
    it('degrades a bad field rather than rejecting the post', () => {
        const post = normalizePost({ id: '1', text: 42, reaction_count: 'lots' })
        expect(post).not.toBe(null)
        expect(post?.text).toBe(null)
        expect(post?.reaction_count).toBe(0)
    })

    /**
     * `created_at` arrives as epoch milliseconds on the channel service — the bug `nullableTimestamp`
     * was written for, where a `nullableText` declaration threw the number away and the date row
     * silently never rendered.
     */
    it('normalises an epoch-millisecond created_at to ISO', () => {
        const post = normalizePost({ id: '1', created_at: 1660516880264 })
        expect(post?.created_at).toBe(new Date(1660516880264).toISOString())
    })

    /**
     * The payload is wider than this file models, and the extra must survive the parse.
     *
     * The example used to be `_insights`, which is now modelled — so it was swapped for two fields
     * nothing reads. That swap is the point of the test rather than an inconvenience: the day a
     * field here gains a schema entry, this test has to be pointed at a different one, which is a
     * deliberate prompt to check that the *new* entry parses what the wire actually sends.
     */
    it('keeps fields it does not model', () => {
        const post = normalizePost({ id: '1', reactions_summary: { LIKE: 9 }, view_count: 12 })
        expect((post as Record<string, unknown>).reactions_summary).toEqual({ LIKE: 9 })
        expect((post as Record<string, unknown>).view_count).toBe(12)
    })

    /**
     * `_insights` is the author's earnings and is **absent from every payload an ordinary reader
     * receives** — so `null`, not `{}`, is what the card has to branch on. Modelled rather than left
     * in the unknown-key bag because `PostInsights` reads it, and `CLAUDE.md` bars reaching through
     * `looseObject` for a field a component depends on.
     */
    it('reads the author-only insights block, and leaves it null when absent', () => {
        expect(normalizePost({ id: '1' })?._insights).toBeNull()
        expect(
            normalizePost({ id: '1', _insights: { post_total_revenue: 4.5 } })?._insights,
        ).toEqual({ post_total_revenue: 4.5 })
    })

    /**
     * The three mini-app fields and `promote` arrive **on the channel**, not on the post, and all
     * three of the first are required together — `post-attachments.tsx` carries the reasoning. This
     * pins that they parse at all: each was a guess against legacy's payload, and a wrong spelling
     * would leave the banner permanently absent with nothing failing.
     */
    it('reads the mini-app trio and the promote block off the channel', () => {
        const post = normalizePost({
            id: '1',
            channel: {
                id: 'c1',
                has_mini_app: true,
                mini_app_url: 'https://app.example.com',
                mini_app_id: 'app-1',
                promote: { referral_url: 'https://ref.example.com', app_name: 'Thing' },
            },
        })
        expect(post?.channel?.has_mini_app).toBe(true)
        expect(post?.channel?.mini_app_url).toBe('https://app.example.com')
        expect(post?.channel?.mini_app_id).toBe('app-1')
        expect(post?.channel?.promote?.referral_url).toBe('https://ref.example.com')
    })

    /**
     * The regression this replaces: declared `nullableText`, the object parsed to `null`, and the
     * verified tick never rendered for any channel — a failure with no error anywhere.
     */
    it('reads the verified tick badge as an object, not a string', () => {
        const post = normalizePost({
            id: '1',
            channel: { id: '1', verified_tick_badge: { image: 'https://cdn/tick.svg' } },
        })
        expect(post?.channel?.verified_tick_badge?.image).toBe('https://cdn/tick.svg')
    })

    it('leaves an unverified channel with no badge rather than an empty one', () => {
        const post = normalizePost({ id: '1', channel: { id: '1' } })
        expect(post?.channel?.verified_tick_badge).toBe(null)
    })

    it('answers null for a body that is not an object at all', () => {
        expect(normalizePost(null)).toBe(null)
        expect(normalizePost('nope')).toBe(null)
    })

    /** One level of quoting is modelled, which is all any surface draws. */
    it('parses a quoted post', () => {
        const post = normalizePost({ id: '1', quoted_post: { id: '2', text: ' quoted ' } })
        expect(post?.quoted_post?.id).toBe('2')
        expect(post?.quoted_post?.text).toBe('quoted')
    })

    it('reads the embedded channel without needing features/channel', () => {
        const post = normalizePost({
            id: '1',
            channel: { id: 7, slug: 'alice', name: 'Alice', paid_interaction_cost: 5 },
        })
        expect(post?.channel?.id).toBe('7')
        expect(post?.channel?.slug).toBe('alice')
        expect(post?.channel?.paid_interaction_enabled).toBe(false)
    })
})

describe('normalizePosts', () => {
    /**
     * A feed with a gap is ordinary — the backend already hides posts from a reader. A feed with a
     * blank card is a defect the reader is invited to tap.
     */
    it('drops rows that cannot be parsed and keeps the rest', () => {
        expect(normalizePosts([{ id: '1' }, null, 'nope', { id: '2' }]).map(p => p.id)).toEqual([
            '1',
            '2',
        ])
    })

    it('answers an empty list for a body that is not an array', () => {
        expect(normalizePosts({ results: [] })).toEqual([])
        expect(normalizePosts(undefined)).toEqual([])
    })
})
