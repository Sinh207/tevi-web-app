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
