'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useState } from 'react'
import { toast } from 'sonner'

/** One id for both outcomes, so pressing twice replaces the toast instead of stacking two —
 *  the same id discipline `ChannelCopyLink` and `CopyHexButton` use. */
const TOAST_ID = 'channel-share'

/**
 * Sharing a space's link — `navigator.share` where it exists, the clipboard everywhere else.
 *
 * ## One implementation, two call sites
 *
 * The channel page's top bar had this inline, and the follow-requests empty state needs the same
 * gesture ("Share profile"). Two copies of it would be two places to get the same three details
 * wrong: that a **dismissed** share sheet rejects and is not a failure, that the desktop path is
 * a copy and therefore needs a toast the native sheet does not, and that a second press while the
 * sheet is open must do nothing.
 *
 * ## Why it is not a share *sheet*
 *
 * Legacy opens its own `<Share>` dialog with a row per network. Nothing in the DS ports to that
 * yet — no `dropdown`, no `bottom-sheet` — and hand-rolling one out of `div`s would fail DoD §10.
 * The platform sheet is the honest substitute on the surface where it exists (every phone, which
 * is where sharing actually happens), and on a desktop browser the link on the clipboard is what
 * the reader wanted anyway.
 *
 * `isSharing` is published because the button has to be able to say it is busy: on iOS the sheet
 * can take a beat to appear, and a second tap in that window opens nothing while looking like it
 * should.
 */
export function useShareSpace(): {
    share: (input: { url: string | null | undefined; title?: string | null }) => Promise<void>
    isSharing: boolean
} {
    const { t } = useTranslation()
    const [isSharing, setIsSharing] = useState(false)

    async function share({
        url,
        title,
    }: {
        url: string | null | undefined
        title?: string | null
    }) {
        if (!url || isSharing) return
        setIsSharing(true)
        try {
            /*
             * **The two branches report failure differently, and that is the point.**
             *
             * A share sheet rejects when it is *dismissed*, which is not a failure — so that
             * branch swallows. The clipboard branch does not get the same treatment: nothing was
             * dismissed there, so a rejection means the press did nothing, and a control that
             * visibly does nothing is worse than one that says why. `ChannelCopyLink` already
             * puts the URL in the toast for exactly this case, so the reader can select it by
             * hand; this does the same.
             *
             * It is reachable in practice, not defensive padding: `navigator.clipboard` does not
             * exist on an insecure origin — `pnpm dev` prints a LAN `http://` URL, which is how
             * phones are tested — and it can be refused by permissions policy.
             */
            if (typeof navigator !== 'undefined' && navigator.share) {
                try {
                    await navigator.share({ ...(title ? { title } : {}), url })
                } catch {
                    // Dismissed. Not news.
                }
                return
            }
            try {
                await navigator.clipboard.writeText(url)
                toast.success(t('channel_link_copied'), { id: TOAST_ID })
            } catch {
                toast.error(t('channel_link_copy_failed', { url }), { id: TOAST_ID })
            }
        } finally {
            setIsSharing(false)
        }
    }

    return { share, isSharing }
}
