'use client'

import type { ShareContext } from '../lib/share-context'
import { useShareLink } from './use-share-link'

/**
 * **A copy-link control outside the share sheet** — the one slice of `useShareLink` another
 * surface may have: mint the copy link, print it, write it.
 *
 * The barrel keeps `useShareLink` itself unexported (a second caller would own a second share's
 * worth of state), and this does not reopen that: it reads the **same query** the sheet does —
 * keyed on (account, url, `copy_link`) — so a copy here and a Copy in the sheet for the same
 * content are one mint and one `share_link_created_v2`, never two. Same eager rule too: pass
 * `enabled` with whatever opens the control, so the link is in hand before the press (Safari
 * refuses a clipboard write that awaits a request first).
 *
 * `url` is `undefined` while the first mint is in flight; it falls back to the plain URL if the
 * link service refuses, so a control built on this always has something to copy.
 */
export function useShareCopyLink({
    url,
    context,
    enabled,
}: {
    url: string | null
    context?: ShareContext | null
    enabled: boolean
}) {
    const link = useShareLink({ url: url ?? '', context, enabled: enabled && Boolean(url) })
    return {
        url: url ? link.shareUrl : null,
        copyLink: link.copyLink,
    }
}
