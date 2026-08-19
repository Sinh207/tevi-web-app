import { describe, expect, it } from 'vitest'
import { normalizeCurrentCampaign, normalizePrograms, normalizeStats } from './types'

const row = {
    id: 7,
    name: 'Coin Rush',
    url: 'https://mini.example/coin-rush',
    icon_url: 'https://cdn.example/icon.png',
    commission_rate: '12.5',
    estimate_income: '1500.00',
    promoter_count: 1500,
}

describe('normalizePrograms', () => {
    it('parses a page of programs', () => {
        const [program] = normalizePrograms({ results: [row] })
        expect(program).toMatchObject({ name: 'Coin Rush', commission_rate: 12.5 })
    })

    it('normalises the id to a string', () => {
        // The id is only ever compared and sent back. Legacy compares a raw wire value, so a
        // numeric `1` from one endpoint and a string `'1'` from another read as different
        // programs — which turns a re-join into a "switch" nobody asked for.
        expect(normalizePrograms({ results: [row] })[0]?.id).toBe('7')
        expect(normalizePrograms({ results: [{ ...row, id: '7' }] })[0]?.id).toBe('7')
    })

    it('parses money and rates that arrive as strings', () => {
        const [program] = normalizePrograms({ results: [row] })
        expect(program?.estimate_income).toBe(1500)
    })

    it('reports an unparseable figure as null rather than NaN', () => {
        const [program] = normalizePrograms({ results: [{ ...row, estimate_income: 'lots' }] })
        expect(program?.estimate_income).toBeNull()
    })

    it('drops a row it cannot parse but keeps the page', () => {
        const programs = normalizePrograms({ results: [{ name: 'no id' }, row] })
        expect(programs).toHaveLength(1)
        expect(programs[0]?.name).toBe('Coin Rush')
    })

    it('accepts a bare array as well as a page', () => {
        expect(normalizePrograms([row])).toHaveLength(1)
    })

    it('survives a body that is not a list at all', () => {
        expect(normalizePrograms(null)).toEqual([])
        expect(normalizePrograms({ results: 'nope' })).toEqual([])
    })
})

describe('normalizeCurrentCampaign', () => {
    it('parses the promoted campaign', () => {
        const campaign = normalizeCurrentCampaign({ program: row, referral_url: 'https://t.ev/a' })
        expect(campaign?.program?.id).toBe('7')
        expect(campaign?.referral_url).toBe('https://t.ev/a')
    })

    it('reports null when nothing is being promoted', () => {
        expect(normalizeCurrentCampaign(null)).toBeNull()
        expect(normalizeCurrentCampaign({})).toBeNull()
        expect(normalizeCurrentCampaign({ program: null })).toBeNull()
    })

    it('reports null when the program cannot be identified', () => {
        // A campaign whose program has no id cannot be displayed, switched away from or left, so
        // "promoting nothing" is the only state the screens can act on.
        expect(normalizeCurrentCampaign({ program: { name: 'no id' } })).toBeNull()
    })
})

describe('normalizeStats', () => {
    it('parses the two figures', () => {
        expect(normalizeStats({ referee_count: 12, total_earnings: '4.5' })).toMatchObject({
            referee_count: 12,
            total_earnings: 4.5,
        })
    })

    it('reports absent figures as null, so the screen shows a skeleton not a zero', () => {
        expect(normalizeStats({})).toMatchObject({ referee_count: null, total_earnings: null })
    })
})
