'use client'

import { usePostCacheSync } from '../hooks/use-post-cache-sync'

/**
 * Mounted **once**, by `session-providers.tsx` — the listener that keeps cached posts in step with
 * what the reader buys (`usePostCacheSync`). Renders nothing. In the session tree because every
 * event it hears comes from a signed-in purchase, and a `/app/*` webview mounts no session.
 */
export function PostCacheSync() {
    usePostCacheSync()
    return null
}
