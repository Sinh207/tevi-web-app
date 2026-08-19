import { describe, expect, it } from 'vitest'
import { campaignReward, EMPTY_CAMPAIGNS, normalizeCampaigns } from './types'

const milestone = {
    campaign_type: 'MILESTONE',
    is_active: true,
    name: 'Grow your fanbase',
    description: 'Hit the milestone, take the pot',
    shortlink: 'https://tevi.app/gyf',
    total_reward_in_usdt: '1500.00',
    user_joined: false,
    milestone_details: { title: 'Week 3', subtitle: 'Two days left' },
}

describe('normalizeCampaigns', () => {
    it('keys the results by campaign type', () => {
        const out = normalizeCampaigns({
            results: [milestone, { campaign_type: 'AFFILIATE', is_active: true }],
        })
        expect(out.MILESTONE?.name).toBe('Grow your fanbase')
        expect(out.AFFILIATE?.is_active).toBe(true)
        expect(out.LUCKY_WHEEL).toBeNull()
    })

    it('drops a row it cannot parse but keeps the rest of the response', () => {
        // The failure this guards: an array-level `.catch([])` would blank all three cards
        // because one campaign arrived with a type nobody has shipped yet.
        const out = normalizeCampaigns({
            results: [{ campaign_type: 'SOMETHING_NEW', is_active: true }, milestone],
        })
        expect(out.MILESTONE?.name).toBe('Grow your fanbase')
    })

    it('keeps unknown fields rather than stripping them', () => {
        const out = normalizeCampaigns({ results: [{ ...milestone, banner_color: '#fff' }] })
        expect(out.MILESTONE).toMatchObject({ banner_color: '#fff' })
    })

    it('treats a missing or malformed flag as off, never on', () => {
        const out = normalizeCampaigns({
            results: [{ campaign_type: 'LUCKY_WHEEL', name: 'Wheel' }],
        })
        expect(out.LUCKY_WHEEL?.is_active).toBe(false)
    })

    it('collapses absent optional text to null', () => {
        const out = normalizeCampaigns({ results: [{ campaign_type: 'AFFILIATE' }] })
        expect(out.AFFILIATE?.logo).toBeNull()
        expect(out.AFFILIATE?.milestone_details).toBeNull()
    })

    it('takes the first row when a type somehow repeats', () => {
        const out = normalizeCampaigns({
            results: [milestone, { ...milestone, name: 'Second' }],
        })
        expect(out.MILESTONE?.name).toBe('Grow your fanbase')
    })

    it('survives a body that is not a page at all', () => {
        expect(normalizeCampaigns(null)).toEqual(EMPTY_CAMPAIGNS)
        expect(normalizeCampaigns({})).toEqual(EMPTY_CAMPAIGNS)
        expect(normalizeCampaigns({ results: 'nope' })).toEqual(EMPTY_CAMPAIGNS)
    })
})

describe('campaignReward', () => {
    it('parses the wire string into a number', () => {
        expect(campaignReward(normalizeCampaigns({ results: [milestone] }).MILESTONE)).toBe(1500)
    })

    it('reports nothing for zero, so the card drops the reward line', () => {
        const out = normalizeCampaigns({
            results: [{ ...milestone, total_reward_in_usdt: '0.00' }],
        })
        expect(campaignReward(out.MILESTONE)).toBeNull()
    })

    it('reports nothing for absent or unparseable amounts', () => {
        expect(campaignReward(null)).toBeNull()
        const out = normalizeCampaigns({
            results: [{ ...milestone, total_reward_in_usdt: 'lots' }],
        })
        expect(campaignReward(out.MILESTONE)).toBeNull()
    })
})
