import en from '@shared/i18n/locales/en/translation.json'
import { describe, expect, it } from 'vitest'
import { MONETIZATION_METHODS, REVENUE_WINDOW_DAYS } from './methods'

/**
 * The hub's list is a table with no endpoint behind it, so nothing at runtime would notice a row
 * going missing, a key being renamed, or two rows colliding. These are the four things that would
 * fail quietly.
 */
describe('monetization methods', () => {
    it('is legacy’s four, in legacy’s order', () => {
        expect(MONETIZATION_METHODS.map(m => m.key)).toEqual([
            'membership',
            'donation',
            'pay-per-post',
            'interaction',
        ])
    })

    /**
     * `ActionRows` keys its rows on this, and React silently renders only the first of a duplicate
     * pair — a row disappearing with no error anywhere.
     */
    it('has no duplicate keys', () => {
        const keys = MONETIZATION_METHODS.map(m => m.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    /**
     * A missing key renders as the key itself (i18next's default), which looks like a typo rather
     * than a missing translation and is exactly the class of defect `resources.test.ts` was written
     * for. English is the fallback for all nine locales, so it is the one that has to be complete.
     */
    it('every label key exists in English', () => {
        for (const method of MONETIZATION_METHODS) {
            expect(en, method.labelKey).toHaveProperty(method.labelKey)
        }
    })

    /**
     * The caption and the dialog title both interpolate this, and the *claim* it makes ("the last 30
     * days") is about a figure the endpoint states no window for — B102. Pinning it here means
     * changing the window is one edit that a test notices rather than two strings that can drift.
     */
    it('states the revenue window legacy hard-codes', () => {
        expect(REVENUE_WINDOW_DAYS).toBe(30)
        expect(en.monetization_revenue_window).toContain('{{days}}')
    })
})
