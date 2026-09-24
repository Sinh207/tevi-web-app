import type { SustainedFeeRule } from '@shared/lib/remote-config'
import { describe, expect, it } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { sustainedFee } from './sustained-fee'

/**
 * **The gate on a recurring charge.**
 *
 * Every wrong answer here is money moving, or not moving, without anybody noticing. The one
 * legacy actually has is the exclusive-only rule, which has never charged a single viewer since
 * it was written — and looks completely correct in the file it lives in.
 */
const rule = (fields: Partial<SustainedFeeRule> = {}): SustainedFeeRule => ({
    enable: true,
    enableWithEventVisibility: null,
    enableWithLiveType: ['free'],
    fee: 1,
    chargeDuration: 5,
    ...fields,
})

const event = (fields: Record<string, unknown> = {}) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        status: 'LIVE',
        paid_interactions: true,
        channel: { id: 'ch-1', slug: 'ada' },
        ...fields,
    })

describe('no rule at all', () => {
    /**
     * `null`, not a disabled object — a screen must be unable to say "1 Star every 5 minutes"
     * when the answer is "nobody is charged here". The fallbacks live on the rule, so they are
     * only reachable once a rule exists.
     */
    it('answers null rather than the fallback figures', () => {
        expect(sustainedFee(event(), null)).toBeNull()
    })

    it('answers null for a rule that is switched off', () => {
        expect(sustainedFee(event(), rule({ enable: false }))).toBeNull()
    })
})

describe('the creator’s own switch', () => {
    /** It outranks every console rule: paid interactions off charges nobody. */
    it('charges nobody when paid interactions are off', () => {
        expect(sustainedFee(event({ paid_interactions: false }), rule())).toBeNull()
    })

    /* `boolish` fails to false, so a payload missing the field bills nobody. */
    it('charges nobody when the field is absent', () => {
        expect(sustainedFee(event({ paid_interactions: undefined }), rule())).toBeNull()
    })
})

describe('visibility', () => {
    /* `null` is "no restriction" — the distinction `optionalTextList` exists to keep. */
    it('applies everywhere when the rule names no visibilities', () => {
        expect(sustainedFee(event({ visibility: 'public' }), rule())).toMatchObject({ fee: 1 })
    })

    it('applies to a visibility the rule lists', () => {
        const r = rule({ enableWithEventVisibility: ['public', 'unlisted'] })
        expect(sustainedFee(event({ visibility: 'unlisted' }), r)).toMatchObject({ fee: 1 })
    })

    it('does not apply to one it omits', () => {
        const r = rule({ enableWithEventVisibility: ['public'] })
        expect(sustainedFee(event({ visibility: 'private' }), r)).toBeNull()
    })

    /** `[]` is "nothing passes", which is a real console state and not the same as `null`. */
    it('applies to nothing for an empty list', () => {
        const r = rule({ enableWithEventVisibility: [] })
        expect(sustainedFee(event({ visibility: 'public' }), r)).toBeNull()
    })

    /*
     * An event whose payload omits `visibility` cannot satisfy a list. Excluded rather than
     * waved through — this gate spends money.
     */
    it('does not apply when the event has no visibility to check', () => {
        const r = rule({ enableWithEventVisibility: ['public'] })
        expect(sustainedFee(event({ visibility: null }), r)).toBeNull()
    })
})

describe('live type', () => {
    const free = event({ price: null })
    const paid = event({ price: '250', product_id: 'p1' })
    const members = event({ required_packages: ['pkg-1'] })

    it('charges a free live when the rule lists free', () => {
        expect(sustainedFee(free, rule({ enableWithLiveType: ['free'] }))).toMatchObject({ fee: 1 })
    })

    it('does not charge a free live when the rule does not list free', () => {
        expect(sustainedFee(free, rule({ enableWithLiveType: ['paid'] }))).toBeNull()
    })

    /**
     * ⚠ **The bug legacy has.** Its exclusive branch checks `paid`/`member`, then falls through
     * to `return types.includes('free')` — so an exclusive-only rule resolves to `false` and has
     * never charged anybody. `types.ts` in the remote-config module records it from the other
     * side; this is the assertion.
     */
    it('charges an exclusive live on a rule that lists only paid and member', () => {
        const r = rule({ enableWithLiveType: ['paid', 'member'] })
        expect(sustainedFee(paid, r)).toMatchObject({ fee: 1 })
        expect(sustainedFee(members, r)).toMatchObject({ fee: 1 })
    })

    /* The two branches are exclusive: a free-only rule must not reach an exclusive live. */
    it('does not charge an exclusive live on a free-only rule', () => {
        expect(sustainedFee(paid, rule({ enableWithLiveType: ['free'] }))).toBeNull()
    })

    it('charges nobody on a rule that lists no types at all', () => {
        expect(sustainedFee(free, rule({ enableWithLiveType: [] }))).toBeNull()
        expect(sustainedFee(paid, rule({ enableWithLiveType: [] }))).toBeNull()
    })
})

describe('figures a human-edited console can produce', () => {
    /**
     * A duration of zero is an interval of 0ms — a charge every tick, i.e. a runaway bill. The
     * schema's fallback covers *absence*; this covers a typed-in zero.
     */
    it('refuses a zero duration rather than charging continuously', () => {
        expect(sustainedFee(event(), rule({ chargeDuration: 0 }))).toBeNull()
    })

    it('refuses a negative or zero fee rather than issuing a refund', () => {
        expect(sustainedFee(event(), rule({ fee: 0 }))).toBeNull()
        expect(sustainedFee(event(), rule({ fee: -5 }))).toBeNull()
    })

    it('carries the console’s figures through when they are sane', () => {
        const r = rule({ fee: 2.5, chargeDuration: 10 })
        expect(sustainedFee(event(), r)).toEqual({ fee: 2.5, durationMinutes: 10 })
    })
})
