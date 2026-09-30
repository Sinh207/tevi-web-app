import { z } from 'zod'

/**
 * The messenger service's conversation, as `v2/rpc/get_recent_conversations` and
 * `v2/rpc/search_conversation` return it.
 *
 * Parsed `looseObject` with a fallback on every field, the way `features/notification` parses its
 * inbox: this is a list, and one malformed row must cost that row's badge, not the whole screen.
 * Nothing here is in a schema — the field names are the ones legacy reads
 * (`containers/directMessage/common/conversations/conversationItem`), and **B111** in
 * `docs/BACKEND_QUESTIONS.md` records what is still being guessed.
 */

const id = z.union([z.string(), z.number()]).transform(String).catch('')

const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

const boolish = z.coerce.boolean().catch(false)

const count = z.coerce
    .number()
    .transform(value => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0))
    .catch(0)

/**
 * A timestamp in whichever of the three spellings arrives — ISO, epoch seconds or epoch **ms** —
 * normalised to epoch ms, or `null`.
 *
 * Legacy is inconsistent about it and so, apparently, is the service: `created_at` goes straight
 * into `new Date()`, while `last_online_at` is divided by 1000 before being compared to seconds, so
 * that one is milliseconds. The `< 1e11` split is the one `features/notification` uses — no epoch
 * in seconds reaches 1e11 before the year 5138.
 */
const epochMs = z
    .unknown()
    .transform(value => {
        const numeric =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && /^\d+$/.test(value.trim())
                  ? Number(value.trim())
                  : null
        if (numeric !== null) {
            if (!Number.isFinite(numeric) || numeric <= 0) return null
            return numeric < 1e11 ? numeric * 1000 : numeric
        }
        if (typeof value !== 'string' || value.trim() === '') return null
        const time = new Date(value).getTime()
        return Number.isNaN(time) ? null : time
    })
    .catch(null)

function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .transform(value => value ?? null)
        .catch(null)
}

const imageSchema = z.looseObject({
    url: nullableText,
    w: z.coerce.number().catch(0),
    h: z.coerce.number().catch(0),
})

const latestMessageSchema = z.looseObject({
    id,
    text: nullableText,
    html_text: nullableText,
    markdown_text: nullableText,
    created_at: epochMs,
    images: z
        .array(imageSchema)
        .catch([])
        .transform(images => images.filter(image => image.url)),
    sender: nullable(z.looseObject({ alias: id })),
    /**
     * `{ [member]: true }` once the other side has seen it. Legacy reads it as "any key at all" —
     * a DM has two members, and the sender never appears in their own `seen_by`.
     */
    seen_by: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform(value => value ?? {})
        .catch({}),
})

const recipientSchema = z.looseObject({
    id,
    /**
     * `false` for a deleted or banned account — the row then shows "Tevi user" and no avatar.
     * **Missing reads as inactive**, as legacy's `recipient?.active || false` does: showing an
     * identity the service did not vouch for is the worse failure.
     */
    active: boolish,
    name: nullableText,
    channel_slug: nullableText,
    avatar: nullable(
        z.looseObject({
            thumb: nullableText,
            /** The Premium animated avatar — `AvatarVideoInput`'s shape. */
            avatar_video: nullable(
                z.looseObject({
                    playback: nullable(z.looseObject({ url: nullableText })),
                    thumbnail: nullableText,
                }),
            ),
        }),
    ),
    is_premium: boolish,
    verified_tick_badge: nullable(z.looseObject({ image: nullableText })),
    space_tier: z.coerce.number().nullish().catch(null),
    space_tier_image: nullableText,
    blocking: boolish,
    last_online_at: epochMs,
})

const conversationSchema = z.looseObject({
    id,
    recipient: nullable(recipientSchema),
    me: nullable(
        z.looseObject({
            tevi_user_alias: id,
            blocking: boolish,
        }),
    ),
    my_settings: nullable(
        z.looseObject({
            pinned: boolish,
            muted: boolish,
        }),
    ),
    stats: nullable(z.looseObject({ unread_messages: count })),
    latest_message: nullable(latestMessageSchema),
})

export type Conversation = z.infer<typeof conversationSchema>
export type ConversationRecipient = z.infer<typeof recipientSchema>
export type LatestMessage = z.infer<typeof latestMessageSchema>

/** The rows of a list body, dropping any row with no id — it could be neither keyed nor opened. */
export function normalizeConversations(value: unknown): Conversation[] {
    if (!Array.isArray(value)) return []
    const rows: Conversation[] = []
    for (const raw of value) {
        const parsed = conversationSchema.safeParse(raw)
        if (parsed.success && parsed.data.id) rows.push(parsed.data)
    }
    return rows
}

/**
 * The two folders the list offers. `TEVI` exists on the wire too (legacy declares it) and no
 * screen in either app has ever shown it, so it is not offered here.
 */
export const CONVERSATION_FILTER = {
    all: 'ALL',
    unread: 'UNREAD',
} as const
export type ConversationFilter = (typeof CONVERSATION_FILTER)[keyof typeof CONVERSATION_FILTER]

/** `change_chat_action`'s `action`. `NONE` is what ends an indicator. */
export const CHAT_ACTION = {
    none: 'NONE',
    typing: 'TYPING',
    uploadingPhoto: 'UPLOADING_PHOTO',
} as const
export type ChatAction = (typeof CHAT_ACTION)[keyof typeof CHAT_ACTION]

const chatActionFrameSchema = z.looseObject({
    conversation_id: id,
    action: z.enum(['NONE', 'TYPING', 'UPLOADING_PHOTO']).catch('NONE'),
})

/** A `change_chat_action` frame, or `null` when it names no conversation. */
export function parseChatActionFrame(
    value: unknown,
): { conversationId: string; action: ChatAction } | null {
    const parsed = chatActionFrameSchema.safeParse(value)
    if (!parsed.success || !parsed.data.conversation_id) return null
    return { conversationId: parsed.data.conversation_id, action: parsed.data.action }
}

/* ============================== The conversation itself ============================== */

/**
 * A message as `v2/rpc/get_messages`, `get_message/{id}`, `send_message` and `edit_message` return
 * it — legacy's field names, from `useChatRoom.js` and the `itemMessage` components. Open questions
 * are **B112**.
 */

const optionalId = z
    .union([z.string(), z.number()])
    .transform(value => {
        const text = String(value).trim()
        return text === '' ? null : text
    })
    .nullish()
    .transform(value => value ?? null)
    .catch(null)

const senderSchema = z.looseObject({
    id,
    alias: id,
    name: nullableText,
    /** Legacy reads both spellings — `channel_slug` on a message, `slug` on a reply's sender. */
    channel_slug: nullableText,
    slug: nullableText,
    avatar: nullable(z.looseObject({ thumb: nullableText })),
})

/**
 * A bot message's buttons: rows of `{ label, action, target }`. Three actions exist
 * (`OPEN_URL`, `CALLBACK_DATA`, `SHOW_INFO_TOAST`); anything else renders nothing.
 */
const inlineItemSchema = z.looseObject({
    label: nullableText,
    action: nullableText,
    target: nullableText,
})

const messageFields = {
    id,
    conversation_id: id,
    text: nullableText,
    html_text: nullableText,
    markdown_text: nullableText,
    images: z
        .array(imageSchema)
        .catch([])
        .transform(images => images.filter(image => image.url)),
    sender: nullable(senderSchema),
    created_at: epochMs,
    edited_at: epochMs,
    seen_by: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform(value => value ?? {})
        .catch({}),
    reply_to_id: optionalId,
}

const replyMessageSchema = z.looseObject(messageFields)

const chatMessageSchema = z.looseObject({
    ...messageFields,
    reply_message: nullable(replyMessageSchema),
    inline_menu: nullable(
        z.looseObject({
            items: z
                .array(
                    z
                        .array(inlineItemSchema)
                        .catch([])
                        .transform(row => row.filter(item => item.label)),
                )
                .catch([])
                .transform(rows => rows.filter(row => row.length > 0)),
        }),
    ),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
export type ReplyMessage = z.infer<typeof replyMessageSchema>
export type InlineMenuItem = z.infer<typeof inlineItemSchema>

/** One message, or `null` when the body is not one (no id). */
export function parseMessage(value: unknown): ChatMessage | null {
    const parsed = chatMessageSchema.safeParse(value)
    return parsed.success && parsed.data.id ? parsed.data : null
}

export function normalizeMessages(value: unknown): ChatMessage[] {
    if (!Array.isArray(value)) return []
    const rows: ChatMessage[] = []
    for (const raw of value) {
        const message = parseMessage(raw)
        if (message) rows.push(message)
    }
    return rows
}

/**
 * Why the messenger refused — on `start_conversation_with` **or** on a write (`send_message`,
 * `edit_message`). The codes are the ones both mobile apps switch on:
 *
 * | Code     | Meaning                                  | Wall          |
 * |----------|------------------------------------------|---------------|
 * | `C001`   | the space takes messages from followers  | `follow`      |
 * | `C002`   | … from members only                      | `member`      |
 * | `MSG001` | this account blocked them                | `i-blocked`   |
 * | `MSG002` | they blocked this account                | `blocked-me`  |
 * | `MSG003` | their account is not available           | `inactive`    |
 * | `MSG004` | (same wall on iOS)                       | `inactive`    |
 * | `MSG005` | the space is unpublished                 | `unpublished` |
 *
 * Android maps C001/C002/MSG002/MSG003/MSG005, iOS C001/C002 and MSG001–005; this is the union.
 * Anything else is an ordinary failure, not a wall.
 */
export type ConversationGate =
    | 'follow'
    | 'member'
    | 'i-blocked'
    | 'blocked-me'
    | 'inactive'
    | 'unpublished'

const GATES: Record<string, ConversationGate> = {
    C001: 'follow',
    C002: 'member',
    MSG001: 'i-blocked',
    MSG002: 'blocked-me',
    MSG003: 'inactive',
    MSG004: 'inactive',
    MSG005: 'unpublished',
}

export function gateFromCode(code: string | undefined): ConversationGate | null {
    return (code && GATES[code]) || null
}

/** A frame that names a conversation and, sometimes, a message — every DM frame has this much. */
export function frameIds(
    value: unknown,
): { conversationId: string; messageId: string | null } | null {
    if (!value || typeof value !== 'object') return null
    const frame = value as Record<string, unknown>
    const conversationId = frame.conversation_id
    if (typeof conversationId !== 'string' && typeof conversationId !== 'number') return null
    const messageId = frame.message_id ?? frame.id
    return {
        conversationId: String(conversationId),
        messageId:
            typeof messageId === 'string' || typeof messageId === 'number'
                ? String(messageId)
                : null,
    }
}
