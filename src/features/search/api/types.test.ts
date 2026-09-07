import { describe, expect, it } from 'vitest'
import { normalizeSearchChannels, searchChannelName } from './types'

/**
 * What a search result may arrive as, and what the screen is allowed to render from it.
 *
 * Three of these pin failures that are **silent in a browser**: a row with no slug renders a
 * name that goes nowhere, an `id` that arrives as a number breaks nothing until something
 * compares it to a string, and `is_nsfw` degrading the wrong way puts an unmarked sensitive
 * space in a list. None of them throws, so none of them reaches an error boundary.
 */

/** The minimum a row needs to survive — a slug. */
const row = (extra: Record<string, unknown> = {}) => ({ id: '1', slug: 'ada', ...extra })

describe('normalizeSearchChannels', () => {
    it('drops rows with no slug, because the whole row is a link to /@{slug}', () => {
        const rows = normalizeSearchChannels([
            row(),
            { id: '2', name: 'No Slug' },
            { id: '3', slug: '' },
            { id: '4', slug: '   ' },
        ])
        expect(rows.map(r => r.slug)).toEqual(['ada'])
    })

    it('keeps a row that carries nothing but a slug', () => {
        const [parsed] = normalizeSearchChannels([{ slug: 'ada' }])
        expect(parsed).toMatchObject({
            slug: 'ada',
            name: null,
            display_name: null,
            is_premium: false,
            is_nsfw: false,
            verified_tick_badge: null,
        })
        expect(parsed.images).toEqual({ thumb: null, avatar_video: null })
    })

    /**
     * `id` is a `z.union([string, number])` for the reason `features/channel` gives: it arrives
     * as either depending on the service. A number reaching a call site that compares it to a
     * string key is the failure, and it is silent.
     */
    it('normalises a numeric id to a string', () => {
        const [parsed] = normalizeSearchChannels([{ id: 42, slug: 'ada' }])
        expect(parsed.id).toBe('42')
    })

    /** Field-level `.catch()`, never a top-level throw: one bad field must not blank the list. */
    it('degrades a field of the wrong type rather than dropping the row', () => {
        const [parsed] = normalizeSearchChannels([
            row({ name: 12, images: 'nope', verified_tick_badge: 'nope', is_premium: 'yes' }),
        ])
        expect(parsed.slug).toBe('ada')
        expect(parsed.name).toBeNull()
        expect(parsed.images).toEqual({ thumb: null, avatar_video: null })
        expect(parsed.verified_tick_badge).toBeNull()
        // `z.coerce.boolean()` — a non-empty string is truthy, which is the coercion asked for.
        expect(parsed.is_premium).toBe(true)
    })

    it('trims text fields and treats a blank string as absent', () => {
        const [parsed] = normalizeSearchChannels([row({ name: '  Ada  ', display_name: '   ' })])
        expect(parsed.name).toBe('Ada')
        expect(parsed.display_name).toBeNull()
    })

    /**
     * `looseObject`, so a field this client does not model survives to whatever reads it later.
     * Stripping unknown keys is how a `space_tier` that ships tomorrow silently disappears.
     */
    it('keeps fields it does not model', () => {
        const [parsed] = normalizeSearchChannels([row({ space_tier: 'gold' })])
        expect(parsed).toMatchObject({ space_tier: 'gold' })
    })

    it('answers an empty list for anything that is not an array', () => {
        for (const body of [null, undefined, {}, 'rows', 0]) {
            expect(normalizeSearchChannels(body)).toEqual([])
        }
    })

    it('reads the avatar clip so a Premium row can animate', () => {
        const [parsed] = normalizeSearchChannels([
            row({
                is_premium: true,
                images: {
                    thumb: 'https://cdn/thumb.png',
                    avatar_video: {
                        playback: { url: 'https://cdn/clip.mp4' },
                        thumbnail: 'https://cdn/poster.png',
                        duration_seconds: 3,
                    },
                },
            }),
        ])
        expect(parsed.images.avatar_video?.playback?.url).toBe('https://cdn/clip.mp4')
    })
})

describe('searchChannelName', () => {
    const named = (fields: { display_name?: string | null; name?: string | null }) =>
        normalizeSearchChannels([row(fields)])[0]

    it('prefers the display name the creator chose', () => {
        expect(searchChannelName(named({ display_name: 'Ada L.', name: 'ada' }))).toBe('Ada L.')
    })

    it('falls back to name, then to the empty string', () => {
        expect(searchChannelName(named({ name: 'ada' }))).toBe('ada')
        expect(searchChannelName(named({}))).toBe('')
    })
})
