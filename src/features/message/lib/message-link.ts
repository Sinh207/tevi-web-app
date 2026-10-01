import { BASE_URL } from '@shared/config/env'
import type { ChatMessage } from '../api/types'
import { messageText, splitLinks } from './message-thread'

/**
 * What a message's links *are* — which ones stay inside Tevi, and which message deserves a card.
 *
 * None of this comes from the service. No field says "this message is a post": all three clients
 * read it out of the text (legacy `useMessageType`, iOS `DMMessage.init`, Android
 * `DmMessageProcessorRepository`), and the one structured exception is iOS's `attachments`, which
 * only the Premium gift uses. So the rules live here, pure, where they can be pinned.
 */

/** Hosts that are this app — legacy's four origins, plus whatever this deployment is served from. */
const TEVI_HOSTS = new Set(['tevi.com', 'web.tevi.com', 'tevi.dev', 'web.tevi.dev'])

function isTeviHost(host: string, extra: string | null): boolean {
    const bare = host.toLowerCase().replace(/^www\./, '')
    return TEVI_HOSTS.has(bare) || (!!extra && bare === extra)
}

const OWN_HOST = (() => {
    try {
        return new URL(BASE_URL).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
        return null
    }
})()

/**
 * The in-app path for a Tevi URL, or `null` for anywhere else.
 *
 * A Tevi link in a message opens **here**, as a client-side navigation — iOS routes every Tevi host
 * through its deep-link handler for the same reason. Legacy sends each one to a new tab, which
 * reloads the whole app to show a page this tab could have shown.
 */
export function teviPath(href: string, ownHost: string | null = OWN_HOST): string | null {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        return null
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!isTeviHost(url.hostname, ownHost)) return null
    return `${url.pathname}${url.search}${url.hash}` || '/'
}

export type MessageEmbed =
    | { kind: 'gift'; productName: string | null }
    | { kind: 'space'; slug: string }
    | { kind: 'post'; slug: string; postId: string }
    | { kind: 'collection'; slug: string; collectionId: string }

const PREMIUM_GIFT_SCHEME = 'tevi://TEVI_PREMIUM_GIFT'
const PREMIUM_GIFT_TYPE = 'TEVI_PREMIUM_GIFT'
/** Legacy's slug rule for the first path segment. */
const SLUG = /^@([a-zA-Z0-9_-]+)$/

/**
 * The Premium plan a gift message names, from either spelling: iOS's attachment, or the query of
 * the `tevi://` text Android and legacy read. Decoded, which legacy does not do — its pill reads
 * `Gift%20Premium%201%20year` whenever the sender's client encoded the space.
 */
/** A message or a list row's `latest_message` — the latter carries no attachments. */
type GiftSource = Pick<ChatMessage, 'text'> & { attachments?: ChatMessage['attachments'] }

export function premiumGiftName(message: GiftSource): string | null {
    const attached = message.attachments?.find(item => item.type === PREMIUM_GIFT_TYPE)
    if (attached?.preview_data?.product_name) return attached.preview_data.product_name
    const raw = message.text?.match(/product_name=([^&|?\n\r]*)/)?.[1]
    if (!raw) return null
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' ')).trim() || null
    } catch {
        return raw.trim() || null
    }
}

export function isPremiumGift(message: GiftSource): boolean {
    return (
        (message.attachments ?? []).some(item => item.type === PREMIUM_GIFT_TYPE) ||
        (message.text?.startsWith(PREMIUM_GIFT_SCHEME) ?? false)
    )
}

/**
 * The card a message draws under its text, or `null` for none.
 *
 * Legacy's order: a photo message is its photos; a gift is a gift; otherwise the **first** URL
 * decides (iOS takes the last — legacy is the reference, and the first is what the reader sees
 * first). Three Tevi shapes get a card — `/@slug`, `/@slug/post/{id}` and `/@slug/collections/{id}`,
 * legacy's space, post and collection. Two stay plain links: an **event** (`/@slug/event/{id}` —
 * there is no read of one event by id in this client), and an **external site** — its preview needs
 * a server that fetches arbitrary URLs for us (legacy's `/api/link-preview`), which is an SSRF surface
 * this app deliberately does not have.
 */
export function messageEmbed(
    message: Pick<ChatMessage, 'text' | 'markdown_text' | 'images' | 'attachments'>,
    ownHost: string | null = OWN_HOST,
): MessageEmbed | null {
    if (message.images.length > 0) return null
    if (isPremiumGift(message)) return { kind: 'gift', productName: premiumGiftName(message) }
    const text = messageText(message)
    if (!text) return null
    const link = splitLinks(text).find(part => part.kind === 'link')
    if (link?.kind !== 'link') return null
    const path = teviPath(link.href, ownHost)
    if (!path) return null
    const [first, second, third] = path.split(/[?#]/)[0].split('/').filter(Boolean)
    const slug = first?.match(SLUG)?.[1]
    if (!slug) return null
    if (!second) return { kind: 'space', slug }
    if (second === 'post' && third) return { kind: 'post', slug, postId: third }
    if (second === 'collections' && third) return { kind: 'collection', slug, collectionId: third }
    return null
}

/**
 * A Premium plan in the reader's words — iOS's `genGiftPackageLocalizedMap`, as a rule rather than
 * a table of spellings: "Gift Premium 1 year", "Gift Premium (3 months)" and "6 Months" all say a
 * duration. `null` when the name says none, and the caller shows the name as sent.
 */
export function giftPlanDuration(
    name: string | null,
): { unit: 'year' | 'month'; count: number } | null {
    if (!name) return null
    const match = name.match(/(\d+)\s*(years?|months?)/i)
    if (!match) return null
    const count = Number(match[1])
    if (!Number.isFinite(count) || count <= 0) return null
    return { unit: match[2].toLowerCase().startsWith('year') ? 'year' : 'month', count }
}

/** The plan as a reader should see it: a translated duration, or the name as sent. */
export function giftPlanLabel(
    name: string | null,
    t: (key: string, options?: Record<string, unknown>) => string,
): string {
    const duration = giftPlanDuration(name)
    if (duration) {
        return t(duration.unit === 'year' ? 'message_gift_plan_year' : 'message_gift_plan_month', {
            count: duration.count,
        })
    }
    return name ?? t('message_gift_plan_unknown')
}
