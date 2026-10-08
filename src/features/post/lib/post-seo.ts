import { ApiError } from '@shared/lib/api/errors'
import type { Post } from '../api/types'
import { isGated } from './post-access'

/**
 * What a crawler and a link-preview scraper are told about a post.
 *
 * ## Posts are `noindex, follow`, and that is a product decision rather than an oversight
 *
 * Legacy sets it on every exit path of `pages/[channelSlug]/post/[postId]`, with the reason
 * written beside it: **spaces are the only pages Tevi wants ranking**. `follow` still lets a
 * crawler walk the links back to the space, so a shared post keeps passing signal to the profile
 * that owns it.
 *
 * Server-rendering the page is therefore *not* about the index. It is about the first paint for
 * somebody opening a shared link, and about Facebook, Telegram and Slack — scrapers that read the
 * initial HTML and run no JavaScript. That is why this module exists at all for a page nobody will
 * find in a search result.
 */

/** Google truncates the page title around 60 characters; leave room for the author suffix. */
const TITLE_SNIPPET = 60
const DESCRIPTION_LIMIT = 160

/**
 * Truncate by **code point**, not by `length` — `channel-seo.ts` carries the full reasoning, and
 * it is the same trap: `slice` counts UTF-16 units, so cutting at 60 can split a surrogate pair
 * and emit a lone half, which renders as `�`. Emoji in post text make this the common case.
 *
 * Whitespace is collapsed first: a post is `whitespace-pre-wrap` on screen, and the newlines that
 * make it readable there become ragged gaps in a preview card.
 */
export function postSnippet(text: string | null, limit: number): string {
    const collapsed = text?.replace(/\s+/g, ' ').trim()
    if (!collapsed) return ''
    const points = [...collapsed]
    return points.length <= limit ? collapsed : `${points.slice(0, limit).join('')}…`
}

function author(post: Post): string {
    const slug = post.channel?.slug
    const name = post.channel?.name
    if (!slug) return name ?? 'Tevi'
    return name ? `${name} (@${slug})` : `@${slug}`
}

/** Legacy's exact format, pinned by a test — changing it churns every shared link's preview. */
export function buildPostTitle(post: Post): string {
    const snippet = postSnippet(post.text, TITLE_SNIPPET)
    return snippet ? `${snippet} - ${author(post)} | Tevi` : `${author(post)} on Tevi`
}

/**
 * The preview sentence.
 *
 * A **gated** post gets different wording from a free one, and the distinction is not cosmetic:
 * its text is withheld by the backend, so there is nothing to quote and the sentence has to say
 * what the reader would be opening instead of describing a post it cannot see.
 */
export function buildPostDescription(post: Post): string {
    const snippet = postSnippet(post.text, DESCRIPTION_LIMIT)
    if (snippet) return snippet
    const who = post.channel?.name ?? (post.channel?.slug ? `@${post.channel.slug}` : 'a creator')
    return isGated(post)
        ? `Exclusive content by ${who} on Tevi. Follow for more updates.`
        : `Post by ${who} on Tevi. Follow for exclusive content and updates.`
}

/**
 * The one URL a post lives at.
 *
 * ## Why a canonical is needed at all: a post has **two** addresses
 *
 * It is reachable by its raw id and by its short `code`, and inbound links vary in slug casing.
 * Legacy resolves this by *redirecting* (301) to the canonical path in `getServerSideProps`.
 *
 * Preferring `shareable_url`'s path over a constructed one is deliberate and is the same rule
 * `post-link.ts` states: the backend mints that URL, and taking only its **pathname** is what
 * keeps a staging render from pointing at production. The constructed fallback exists because an
 * unconfirmed post has no `shareable_url` yet.
 */
export function postCanonicalPath(post: Post, requested: string): string | null {
    const shared = post.shareable_url?.trim()
    if (shared) {
        try {
            const path = new URL(shared, 'https://tevi.invalid').pathname
            if (path && path !== '/') return path
        } catch {
            // Fall through and construct one.
        }
    }
    const slug = post.channel?.slug
    if (!slug) return null
    return `/@${slug}/post/${post.code ?? requested}`
}

/**
 * Whether the address the reader used is already the canonical one.
 *
 * Compared **decoded and without a trailing slash**, because neither difference is a different
 * page and redirecting on one would be a loop waiting to happen — `/@ada/post/abc/` and
 * `/%40ada/post/abc` are the same post. Legacy's `needsCanonicalRedirect` normalises exactly these
 * two and nothing else, and this matches it.
 *
 * ⚠ **Case is significant, and deliberately so.** Folding it looks like an improvement — one URL
 * per post regardless of how a link was typed — and it is the wrong call here: the canonical path
 * comes from `shareable_url`, so the *slug* half is already the channel's own casing and needs no
 * help, while the *code* half is case-sensitive. A fold that cannot tell the two segments apart
 * would report `/@ada/post/AbC` as already canonical and leave the reader on a URL the API will
 * not resolve. Comparing raw sends them to the one address the backend minted.
 */
export function isCanonicalPath(requestPath: string, canonical: string): boolean {
    return normalizePath(requestPath) === normalizePath(canonical)
}

function normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0].split('#')[0].replace(/\/+$/, '')
    try {
        return decodeURIComponent(withoutQuery)
    } catch {
        // A malformed escape is not worth failing over; compare what we were given.
        return withoutQuery
    }
}

/**
 * What asking the API for a post produced, from the crawler's point of view.
 *
 * The same four-way shape `channel-seo.ts` uses, and for the same reason: `generateMetadata` and
 * the page body need **different** behaviour from the same failure, and collapsing them is how an
 * upstream outage becomes a deindexing event.
 *
 * - `gone` — a definitive 404. The post is not there.
 * - `restricted` — a **422**, which is what a protected space answers an anonymous caller. The
 *   post exists and this render may not see it; a reader with a session still can.
 * - `unavailable` — anything else, including a network fault. Never treated as missing.
 */
export type PostFetchStatus = 'ok' | 'gone' | 'restricted' | 'unavailable'

export function resolvePostFetchStatus(error: unknown): Exclude<PostFetchStatus, 'ok'> {
    if (error instanceof ApiError) {
        if (error.status === 404) return 'gone'
        if (error.status === 422) return 'restricted'
    }
    return 'unavailable'
}

/**
 * Whether this post's content may appear in the server's HTML at all.
 *
 * Distinct from indexing — nothing here is indexed. This gates what a **scraper** is handed, and
 * an NSFW post is the case that matters: a link preview is rendered by the chat app, not by us,
 * with no consent gate in front of it. Legacy withholds the server HTML on the same condition.
 */
export function mayRenderForCrawler(post: Post): boolean {
    if (post.deleted) return false
    if (post.marked_nsfw || post.detected_nsfw) return false
    return !post.channel?.is_nsfw
}
