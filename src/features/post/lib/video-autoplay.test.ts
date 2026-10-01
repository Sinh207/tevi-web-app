import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import {
    AUTOPLAY_MAX_SECONDS,
    connectionAllowsAutoplay,
    mayAutoplay,
    pickAutoplayTarget,
} from './video-autoplay'

/**
 * iOS's autoplay policy, as the parts a browser can honour.
 *
 * The two-checkpoint picker is the half worth pinning hardest: "the most visible clip" is the
 * obvious alternative and a **different behaviour**, and nothing on screen tells the two apart
 * until a feed is scrolling under a reader's eye.
 */

/**
 * Through `normalizePost`, not a hand-rolled literal — the first version of this file built posts by
 * hand and `isLocked` threw on `required_packages.length`, because a partial object is not a `Post`
 * however convincingly it is cast. The schema fills every field the access rules read.
 */
function post(video: Record<string, unknown> | null, extra: Record<string, unknown> = {}): Post {
    return normalizePost({
        id: 'p1',
        video: video === null ? null : { playback: { hls: 'https://x.invalid/v.m3u8' }, ...video },
        ...extra,
    }) as Post
}

describe('mayAutoplay', () => {
    it('plays a short clip with a source', () => {
        expect(mayAutoplay(post({ duration_seconds: 30 }))).toBe(true)
    })

    /** iOS: `duration > 0 && duration <= 60`. Legacy web's ceiling is 180; iOS is the stricter. */
    it('is bounded at iOS’s sixty seconds, inclusive', () => {
        expect(mayAutoplay(post({ duration_seconds: AUTOPLAY_MAX_SECONDS }))).toBe(true)
        expect(mayAutoplay(post({ duration_seconds: AUTOPLAY_MAX_SECONDS + 1 }))).toBe(false)
    })

    /** A duration of zero is "unknown", not "instant" — iOS guards `duration > 0` for this. */
    it('refuses a clip whose duration the payload did not state', () => {
        expect(mayAutoplay(post({ duration_seconds: 0 }))).toBe(false)
        expect(mayAutoplay(post({}))).toBe(false)
    })

    it('refuses a post with no playable source', () => {
        expect(mayAutoplay(post(null))).toBe(false)
    })

    /**
     * ⚠ Both refusals matter and for different reasons: a paywalled post's payload carries a cover
     * rather than a clip, and a post behind the sensitive-content cover must not start moving
     * underneath it — which is iOS's `isHiddenNSFW` check read from the other side.
     */
    it('refuses a locked post and one behind the NSFW cover', () => {
        const locked = post({ duration_seconds: 10 }, {
            product_id: 'prod',
            need_unlock_package: true,
            viewer: 'STARGAZERS',
        } as Partial<Post>)
        expect(mayAutoplay(locked)).toBe(false)
        expect(
            mayAutoplay(post({ duration_seconds: 10 }, { marked_nsfw: true } as Partial<Post>)),
        ).toBe(false)
    })
})

describe('connectionAllowsAutoplay', () => {
    /**
     * ⚠ **Silence is not a veto.** Safari and Firefox ship no `navigator.connection` at all, so
     * treating absence as "do not autoplay" would apply the policy to Chrome users and not to
     * Safari users — a worse rule than either answer. The long form is in the module header.
     */
    it('allows it when the browser says nothing', () => {
        expect(connectionAllowsAutoplay(null)).toBe(true)
        expect(connectionAllowsAutoplay({})).toBe(true)
    })

    it('honours an explicit refusal', () => {
        expect(connectionAllowsAutoplay({ saveData: true })).toBe(false)
        expect(connectionAllowsAutoplay({ type: 'cellular' })).toBe(false)
        expect(connectionAllowsAutoplay({ effectiveType: '2g' })).toBe(false)
        expect(connectionAllowsAutoplay({ effectiveType: 'slow-2g' })).toBe(false)
    })

    it('allows a wifi or fast connection', () => {
        expect(connectionAllowsAutoplay({ type: 'wifi', effectiveType: '4g' })).toBe(true)
        expect(connectionAllowsAutoplay({ effectiveType: '3g' })).toBe(true)
    })
})

describe('pickAutoplayTarget', () => {
    const VH = 900 // thirds at 300 and 600

    it('takes the clip under the first third', () => {
        const target = pickAutoplayTarget(
            [
                { id: 'a', top: 100, bottom: 400 },
                { id: 'b', top: 500, bottom: 800 },
            ],
            VH,
        )
        expect(target).toBe('a')
    })

    /** The fallback is what keeps a feed from going silent when nothing straddles the first mark. */
    it('falls back to the second third', () => {
        expect(pickAutoplayTarget([{ id: 'b', top: 500, bottom: 800 }], VH)).toBe('b')
    })

    it('prefers the first third even when a later clip sits on the second', () => {
        const target = pickAutoplayTarget(
            [
                { id: 'b', top: 500, bottom: 800 },
                { id: 'a', top: 100, bottom: 400 },
            ],
            VH,
        )
        expect(target).toBe('a')
    })

    /** iOS's `replaceFocusPostVideoView(nil)` — the playing clip stops and nothing replaces it. */
    it('answers null when neither mark lands on a clip', () => {
        expect(pickAutoplayTarget([{ id: 'a', top: 620, bottom: 880 }], VH)).toBe(null)
        expect(pickAutoplayTarget([], VH)).toBe(null)
    })

    /**
     * A tall clip covering both marks is still one answer, not two — which is the invariant behind
     * "one `<video>` in the document" rather than a coincidence of the data.
     */
    it('answers once for a clip spanning both marks', () => {
        expect(pickAutoplayTarget([{ id: 'tall', top: 0, bottom: 900 }], VH)).toBe('tall')
    })
})
