import { describe, expect, it } from 'vitest'
import type { Channel } from '../api/types'
import {
    buildChannelPatch,
    dateOfBirthError,
    fileExtension,
    invalidSocialRows,
    isProfileDirty,
    isValidLinkUrl,
    maxDateOfBirth,
    moveSocialLink,
    nameRuleFailures,
    normalizeLinkUrl,
    type ProfileValues,
    profileFormErrors,
    profileValuesFromChannel,
    uploadKey,
} from './profile-form'

/**
 * The edit-profile form's rules, tested where they live.
 *
 * The one that matters most is `buildChannelPatch`: a field included in the body when it did not
 * change is not a cosmetic defect — `slug` is rate-limited to one write a week and `images`
 * re-runs moderation. Those two cases have their own tests below and they are the reason this
 * function exists separately from the component.
 */

const values = (overrides: Partial<ProfileValues> = {}): ProfileValues => ({
    name: 'Ada Lovelace',
    slug: 'ada',
    description: 'Numbers, mostly.',
    dateOfBirth: '1990-01-01',
    categories: ['Music', 'Game'],
    socialLinks: [{ platform: 'x', title: 'X', url: 'https://x.com/ada' }],
    showIncome: false,
    images: { thumb: 'https://cdn/thumb.jpg', cover: 'https://cdn/cover.jpg', avatarVideo: null },
    ...overrides,
})

describe('nameRuleFailures', () => {
    it('accepts a normal name', () => {
        expect(nameRuleFailures('Ada Lovelace')).toEqual([])
    })

    it('flags a short name and a long one', () => {
        expect(nameRuleFailures('Ada')).toEqual(['min_length'])
        expect(nameRuleFailures('a'.repeat(51))).toEqual(['max_length'])
    })

    /**
     * The regression this file exists for. An ASCII-only character class would reject a large
     * part of this app's audience by name — see `NAME_ALLOWED`.
     */
    it('accepts non-Latin scripts', () => {
        for (const name of ['Nguyễn Văn A', '김지수 스페이스', '中文名字测试', 'مساحة عربية']) {
            expect(nameRuleFailures(name)).toEqual([])
        }
    })

    it('rejects punctuation outside the allowed set', () => {
        expect(nameRuleFailures('Ada <script>')).toContain('invalid_characters')
    })

    it('ignores surrounding whitespace when measuring length', () => {
        expect(nameRuleFailures('   Ada    ')).toEqual(['min_length'])
    })
})

describe('isValidLinkUrl', () => {
    it('accepts http and https', () => {
        expect(isValidLinkUrl('https://x.com/ada')).toBe(true)
        expect(isValidLinkUrl('http://example.com')).toBe(true)
    })

    /** The reason the check exists: these strings become `href`s on a public page. */
    it('rejects javascript: and other schemes', () => {
        expect(isValidLinkUrl('javascript:alert(1)')).toBe(false)
        expect(isValidLinkUrl('data:text/html,<script>')).toBe(false)
        expect(isValidLinkUrl('ftp://example.com')).toBe(false)
    })

    it('rejects a bare host rather than guessing a scheme', () => {
        expect(isValidLinkUrl('tevi.com')).toBe(false)
    })
})

describe('invalidSocialRows', () => {
    it('reports the position of each unusable row', () => {
        const rows = invalidSocialRows([
            { platform: 'x', title: 'X', url: 'https://x.com/ada' },
            { platform: 'x', title: 'X', url: 'not a url' },
            { platform: '', title: null, url: 'https://x.com/ada' },
        ])
        expect(rows).toEqual([1, 2])
    })
})

describe('dateOfBirthError', () => {
    const today = new Date('2026-08-15T00:00:00')

    it('treats empty as no error — the field is optional', () => {
        expect(dateOfBirthError('', today)).toBeNull()
    })

    it('accepts exactly eighteen years old', () => {
        expect(dateOfBirthError(maxDateOfBirth(today), today)).toBeNull()
    })

    it('rejects a day under eighteen', () => {
        expect(dateOfBirthError('2008-08-16', today)).toBe('profile_dob_too_young')
    })

    it('rejects an unparseable date', () => {
        expect(dateOfBirthError('not-a-date', today)).toBe('profile_dob_invalid')
    })
})

describe('isProfileDirty', () => {
    it('is false for an untouched form', () => {
        const initial = values()
        expect(isProfileDirty(initial, values())).toBe(false)
    })

    it('ignores whitespace-only edits, which are not edits', () => {
        expect(isProfileDirty(values(), values({ name: '  Ada Lovelace  ' }))).toBe(false)
    })

    it('notices a re-ordered category list', () => {
        expect(isProfileDirty(values(), values({ categories: ['Game', 'Music'] }))).toBe(true)
    })

    it('notices a new picture', () => {
        const next = values({
            images: { thumb: 'blob:preview', cover: 'https://cdn/cover.jpg', avatarVideo: null },
        })
        expect(isProfileDirty(values(), next)).toBe(true)
    })

    it('notices the date of birth, which is not even a channel field', () => {
        expect(isProfileDirty(values(), values({ dateOfBirth: '1991-01-01' }))).toBe(true)
    })
})

describe('buildChannelPatch', () => {
    it('is null when nothing changed', () => {
        expect(buildChannelPatch(values(), values())).toBeNull()
    })

    /** The expensive mistake: a slug re-sent unchanged spends a weekly allowance for nothing. */
    it('omits the username when it did not change', () => {
        const patch = buildChannelPatch(values(), values({ description: 'New bio' }))
        expect(patch).toEqual({ description: 'New bio' })
        expect(patch).not.toHaveProperty('slug')
    })

    /** The other one: `images` re-runs moderation on whatever it is given. */
    it('omits images when no picture changed', () => {
        const patch = buildChannelPatch(values(), values({ showIncome: true }))
        expect(patch).toEqual({ show_income: true })
    })

    it('sends the whole image trio when one of them changed', () => {
        const next = values({
            images: {
                thumb: 'https://cdn/thumb.jpg',
                cover: 'https://cdn/new.jpg',
                avatarVideo: null,
            },
        })
        expect(buildChannelPatch(values(), next)?.images).toEqual({
            thumb: 'https://cdn/thumb.jpg',
            cover: 'https://cdn/new.jpg',
            avatar_video: null,
        })
    })

    it('never sends the date of birth — that write goes to /me', () => {
        const patch = buildChannelPatch(values(), values({ dateOfBirth: '1991-02-02' }))
        expect(patch).toBeNull()
    })

    it('trims the text it does send', () => {
        const patch = buildChannelPatch(values(), values({ description: '  New bio  ' }))
        expect(patch).toEqual({ description: 'New bio' })
    })

    it('sends social links as the API shape', () => {
        const next = values({
            socialLinks: [
                { platform: 'x', title: 'X', url: 'https://x.com/ada' },
                { platform: 'website', title: 'Website', url: ' https://ada.dev ' },
            ],
        })
        expect(buildChannelPatch(values(), next)?.social_links).toEqual([
            { platform: 'x', title: 'X', url: 'https://x.com/ada' },
            { platform: 'website', title: 'Website', url: 'https://ada.dev' },
        ])
    })
})

describe('profileValuesFromChannel', () => {
    it('turns nulls into empty strings so every input stays controlled', () => {
        const channel = {
            name: null,
            slug: 'ada',
            description: null,
            categories: [],
            social_links: [{ id: '1', platform: 'x', title: null, url: null }],
            show_income: false,
            images: { thumb: null, cover: null, avatar_video: null },
        } as unknown as Channel

        const result = profileValuesFromChannel(channel, '')
        expect(result.name).toBe('')
        expect(result.description).toBe('')
        expect(result.socialLinks[0]).toEqual({ platform: 'x', title: null, url: '' })
    })
})

describe('uploadKey', () => {
    it('is legacy’s shape, timestamped so a CDN cannot serve the old picture', () => {
        expect(uploadKey('42', 'ct', 'jpg', 1_700_000_000_000)).toBe('42-ct-1700000000000.jpg')
    })
})

describe('fileExtension', () => {
    it('maps the two types whose extension is not their subtype', () => {
        expect(fileExtension(new Blob([], { type: 'image/jpeg' }))).toBe('jpg')
        expect(fileExtension(new Blob([], { type: 'video/quicktime' }))).toBe('mov')
    })

    it('falls back rather than producing an extensionless key', () => {
        expect(fileExtension(new Blob([]))).toBe('jpg')
        expect(fileExtension(new Blob([], { type: 'video/x-odd' }))).toBe('x-odd')
    })
})

describe('profileFormErrors', () => {
    it('is empty for a valid, untouched form', () => {
        expect(profileFormErrors(values(), values())).toEqual({})
    })

    /**
     * The trap this guards. A space whose stored name predates the six-character rule must not
     * make every *other* field unsavable — `buildChannelPatch` was never going to send `name`.
     */
    it('does not judge a field that was not touched', () => {
        const stored = values({ name: 'Ada' })
        expect(profileFormErrors(stored, stored)).toEqual({})
    })

    it('judges it as soon as it is edited', () => {
        const stored = values({ name: 'Ada' })
        expect(profileFormErrors(values({ name: 'Adaa' }), stored).name).toBe(
            'profile_name_invalid',
        )
    })

    it('leaves an existing over-long bio alone and catches a new one', () => {
        const long = values({ description: 'x'.repeat(600) })
        expect(profileFormErrors(long, long)).toEqual({})
        expect(profileFormErrors(long, values()).description).toBe('profile_about_too_long')
    })

    it('always judges the date of birth, which cannot inherit a stored problem', () => {
        const stored = values({ dateOfBirth: '2020-01-01' })
        expect(profileFormErrors(stored, stored).dateOfBirth).toBe('profile_dob_too_young')
    })

    it('reports an edited social row by position', () => {
        const next = values({ socialLinks: [{ platform: 'x', title: 'X', url: 'nope' }] })
        expect(profileFormErrors(next, values()).socialLinks).toEqual([0])
    })
})

describe('normalizeLinkUrl', () => {
    it('completes a bare host', () => {
        expect(normalizeLinkUrl('tevi.com')).toBe('https://tevi.com')
        expect(normalizeLinkUrl('  x.com/ada  ')).toBe('https://x.com/ada')
    })

    it('completes a protocol-relative URL', () => {
        expect(normalizeLinkUrl('//ada.dev')).toBe('https://ada.dev')
    })

    it('leaves a URL that already has a scheme alone', () => {
        expect(normalizeLinkUrl('https://x.com/ada')).toBe('https://x.com/ada')
        expect(normalizeLinkUrl('http://x.com')).toBe('http://x.com')
    })

    /**
     * The one that matters: a dangerous scheme must arrive at the validator **intact**, not
     * wrapped into something that parses as https and slips through.
     */
    it('does not disguise a scheme it should not accept', () => {
        expect(normalizeLinkUrl('javascript:alert(1)')).toBe('javascript:alert(1)')
        expect(isValidLinkUrl(normalizeLinkUrl('javascript:alert(1)'))).toBe(false)
        expect(normalizeLinkUrl('ftp://example.com')).toBe('ftp://example.com')
    })

    it('leaves something that is not a host alone', () => {
        expect(normalizeLinkUrl('my profile')).toBe('my profile')
        expect(normalizeLinkUrl('ada')).toBe('ada')
        expect(normalizeLinkUrl('')).toBe('')
    })
})

describe('moveSocialLink', () => {
    const rows = ['a', 'b', 'c'].map(platform => ({ platform, title: platform, url: '' }))

    it('moves a row down and up', () => {
        expect(moveSocialLink(rows, 0, 2).map(r => r.platform)).toEqual(['b', 'c', 'a'])
        expect(moveSocialLink(rows, 2, 0).map(r => r.platform)).toEqual(['c', 'a', 'b'])
    })

    it('is a no-op for the same index or an index outside the list', () => {
        expect(moveSocialLink(rows, 1, 1)).toBe(rows)
        expect(moveSocialLink(rows, 0, 9)).toBe(rows)
        expect(moveSocialLink(rows, -1, 0)).toBe(rows)
    })
})

describe('maxDateOfBirth', () => {
    it('clamps the leap-day case instead of rolling a day forward', () => {
        expect(maxDateOfBirth(new Date(2028, 1, 29))).toBe('2010-02-28')
        expect(maxDateOfBirth(new Date(2044, 1, 29))).toBe('2026-02-28')
    })

    it('is today minus eighteen years on an ordinary day', () => {
        expect(maxDateOfBirth(new Date(2025, 6, 15))).toBe('2007-07-15')
    })
})
