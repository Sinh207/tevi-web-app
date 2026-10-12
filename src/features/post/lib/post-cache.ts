import type { Post } from '../api/types'
import { isLocked } from './post-access'

/**
 * Finding and replacing one post wherever the query cache holds it.
 *
 * ## Why a walk over the cache, and not a list of keys
 *
 * A post is in lists that are not this feature's: the home feed is `features/home`'s and a space's
 * thread pages are `features/channel`'s, and both import this feature, so naming their keys here
 * would close a barrel cycle. Every one of those lists parses its rows with `normalizePosts`, so a
 * row *is* a `Post` — which is what makes replacing one by id safe whatever list it sits in.
 *
 * ## Why patch, when the rule is to invalidate
 *
 * Because re-reading the list does not work: after a purchase, `GET v1/posts/bookmark/` comes back
 * with the post still locked (seen on staging, with the validators already dropped). The **detail**
 * endpoint is what legacy re-reads after a purchase (`handleGetPostById`), and it is right. So the
 * fresh detail — an HTTP read, not a socket frame — is written into the rows that carry the post.
 * Refetching the list afterwards would put the stale row straight back.
 *
 * Bounded at `MAX_DEPTH`: the deepest shape that holds a post today is
 * `InfiniteData.pages[].results[]`, four levels. It runs per purchase, never per render.
 */
const MAX_DEPTH = 6

type Visit = (post: Record<string, unknown>) => void

function walk(data: unknown, visit: Visit, depth = 0) {
    if (depth > MAX_DEPTH || data === null || typeof data !== 'object') return
    if (Array.isArray(data)) {
        for (const item of data) walk(item, visit, depth + 1)
        return
    }
    const record = data as Record<string, unknown>
    if (typeof record.id === 'string') visit(record)
    for (const value of Object.values(record)) walk(value, visit, depth + 1)
}

/** Does this cache entry carry the post anywhere? */
export function holdsPost(data: unknown, postId: string): boolean {
    let found = false
    walk(data, record => {
        if (record.id === postId) found = true
    })
    return found
}

/**
 * The ids of every post in this cache entry that belongs to the space `slug`.
 *
 * Matched on `channel.slug`, case-insensitively, because the space page — where a membership is
 * joined — knows the space by its slug and the URL can carry it in any case.
 */
export function postIdsOfChannel(data: unknown, slug: string): string[] {
    const wanted = slug.replace(/^@/, '').toLowerCase()
    const ids: string[] = []
    walk(data, record => {
        const channel = record.channel as { slug?: unknown } | null | undefined
        if (typeof channel?.slug === 'string' && channel.slug.toLowerCase() === wanted) {
            ids.push(record.id as string)
        }
    })
    return ids
}

/**
 * The ids of every post in this cache entry that is locked **behind a membership** for this reader
 * — what a card-paid membership may have just unlocked, when nothing says which space it was for.
 *
 * A record counts as a post only if it carries `required_packages` as an array — the field
 * `postGate` reads — so a channel or an image object inside a post is never mistaken for one.
 */
export function membershipLockedPostIds(data: unknown): string[] {
    const ids: string[] = []
    walk(data, record => {
        const packages = record.required_packages
        if (!Array.isArray(packages) || packages.length === 0) return
        if (isLocked(record as unknown as Post)) ids.push(record.id as string)
    })
    return ids
}

/**
 * The same entry with every row whose id is in `fresh` replaced — immutably, so a list that held
 * none of them comes back as the same reference and TanStack Query notifies nobody.
 */
export function replacePosts<T>(data: T, fresh: ReadonlyMap<string, Post>, depth = 0): T {
    if (depth > MAX_DEPTH || data === null || typeof data !== 'object') return data
    if (Array.isArray(data)) {
        let changed = false
        const next = data.map(item => {
            const replaced = replacePosts(item, fresh, depth + 1)
            if (replaced !== item) changed = true
            return replaced
        })
        return (changed ? next : data) as T
    }
    const record = data as Record<string, unknown>
    if (typeof record.id === 'string' && fresh.has(record.id)) return fresh.get(record.id) as T
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
        const replaced = replacePosts(value, fresh, depth + 1)
        if (replaced !== value) changed = true
        next[key] = replaced
    }
    return (changed ? next : data) as T
}
