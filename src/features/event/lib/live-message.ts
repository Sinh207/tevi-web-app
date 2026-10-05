import { z } from 'zod'

/**
 * **A line in the live chat**, parsed from a `msg` frame.
 *
 * The transcript is the one thing in this feature with **no HTTP source** — `get_message_history`
 * is a socket command, so the room's own frames are the record. That is why this is a parser with
 * a closed union rather than a pass-through: a malformed frame has nothing to fall back to.
 *
 * ## The wire is two shapes behind one channel
 *
 * ```
 * { type: 'msg',  msg: 'hello',         user }            → a comment
 * { type: 'cmd',  msg: '/give_gift',    user, gift_data } → a gift
 * { type: 'cmd',  msg: '/new_subscriber', user }          → somebody joined the membership
 * ```
 *
 * `type: 'cmd'` makes `msg` a **command name**, not something to print. Legacy's switch has a
 * `default:` that treats every unrecognised `type` as a comment — so a future `type` prints its
 * own payload into the chat — and inside the `cmd` branch it has no `else` at all, so an
 * unrecognised command is **silently dropped**. Both are handled here: an unknown `type` is a
 * comment only when `msg` does not look like a command, and an unknown command becomes
 * `{ kind: 'unknown' }`, which the renderer skips *deliberately* rather than by omission.
 */

const nullableText = z
    .unknown()
    .transform(v => {
        if (typeof v !== 'string') return null
        const t = v.trim()
        return t === '' ? null : t
    })
    .catch(null)

const nullableId = z
    .unknown()
    .transform(v => {
        if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
        if (typeof v !== 'string') return null
        return v.trim() || null
    })
    .catch(null)

/**
 * The Premium mark on a person — `{ image, title }`, as legacy reads it (`premium_badge.image`). A
 * bare string is taken as the image in case a payload flattens it; anything else is "not Premium".
 * Shared by the chat's people and the gift board's, so the two cannot read it differently.
 */
const premiumBadge = z
    .unknown()
    .transform(v => {
        if (typeof v === 'string') return v.trim() ? { image: v.trim() } : null
        const p = z.looseObject({ image: nullableText }).safeParse(v)
        return p.success && p.data.image ? p.data : null
    })
    .catch(null)

/**
 * Who said it.
 *
 * `channel_slug` rather than an id, because the chat row links to a space and that is the address.
 * `is_host` decides the badge. `premium_badge` and `verified_tick_badge` are `{ image }` objects
 * the backend picks, so neither may be inferred from anything local.
 */
export const liveChatUserSchema = z.looseObject({
    id: nullableId,
    name: nullableText,
    avatar: nullableText,
    channel_slug: nullableText,
    is_host: z.coerce.boolean().catch(false),
    /**
     * How long this person has been a member of the space, in whatever unit the room sends.
     *
     * Read as **presence, never as a figure**: legacy only ever tests it for truthiness, to
     * decide whether the row gets the member badge and its gradient ground. Nothing prints it, so
     * nothing here has to know the unit — which is the only reason this can be carried at all
     * without asking the backend what it means.
     */
    channel_subscription_duration: z
        .unknown()
        .transform(v => (v === undefined || v === null || v === '' || v === 0 ? null : v))
        .catch(null),
    /**
     * ⚠ **An object, `{ image, title }`, not a URL** — legacy reads `user.premium_badge.image` at
     * all four of its chat rows. It was parsed as text here, so every real frame's object became
     * `null` and no Premium reader ever showed a crown. A bare string is still accepted, as the
     * image, in case a payload ever flattens it; anything else is "not Premium".
     */
    premium_badge: premiumBadge,
    verified_tick_badge: z
        .unknown()
        .transform(v => {
            const p = z.looseObject({ image: nullableText }).safeParse(v)
            return p.success ? p.data : null
        })
        .catch(null),
})
export type LiveChatUser = z.infer<typeof liveChatUserSchema>

/**
 * The gift attached to a `/give_gift` command.
 *
 * ⚠ **`thumb` is the field the row actually draws, and it is not `image`.** The comps put a 16px
 * picture of the gift in the middle of the sentence and legacy reads `gift_data.thumb` for it;
 * `image` is carried too because the payload sends both and a gift with only one of them should
 * still show something. Reading `image` alone — which this did — leaves a sentence with a hole in
 * it on every gift, and nothing throws.
 *
 * `recipient_name` is who the gift went to, and it is on the **gift**, not on the frame.
 */
export const liveGiftSchema = z.looseObject({
    id: nullableId,
    name: nullableText,
    image: nullableText,
    thumb: nullableText,
    recipient_name: nullableText,
    price: z.coerce.number().catch(0),
    /**
     * **The float banner's ground** — the swoosh the sender's name and the gift ride on, over the
     * stage. `EventGiftFloat` draws it, and a gift without one simply gets the plate's own fill.
     *
     * ⚠ It is a **backend URL** and must never reach a CSS `url(…)`: a `)` in the string closes the
     * function and everything after it parses as further declarations. `EventStudioScreen`'s
     * backdrop carries the same note and the same answer — `next/image`, never `style`.
     */
    anim_background: nullableText,
    /**
     * The full-stage **SVGA** effect.
     *
     * Carried and **unread**, deliberately: playing it needs `svgaplayerweb`, which is not a
     * dependency of this app, and a field parsed for a player that does not exist is cheaper than
     * discovering the frame never carried it. `docs/EVENT.md` holds it as an open item.
     */
    animation: nullableText,
})
export type LiveGift = z.infer<typeof liveGiftSchema>

/** Whichever picture of the gift the payload carried. */
export function giftThumb(gift: LiveGift | null): string | null {
    return gift?.thumb ?? gift?.image ?? null
}

export type LiveChatLine =
    /** Somebody typed something. */
    | { kind: 'comment'; user: LiveChatUser | null; text: string; isMember: boolean }
    /** Somebody sent a gift. `quantity` is how many of the same gift in one burst. */
    | {
          kind: 'gift'
          user: LiveChatUser | null
          gift: LiveGift | null
          quantity: number
          /** Everything the burst is worth, for the leaderboard. */
          total: number
          isMember: boolean
      }
    /** Somebody became a member of the space. */
    | { kind: 'subscriber'; user: LiveChatUser | null }
    /**
     * The room's own text — the welcome line, the paid-chat notice.
     *
     * ⚠ There is deliberately **no `join` kind**. Somebody walking in is not a line in the
     * transcript: legacy renders it as a **transient toast**, one at a time, gone after three
     * seconds (`Attendance`, `NOTIFICATION_DURATION = 3000`). Appending it instead — which this
     * did first — leaves a busy room's chat as a wall of "X has entered the live broadcast" with
     * the actual conversation pushed off the top.
     */
    | { kind: 'notice'; text: string }
    /**
     * A command this client does not know.
     *
     * Kept rather than dropped so the **count** is right and a later reader can see it arrived.
     * Renders nothing. Legacy drops it, which is why a new command type looks like a chat that
     * skipped a beat.
     */
    | { kind: 'unknown'; command: string }

/** Commands this client understands. Anything else is `unknown`, deliberately. */
const COMMANDS = {
    '/give_gift': 'gift',
    '/new_subscriber': 'subscriber',
} as const

const frameSchema = z.looseObject({
    type: nullableText,
    msg: nullableText,
    user: z
        .unknown()
        .transform(v => {
            const p = liveChatUserSchema.safeParse(v)
            return p.success ? p.data : null
        })
        .catch(null),
    /**
     * ⚠ **The member mark lives on the frame, not on `user`.**
     *
     * Every one of legacy's four reads is `data.channel_subscription_duration` — the frame's own
     * top level — and nothing in that codebase ever writes it under `user`. This parser had it on
     * `liveChatUserSchema` only, so `isMember` was **never true**: no `MEM` badge on any line, in
     * a room where membership is the thing the creator is selling. Nothing failed; the badge
     * simply never appeared.
     *
     * Both places are read now, frame first. If the backend ever does nest it the row still draws,
     * and the cost of accepting two spellings for a boolean is nothing.
     *
     * Presence, never a figure — see `liveChatUserSchema`.
     */
    channel_subscription_duration: z
        .unknown()
        .transform(v => (v === undefined || v === null || v === '' || v === 0 ? null : v))
        .catch(null),
    gift_amount: z.coerce.number().catch(1),
    /** What the burst was worth, as the room counted it. Preferred over `quantity × price`. */
    total_stars: z
        .unknown()
        .transform(v => {
            const n = Number(v)
            return Number.isFinite(n) && n > 0 ? n : null
        })
        .catch(null),
    gift_data: z
        .unknown()
        .transform(v => {
            const p = liveGiftSchema.safeParse(v)
            return p.success ? p.data : null
        })
        .catch(null),
})

/**
 * **The host's pinned message.**
 *
 * A flat frame — `{ message, user_name }` — and nothing like a chat line, which is why it is its
 * own shape rather than a `LiveChatLine` kind: it is not part of the conversation, it sits above
 * it and stays.
 */
export const livePinnedMessageSchema = z.looseObject({
    message: nullableText,
    user_name: nullableText,
})
export type LivePinnedMessage = z.infer<typeof livePinnedMessageSchema>

/**
 * Read a `pinned_message` frame, or the `get_pinned_message` answer.
 *
 * ⚠ **`null` is the unpin and has to survive.** The host taking a pin down sends an empty frame,
 * so a parser that only ever returns a value would leave the old pin on screen for the rest of
 * the broadcast. A frame with no `message` is also `null` — a pin with no text is not a pin.
 */
export function parsePinnedMessage(payload: unknown): LivePinnedMessage | null {
    if (!payload) return null
    const parsed = livePinnedMessageSchema.safeParse(payload)
    if (!parsed.success || !parsed.data.message) return null
    return parsed.data
}

/**
 * **One row of the gift leaderboard** — who has given the most Star in this broadcast.
 *
 * A different shape from a chat user and not worth folding together: the `top_stars` frame nests
 * the person under `user` with `display_name` and `avatar.thumb`, where a chat frame sends `name`
 * and a flat `avatar`. Two services, two spellings; `api/types.ts` explains why this repo stops
 * trying to share parsers across them.
 */
export const liveTopStarSchema = z.looseObject({
    score: z.coerce.number().catch(0),
    user: z
        .unknown()
        .transform(v => {
            const p = z
                .looseObject({
                    id: nullableId,
                    display_name: nullableText,
                    avatar: z
                        .unknown()
                        .transform(a => {
                            const q = z.looseObject({ thumb: nullableText }).safeParse(a)
                            return q.success ? q.data : null
                        })
                        .catch(null),
                    // The blue tick, when the board's service sends one — gated on `image` like
                    // everywhere else (`VerifiedBadge`'s note).
                    verified_tick_badge: z
                        .unknown()
                        .transform(b => {
                            const q = z.looseObject({ image: nullableText }).safeParse(b)
                            return q.success ? q.data : null
                        })
                        .catch(null),
                    /*
                     * Premium — **unconfirmed on this service.** The board comes from analytics,
                     * whose schema is not published, and legacy draws no mark here at all. Read the
                     * way the chat's people carry it, plus a plain `is_premium`, so whichever the
                     * service sends lights the crown and an absent field draws nothing.
                     */
                    premium_badge: premiumBadge,
                    is_premium: z.boolean().catch(false).optional(),
                })
                .safeParse(v)
            return p.success ? p.data : null
        })
        .catch(null),
})
export type LiveTopStar = z.infer<typeof liveTopStarSchema>

/**
 * Read a `top_stars` frame.
 *
 * ⚠ Legacy guards with `if (message?.data?.length)` and has **no else**, so a frame that empties
 * the board — everybody's gifts refunded, or simply the first frame of a fresh broadcast — leaves
 * the previous leaderboard on screen indefinitely. An empty list is a legitimate answer and is
 * returned as one; the *caller* decides whether to draw an empty block, which it does by not
 * drawing it at all.
 *
 * Rows with no identifiable person are dropped: the board is a ranking of people, and a nameless
 * row is a rank nobody can be awarded.
 */
export function parseTopStars(payload: unknown): LiveTopStar[] {
    const rows = (payload as { data?: unknown } | null)?.data ?? payload
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
        const parsed = liveTopStarSchema.safeParse(row)
        return parsed.success && parsed.data.user ? [parsed.data] : []
    })
}

/**
 * Turn one `msg` frame into a line, or `null` when there is nothing to show.
 *
 * `null` rather than a `{ kind: 'unknown' }` for a frame with no content at all — an empty
 * comment is not a line somebody sent, it is a frame that arrived broken, and printing a blank
 * row for it makes the chat look like it is losing messages.
 */
export function parseChatLine(frame: unknown): LiveChatLine | null {
    const parsed = frameSchema.safeParse(frame)
    if (!parsed.success) return null
    const { type, msg, user, gift_amount, gift_data, total_stars } = parsed.data
    // Frame first, then the nested spelling — see `channel_subscription_duration` above.
    const isMember =
        parsed.data.channel_subscription_duration != null ||
        user?.channel_subscription_duration != null

    /*
     * ⚠ The command test is on `msg`, not on `type`.
     *
     * Legacy branches on `type === 'cmd'` and lets its `default:` print anything else as a
     * comment — so a frame typed `command`, or `CMD`, or a type added next quarter, puts
     * `/give_gift` into the transcript as though somebody had typed it. Reading the leading
     * slash is what the payload actually distinguishes on.
     */
    if (msg?.startsWith('/')) {
        const command = COMMANDS[msg as keyof typeof COMMANDS]
        if (command === 'gift') {
            const quantity = Number.isFinite(gift_amount) && gift_amount > 0 ? gift_amount : 1
            return {
                kind: 'gift',
                user,
                gift: gift_data,
                quantity,
                /*
                 * The room's own figure when it sent one. `quantity × price` is the fallback and
                 * not the other way round: a gift whose price changed mid-broadcast, or one the
                 * backend discounted, would be mispriced in the sentence the reader is shown.
                 */
                total: total_stars ?? quantity * (gift_data?.price ?? 0),
                isMember,
            }
        }
        if (command === 'subscriber') return { kind: 'subscriber', user }
        return { kind: 'unknown', command: msg }
    }

    // Anything that is not a command is what somebody typed, whatever `type` says.
    if (!msg) return null
    if (type === 'cmd') {
        // `type: 'cmd'` with no leading slash is a malformed command, not a comment. Printing it
        // would put an internal string in front of the room.
        return { kind: 'unknown', command: msg }
    }
    return { kind: 'comment', user, text: msg, isMember }
}

/**
 * The same, for a whole `get_message_history` payload.
 *
 * Unparseable rows are dropped rather than failing the batch: a transcript missing one line beats
 * an empty chat, and the history is the only copy there is.
 */
export function parseChatHistory(payload: unknown): LiveChatLine[] {
    if (!Array.isArray(payload)) return []
    return payload.flatMap(row => {
        const line = parseChatLine(row)
        return line ? [line] : []
    })
}

/**
 * **Collapse a burst of identical gifts into one line.**
 *
 * Somebody tapping a gift ten times sends ten frames, and ten identical rows push the
 * conversation off the screen. Legacy groups them behind a `setTimeout` per
 * `{user}-{gift}` pair and a mutable ref, which is where its gift-count bugs live; this is the
 * same rule as a pure fold over the tail of the list.
 *
 * Only the **last** line is considered, so a burst interrupted by somebody else's comment starts
 * a new group — which is right: the two gifts are no longer adjacent in the conversation.
 */
export function appendChatLine(lines: LiveChatLine[], next: LiveChatLine): LiveChatLine[] {
    const last = lines.at(-1)
    if (
        last?.kind === 'gift' &&
        next.kind === 'gift' &&
        last.user?.id &&
        last.user.id === next.user?.id &&
        last.gift?.id &&
        last.gift.id === next.gift?.id
    ) {
        const merged: LiveChatLine = {
            ...last,
            quantity: last.quantity + next.quantity,
            total: last.total + next.total,
        }
        return [...lines.slice(0, -1), merged]
    }
    return [...lines, next]
}
