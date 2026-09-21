import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import {
    canReply,
    hasReacted,
    isGated,
    isLocked,
    isNsfw,
    isPurchased,
    postActionVisibility,
    postDisplay,
    postGate,
    postMenuVisibility,
    replyCost,
    spaceTierBadge,
} from './post-access'

/** Built through the schema, so a test can never assert on a shape the parser would not produce. */
function post(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: '1', ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

describe('postGate', () => {
    it('is open when neither a product nor a tier gates it', () => {
        expect(postGate(post())).toBe('open')
    })

    it('is purchase when only a product id is present', () => {
        expect(postGate(post({ product_id: 'p1' }))).toBe('purchase')
    })

    it('is members when only tiers are present', () => {
        expect(postGate(post({ required_packages: [{ id: 't1' }] }))).toBe('members')
    })

    it('is members-or-purchase when both routes exist', () => {
        expect(postGate(post({ product_id: 'p1', required_packages: [{ id: 't1' }] }))).toBe(
            'members-or-purchase',
        )
    })

    /**
     * `nullableId` turns `''` into `null` precisely so this cannot happen — a blank product id must
     * not put a price on a free post.
     */
    it('treats a blank product id as no product', () => {
        expect(postGate(post({ product_id: '' }))).toBe('open')
    })
})

describe('isLocked', () => {
    const gated = { product_id: 'p1', need_unlock_package: true }

    it('locks a gated post the backend says the reader is a stargazer for', () => {
        expect(isLocked(post({ ...gated, viewer: 'STARGAZERS' }))).toBe(true)
    })

    /**
     * The bug this function exists to prevent: `need_unlock_package` stays true after purchase, so
     * a member is shown the lock screen for content they own unless `viewer` is also consulted.
     */
    it('does not lock a reader the backend no longer calls a stargazer', () => {
        expect(isLocked(post({ ...gated, viewer: 'MEMBER' }))).toBe(false)
    })

    it('never locks an ungated post, even if the flag arrives set', () => {
        expect(isLocked(post({ need_unlock_package: true, viewer: 'STARGAZERS' }))).toBe(false)
    })

    it('pairs with isPurchased only among gated posts', () => {
        const open = post()
        expect(isGated(open)).toBe(false)
        expect(isLocked(open)).toBe(false)
        expect(isPurchased(open)).toBe(false)

        const paid = post({ ...gated, viewer: 'MEMBER' })
        expect(isLocked(paid)).toBe(false)
        expect(isPurchased(paid)).toBe(true)
    })
})

describe('isNsfw', () => {
    it('takes either source on its own', () => {
        expect(isNsfw(post({ detected_nsfw: true }))).toBe(true)
        expect(isNsfw(post({ marked_nsfw: true }))).toBe(true)
        expect(isNsfw(post())).toBe(false)
    })
})

describe('postDisplay', () => {
    it('puts deleted ahead of every other state', () => {
        const deleted = post({
            deleted: true,
            marked_nsfw: true,
            product_id: 'p1',
            viewer: 'STARGAZERS',
            need_unlock_package: true,
        })
        expect(postDisplay(deleted)).toBe('deleted')
    })

    /**
     * A locked post's media is withheld by the backend, so there is nothing to blur. Offering the
     * NSFW reveal first would open onto an empty card.
     */
    it('puts locked ahead of nsfw', () => {
        const both = post({
            marked_nsfw: true,
            product_id: 'p1',
            viewer: 'STARGAZERS',
            need_unlock_package: true,
        })
        expect(postDisplay(both)).toBe('locked')
    })

    it('falls through to the body', () => {
        expect(postDisplay(post())).toBe('body')
    })
})

describe('canReply', () => {
    it('needs the creator switch and the backend decision to agree', () => {
        expect(canReply(post({ reply_allowed: true, can_reply: true }))).toBe(true)
    })

    /**
     * The real case: replies are on, but restricted to followers, so a stranger gets
     * `reply_allowed: true` with `can_reply: false`. Reading only the first renders a box whose
     * submit the API refuses.
     */
    it('refuses when the creator allows replies but this reader may not', () => {
        expect(canReply(post({ reply_allowed: true, can_reply: false }))).toBe(false)
    })

    it('refuses on a deleted post whatever the flags say', () => {
        expect(canReply(post({ reply_allowed: true, can_reply: true, deleted: true }))).toBe(false)
    })
})

describe('replyCost', () => {
    const charging = {
        channel: { id: 'c1', paid_interaction_enabled: true, paid_interaction_cost: 5 },
    }

    it('is the channel cost for an ordinary reader', () => {
        expect(replyCost(post(charging), { isPremiumReader: false })).toBe(5)
    })

    it('is free for the creator on their own post', () => {
        expect(replyCost(post({ ...charging, is_owner: true }), { isPremiumReader: false })).toBe(
            null,
        )
    })

    it('is free for a premium reader', () => {
        expect(replyCost(post(charging), { isPremiumReader: true })).toBe(null)
    })

    it('is free when the channel has the switch off, whatever cost it carries', () => {
        const off = {
            channel: { id: 'c1', paid_interaction_enabled: false, paid_interaction_cost: 5 },
        }
        expect(replyCost(post(off), { isPremiumReader: false })).toBe(null)
    })

    /** A cost of zero is not a charge, and must not render a Star price of 0. */
    it('is free when the cost is zero or missing', () => {
        const zero = {
            channel: { id: 'c1', paid_interaction_enabled: true, paid_interaction_cost: 0 },
        }
        expect(replyCost(post(zero), { isPremiumReader: false })).toBe(null)
        const missing = { channel: { id: 'c1', paid_interaction_enabled: true } }
        expect(replyCost(post(missing), { isPremiumReader: false })).toBe(null)
    })
})

describe('hasReacted', () => {
    it('reads the reaction type, not the object', () => {
        expect(hasReacted(post({ user_reaction: { type: 'LIKE' } }))).toBe(true)
        expect(hasReacted(post({ user_reaction: {} }))).toBe(false)
        expect(hasReacted(post())).toBe(false)
    })
})

describe('spaceTierBadge', () => {
    const image = 'https://static.tevicdn.com/tier.png'

    it('draws the mark from tier 1 up', () => {
        const p = post({ channel: { id: '1', space_tier: 3, space_tier_image: image } })
        expect(spaceTierBadge(p.channel)).toBe(image)
    })

    /**
     * The bug this prevents: every channel has a `space_tier` and most are `0`, and the backend
     * still sends an image alongside. Gate on the image alone and every ordinary channel wears a
     * tier badge it has not earned.
     */
    it('draws nothing at tier 0, even though an image is sent', () => {
        const p = post({ channel: { id: '1', space_tier: 0, space_tier_image: image } })
        expect(spaceTierBadge(p.channel)).toBe(null)
    })

    /**
     * `space_tier` arrives as a JSON **number**. Declared as text it parses to `null`, the gate can
     * never be satisfied, and the badge silently never renders — which is how it was found.
     */
    it('reads the tier as a number rather than dropping it', () => {
        const p = post({ channel: { id: '1', space_tier: 2, space_tier_image: image } })
        expect(p.channel?.space_tier).toBe(2)
    })

    /**
     * The backend's rungs are 0, 1, 2, 5, 10 — not consecutive. So the gate is a comparison against
     * zero and nothing else: no upper bound, no step assumption, no index into a list.
     */
    it('draws every rung above zero, however far apart they are', () => {
        for (const tier of [1, 2, 5, 10, 47]) {
            const p = post({ channel: { id: '1', space_tier: tier, space_tier_image: image } })
            expect(spaceTierBadge(p.channel)).toBe(image)
        }
    })

    it('draws nothing when the tier is absent or the image is', () => {
        expect(
            spaceTierBadge(post({ channel: { id: '1', space_tier_image: image } }).channel),
        ).toBe(null)
        expect(spaceTierBadge(post({ channel: { id: '1', space_tier: 3 } }).channel)).toBe(null)
        expect(spaceTierBadge(null)).toBe(null)
    })
})

describe('postActionVisibility', () => {
    const on = { quoteEnabled: true }
    const off = { quoteEnabled: false }

    it("shows everything on a stranger's post with replies open and quote on", () => {
        const p = post({ reply_allowed: true })
        expect(postActionVisibility(p, on)).toEqual({
            comment: true,
            sendMessage: true,
            quote: true,
            bookmark: true,
        })
    })

    /**
     * The guard legacy actually uses is the creator's switch, **not** `can_reply`. A follower-only
     * post still shows a stranger the button and the count; what it withholds is the box.
     */
    it('hides comment on the creator switch alone, not on whether this reader may reply', () => {
        expect(postActionVisibility(post({ reply_allowed: false }), on).comment).toBe(false)
        const restricted = post({ reply_allowed: true, can_reply: false })
        expect(postActionVisibility(restricted, on).comment).toBe(true)
        // …while the reply box itself is still refused.
        expect(canReply(restricted)).toBe(false)
    })

    it("hides send message and bookmark on the reader's own post", () => {
        const mine = postActionVisibility(post({ reply_allowed: true, is_owner: true }), on)
        expect(mine.sendMessage).toBe(false)
        expect(mine.bookmark).toBe(false)
        // Commenting on your own post is ordinary, so that one stays.
        expect(mine.comment).toBe(true)
    })

    /** The console decides, and an unreachable Firebase means off. */
    it('hides quote when the flag is off', () => {
        expect(postActionVisibility(post({ reply_allowed: true }), off).quote).toBe(false)
    })
})

describe('postMenuVisibility', () => {
    const post = (overrides: Record<string, unknown> = {}) => {
        const parsed = normalizePost({
            id: 'p1',
            channel: { id: 'c1', owner_id: 'u1' },
            ...overrides,
        })
        if (!parsed) throw new Error('fixture did not parse')
        return parsed
    }

    /**
     * The split is **total**, not a superset. A menu that could show *Delete* beside *Report* would
     * be one wrong `is_owner` away from offering to delete another person's post.
     */
    it('gives the owner four rows and none of the moderation ones', () => {
        expect(postMenuVisibility(post({ is_owner: true }), { reportEnabled: true })).toEqual({
            pin: true,
            replyAllowed: true,
            edit: false,
            delete: true,
            report: false,
            block: false,
        })
    })

    it('gives a stranger the two moderation rows and none of the owner ones', () => {
        expect(postMenuVisibility(post(), { reportEnabled: true })).toEqual({
            pin: false,
            replyAllowed: false,
            edit: false,
            delete: false,
            report: true,
            block: true,
        })
    })

    /**
     * `edit` opens the composer, which does not exist — so it is off by default and is the one owner
     * row a caller has to switch on. A button that navigates nowhere is worse than one that is
     * plainly absent.
     */
    it('offers edit only when the caller says the composer exists', () => {
        expect(postMenuVisibility(post({ is_owner: true }), { reportEnabled: true }).edit).toBe(
            false,
        )
        expect(
            postMenuVisibility(post({ is_owner: true }), { reportEnabled: true, canEdit: true })
                .edit,
        ).toBe(true)
    })

    /** The console's kill switch on post reporting, failing closed. Block has no such flag. */
    it('hides report when the console switch is off, and leaves block alone', () => {
        const shows = postMenuVisibility(post(), { reportEnabled: false })
        expect(shows.report).toBe(false)
        expect(shows.block).toBe(true)
    })

    /**
     * Blocks are keyed by **user** id, not channel id. Without `owner_id` the row would open a
     * confirmation whose confirm button has nothing to send.
     */
    it('hides block when the channel carries no owner_id', () => {
        expect(
            postMenuVisibility(post({ channel: { id: 'c1' } }), { reportEnabled: true }).block,
        ).toBe(false)
    })

    /** A tombstone offers nothing — legacy hides the trigger entirely, and every row would act on a row that is gone. */
    it('offers nothing at all on a deleted post, from either side', () => {
        for (const owner of [true, false]) {
            const shows = postMenuVisibility(post({ deleted: true, is_owner: owner }), {
                reportEnabled: true,
                canEdit: true,
            })
            expect(Object.values(shows).every(value => value === false)).toBe(true)
        }
    })
})
