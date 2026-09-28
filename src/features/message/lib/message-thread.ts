import type { InfiniteData } from '@tanstack/react-query'
import type { MessagePage } from '../api/message-api'
import type { ChatMessage } from '../api/types'
import type { ConversationCursor } from './conversation-page'

/**
 * The conversation's messages as data — what the thread renders, and every write the screen makes
 * into it. Pure, so the ordering and dedup rules can be tested without a list on screen.
 *
 * ## Newest page first, oldest message first
 *
 * The service pages **backwards**: page one is the latest twenty, `next_url` goes further into the
 * past. So `pages[0]` is the newest page, and flattening reverses nothing by position — it sorts by
 * `created_at`, because within a page the service's own order is not something either shipped
 * client relies on (legacy sorts every group it builds).
 *
 * ## Why frames never write here
 *
 * A socket frame is a signal (CLAUDE.md, primitive 3). A new or edited message is fetched by id
 * (`get_message/{id}`) and *that* response is what `upsertMessage` writes, so the cache only ever
 * holds what an HTTP response said. The one exception is `removeMessage` on `deleted_message`: a
 * deletion names an id, and there is nothing left to fetch.
 */

export type ThreadData = InfiniteData<MessagePage, ConversationCursor | null> | undefined

/** A message this client is still sending, or failed to — never in the query cache. */
export type PendingMessage = {
    /** `local-…`, so it can never collide with a server id. */
    localId: string
    text: string
    replyTo: ChatMessage | null
    createdAt: number
    status: 'sending' | 'failed'
}

/** Every loaded message, oldest first, one copy per id. */
export function flattenThread(data: ThreadData): ChatMessage[] {
    const byId = new Map<string, ChatMessage>()
    for (const page of data?.pages ?? []) {
        for (const message of page.results) {
            // An earlier page is newer, so the first copy seen is the freshest.
            if (!byId.has(message.id)) byId.set(message.id, message)
        }
    }
    return [...byId.values()].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
}

/**
 * Put a message into the newest page — replacing it where it is already loaded (an edit, or the
 * server's copy of what this client just sent), prepending it where it is not.
 */
export function upsertMessage(data: ThreadData, message: ChatMessage): ThreadData {
    if (!data || data.pages.length === 0) {
        return {
            pages: [{ results: [message], next: undefined }],
            pageParams: [null],
        }
    }
    let replaced = false
    const pages = data.pages.map(page => ({
        ...page,
        results: page.results.map(row => {
            if (row.id !== message.id) return row
            replaced = true
            return message
        }),
    }))
    if (!replaced) pages[0] = { ...pages[0], results: [message, ...pages[0].results] }
    return { ...data, pages }
}

/**
 * Fold a fresh copy of the newest page into the cache **without** replacing it.
 *
 * Replacing `pages[0]` wholesale would open a gap: if thirty messages arrived, the fresh page holds
 * the latest twenty, the old page one held the twenty before those, and page two's cursor starts
 * after *that*. So the fresh rows win by id and the old page's rows stay.
 */
export function mergeNewest(data: ThreadData, fresh: MessagePage): ThreadData {
    if (!data || data.pages.length === 0) return { pages: [fresh], pageParams: [null] }
    const freshIds = new Set(fresh.results.map(row => row.id))
    const kept = data.pages[0].results.filter(row => !freshIds.has(row.id))
    const pages = [...data.pages]
    pages[0] = { ...pages[0], results: [...fresh.results, ...kept] }
    return { ...data, pages }
}

/** Take a message out of every page. Same object back when it is not loaded. */
export function removeMessage(data: ThreadData, id: string): ThreadData {
    if (!data) return data
    if (!data.pages.some(page => page.results.some(row => row.id === id))) return data
    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.filter(row => row.id !== id),
        })),
    }
}

/**
 * Whether a message is this account's.
 *
 * The alias first — the conversation's `me.tevi_user_alias` against the sender's, the rule the list
 * uses for its ticks. Legacy compares `sender.channel_slug` with the reader's own space, which is
 * never true for an account that has no space yet; that is the fallback here, not the rule.
 */
export function isOwnMessage(
    message: Pick<ChatMessage, 'sender'>,
    me: { alias: string | null; slug: string | null },
): boolean {
    const alias = message.sender?.alias ?? ''
    if (me.alias && alias) return alias === me.alias
    const slug = message.sender?.channel_slug ?? message.sender?.slug ?? null
    return !!me.slug && !!slug && slug === me.slug
}

export type ThreadDay = { key: string; day: number; messages: ChatMessage[] }

/** Local calendar day, as `YYYY-MM-DD` — the reader's day, not UTC's (legacy groups by UTC). */
function dayKey(time: number): string {
    const date = new Date(time)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/** Messages in runs of one calendar day, oldest day first. */
export function groupByDay(messages: ChatMessage[]): ThreadDay[] {
    const days: ThreadDay[] = []
    for (const message of messages) {
        const time = message.created_at ?? 0
        const key = dayKey(time)
        const last = days[days.length - 1]
        if (last && last.key === key) last.messages.push(message)
        else days.push({ key, day: time, messages: [message] })
    }
    return days
}

function startOfDay(time: number): number {
    const date = new Date(time)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

/** "today", "yesterday", or the date in full — the chip between days. */
export function formatDayLabel(time: number, locale = 'en', now: number = Date.now()): string {
    const days = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000)
    if (days === 0 || days === 1) {
        let word: string
        try {
            word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
        } catch {
            word = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-days, 'day')
        }
        // `Intl` gives the word as it reads mid-sentence ("today", "hôm nay"); a chip is a heading.
        return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1)
    }
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
    try {
        return new Intl.DateTimeFormat(locale, options).format(time)
    } catch {
        return new Intl.DateTimeFormat('en', options).format(time)
    }
}

/** The time under a bubble, in the reader's own clock convention. */
export function formatMessageTime(time: number | null, locale = 'en'): string {
    if (time === null) return ''
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
    try {
        return new Intl.DateTimeFormat(locale, options).format(time)
    } catch {
        return new Intl.DateTimeFormat('en', options).format(time)
    }
}

/** The text a message *says*, in the order legacy prefers — `text`, then markdown. */
export function messageText(message: Pick<ChatMessage, 'text' | 'markdown_text'>): string | null {
    return message.text ?? message.markdown_text ?? null
}

/**
 * A Premium gift is sent as a text message whose body is an app link. Legacy renders a card for
 * it; this client renders the gift as a labelled line rather than an unreadable `tevi://` URL.
 */
export function isPremiumGift(message: Pick<ChatMessage, 'text'>): boolean {
    return message.text?.startsWith('tevi://TEVI_PREMIUM_GIFT') ?? false
}

export type TextPart =
    | { kind: 'text'; value: string }
    | { kind: 'link'; value: string; href: string }

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
/** Punctuation that ends a sentence rather than a URL. */
const TRAILING = /[.,;:!?)\]}'"]+$/

/**
 * Split a message into text and links, so links are clickable **without** rendering the message as
 * HTML — legacy writes `html_text` into the DOM with `dangerouslySetInnerHTML`, i.e. another
 * account's markup in ours. Only `http(s)` is linked; the caller still passes each `href` through
 * `safeExternalUrl`.
 */
export function splitLinks(text: string): TextPart[] {
    const parts: TextPart[] = []
    let last = 0
    for (const match of text.matchAll(URL_PATTERN)) {
        const start = match.index ?? 0
        let url = match[0]
        const trailing = url.match(TRAILING)?.[0] ?? ''
        if (trailing) url = url.slice(0, -trailing.length)
        if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) })
        parts.push({ kind: 'link', value: url, href: url })
        last = start + url.length
    }
    if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
    return parts
}
