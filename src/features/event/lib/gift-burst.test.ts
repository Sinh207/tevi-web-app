import { describe, expect, it } from 'vitest'
import {
    expireGiftBursts,
    GIFT_BURST_MS,
    giftBurstKey,
    giftSenderName,
    MAX_GIFT_BURSTS,
    mergeGiftBurst,
} from './gift-burst'
import type { LiveChatLine } from './live-message'

/** A gift line, as `parseChatLine` would produce one. */
function gift({
    userId = 'u1',
    giftId = 'g1',
    quantity = 1,
    name = 'Ada',
}: {
    userId?: string | null
    giftId?: string | null
    quantity?: number
    name?: string
} = {}): LiveChatLine {
    return {
        kind: 'gift',
        user: {
            id: userId,
            name,
            avatar: null,
            channel_slug: null,
            is_host: false,
            channel_subscription_duration: null,
            premium_badge: null,
            verified_tick_badge: null,
        },
        gift: {
            id: giftId,
            name: 'Rose',
            image: null,
            thumb: null,
            recipient_name: null,
            price: 1,
            anim_background: null,
            animation: null,
        },
        quantity,
        total: quantity,
        isMember: false,
    }
}

describe('giftBurstKey', () => {
    it('is the sender and the product together', () => {
        expect(giftBurstKey(gift())).toBe('u1-g1')
    })

    it('refuses a frame with no sender or no product — neither can be drawn', () => {
        expect(giftBurstKey(gift({ userId: null }))).toBeNull()
        expect(giftBurstKey(gift({ giftId: null }))).toBeNull()
    })

    it('refuses anything that is not a gift', () => {
        expect(giftBurstKey({ kind: 'notice', text: 'hi' })).toBeNull()
    })
})

describe('mergeGiftBurst', () => {
    it('adds a banner for a gift nobody has sent yet', () => {
        const bursts = mergeGiftBurst([], gift({ quantity: 3 }), 1_000)
        expect(bursts).toHaveLength(1)
        expect(bursts[0]).toMatchObject({ key: 'u1-g1', amount: 3, bumps: 0 })
        expect(bursts[0].expiresAt).toBe(1_000 + GIFT_BURST_MS)
    })

    /**
     * The point of the whole file: ten presses are one banner counting up, not ten banners.
     */
    it('accumulates the same sender and gift into one banner', () => {
        let bursts = mergeGiftBurst([], gift({ quantity: 2 }), 0)
        bursts = mergeGiftBurst(bursts, gift({ quantity: 5 }), 100)
        expect(bursts).toHaveLength(1)
        expect(bursts[0].amount).toBe(7)
    })

    it('restarts the clock on every merge, so a burst leaves after the last one', () => {
        let bursts = mergeGiftBurst([], gift(), 0)
        bursts = mergeGiftBurst(bursts, gift(), 2_000)
        expect(bursts[0].expiresAt).toBe(2_000 + GIFT_BURST_MS)
    })

    /** The counter exists only to be a React key — see the component. */
    it('bumps a counter each time so the figure can replay its animation', () => {
        let bursts = mergeGiftBurst([], gift(), 0)
        expect(bursts[0].bumps).toBe(0)
        bursts = mergeGiftBurst(bursts, gift(), 10)
        bursts = mergeGiftBurst(bursts, gift(), 20)
        expect(bursts[0].bumps).toBe(2)
    })

    it('keeps a bumped banner in place rather than moving it to the end', () => {
        let bursts = mergeGiftBurst([], gift({ userId: 'a' }), 0)
        bursts = mergeGiftBurst(bursts, gift({ userId: 'b' }), 1)
        bursts = mergeGiftBurst(bursts, gift({ userId: 'a' }), 2)
        expect(bursts.map(b => b.key)).toEqual(['a-g1', 'b-g1'])
    })

    it('separates two people sending the same gift, and one person sending two', () => {
        let bursts = mergeGiftBurst([], gift({ userId: 'a', giftId: 'rose' }), 0)
        bursts = mergeGiftBurst(bursts, gift({ userId: 'b', giftId: 'rose' }), 0)
        bursts = mergeGiftBurst(bursts, gift({ userId: 'a', giftId: 'crown' }), 0)
        expect(bursts).toHaveLength(3)
    })

    /**
     * Legacy has no cap at all: a busy room stacks a banner per gifter up the whole edge.
     */
    it('caps the stack and drops the oldest, never the one that just happened', () => {
        let bursts: ReturnType<typeof mergeGiftBurst> = []
        for (const userId of ['a', 'b', 'c', 'd']) {
            bursts = mergeGiftBurst(bursts, gift({ userId }), 0)
        }
        expect(bursts).toHaveLength(MAX_GIFT_BURSTS)
        expect(bursts.map(b => b.key)).toEqual(['b-g1', 'c-g1', 'd-g1'])
    })

    it('leaves the list untouched for a frame it cannot group', () => {
        const bursts = mergeGiftBurst([], gift(), 0)
        expect(mergeGiftBurst(bursts, gift({ giftId: null }), 0)).toBe(bursts)
    })
})

describe('expireGiftBursts', () => {
    it('drops what has run out and keeps what has not', () => {
        let bursts = mergeGiftBurst([], gift({ userId: 'a' }), 0)
        bursts = mergeGiftBurst(bursts, gift({ userId: 'b' }), 1_000)
        // Past a's whole display, one tick short of b's.
        const kept = expireGiftBursts(bursts, 1_000 + GIFT_BURST_MS - 1)
        expect(kept.map(b => b.key)).toEqual(['b-g1'])
    })

    /** `expiresAt` is the moment it goes, not the last moment it is up. Pinned on both sides. */
    it('keeps a banner up to its expiry and drops it on it', () => {
        const bursts = mergeGiftBurst([], gift(), 1_000)
        const expiresAt = bursts[0].expiresAt
        expect(expireGiftBursts(bursts, expiresAt - 1)).toHaveLength(1)
        expect(expireGiftBursts(bursts, expiresAt)).toHaveLength(0)
    })

    /** The whole reason the sweep can run on a timer without re-rendering a quiet room. */
    it('returns the same array when nothing expired', () => {
        const bursts = mergeGiftBurst([], gift(), 1_000)
        expect(expireGiftBursts(bursts, 1_100)).toBe(bursts)
    })
})

describe('giftSenderName', () => {
    it('falls back rather than leaving the line blank', () => {
        const line = gift()
        expect(giftSenderName(null, 'Someone')).toBe('Someone')
        expect(giftSenderName(line.kind === 'gift' ? line.user : null, 'Someone')).toBe('Ada')
    })
})
