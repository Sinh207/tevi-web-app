'use client'

import { liveShareContext, ShareDialog } from '@features/share'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { useState } from 'react'
import type { EventDetail } from '../api/types'
import { eventPath } from '../routes'

/**
 * **Share**, as a bar control rather than a button in the page.
 *
 * `EventActions` puts the same action inside the viewer's details card, which is where it belongs on
 * a page that draws that card. The host's live screen does not — it is two blocks that must fit one
 * viewport — and sharing is the one thing a creator on a laptop can actually *do* while their stream
 * is running, so it moves to the bar's `actions` slot. `PageBackBar`'s own note calls that slot the
 * place for "a filter, a **share**, an overflow menu", for the reason it gives: a control pressed
 * against the back arrow reads as part of the back affordance.
 *
 * ## ⚠ `window.location.origin` must not be read during render
 *
 * The whole reason this is a component and not four lines inlined into the bar. The trap is recorded
 * at length in `EventActions` and it has bitten this repo twice: the page is server-rendered, so an
 * origin-derived fallback is `null` on the server and a real URL in the browser — which put
 * `disabled` on the button in the HTML and off after hydration. React reported a mismatch on
 * `disabled` and threw the server's markup away, with nothing else looking wrong.
 *
 * So `canShare` reads only fields both sides have, and `shareUrl()` is called from inside the
 * `shareOpen` branch, which cannot render before a press.
 */
export function EventShareButton({ event }: { event: EventDetail }) {
    const { t } = useTranslation()
    const [shareOpen, setShareOpen] = useState(false)

    const slug = event.channel?.slug ?? ''
    const canShare = Boolean(event.shareable_url || (event.code && slug))

    const shareUrl = () =>
        event.shareable_url ??
        (event.code ? `${window.location.origin}${eventPath(slug, event.code)}` : null)

    return (
        <>
            <BarIconButton
                data-testid="event-share-bar"
                name="share"
                label={t('event_share')}
                // Nothing to share. Disabled rather than hidden, as in `EventActions`: an absent
                // control reads as this page not offering sharing at all.
                disabled={!canShare}
                onClick={() => setShareOpen(true)}
            />

            {/*
             * Mounted only once there is something to share, and only after the first press — the
             * sheet's `useShareLink` mints eagerly when `open`, so an always-mounted dialog would be
             * a link minted (and a `share_link_created_v2` emitted) on every page view.
             */}
            {canShare && shareOpen && (
                <ShareDialog
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    url={shareUrl() ?? ''}
                    title={event.title}
                    image={event.images.banner ?? event.channel?.images.thumb}
                    context={liveShareContext(event, slug)}
                />
            )}
        </>
    )
}
