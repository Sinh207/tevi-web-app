import en from '@shared/i18n/locales/en/translation.json'
import { describe, expect, it } from 'vitest'
import { apiCopyIndex, apiCopyKey, isTranslatableCopy, normalizeCopy } from './benefit-copy'

describe('normalizeCopy', () => {
    it('ignores case, periods and repeated whitespace', () => {
        expect(normalizeCopy('  Fast   Payout.  ')).toBe('fast payout')
        expect(normalizeCopy('FAST PAYOUT')).toBe(normalizeCopy('Fast Payout'))
    })

    /** The two-space typo in the shipped copy, which legacy's first-period rule does not survive. */
    it('collapses the double space the backoffice actually sent', () => {
        expect(normalizeCopy('experiences,  all for just')).toBe('experiences, all for just')
    })
})

describe('apiCopyIndex', () => {
    it('maps an English value back to its key', () => {
        const index = apiCopyIndex({ a_key: 'Fast Payout' })
        expect(apiCopyKey(index, 'Fast Payout')).toBe('a_key')
    })

    /** Legacy's `Object.keys().find()` returns the first hit; so does this. */
    it('keeps the first key when two share an English value', () => {
        const index = apiCopyIndex({ first: 'Premium', second: 'Premium' })
        expect(apiCopyKey(index, 'premium')).toBe('first')
    })

    it('skips non-strings and blanks rather than indexing them', () => {
        const index = apiCopyIndex({ blank: '   ', nested: { a: 1 } as unknown as string })
        expect(index.size).toBe(0)
        expect(apiCopyKey(index, '')).toBeNull()
    })

    it('is built once per bundle object', () => {
        const bundle = { a_key: 'Fast Payout' }
        expect(apiCopyIndex(bundle)).toBe(apiCopyIndex(bundle))
    })
})

/**
 * The half that actually breaks in production: a `premium_copy_*` English value edited away from
 * the API's own wording stops localising its benefit in eight languages, and the English screen
 * still reads correctly. These are the strings observed in legacy's own payload, so a rename here
 * is a red test rather than a silent regression.
 */
describe('the shipped copy still matches what the API sends', () => {
    const index = apiCopyIndex(en as Record<string, unknown>)

    it.each([
        ['Fast Payout', 'premium_copy_fast_payout'],
        ['Star Purchase Bonus', 'premium_copy_star_purchase_bonus'],
        ['Enhanced Storage & Upload', 'premium_copy_enhanced_storage_upload'],
        [
            'Access your money 4 times faster than regular accounts',
            'premium_copy_access_your_money_4_times_faster_t',
        ],
        [
            'Chat for free and watch without the Sustained Fee during live streams.',
            'premium_copy_chat_for_free_and_watch_without_th',
        ],
        ['Extra 5 spins', 'premium_copy_extra_5_spins'],
        /*
         * The two the live payload edited **after** these strings went to Crowdin, and which
         * therefore read in English for eight locales until they were added. Their old spellings are
         * still in the bundle (`…free_for_react_reply`, `…unlimited_reacts_and_replies_every`) and
         * are simply never hit — harmless, and they cover a revert.
         */
        ['Free for React/Reply & Follow', 'premium_copy_free_react_reply_follow'],
        [
            'Unlimited reacts and replies every posts, follow every Spaces without fee',
            'premium_copy_unlimited_reacts_follow_spaces',
        ],
    ])('%s → %s', (apiText, key) => {
        expect(apiCopyKey(index, apiText)).toBe(key)
    })

    /**
     * **Every string the captured payload sends must resolve.** This is the assertion the two above
     * were missing: a list of individual cases only covers the strings somebody remembered to add,
     * whereas the payload is the contract. If the backoffice edits a sentence, this goes red rather
     * than the screen going quietly English.
     *
     * Values carrying a rendered figure are deliberately excluded — their Crowdin strings hold a
     * `[%s]`, so they never match and never should (`1 minutes`, `500 MB`, `2K 60fps`…).
     */
    it.each([
        'Get more Lucky wheel spins',
        'Get 5 more spins in Lucky wheel everyday',
        'Fast Payout',
        'Access your money 4 times faster than regular accounts',
        'Enhanced Storage & Upload',
        'Upgrade to Tevi Premium for longer uploads',
        'Free Translation',
        'With Tevi Premium, you can translate for free instead of spending 1 Star each time',
        'Free for React/Reply & Follow',
        'Unlimited reacts and replies every posts, follow every Spaces without fee',
        'Free for Live interactions',
        'Chat for free and watch without the Sustained Fee during live streams.',
        'Faster & Smoother Streaming',
        'Faster loading and smoother streaming experience',
        'Star Purchase Bonus',
        'Extra Stars when you purchase Star packs',
        'Livestream & Post for Free',
        'Keep up your Livestream & Create your post without fee',
        'Live Studio',
        'Stream directly from professional software like OBS, Streamlabs, or any broadcasting software',
        'No Ads',
        'Ad-free so you can immerse in your favorite content without interruption',
        'Tevi App Icon',
        'Choose from a selection of Tevi app icons for your homescreen',
        'Premium Badge',
        'Stand out and be recognized as a professional content creator',
        'Video Length',
        'File Upload Size',
        'Video Quality',
        'Purchase Bonus',
        '0% bonus',
        '10% bonus',
    ])('the live payload’s %s resolves to a key', text => {
        expect(apiCopyKey(index, text)).not.toBeNull()
    })

    /** A benefit nobody has written copy for shows as it arrived — see the module doc. */
    it('answers null for a string the bundle has never seen', () => {
        expect(apiCopyKey(index, 'A perk launched this morning')).toBeNull()
    })

    /** A value carrying a figure is absent on purpose: its Crowdin string holds a placeholder. */
    it('answers null for a rendered figure', () => {
        expect(apiCopyKey(index, '60 minutes')).toBeNull()
    })
})

/**
 * The gate on `useBenefitCopy`'s development warning. A miss is only worth reporting when there is
 * something in the string to translate — see the predicate's own doc for why the line is letters
 * rather than digits.
 */
describe('isTranslatableCopy', () => {
    it.each(['+5', '5', '∞', '—', '1/2', '  ', '100%'])(
        'stays quiet about the bare figure %j',
        text => {
            expect(isTranslatableCopy(text)).toBe(false)
        },
    )

    /** The class that must keep warning: a real `premium_copy_*` value carries digits too. */
    it.each(['10% bonus', '60 minutes', 'Fast Payout', '1080p', 'プレミアム'])(
        'reports a miss on %j',
        text => {
            expect(isTranslatableCopy(text)).toBe(true)
        },
    )
})
