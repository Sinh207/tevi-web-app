import type { LiveChatLine, LiveChatUser, LiveGift } from './live-message'

/**
 * **The gift banners that fly across the stage** — one per person per gift, accumulating.
 *
 * Somebody tapping a rose ten times sends ten frames. Ten banners would be a wall; one banner
 * counting up to `x10` is what the room is meant to see, and it is also what makes a burst read as
 * *one person's* enthusiasm rather than ten separate events.
 *
 * ## Why this is a pure fold and not a component's refs
 *
 * Legacy keeps the whole thing in a mutable ref plus a `setTimeout` per group plus a `Set` of
 * exiting ids plus a counter map of animation triggers — four pieces of state that have to agree,
 * inside the component that draws them. Every bug it has lives in that arrangement, and none of it
 * is testable: the claims worth pinning here are *rules* ("a second rose extends the banner rather
 * than adding one", "the eleventh gifter does not push the room off the screen"), and a rule
 * belongs in a function.
 *
 * The component keeps a list and a clock. Everything that decides what is in the list is here.
 */

/**
 * How long a banner stays once nothing more has been added to it. Legacy's
 * `GIFT_DISPLAY_DURATION = 2500`.
 *
 * ⚠ **The clock restarts on every merge**, which is legacy's behaviour and is the point: a reader
 * spamming a gift keeps their banner up for as long as they keep sending, and it leaves 2.5s after
 * they stop rather than mid-burst.
 */
export const GIFT_BURST_MS = 2_500

/**
 * How many banners may be on screen at once.
 *
 * Legacy has **no cap**: a busy broadcast stacks one 45px banner per gifter up the left edge until
 * they cover the stream, and since each one's timer is independent the pile does not drain in any
 * order a reader can follow. Three is what fits under the chrome without covering the seats.
 *
 * Past it the **oldest** goes, not the newest — the newest is the one that just happened, and
 * dropping it would make a gift the reader *just sent* the one thing they do not see.
 */
export const MAX_GIFT_BURSTS = 3

export interface GiftBurst {
    /** `{userId}-{giftId}` — one person, one product. Two people sending roses are two banners. */
    key: string
    user: LiveChatUser | null
    gift: LiveGift | null
    /** Every unit this burst has carried, summed. The `x` figure on the banner. */
    amount: number
    /**
     * Bumped on every merge, and it exists **only** to be a React key.
     *
     * The count-up is an animation that has to replay each time the figure changes, and CSS has no
     * way to restart an animation on a node that is already playing one. Remounting the node does,
     * so the key carries this. Legacy calls it `animationTriggers` and keeps it in a fourth map.
     */
    bumps: number
    /** When it leaves, unless something extends it. */
    expiresAt: number
}

/**
 * The identity of a burst, or `null` when the frame cannot be grouped.
 *
 * Both halves are required: a gift with no sender could be anybody, and a sender with no gift has
 * nothing to draw. Legacy guards on exactly these two (`!message?.user?.id ||
 * !message?.gift_data?.id`) and returns early; the same rule, as a value.
 */
export function giftBurstKey(line: LiveChatLine): string | null {
    if (line.kind !== 'gift') return null
    const userId = line.user?.id
    const giftId = line.gift?.id
    if (!userId || !giftId) return null
    return `${userId}-${giftId}`
}

/**
 * Fold one gift line into the list.
 *
 * Returns the **same array** when there is nothing to do, so a caller can skip a render.
 *
 * An existing burst keeps its **position**: a banner that is bumped must not jump to the bottom of
 * the stack, because the reader is looking at it. A new one goes on the end, and the cap then takes
 * from the front.
 */
export function mergeGiftBurst(bursts: GiftBurst[], line: LiveChatLine, now: number): GiftBurst[] {
    const key = giftBurstKey(line)
    if (key === null || line.kind !== 'gift') return bursts

    const expiresAt = now + GIFT_BURST_MS
    const index = bursts.findIndex(burst => burst.key === key)

    if (index >= 0) {
        const previous = bursts[index]
        const next = [...bursts]
        next[index] = {
            ...previous,
            /*
             * The **frame's** user and gift, not the previous banner's: a payload can change
             * between frames (a renamed space, a repriced gift), and the newest is the one the
             * room is being told about.
             */
            user: line.user,
            gift: line.gift,
            amount: previous.amount + line.quantity,
            bumps: previous.bumps + 1,
            expiresAt,
        }
        return next
    }

    const next = [
        ...bursts,
        { key, user: line.user, gift: line.gift, amount: line.quantity, bumps: 0, expiresAt },
    ]
    return next.length > MAX_GIFT_BURSTS ? next.slice(next.length - MAX_GIFT_BURSTS) : next
}

/**
 * Drop whatever has run out.
 *
 * Returns the **same array** when nothing has, which is the common case — this runs on a timer, and
 * a new array every tick would re-render the stage's banners for no reason.
 *
 * `>` rather than `>=`: a banner merged at exactly `now` has `expiresAt === now + GIFT_BURST_MS`,
 * and a tick landing on that boundary should keep it rather than swallow a whole display.
 */
export function expireGiftBursts(bursts: GiftBurst[], now: number): GiftBurst[] {
    const kept = bursts.filter(burst => burst.expiresAt > now)
    return kept.length === bursts.length ? bursts : kept
}

/**
 * How the banner reads: **who** sent it, as one string.
 *
 * Here rather than in the component because the fallback is a product decision and not a render
 * detail — an unnamed sender is `Someone`, never a blank line where a name goes. The caller passes
 * the translated word.
 */
export function giftSenderName(user: LiveChatUser | null, fallback: string): string {
    return user?.name ?? fallback
}
