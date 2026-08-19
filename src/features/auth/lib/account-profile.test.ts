import { describe, expect, it } from 'vitest'
import {
    accountAutoFollow,
    accountAvatarUrl,
    accountDisplayName,
    accountEmail,
    accountNsfwSettings,
    accountShowSensitive,
} from './account-profile'

describe('accountAvatarUrl', () => {
    it('reads the legacy avatar object', () => {
        expect(
            accountAvatarUrl({
                id: '1',
                avatar: { thumb: 'https://cdn/t.jpg', cover: 'https://cdn/c.jpg' },
            }),
        ).toBe('https://cdn/t.jpg')
    })

    it('accepts a flat string, in case the field is ever flattened', () => {
        expect(accountAvatarUrl({ id: '1', avatar: 'https://cdn/a.jpg' })).toBe('https://cdn/a.jpg')
    })

    it('is null when there is no usable url', () => {
        expect(accountAvatarUrl(null)).toBeNull()
        expect(accountAvatarUrl({ id: '1' })).toBeNull()
        expect(accountAvatarUrl({ id: '1', avatar: {} })).toBeNull()
        expect(accountAvatarUrl({ id: '1', avatar: { thumb: null } })).toBeNull()
        // A blank string is truthy enough to pass a `??` and render nothing.
        expect(accountAvatarUrl({ id: '1', avatar: { thumb: '   ' } })).toBeNull()
        expect(accountAvatarUrl({ id: '1', avatar: 42 })).toBeNull()
    })
})

describe('accountDisplayName / accountEmail', () => {
    it('trims', () => {
        expect(accountDisplayName({ id: '1', display_name: '  Ada  ' })).toBe('Ada')
        expect(accountEmail({ id: '1', email: ' ada@tevi.com ' })).toBe('ada@tevi.com')
    })

    it('is null when absent, blank or not a string', () => {
        expect(accountDisplayName({ id: '1' })).toBeNull()
        expect(accountDisplayName({ id: '1', display_name: '' })).toBeNull()
        expect(accountEmail({ id: '1', email: 123 })).toBeNull()
        expect(accountEmail(undefined)).toBeNull()
    })
})

describe('accountAutoFollow', () => {
    it('is true only when the backend says true', () => {
        expect(accountAutoFollow({ id: '1', auto_follow: true })).toBe(true)
    })

    /**
     * The whole point of `=== true`: a switch that reads as *on* because its value was
     * missing, or because the backend sent `1` / `'true'`, is a setting nobody chose.
     */
    it('is false for absent, null and truthy-but-not-true values', () => {
        expect(accountAutoFollow({ id: '1' })).toBe(false)
        expect(accountAutoFollow({ id: '1', auto_follow: null })).toBe(false)
        expect(accountAutoFollow({ id: '1', auto_follow: 1 })).toBe(false)
        expect(accountAutoFollow({ id: '1', auto_follow: 'true' })).toBe(false)
        expect(accountAutoFollow(null)).toBe(false)
    })
})

describe('accountNsfwSettings', () => {
    /** The caller spreads this into a patch, so it has to be spreadable — never `undefined`. */
    it('returns the object as stored', () => {
        const settings = { show_sensitive: true, blur_thumbnails: false }
        expect(accountNsfwSettings({ id: '1', nsfw_settings: settings })).toEqual(settings)
    })

    it('is an empty object for anything that is not one', () => {
        expect(accountNsfwSettings({ id: '1' })).toEqual({})
        expect(accountNsfwSettings({ id: '1', nsfw_settings: null })).toEqual({})
        // An array spreads to numeric keys, which would post nonsense.
        expect(accountNsfwSettings({ id: '1', nsfw_settings: [] })).toEqual({})
        expect(accountNsfwSettings({ id: '1', nsfw_settings: 'yes' })).toEqual({})
        expect(accountNsfwSettings(undefined)).toEqual({})
    })

    it('keeps the siblings a patch has to send back', () => {
        const user = { id: '1', nsfw_settings: { show_sensitive: false, other_flag: 'keep' } }
        expect({ ...accountNsfwSettings(user), show_sensitive: true }).toEqual({
            show_sensitive: true,
            other_flag: 'keep',
        })
    })
})

describe('accountShowSensitive', () => {
    it('reads the nested flag, strictly', () => {
        expect(accountShowSensitive({ id: '1', nsfw_settings: { show_sensitive: true } })).toBe(
            true,
        )
        expect(accountShowSensitive({ id: '1', nsfw_settings: { show_sensitive: 1 } })).toBe(false)
        expect(accountShowSensitive({ id: '1', nsfw_settings: {} })).toBe(false)
        expect(accountShowSensitive({ id: '1' })).toBe(false)
    })
})
