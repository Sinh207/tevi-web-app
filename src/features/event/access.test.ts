import { describe, expect, it } from 'vitest'
import { appLink, isExclusiveLive, isPlatformRestricted, liveAccess } from './access'

/**
 * Plain objects rather than a parsed DTO, and that is the whole point of the module being
 * structural: the rule is shared by two schemas on two services, so a test that pinned it to one of
 * them would be asserting that service's wire format alongside the product rule. Each schema's
 * **compatibility** with these shapes is checked by `tsc` at every call site, which is a stronger
 * guarantee than one fixture.
 *
 * ⚠ The cases that used to live here and *were* about parsing — `required_packages` arriving as
 * objects, `restricted_platforms` arriving as a bare string — moved to
 * `features/channel/api/events-api.test.ts`, next to the schema that decides them. They were
 * load-bearing (an emptied `required_packages` array reads a members-only stream as **free**), so
 * they are asserted there directly rather than through this rule.
 */
const gate = (fields: Partial<Parameters<typeof liveAccess>[0]> = {}) => ({
    price: null,
    required_packages: [],
    need_unlock_package: false,
    purchased: false,
    ...fields,
})

const links = (fields: Partial<Parameters<typeof appLink>[0]> = {}) => ({
    public_url: null,
    shareable_url: null,
    ...fields,
})

describe('liveAccess', () => {
    it('offers both routes when a stream is priced and members-only', () => {
        // The real payload's shape: price is a decimal *string*, packages is a list of ids.
        expect(
            liveAccess(
                gate({ price: '3.00', required_packages: ['pkg'], need_unlock_package: true }),
            ),
        ).toEqual({ key: 'channel_live_members_or', price: 3 })
    })

    it('says members only when there is no price', () => {
        expect(liveAccess(gate({ required_packages: ['pkg'], need_unlock_package: true }))).toEqual(
            {
                key: 'channel_live_members_only',
                price: null,
            },
        )
    })

    it('says unlock when it is priced and open to anyone who pays', () => {
        expect(liveAccess(gate({ price: '10.50' }))).toEqual({
            key: 'channel_live_unlock_for',
            price: 10.5,
        })
    })

    it('says nothing for an ordinary open stream — the case legacy prices at zero', () => {
        /*
         * `Boolean(price && parseInt(price, 10) <= 0)` is false for a missing price, so legacy's
         * `isExclusive` is true and it prints "Unlock for 0 ⭐" over a free stream.
         */
        expect(liveAccess(gate())).toBeNull()
        expect(liveAccess(gate({ price: '0.00' }))).toBeNull()
        expect(liveAccess(gate({ price: 'not a number' }))).toBeNull()
    })

    /**
     * Two readers who owe nothing, and they are **not** the same case.
     *
     * Somebody who has *bought* the stream needs no badge at all — a price on it would be a second
     * bill. Somebody who holds the *membership* still gets "Members only": the stream is gated and
     * the badge over the art says so, it just stops inviting them to join something they are in.
     */
    it('says nothing to someone who already paid, and only states the gating to a member', () => {
        expect(liveAccess(gate({ price: '3.00', purchased: true }))).toBeNull()
        expect(
            liveAccess(
                gate({ price: '3.00', required_packages: ['pkg'], need_unlock_package: false }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /**
     * `purchased` is checked **after** the membership test, and this is the reported card that
     * ordering fixes: a creator looking at their own members-only broadcast saw the *Exclusive* chip
     * and a blank banner, because their own stream comes back `purchased: true`.
     */
    it('still states members only to somebody who has purchased it', () => {
        expect(liveAccess(gate({ required_packages: ['pkg'], purchased: true }))).toEqual({
            key: 'channel_live_members_only',
            price: null,
        })
    })

    /** What `purchased` legitimately suppresses is the **price**, not the membership. */
    it('drops the price but keeps the membership for a purchased both-routes stream', () => {
        expect(
            liveAccess(
                gate({
                    price: '250',
                    required_packages: ['pkg'],
                    need_unlock_package: true,
                    purchased: true,
                }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })
})

describe('isPlatformRestricted', () => {
    it('is restricted when the list names the website, whatever the case', () => {
        expect(isPlatformRestricted({ restricted_platforms: ['Website'] })).toBe(true)
        expect(isPlatformRestricted({ restricted_platforms: ['website'] })).toBe(true)
        expect(isPlatformRestricted({ restricted_platforms: ['iOS', 'Website'] })).toBe(true)
    })

    it('is not restricted when the list names other platforms, or nothing', () => {
        expect(isPlatformRestricted({ restricted_platforms: ['iOS'] })).toBe(false)
        expect(isPlatformRestricted({ restricted_platforms: [] })).toBe(false)
    })
})

describe('appLink', () => {
    it('prefers the short public URL, then the shareable one', () => {
        expect(
            appLink(
                links({
                    public_url: 'https://tevi.com/e/123/',
                    shareable_url: 'https://tevi.com/@ada/event/123/',
                }),
            ),
        ).toBe('https://tevi.com/e/123/')
        expect(appLink(links({ shareable_url: 'https://tevi.com/@ada/event/123/' }))).toBe(
            'https://tevi.com/@ada/event/123/',
        )
    })

    it('is null when the payload carried neither — the one case the button cannot be drawn', () => {
        expect(appLink(links())).toBeNull()
    })
})

/**
 * The chip on the Live now card, and the pair of cases that make it a **separate** function from
 * `liveAccess`: a reader who has paid, and one whose membership the backend has confirmed. For both
 * of those `liveAccess` returns `null` — there is nothing to invite them to unlock — and reusing
 * that as "is it free" would print **Free** on a paid stream, to the very people who paid.
 */
describe('isExclusiveLive', () => {
    it('is exclusive when it costs Star', () => {
        expect(isExclusiveLive(gate({ price: '250' }))).toBe(true)
    })

    it('is exclusive when it needs a membership', () => {
        expect(isExclusiveLive(gate({ required_packages: ['pkg'] }))).toBe(true)
    })

    it('stays exclusive for a reader who already bought it', () => {
        expect(isExclusiveLive(gate({ price: '250', purchased: true }))).toBe(true)
        expect(liveAccess(gate({ price: '250', purchased: true }))).toBeNull()
    })

    it('stays exclusive for a member the backend says is not locked out', () => {
        const held = gate({ required_packages: ['pkg'], need_unlock_package: false })
        expect(isExclusiveLive(held)).toBe(true)
        /* Not null: the badge still *states* the gating for somebody who can watch — see the
           branch in `liveAccess`. What it stops doing is inviting them to join. */
        expect(liveAccess(held)).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /** The case legacy's *home* card gets wrong — an absent price is not a gate. */
    it('is free when the payload carries no price and no packages', () => {
        expect(isExclusiveLive(gate())).toBe(false)
    })

    it('is free at a price of zero', () => {
        expect(isExclusiveLive(gate({ price: '0' }))).toBe(false)
        expect(isExclusiveLive(gate({ price: '0.00' }))).toBe(false)
    })

    /** `Number`, not `parseInt` — a sub-Star price must not floor to nothing. */
    it('is exclusive at a fractional price', () => {
        expect(isExclusiveLive(gate({ price: '0.50' }))).toBe(true)
    })

    it('is free when the price is not a number at all', () => {
        expect(isExclusiveLive(gate({ price: 'free' }))).toBe(false)
    })
})
