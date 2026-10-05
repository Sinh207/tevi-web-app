/**
 * Where direct messages live, and nothing else — **no imports**, for the reason
 * `features/channel/routes.ts` gives: `features/navigation` links here from the tab bar and the
 * rail, and routing that link through `index.ts` would drag the whole conversation list into
 * every page's bundle and close a barrel cycle through `features/channel`.
 */

/**
 * The inbox. Legacy's path (`pages/messages`), unchanged: the apps and push notifications link to
 * it, and the cutover is same-origin.
 */
export const MESSAGES_PATH = '/messages'

/**
 * One conversation, addressed by the **other side's** space — `/@ada/messages`.
 *
 * Legacy's URL (`pages/[channelSlug]/messages`), and the one its setting sheet hands out as "link to
 * your message", so it is already in people's bios. The slug is passed without its `@` and encoded
 * here, as `channelActionPath` does: slugs are user-chosen.
 */
export function conversationPath(slug: string): string {
    return `/@${encodeURIComponent(slug)}/messages`
}

/**
 * Whether a pathname is inside direct messages — the inbox or a conversation — so the shell can
 * light its Messages entry on both. The `@` may arrive percent-encoded (`parseChannelSlug`
 * documents why `%40ada` is the ordinary case).
 */
export function isMessagesPath(pathname: string): boolean {
    return pathname === MESSAGES_PATH || /^\/(?:@|%40)[^/]+\/messages\/?$/.test(pathname)
}

/**
 * The slug of the conversation a pathname opens, or `null` on `/messages` (and anywhere else).
 * Decoded, without its `@` — the same spelling `conversationPath` takes.
 */
export function slugFromMessagesPath(pathname: string): string | null {
    const match = /^\/(?:@|%40)([^/]+)\/messages\/?$/.exec(pathname)
    if (!match) return null
    try {
        return decodeURIComponent(match[1])
    } catch {
        return null
    }
}
