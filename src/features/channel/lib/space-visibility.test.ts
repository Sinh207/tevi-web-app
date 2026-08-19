import { describe, expect, it } from 'vitest'
import { CHANNEL_PRIVACY, type ChannelPrivacy } from '../api/types'
import {
    isSpaceVisibilityChange,
    SPACE_VISIBILITY_OPTIONS,
    spaceVisibilityConfirmKey,
} from './space-visibility'

describe('SPACE_VISIBILITY_OPTIONS', () => {
    /**
     * The screen renders this table and nothing else, so a value the backend can return that
     * is missing from it would be both un-selectable and invisible — someone's space sitting
     * in a mode the settings screen does not admit exists.
     */
    it('covers every value of the privacy enum, in enum order', () => {
        expect(SPACE_VISIBILITY_OPTIONS.map(o => o.value)).toEqual([...CHANNEL_PRIVACY])
    })

    it('gives every option copy to render', () => {
        for (const option of SPACE_VISIBILITY_OPTIONS) {
            expect(option.titleKey).toMatch(/^space_visibility_/)
            expect(option.bodyKey).toMatch(/^space_visibility_/)
            for (const key of option.bulletKeys) expect(key).toMatch(/^space_visibility_/)
        }
    })

    /**
     * Every bullet key is distinct across the whole table. Two options sharing one would look
     * fine and translate fine, and then a copy change to one list would silently edit the
     * other.
     */
    it('does not reuse a bullet key between options', () => {
        const keys = SPACE_VISIBILITY_OPTIONS.flatMap(o => [...o.bulletKeys])
        expect(new Set(keys).size).toBe(keys.length)
    })

    /** Indigo is the radio's fill; a tile in it would read as "this row is selected". */
    it('paints no tile with the selection colour', () => {
        for (const option of SPACE_VISIBILITY_OPTIONS) {
            expect(option.tile).not.toContain('indigo')
        }
    })
})

describe('spaceVisibilityConfirmKey', () => {
    /**
     * Public is the escape hatch from the other two and takes nothing away, so it applies
     * immediately. The other two hide content and stop memberships renewing, and the backend
     * will not let them be undone for 24 hours.
     */
    it('confirms only the directions that take something away', () => {
        expect(spaceVisibilityConfirmKey('public')).toBeNull()
        expect(spaceVisibilityConfirmKey('protected')).toBe('space_visibility_confirm_protected')
        expect(spaceVisibilityConfirmKey('unpublished')).toBe(
            'space_visibility_confirm_unpublished',
        )
    })

    /**
     * A future fourth value must not fall through to "no confirmation needed" by default.
     * `switch` over the union with no `default` is what makes that a type error rather than a
     * silent `undefined`; this asserts the runtime side of the same thing.
     */
    it('answers for every value in the enum', () => {
        for (const value of CHANNEL_PRIVACY) {
            const key = spaceVisibilityConfirmKey(value)
            expect(key === null || key.length > 0).toBe(true)
        }
    })
})

describe('isSpaceVisibilityChange', () => {
    it('is a change only when the current value is known and different', () => {
        expect(isSpaceVisibilityChange('public', 'protected')).toBe(true)
        expect(isSpaceVisibilityChange('public', 'public')).toBe(false)
    })

    /**
     * `undefined` is "still loading" and `null` is "this account has no channel". A write in
     * either state would act on something we have not read or that does not exist, so both
     * have to be false — and this is the gate that holds when a stale click or a keyboard gets
     * past the disabled controls.
     */
    it('refuses to treat an unknown or absent channel as a change', () => {
        const cases: (ChannelPrivacy | null | undefined)[] = [undefined, null]
        for (const current of cases) {
            for (const next of CHANNEL_PRIVACY) {
                expect(isSpaceVisibilityChange(current, next)).toBe(false)
            }
        }
    })
})
