import { describe, expect, it } from 'vitest'
import {
    appendChatLine,
    giftThumb,
    parseChatHistory,
    parseChatLine,
    parseTopStars,
} from './live-message'

/**
 * **The chat transcript, which has no second copy.**
 *
 * `get_message_history` is a socket command rather than an endpoint, so a frame this parser drops
 * or mis-reads is gone. Two of legacy's readings are wrong in ways that put internal strings in
 * front of a live audience, and both are pinned below.
 */
const user = { id: 'u1', name: 'Ada', channel_slug: 'ada', is_host: true }

describe('comments', () => {
    it('reads what somebody typed', () => {
        const line = parseChatLine({ type: 'msg', msg: 'hello', user })
        expect(line).toMatchObject({ kind: 'comment', text: 'hello' })
        expect(line?.kind === 'comment' && line.user?.name).toBe('Ada')
    })

    /** A blank frame is a broken one, not a message — a blank row reads as a dropped message. */
    it('drops a frame with nothing in it', () => {
        expect(parseChatLine({ type: 'msg', msg: '   ', user })).toBeNull()
        expect(parseChatLine({ type: 'msg', user })).toBeNull()
        expect(parseChatLine(null)).toBeNull()
    })

    it('keeps a comment whose sender could not be parsed', () => {
        const line = parseChatLine({ type: 'msg', msg: 'hi', user: 'nonsense' })
        expect(line).toMatchObject({ kind: 'comment', text: 'hi', user: null })
    })
})

/**
 * **Three fields this parser looked for in the wrong place**, each of which failed silently: the
 * row still drew, it simply drew without the thing.
 */
describe('fields the wire puts where legacy reads them', () => {
    /**
     * ⚠ The member mark is on the **frame**. All four of legacy's reads are
     * `data.channel_subscription_duration`, and nothing there ever writes it under `user` — so
     * having it only on `liveChatUserSchema` meant `isMember` was never once true and the `MEM`
     * badge never appeared, in a room where membership is what the creator is selling.
     */
    it('reads the member mark off the frame', () => {
        const line = parseChatLine({
            type: 'msg',
            msg: 'hi',
            user,
            channel_subscription_duration: 90,
        })
        expect(line).toMatchObject({ kind: 'comment', isMember: true })
    })

    it('still reads it if the backend ever nests it under the sender', () => {
        const line = parseChatLine({
            type: 'msg',
            msg: 'hi',
            user: { ...user, channel_subscription_duration: 90 },
        })
        expect(line).toMatchObject({ isMember: true })
    })

    it('treats a zero, an empty string and an absent field as "not a member"', () => {
        for (const v of [0, '', null, undefined]) {
            expect(
                parseChatLine({ type: 'msg', msg: 'hi', user, channel_subscription_duration: v }),
            ).toMatchObject({ isMember: false })
        }
    })

    /**
     * ⚠ `thumb` is the picture the sentence draws, and this read `image` only — so every gift
     * line had a hole where the gift is.
     */
    it('prefers the gift’s thumb, falling back to its image', () => {
        expect(giftThumb({ thumb: 't.png', image: 'i.png' } as never)).toBe('t.png')
        expect(giftThumb({ thumb: null, image: 'i.png' } as never)).toBe('i.png')
        expect(giftThumb(null)).toBeNull()
    })

    /**
     * ⚠ The room prices the burst; `quantity × price` is only the fallback. A gift discounted or
     * repriced mid-broadcast would otherwise be mis-stated in a sentence about money.
     */
    it('takes the room’s own Star figure over the arithmetic', () => {
        expect(
            parseChatLine({
                type: 'cmd',
                msg: '/give_gift',
                user,
                gift_amount: 2,
                total_stars: 1500,
                gift_data: { id: 'g1', price: 10 },
            }),
        ).toMatchObject({ total: 1500, quantity: 2 })
    })

    it('falls back to quantity × price when the frame carries no total', () => {
        expect(
            parseChatLine({
                type: 'cmd',
                msg: '/give_gift',
                user,
                gift_amount: 2,
                gift_data: { id: 'g1', price: 10 },
            }),
        ).toMatchObject({ total: 20 })
    })

    it('carries the recipient the gift names', () => {
        const line = parseChatLine({
            type: 'cmd',
            msg: '/give_gift',
            user,
            gift_data: { id: 'g1', price: 10, recipient_name: 'Ada’s Space' },
        })
        expect(line?.kind === 'gift' && line.gift?.recipient_name).toBe('Ada’s Space')
    })
})

describe('commands', () => {
    it('reads a gift, with its quantity and what it is worth', () => {
        const line = parseChatLine({
            type: 'cmd',
            msg: '/give_gift',
            user,
            gift_amount: '3',
            gift_data: { id: 'g1', name: 'Rose', price: 10 },
        })
        expect(line).toMatchObject({ kind: 'gift', quantity: 3, total: 30 })
    })

    it('defaults a missing quantity to one rather than zero', () => {
        const line = parseChatLine({
            type: 'cmd',
            msg: '/give_gift',
            user,
            gift_data: { id: 'g1', price: 10 },
        })
        expect(line).toMatchObject({ quantity: 1, total: 10 })
    })

    it('reads a new member', () => {
        expect(parseChatLine({ type: 'cmd', msg: '/new_subscriber', user })).toMatchObject({
            kind: 'subscriber',
        })
    })

    /**
     * ⚠ **Legacy drops this silently.** Its `cmd` branch has no `else`, so a command added next
     * quarter makes the chat skip a beat with nothing anywhere to say why. Keeping it as
     * `unknown` renders nothing either — but the line exists, so the count is right and it is
     * visible to anybody looking.
     */
    it('keeps a command it does not understand instead of dropping it', () => {
        expect(parseChatLine({ type: 'cmd', msg: '/raffle_started', user })).toMatchObject({
            kind: 'unknown',
            command: '/raffle_started',
        })
    })

    /**
     * ⚠ **The reading that puts an internal string on screen.**
     *
     * Legacy branches on `type === 'cmd'` and its `default:` prints everything else as a comment
     * — so a frame typed `command`, or `CMD`, or anything added later, renders `/give_gift` into
     * the transcript as though a viewer had typed it. The leading slash is what the payload
     * actually distinguishes on.
     */
    it('never prints a command as a comment, whatever the type says', () => {
        for (const type of ['command', 'CMD', 'notification', undefined]) {
            const line = parseChatLine({ type, msg: '/give_gift', user, gift_data: { id: 'g' } })
            expect(line?.kind, `type=${type}`).not.toBe('comment')
        }
    })

    /* `type: 'cmd'` with no slash is a malformed command — still not something to print. */
    it('does not print a slashless cmd frame either', () => {
        expect(parseChatLine({ type: 'cmd', msg: 'give_gift', user })).toMatchObject({
            kind: 'unknown',
        })
    })
})

describe('history', () => {
    it('keeps the rows it can read and drops only the rest', () => {
        const lines = parseChatHistory([
            { type: 'msg', msg: 'one', user },
            null,
            { type: 'msg', msg: '', user },
            { type: 'msg', msg: 'two', user },
        ])
        expect(lines).toHaveLength(2)
    })

    it('answers empty for anything that is not a list', () => {
        expect(parseChatHistory({ data: [] })).toEqual([])
        expect(parseChatHistory(undefined)).toEqual([])
    })
})

describe('collapsing a gift burst', () => {
    const gift = (quantity: number, giftId = 'g1', userId = 'u1') =>
        parseChatLine({
            type: 'cmd',
            msg: '/give_gift',
            user: { ...user, id: userId },
            gift_amount: quantity,
            gift_data: { id: giftId, price: 10 },
        }) as never

    /** Ten taps is ten frames, and ten rows push the conversation off the screen. */
    it('merges consecutive gifts from the same person', () => {
        let lines = appendChatLine([], gift(1))
        lines = appendChatLine(lines, gift(2))
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ quantity: 3, total: 30 })
    })

    it('does not merge a different gift', () => {
        let lines = appendChatLine([], gift(1, 'g1'))
        lines = appendChatLine(lines, gift(1, 'g2'))
        expect(lines).toHaveLength(2)
    })

    it('does not merge a different person', () => {
        let lines = appendChatLine([], gift(1, 'g1', 'u1'))
        lines = appendChatLine(lines, gift(1, 'g1', 'u2'))
        expect(lines).toHaveLength(2)
    })

    /*
     * Adjacency is the rule. Once somebody else has spoken the two gifts are no longer one burst,
     * and merging them would reorder the conversation.
     */
    it('starts a new group once something else has been said', () => {
        let lines = appendChatLine([], gift(1))
        lines = appendChatLine(lines, { kind: 'notice', text: 'welcome' })
        lines = appendChatLine(lines, gift(1))
        expect(lines).toHaveLength(3)
    })

    /* A gift from somebody the parser could not identify must not merge into the one before. */
    it('does not merge when the sender is unknown', () => {
        const anonymous = parseChatLine({
            type: 'cmd',
            msg: '/give_gift',
            gift_data: { id: 'g1', price: 10 },
        }) as never
        let lines = appendChatLine([], anonymous)
        lines = appendChatLine(lines, anonymous)
        expect(lines).toHaveLength(2)
    })

    it('appends anything else untouched', () => {
        const lines = appendChatLine([{ kind: 'notice', text: 'a' }], {
            kind: 'comment',
            user: null,
            text: 'b',
            isMember: false,
        })
        expect(lines).toHaveLength(2)
    })
})

describe('premium_badge', () => {
    const lineFor = (premium_badge: unknown) => {
        const line = parseChatLine({ type: 'msg', msg: 'hi', user: { ...user, premium_badge } })
        return line?.kind === 'comment' ? line : null
    }

    it('reads the object legacy reads — `{ image, title }`, not a URL', () => {
        const line = lineFor({ image: 'https://cdn/premium.png', title: 'Premium' })
        expect(line?.user?.premium_badge).toEqual(
            expect.objectContaining({ image: 'https://cdn/premium.png' }),
        )
    })

    it('still accepts a bare URL, as the image', () => {
        expect(lineFor('https://cdn/premium.png')?.user?.premium_badge).toEqual({
            image: 'https://cdn/premium.png',
        })
    })

    it('reads no image, or nothing, as not Premium', () => {
        expect(lineFor({ image: null })?.user?.premium_badge).toBeNull()
        expect(lineFor(null)?.user?.premium_badge).toBeNull()
        expect(lineFor('')?.user?.premium_badge).toBeNull()
    })
})

describe('the gift board’s Premium mark', () => {
    const row = (user: Record<string, unknown>) =>
        parseTopStars([{ score: 10, user: { id: 'u1', display_name: 'Ada', ...user } }])[0]

    it('reads the badge object the chat reads, or a plain is_premium', () => {
        expect(row({ premium_badge: { image: 'https://cdn/p.png' } })?.user?.premium_badge).toEqual(
            { image: 'https://cdn/p.png' },
        )
        expect(row({ is_premium: true })?.user?.is_premium).toBe(true)
    })

    it('reads neither as not Premium, and never fails the row', () => {
        const plain = row({})
        expect(plain?.user?.premium_badge).toBeNull()
        expect(plain?.user?.is_premium).toBeFalsy()
        expect(row({ is_premium: 'yes' })?.user?.display_name).toBe('Ada')
    })
})
