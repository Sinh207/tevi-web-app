import { describe, expect, it } from 'vitest'
import { channelEventSchema } from '../api/events-api'
import { appLink, isExclusiveLive, isPlatformRestricted, liveAccess } from './live-access'

const event = (fields: Record<string, unknown>) =>
    channelEventSchema.parse({ code: 'c', title: 't', status: 'LIVE', ...fields })

describe('liveAccess', () => {
    it('offers both routes when a stream is priced and members-only', () => {
        // The real payload's shape: price is a decimal *string*, packages is a list of ids.
        expect(
            liveAccess(
                event({ price: '3.00', required_packages: ['pkg'], need_unlock_package: true }),
            ),
        ).toEqual({ key: 'channel_live_members_or', price: 3 })
    })

    it('says members only when there is no price', () => {
        expect(
            liveAccess(event({ required_packages: ['pkg'], need_unlock_package: true })),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    it('says unlock when it is priced and open to anyone who pays', () => {
        expect(liveAccess(event({ price: '10.50' }))).toEqual({
            key: 'channel_live_unlock_for',
            price: 10.5,
        })
    })

    it('says nothing for an ordinary open stream — the case legacy prices at zero', () => {
        /*
         * `Boolean(price && parseInt(price, 10) <= 0)` is false for a missing price, so legacy's
         * `isExclusive` is true and it prints "Unlock for 0 ⭐" over a free stream.
         */
        expect(liveAccess(event({}))).toBeNull()
        expect(liveAccess(event({ price: '0.00' }))).toBeNull()
        expect(liveAccess(event({ price: 'not a number' }))).toBeNull()
    })

    /**
     * Two readers who owe nothing, and they are **not** the same case any more.
     *
     * Somebody who has *bought* the stream needs no badge at all — a price on it would be a second
     * bill. Somebody who holds the *membership* still gets "Members only": the stream is gated and
     * the badge over the art says so, it just stops inviting them to join something they are in.
     * A real card is what drew the distinction — see the describe block at the foot of this file.
     */
    it('says nothing to someone who already paid, and only states the gating to a member', () => {
        expect(liveAccess(event({ price: '3.00', purchased: true }))).toBeNull()
        expect(
            liveAccess(
                event({ price: '3.00', required_packages: ['pkg'], need_unlock_package: false }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })
})

describe('isPlatformRestricted', () => {
    it('is restricted when the list names the website, whatever the case', () => {
        expect(isPlatformRestricted(event({ restricted_platforms: ['Website'] }))).toBe(true)
        expect(isPlatformRestricted(event({ restricted_platforms: ['website'] }))).toBe(true)
        expect(isPlatformRestricted(event({ restricted_platforms: ['iOS', 'Website'] }))).toBe(true)
    })

    it('is not restricted when the list names other platforms, or nothing', () => {
        expect(isPlatformRestricted(event({ restricted_platforms: ['iOS'] }))).toBe(false)
        expect(isPlatformRestricted(event({}))).toBe(false)
        // A non-array is the payload being odd, not a restriction — fail open, since the event page
        // enforces this too and locking a stream out on a parse slip is the worse mistake.
        expect(isPlatformRestricted(event({ restricted_platforms: 'Website' }))).toBe(false)
    })
})

describe('appLink', () => {
    it('prefers the short public URL, then the shareable one', () => {
        expect(
            appLink(
                event({
                    public_url: 'https://tevi.com/e/123/',
                    shareable_url: 'https://tevi.com/@ada/event/123/',
                }),
            ),
        ).toBe('https://tevi.com/e/123/')
        expect(appLink(event({ shareable_url: 'https://tevi.com/@ada/event/123/' }))).toBe(
            'https://tevi.com/@ada/event/123/',
        )
    })

    it('is null when the payload carried neither — the one case the button cannot be drawn', () => {
        expect(appLink(event({}))).toBeNull()
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
        expect(isExclusiveLive(event({ price: '250' }))).toBe(true)
    })

    it('is exclusive when it needs a membership', () => {
        expect(isExclusiveLive(event({ required_packages: ['pkg'] }))).toBe(true)
    })

    it('stays exclusive for a reader who already bought it', () => {
        expect(isExclusiveLive(event({ price: '250', purchased: true }))).toBe(true)
        expect(liveAccess(event({ price: '250', purchased: true }))).toBeNull()
    })

    it('stays exclusive for a member the backend says is not locked out', () => {
        const held = event({ required_packages: ['pkg'], need_unlock_package: false })
        expect(isExclusiveLive(held)).toBe(true)
        /* Not null: the badge still *states* the gating for somebody who can watch — see the
           branch in `liveAccess`. What it stops doing is inviting them to join. */
        expect(liveAccess(held)).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /** The case legacy's *home* card gets wrong — an absent price is not a gate. */
    it('is free when the payload carries no price and no packages', () => {
        expect(isExclusiveLive(event({}))).toBe(false)
    })

    it('is free at a price of zero', () => {
        expect(isExclusiveLive(event({ price: '0' }))).toBe(false)
        expect(isExclusiveLive(event({ price: '0.00' }))).toBe(false)
    })

    /** `Number`, not `parseInt` — a sub-Star price must not floor to nothing. */
    it('is exclusive at a fractional price', () => {
        expect(isExclusiveLive(event({ price: '0.50' }))).toBe(true)
    })

    it('is free when the price is not a number at all', () => {
        expect(isExclusiveLive(event({ price: 'free' }))).toBe(false)
    })
})

/**
 * The reader who is **not** locked out, which is the case a real card reported: a creator looking at
 * their own members-only broadcast saw the *Exclusive* chip and a blank banner, because the badge
 * was driven by an invitation that had correctly been withdrawn.
 */
describe('liveAccess states the gating even when there is nothing to unlock', () => {
    it('says members only to somebody who already holds the membership', () => {
        expect(
            liveAccess(event({ required_packages: ['pkg'], need_unlock_package: false })),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /** A member does not need the price of the route they already took. */
    it('drops the both-routes label to members only for a member', () => {
        expect(
            liveAccess(
                event({ price: '250', required_packages: ['pkg'], need_unlock_package: false }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /** Still the invitation for somebody who is locked out. */
    it('keeps both routes for a reader who is', () => {
        expect(
            liveAccess(
                event({ price: '250', required_packages: ['pkg'], need_unlock_package: true }),
            ),
        ).toEqual({ key: 'channel_live_members_or', price: 250 })
    })

    /** A bought stream is the one case with nothing to say — a price on it would be a second bill. */
    it('still says nothing about a stream the reader has purchased', () => {
        expect(liveAccess(event({ price: '250', purchased: true }))).toBeNull()
    })

    it('still says nothing about an open stream', () => {
        expect(liveAccess(event({}))).toBeNull()
    })
})

/**
 * The two paths that still erased the badge on a members-only stream after the first fix, both found
 * by re-reading the function against a real card rather than by a failing test.
 */
describe('liveAccess never loses a membership', () => {
    /**
     * `required_packages` arriving as **objects** rather than ids. The parse filtered to
     * `typeof === 'string'`, so the array emptied, `requiresMembership` went false, and the stream
     * was read as **open** — no badge, and advertised as free. The array trapdoor, one field over
     * from where `channelCategorySchema` documents it.
     */
    it('reads a membership whether the rows are ids or objects', () => {
        for (const rows of [['pkg'], [{ id: 'pkg' }], [{ package_id: 'pkg' }], [{ id: 42 }]]) {
            expect(
                liveAccess(event({ required_packages: rows, need_unlock_package: true })),
                JSON.stringify(rows),
            ).toEqual({ key: 'channel_live_members_only', price: null })
        }
    })

    it('drops rows it cannot reduce to an id without emptying the array', () => {
        expect(
            liveAccess(
                event({ required_packages: ['pkg', null, {}, 7], need_unlock_package: true }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /**
     * `purchased` is checked **after** the membership test now. A creator's own stream can come back
     * `purchased: true`, and checked first that blanked the banner on a stream that is still
     * members-only — the reported card.
     */
    it('still states members only to somebody who has purchased it', () => {
        expect(liveAccess(event({ required_packages: ['pkg'], purchased: true }))).toEqual({
            key: 'channel_live_members_only',
            price: null,
        })
    })

    /** What `purchased` legitimately suppresses is the **price**, not the membership. */
    it('drops the price but keeps the membership for a purchased both-routes stream', () => {
        expect(
            liveAccess(
                event({
                    price: '250',
                    required_packages: ['pkg'],
                    need_unlock_package: true,
                    purchased: true,
                }),
            ),
        ).toEqual({ key: 'channel_live_members_only', price: null })
    })

    /** And a pure price case is still silenced outright — a figure on it would be a second bill. */
    it('says nothing about a purchased price-only stream', () => {
        expect(liveAccess(event({ price: '250', purchased: true }))).toBeNull()
    })
})
