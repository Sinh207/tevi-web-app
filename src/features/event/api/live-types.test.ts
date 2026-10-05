import { describe, expect, it } from 'vitest'
import {
    type LivePublisher,
    livePlaybackSchema,
    liveRoomSchema,
    liveTransport,
    preferredRendition,
    spotlitPublisher,
} from './live-types'

/**
 * **The live room's wire format, which has no spec.**
 *
 * `live-types.ts` was derived by grepping every field legacy dereferences, so these cases stand in
 * for the contract that does not exist. Each one is a payload shape that has a plausible wrong
 * reading, and in every case the wrong reading renders a screen that looks fine — a black
 * rectangle where a person should be, or a room that never connects.
 */
const publisher = (fields: Record<string, unknown> = {}) =>
    livePublisherRow({ id: 'u1', name: 'Ada', audio: true, video: true, ...fields })

function livePublisherRow(fields: Record<string, unknown>): LivePublisher {
    const parsed = liveRoomSchema.parse({ layout: null, publishers: [fields] })
    return parsed.publishers[0]
}

describe('parsing publishers', () => {
    /**
     * The id is the mount node's key (`player-{id}`) *and* Agora's `uid`. Agora reports numeric
     * uids as numbers; a room payload may send the same id as a string. Both have to normalise to
     * the same thing or the video track is played into a node that does not exist.
     */
    it('normalises a numeric id to the same string a uid would produce', () => {
        expect(livePublisherRow({ id: 42 }).id).toBe('42')
    })

    /**
     * ⚠ A row with no id is **dropped**, and this is the one strict rule in the schema. Keeping it
     * renders a `player-null` box the SDK never attaches to — a permanent black rectangle in the
     * grid, with nothing logged and nothing failing.
     */
    it('drops a publisher with no usable id', () => {
        const room = liveRoomSchema.parse({
            layout: null,
            publishers: [{ id: 'u1' }, { name: 'ghost' }, { id: '   ' }],
        })
        expect(room.publishers.map(p => p.id)).toEqual(['u1'])
    })

    /*
     * `audio` and `video` are states, not capabilities. Defaulting either to `true` leaves an
     * empty box where a co-host with their camera off should have an avatar and a mic ring.
     */
    it('reads a missing camera flag as off, never as on', () => {
        expect(publisher({ video: undefined }).video).toBe(false)
        expect(publisher({ audio: undefined }).audio).toBe(false)
    })

    it('keeps fields it has never seen rather than stripping them', () => {
        const row = livePublisherRow({ id: 'u1', role: 'moderator' })
        expect((row as unknown as { role: string }).role).toBe('moderator')
    })
})

describe('spotlitPublisher', () => {
    const a = publisher({ id: 'a' })
    const b = publisher({ id: 'b' })

    it('picks the person the spotlight names', () => {
        const layout = { layout: 'P1', spotlight: true, spotlight_uid: 'b', spotlightUid: null }
        expect(spotlitPublisher(layout, [a, b])?.id).toBe('b')
    })

    /**
     * ⚠ The camelCase spelling is legacy's, in a snake_case API — **B117**. Accepting both fails
     * in the safe direction: if the wire really sends `spotlight_uid`, the feature starts working;
     * if it sends camelCase after all, nothing is lost.
     */
    it("accepts legacy's camelCase spelling as well as the snake_case one", () => {
        const layout = { layout: 'P1', spotlight: true, spotlight_uid: null, spotlightUid: 'b' }
        expect(spotlitPublisher(layout, [a, b])?.id).toBe('b')
    })

    /**
     * The layout is a moment older than the publisher list, so the two can disagree — a spotlight
     * pointing at somebody who has just left. Showing the host beats showing an empty seat.
     */
    it('falls back to the first publisher when the spotlight names somebody who has left', () => {
        const layout = { layout: 'P1', spotlight: true, spotlight_uid: 'gone', spotlightUid: null }
        expect(spotlitPublisher(layout, [a, b])?.id).toBe('a')
    })

    it('ignores the uid when the spotlight is off', () => {
        const layout = { layout: 'P1', spotlight: false, spotlight_uid: 'b', spotlightUid: null }
        expect(spotlitPublisher(layout, [a, b])?.id).toBe('a')
    })

    it('answers null for an empty room', () => {
        expect(spotlitPublisher(null, [])).toBeNull()
    })
})

describe('preferredRendition', () => {
    const playback = (list: unknown) =>
        livePlaybackSchema.parse({ is_preview: false, alternative_playlist: list })

    /**
     * FLV first, and it is not arbitrary: HTTP-FLV is seconds of latency where HLS is tens, and on
     * a live broadcast that is the difference between the chat answering what is on screen and
     * answering what was on screen half a minute ago.
     */
    it('prefers flv over hls whatever order the list arrives in', () => {
        const r = preferredRendition(
            playback([
                { protocol: 'hls', url: 'https://cdn/x.m3u8' },
                { protocol: 'flv', url: 'https://cdn/x.flv' },
            ]),
        )
        expect(r?.url).toBe('https://cdn/x.flv')
    })

    /**
     * The fallbacks are **ordered**, which legacy's are not — it passes the raw array, so its first
     * retry is frequently the HLS rendition it had just decided against.
     */
    it('orders the fallbacks by the same preference', () => {
        const r = preferredRendition(
            playback([
                { protocol: 'rtm', url: 'https://cdn/x.rtm' },
                { protocol: 'hls', url: 'https://cdn/x.m3u8' },
                { protocol: 'flv', url: 'https://cdn/x.flv' },
            ]),
        )
        expect(r?.fallbacks).toEqual([
            'https://cdn/x.flv',
            'https://cdn/x.m3u8',
            'https://cdn/x.rtm',
        ])
    })

    it('drops entries with no url rather than offering an empty one', () => {
        const r = preferredRendition(
            playback([{ protocol: 'flv' }, { protocol: 'hls', url: 'https://cdn/x.m3u8' }]),
        )
        expect(r?.url).toBe('https://cdn/x.m3u8')
        expect(r?.fallbacks).toHaveLength(1)
    })

    /** An Agora room carries no playlist at all — that is a state, not a failure. */
    it('answers null for a room with nothing to pull', () => {
        expect(preferredRendition(playback([]))).toBeNull()
        expect(preferredRendition(null)).toBeNull()
    })
})

describe('liveTransport', () => {
    const solo = [publisher({ id: 'a' })]
    const pair = [publisher({ id: 'a' }), publisher({ id: 'b' })]
    const withPlaylist = livePlaybackSchema.parse({
        alternative_playlist: [{ protocol: 'flv', url: 'https://cdn/x.flv' }],
        live_channel: 'room-1',
    })

    it('pulls from the CDN for a solo broadcast with a playlist', () => {
        expect(liveTransport(withPlaylist, solo)).toBe('cdn')
    })

    /**
     * ⚠ The ordering is the whole rule. A room with co-hosts joins Agora **even though a playlist
     * is present**, because that playlist is a composited mix and the seats need the tracks apart.
     */
    it('joins the channel once there are co-hosts, playlist or not', () => {
        expect(liveTransport(withPlaylist, pair)).toBe('rtc')
    })

    it('reports nothing playable when neither route is offered', () => {
        expect(liveTransport(livePlaybackSchema.parse({}), solo)).toBe('none')
        expect(liveTransport(null, solo)).toBe('none')
    })
})
