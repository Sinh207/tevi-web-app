import { describe, expect, it } from 'vitest'
import { campaignTextKey, resolveCampaignText } from './campaign-text'

const bundle = {
    campaign_spin: 'Spin daily. Win big.',
    campaign_join: 'Join now',
    campaign_dupe: 'Join now',
    rail_count: 42,
}

/** Stands in for `t` — proves the caller renders the key's translation, not the wire string. */
const translate = (key: string) => `[${key}]`

describe('campaignTextKey', () => {
    it('finds the key whose English value the server echoed back', () => {
        expect(campaignTextKey(bundle, 'Join now')).toBe('campaign_join')
    })

    it('matches copy with more than one sentence', () => {
        // Legacy's `text.replace('.', '')` strips only the first dot, so this string normalises
        // differently on each side of the comparison and never matches.
        expect(campaignTextKey(bundle, 'Spin daily. Win big.')).toBe('campaign_spin')
    })

    it('ignores case and surrounding whitespace', () => {
        expect(campaignTextKey(bundle, '  join NOW ')).toBe('campaign_join')
    })

    it('resolves a duplicated English string to the first key, every time', () => {
        expect(campaignTextKey(bundle, 'Join now')).toBe('campaign_join')
        expect(campaignTextKey(bundle, 'Join now')).toBe('campaign_join')
    })

    it('returns null for text no key carries', () => {
        expect(campaignTextKey(bundle, 'Double your reach this weekend')).toBeNull()
    })

    it('returns null for empty, null and undefined', () => {
        expect(campaignTextKey(bundle, '')).toBeNull()
        expect(campaignTextKey(bundle, null)).toBeNull()
        expect(campaignTextKey(bundle, undefined)).toBeNull()
        expect(campaignTextKey(bundle, '   ')).toBeNull()
    })

    it('skips non-string entries rather than throwing on them', () => {
        expect(campaignTextKey(bundle, '42')).toBeNull()
    })
})

describe('resolveCampaignText', () => {
    it('translates when there is a key', () => {
        expect(resolveCampaignText(bundle, 'Join now', translate)).toBe('[campaign_join]')
    })

    it('falls through to the wire string when there is not', () => {
        expect(resolveCampaignText(bundle, 'Double your reach', translate)).toBe(
            'Double your reach',
        )
    })

    it('renders nothing for absent copy', () => {
        expect(resolveCampaignText(bundle, null, translate)).toBe('')
        expect(resolveCampaignText(bundle, undefined, translate)).toBe('')
    })
})
