import type { Post } from '../api/types'

/**
 * Where a post lives on this site.
 *
 * ## The backend hands over an absolute URL and only its path may be used
 *
 * `shareable_url` is `https://tevi.com/@ada/post/abc` — an **absolute** URL, minted by a service
 * that does not know which host the reader is on. Legacy takes `new URL(url).pathname` and pushes
 * that, and the reason is not tidiness: staging serves `shareable_url` pointing at production, so
 * following it whole walks a developer out of the environment they are testing, taking their
 * session with them. Every navigation to a post in this app goes through this function.
 *
 * Anything that is not a parseable absolute URL answers `null`, and a `null` here is what makes the
 * card **not a link** rather than a link to `/`. A post without one is ordinary: an optimistic row
 * the composer has not had confirmed yet has no `shareable_url`.
 *
 * ## A relative value is accepted, but only a **path-absolute** one
 *
 * `URL` needs a base for those, so one is supplied — and the result is still reduced to a path, so
 * the fake origin never escapes. This means a backend that starts sending `/@ada/post/abc` does not
 * silently turn every card into a non-link.
 *
 * ⚠ **The leading `/` is required, and that is not pedantry.** With a base, `URL` resolves
 * *anything* — `'not a url at all'` becomes `/not%20a%20url%20at%20all`, so a malformed row would
 * have produced a confident in-app link to a page that cannot exist, rather than no link. Requiring
 * either a real scheme or a leading slash is what keeps garbage answering `null`. A test caught
 * this; nothing in the app would have.
 *
 * ## The query and hash are dropped
 *
 * Deliberately. What the backend appends today is a share attribution (`?utm_…`), and carrying it
 * into an in-app `router.push` would attribute an internal navigation to whichever campaign last
 * touched that row. A share **sheet** wants the whole URL; this function is for navigating.
 */
export function postPath(post: Pick<Post, 'shareable_url'>): string | null {
    const raw = post.shareable_url?.trim()
    if (!raw) return null
    // Either an absolute URL with a scheme, or a path-absolute reference. Nothing else resolves.
    if (!raw.startsWith('/') && !/^https?:\/\//i.test(raw)) return null
    try {
        const url = new URL(raw, 'https://tevi.invalid')
        return url.pathname || null
    } catch {
        return null
    }
}

/**
 * Whether a press on the card's body should navigate at all.
 *
 * Three separate reasons not to, and they are not the same reason:
 *
 * - **no path** — nothing to navigate to (above).
 * - **deleted** — the destination is a tombstone. Legacy blanks `postDetailUrl` on
 *   `isPostDeleted`, which is what stops a reader tapping a "this post is no longer available"
 *   card to be shown the same sentence on a page of its own.
 * - **`disabled`** — the caller is *already* the post detail page, or is rendering the card inside
 *   something where a navigation would be wrong (a preview, a picker). Legacy calls this
 *   `disablePostDetail` and passes it from four places.
 */
export function postHref(
    post: Pick<Post, 'shareable_url' | 'deleted'>,
    { disabled = false }: { disabled?: boolean } = {},
): string | null {
    if (disabled || post.deleted) return null
    return postPath(post)
}
