import { OWN_HOST, teviPath } from '@shared/lib/tevi-path'
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

/**
 * The Tevi-host rule lives in `shared/lib/tevi-path.ts` now — a post's promote card needs the same
 * answer and `features/post` may not import this feature. Re-exported so every existing caller and
 * test keeps its import.
 */
export { teviPath }

export type MessageEmbed =
    | { kind: 'gift'; productName: string | null }
    | { kind: 'space'; slug: string }
    | { kind: 'post'; slug: string; postId: string }
    | { kind: 'collection'; slug: string; collectionId: string }
    | { kind: 'event'; slug: string; code: string }
    /**
     * A short link — `/{anything}/s/{code}`, legacy's own test (`partsShortLink[1] === 's'`), which
     * covers both its `/x/s/…` and the share sheet's `/@creator/s/…`. Resolved first, then carded as
     * whatever it points at.
     */
    | { kind: 'short'; code: string }

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
 * first). Every Tevi shape legacy cards gets one — `/@slug` (space, or its mini app),
 * `/@slug/post/{id}`, `/@slug/collections/{id}` and `/@slug/event/{code}` — and a legacy short link
 * (`/{x|@creator}/s/{code}`) is resolved and then carded as what it points at. One thing stays a plain link: an
 * **external site** — its preview needs a server that fetches arbitrary URLs for us (legacy's
 * `/api/link-preview`), which is an SSRF surface this app deliberately does not have.
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
    if (first && second === 's' && third) return { kind: 'short', code: third }
    const slug = first?.match(SLUG)?.[1]
    if (!slug) return null
    if (!second) return { kind: 'space', slug }
    if (second === 'post' && third) return { kind: 'post', slug, postId: third }
    if (second === 'collections' && third) return { kind: 'collection', slug, collectionId: third }
    if (second === 'event' && third) return { kind: 'event', slug, code: third }
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
