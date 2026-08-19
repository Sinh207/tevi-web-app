import { describe, expect, it } from 'vitest'
import { resolveAvatarSource } from './avatar-source'

const VIDEO = {
    playback: { url: 'https://static.tevicdn.com/a/clip.mp4' },
    thumbnail: 'https://static.tevicdn.com/a/clip-frame.jpg',
    duration_seconds: 8,
}
const THUMB = 'https://static.tevicdn.com/a/avatar.jpg'

describe('resolveAvatarSource', () => {
    /**
     * The whole reason this function exists. An account can hold an `avatar_video` without
     * holding Premium — a lapsed subscription leaves the field populated — and the clip
     * must not play. If this ever passes as a URL, twenty-odd call sites start animating
     * avatars they are not entitled to.
     */
    it('never plays a clip for a non-Premium account, even when one is present', () => {
        expect(resolveAvatarSource({ thumb: THUMB, avatarVideo: VIDEO })).toEqual({
            poster: THUMB,
            videoSrc: null,
        })
        expect(
            resolveAvatarSource({ thumb: THUMB, avatarVideo: VIDEO, isPremium: false }).videoSrc,
        ).toBeNull()
    })

    it('plays the clip for a Premium account', () => {
        expect(
            resolveAvatarSource({ thumb: THUMB, avatarVideo: VIDEO, isPremium: true }).videoSrc,
        ).toBe(VIDEO.playback.url)
    })

    /**
     * The poster has to be a frame *of the clip*, not the older still — otherwise the
     * avatar visibly jumps from one picture to another the moment playback starts.
     */
    it("prefers the clip's own frame over the ordinary thumb when animating", () => {
        expect(
            resolveAvatarSource({ thumb: THUMB, avatarVideo: VIDEO, isPremium: true }).poster,
        ).toBe(VIDEO.thumbnail)
    })

    it('falls back to the thumb when the clip carries no frame', () => {
        const source = resolveAvatarSource({
            thumb: THUMB,
            avatarVideo: { playback: { url: VIDEO.playback.url }, thumbnail: null },
            isPremium: true,
        })
        expect(source).toEqual({ poster: THUMB, videoSrc: VIDEO.playback.url })
    })

    it('renders a still when Premium but the clip has no playback url', () => {
        for (const avatarVideo of [
            { playback: null, thumbnail: VIDEO.thumbnail },
            { playback: { url: null } },
            { playback: { url: '   ' } },
            {},
        ]) {
            expect(resolveAvatarSource({ thumb: THUMB, avatarVideo, isPremium: true })).toEqual({
                poster: THUMB,
                videoSrc: null,
            })
        }
    })

    /** `null` on both hands over to the DS Avatar's initials / placeholder types. */
    it('resolves to nothing rather than an empty string', () => {
        expect(resolveAvatarSource({})).toEqual({ poster: null, videoSrc: null })
        expect(resolveAvatarSource({ thumb: '' })).toEqual({ poster: null, videoSrc: null })
        expect(resolveAvatarSource({ thumb: '   ' }).poster).toBeNull()
        expect(resolveAvatarSource({ thumb: null, avatarVideo: null, isPremium: true })).toEqual({
            poster: null,
            videoSrc: null,
        })
    })
})
