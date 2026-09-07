import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '@shared/i18n/locales/en/translation.json'
import { SUPPORTED_LOCALES } from '@shared/i18n/settings'
import { describe, expect, it } from 'vitest'
import { NSFW_ROWS } from './nsfw-rows'

/**
 * The table is data plus two translation keys per row, and both halves fail quietly.
 *
 * `shared/i18n/keys.test.ts` cannot see these: it scans source for literal `t('…')` calls, and
 * these keys are read out of an object (`t(row.titleKey)`). So a typo here renders
 * `privacy_settings_blur_medai` on a screen inside the mobile app — invisible in review, obvious
 * in production, and caught by nothing else in the suite. Same reasoning as
 * `features/brand-assets/content/brand-assets.test.ts`.
 */
const keys = en as Record<string, string>
const LOCALES = join(process.cwd(), 'src/shared/i18n/locales')

describe('privacy settings rows', () => {
    it('names every row through a key that exists in English', () => {
        const missing = NSFW_ROWS.flatMap(row =>
            [row.titleKey, row.noteKey].filter(key => !(key in keys)),
        )
        expect(missing).toEqual([])
    })

    /**
     * And in **every** locale, not only English. i18next falls back per key, so a locale missing
     * one of these renders the English sentence beside eight translated ones — which is a thing
     * nobody sees until they switch language. `resources.test.ts` pins that English is a superset;
     * this pins the other direction for the six keys this screen depends on.
     */
    it('is translated in every supported locale', () => {
        const used = NSFW_ROWS.flatMap(row => [row.titleKey, row.noteKey])
        for (const locale of SUPPORTED_LOCALES) {
            const bundle = JSON.parse(
                readFileSync(join(LOCALES, locale, 'translation.json'), 'utf8'),
            ) as Record<string, string>
            expect(
                used.filter(key => !bundle[key]?.trim()),
                `${locale} is missing`,
            ).toEqual([])
        }
    })

    /** The write sends the whole object, so a duplicated field would silently drop a row's value. */
    it('covers each field once', () => {
        const fields = NSFW_ROWS.map(row => row.field)
        expect(new Set(fields).size).toBe(fields.length)
    })
})
