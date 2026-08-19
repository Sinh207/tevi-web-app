import { ChannelSkeleton } from '@features/channel'

/**
 * Shown during the streaming gap and on a client-side navigation into a channel.
 *
 * The **same** component the page's own Suspense fallback and `/my-space`'s waiting state use, which
 * is the point: three different paths into this screen should not each invent their own idea of what
 * it looks like while loading. `ChannelSkeleton` has no hooks, so it renders here on the server.
 *
 * Note it is rarely seen on a first visit: the server fetch completes before the page streams, so the
 * HTML usually arrives with real content. This covers the cases where it does not.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <ChannelSkeleton />
        </main>
    )
}
