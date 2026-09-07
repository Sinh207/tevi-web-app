'use client'

import { useAuth } from '@features/auth'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ShareLink, shareKeys, shareLinkApi } from '../api/share-link-api'
import { SHARE_CHANNEL_BY_ID, type ShareChannel } from '../lib/share-channels'
import type { ShareContext } from '../lib/share-context'

/**
 * Opens a tab **before** the link is minted, and navigates it after.
 *
 * A share link takes a round trip, and `window.open` after an `await` is a popup: the user gesture
 * has been spent by the time it runs, so Safari and Firefox block it outright and the press does
 * nothing. Opening `about:blank` synchronously keeps the gesture, and the returned function points
 * the tab at the real target once there is one — legacy's trick, and the one piece of its share
 * hook that is load-bearing rather than incidental.
 *
 * `opener = null` before navigating: the DS-era `noopener` window feature cannot be used here (it
 * makes `window.open` return `null`, so there would be no tab to navigate), and a share target that
 * can reach back into `window.opener` can navigate this app's tab wherever it likes.
 *
 * Returns `null` when even the blank tab was refused — a browser configured to block popups
 * entirely — which the caller answers by trying once more with the finished URL, since a direct
 * `window.open` to a real destination is what those settings usually still allow.
 */
function openBlankTab(): ((url: string) => void) | null {
    const win = window.open('about:blank', '_blank')
    if (!win) return null
    return url => {
        win.opener = null
        win.location.href = url
    }
}

/**
 * One share's links — minted lazily per channel, deduplicated, and never allowed to leave the
 * reader with nothing.
 *
 * ## Three promises, and none of them is visible at the call site
 *
 * **1. A press mints at most one link.** `POST v1/links` is per-channel, so pressing Telegram twice
 * must not create two rows in the link service (each with its own `share_link_created_v2`). Legacy
 * hand-rolls that with two `useRef` maps — one for the finished links, one for the promises in
 * flight — plus an effect that clears both when the content changes. All three of those are what a
 * query key already does: the key *is* (account, target, channel), a second press hits the cache, a
 * concurrent press joins the flight, and a different content is a different key with nothing to
 * clear. The refs were also the only thing keeping the mini-app player from sharing the *previous*
 * tab's link, which is a bug you can only have if you own the cache by hand.
 *
 * **2. A share with no context mints one link, not six.** `v1/shorten/` takes no `share_channel`,
 * so every row would be an identical request. The cache channel collapses to a constant, which is
 * legacy's `'legacy'` key, and the first row pressed serves the rest.
 *
 * **3. A failed mint still shares.** Legacy toasts "Create share link failed" and hands back
 * `null`; `handleCopyLink` then copies nothing and the reader gets a control that visibly did
 * nothing. The URL passed in is already a working public link — the pretty one is an attribution
 * wrapper, not the content — so a failure falls back to it. The link service being down is not a
 * reason to be unable to share a page.
 *
 * ## The copy link is fetched eagerly, and that is not a convenience
 *
 * `navigator.clipboard.writeText` must run in the same task as the gesture on Safari; awaiting a
 * mint first loses it and the write is refused. So the copy link is a `useQuery` that runs as soon
 * as the sheet opens: by the time anyone presses Copy there is a string in hand and the write is
 * synchronous. It doubles as the URL the sheet prints under the title, which is why `displayUrl`
 * exists here at all — legacy shows the same line for the same reason.
 */
export function useShareLink({
    url,
    context,
    /** The sheet's open state. `false` keeps the eager mint from firing for a dialog nobody opened. */
    enabled = true,
}: {
    url: string
    context?: ShareContext | null
    enabled?: boolean
}) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const queryClient = useQueryClient()

    /** The cache channel: the pressed one for a content share, one constant for everything else. */
    const cacheChannel = (channel: ShareChannel) =>
        context ? SHARE_CHANNEL_BY_ID[channel].wire : 'legacy'

    function linkQuery(channel: ShareChannel) {
        const spec = SHARE_CHANNEL_BY_ID[channel]
        return {
            queryKey: shareKeys.link(activeId, url, cacheChannel(channel)),
            queryFn: (): Promise<ShareLink | null> =>
                context
                    ? shareLinkApi.createLink({
                          url,
                          channel: spec.wire,
                          context,
                          accountId: activeId,
                      })
                    : shareLinkApi.createShortLink({ url, accountId: activeId }),
            /*
             * A minted link never changes: same content, same channel, same URL forever. So the
             * only question is how long to hold it, and `keepFor` sets `gcTime` alongside
             * `staleTime` — a long `staleTime` with the default five-minute `gcTime` would collect
             * it five minutes after the sheet closed and mint a second one on the next share of the
             * same post.
             */
            ...keepFor(30 * 60_000),
        }
    }

    const copy = useQuery({ ...linkQuery('copy-link'), enabled })

    /** The link for one channel — the minted one, or the plain URL if the service would not. */
    async function linkFor(channel: ShareChannel): Promise<string> {
        try {
            const link = await queryClient.fetchQuery(linkQuery(channel))
            return link?.url ?? url
        } catch {
            return url
        }
    }

    return {
        /**
         * What the sheet prints, and what Copy writes. `undefined` while the first mint is in
         * flight — the sheet draws a skeleton rather than the raw URL, so the line does not change
         * under the reader's eyes a beat after it appears.
         */
        shareUrl: copy.isPending && enabled ? undefined : (copy.data?.url ?? url),

        async copyLink() {
            /*
             * Resolved value first, so the common path is synchronous and Safari allows the write.
             * The `await` branch only runs if someone presses Copy before the eager query settles,
             * where the alternative is refusing a press that is perfectly reasonable.
             */
            const link = copy.data?.url ?? (copy.isPending ? await linkFor('copy-link') : url)
            try {
                await navigator.clipboard.writeText(link)
                // One id, so a second press replaces the toast instead of stacking two — the same
                // discipline `ChannelCopyLink` uses.
                toast.success(t('share_link_copied'), { id: TOAST_ID })
            } catch {
                // Reachable, not padding: no `navigator.clipboard` on an insecure origin (a LAN
                // `http://` dev URL, which is how phones are tested) and it can be refused by
                // permissions policy. The URL goes in the toast so it can be selected by hand.
                toast.error(t('share_link_copy_failed', { url: link }), { id: TOAST_ID })
            }
        },

        /** The QR step's link. Same cache as the row, so the code and a pasted link agree. */
        qrLink: () => linkFor('qr-code'),

        /** Send the reader to one channel's own share page. */
        async openChannel(channel: ShareChannel) {
            const spec = SHARE_CHANNEL_BY_ID[channel]
            if (!spec.target) return
            /*
             * The context every target could need, assembled here because this is the only place
             * that has all three: the translated subject, the page being shared *from* (Messenger
             * returns the reader to it), and the Meta app id. The table itself stays pure, which is
             * what lets a node test call every row of it.
             */
            const ctx = {
                subject: t('share_email_subject'),
                redirectUri: window.location.href,
                appId: env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID,
            }
            const navigate = openBlankTab()
            const target = spec.target(await linkFor(channel), ctx)
            if (navigate) {
                navigate(target)
                return
            }
            // The blank tab was blocked. A direct open to the finished URL is what a popup blocker
            // usually still permits, and if it does not, say so rather than doing nothing.
            if (!window.open(target, '_blank', 'noopener,noreferrer')) {
                toast.error(t('share_open_failed'), { id: TOAST_ID })
            }
        },
    }
}

const TOAST_ID = 'share-link'
