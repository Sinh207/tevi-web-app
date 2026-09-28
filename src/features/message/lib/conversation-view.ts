import type { Conversation, ConversationRecipient } from '../api/types'

/**
 * Everything a conversation row *shows*, derived once from the payload — so the row is markup and
 * the rules are here, where a test can reach them.
 *
 * Each rule is legacy's (`conversationItem/hook/useConversationItem.js`,
 * `unreadIndicator/hook/useUnreadIndicator.js`), with two corrections noted where they happen.
 */

/** Legacy's "online" window: seen within the last five minutes. */
export const ONLINE_WINDOW_MS = 5 * 60_000

export type ConversationPreview =
    | { kind: 'text'; text: string }
    | { kind: 'photo'; thumb: string }
    | { kind: 'none' }

export type ConversationView = {
    /** `false` for a deleted or banned account: no name, no avatar, no link to a space. */
    active: boolean
    /** `null` when the account is inactive — the row prints the translated "Tevi user". */
    name: string | null
    slug: string | null
    thumb: string | null
    avatarVideo: NonNullable<ConversationRecipient['avatar']>['avatar_video']
    premium: boolean
    verifiedImage: string | null
    tierImage: string | null
    tier: number | null
    online: boolean
    unread: number
    muted: boolean
    pinned: boolean
    /** Either side has blocked the other. */
    blocked: boolean
    preview: ConversationPreview
    /** The latest message is this account's own — the row then shows sent / seen ticks. */
    sentByMe: boolean
    /** …and the other side has seen it. */
    seen: boolean
    /** Epoch ms of the latest message. */
    time: number | null
}

/**
 * A preview line from a message's HTML, as **text**.
 *
 * Legacy renders `html_text` through `dangerouslySetInnerHTML`, unsanitised, in every row of the
 * list — the one place in the app where another account's input is written into our DOM as markup.
 * A preview needs none of it: the line is clamped to one row, so links and bold are invisible
 * anyway. Tags are dropped and the five entities a message can contain are decoded; the result goes
 * into a text node, so nothing in it can execute however it is spelled.
 */
export function htmlToPreviewText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
}

function previewOf(conversation: Conversation): ConversationPreview {
    const message = conversation.latest_message
    if (!message) return { kind: 'none' }
    const image = message.images[0]
    if (image?.url) return { kind: 'photo', thumb: image.url }
    /*
     * `text` before `html_text`. Legacy prefers the HTML, but the plain spelling is the same words
     * without markup to strip — it is only when a client sent HTML alone that the fallback runs.
     */
    const text =
        message.text ??
        message.markdown_text ??
        (message.html_text ? htmlToPreviewText(message.html_text) : null)
    return text ? { kind: 'text', text } : { kind: 'none' }
}

export function toConversationView(
    conversation: Conversation,
    now: number = Date.now(),
): ConversationView {
    const recipient = conversation.recipient
    const active = recipient?.active ?? false
    const lastOnline = recipient?.last_online_at ?? null
    const message = conversation.latest_message
    const myAlias = conversation.me?.tevi_user_alias ?? ''
    const senderAlias = message?.sender?.alias ?? ''
    const tier = recipient?.space_tier ?? null

    return {
        active,
        name: active ? (recipient?.name ?? recipient?.channel_slug ?? null) : null,
        slug: active ? (recipient?.channel_slug ?? null) : null,
        thumb: active ? (recipient?.avatar?.thumb ?? null) : null,
        avatarVideo: active ? (recipient?.avatar?.avatar_video ?? null) : null,
        premium: active && (recipient?.is_premium ?? false),
        verifiedImage: active ? (recipient?.verified_tick_badge?.image ?? null) : null,
        tierImage:
            active && tier !== null && tier > 0 ? (recipient?.space_tier_image ?? null) : null,
        tier,
        online:
            lastOnline !== null && now - lastOnline >= 0 && now - lastOnline <= ONLINE_WINDOW_MS,
        unread: conversation.stats?.unread_messages ?? 0,
        muted: conversation.my_settings?.muted ?? false,
        pinned: conversation.my_settings?.pinned ?? false,
        blocked: (conversation.me?.blocking ?? false) || (recipient?.blocking ?? false),
        preview: previewOf(conversation),
        /*
         * Compared as strings, not `Number(a) === Number(b)` as legacy does: two missing aliases
         * are `NaN` there and never equal, which is right, but two *empty* ones would be `0 === 0`.
         * An alias this client cannot read is never "mine".
         */
        sentByMe: myAlias !== '' && myAlias === senderAlias,
        seen: Object.keys(message?.seen_by ?? {}).length > 0,
        time: message?.created_at ?? null,
    }
}
