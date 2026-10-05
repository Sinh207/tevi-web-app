'use client'

import { liveShareContext, ShareDialog } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { EventDetail } from '../api/types'
import { eventPath } from '../routes'

/**
 * The page's own controls. One, today: **Share**.
 *
 * ## What legacy has here, and what happened to each of the three
 *
 * - **Share** — legacy's is a bare *copy to clipboard*, with a toast. This opens the app's share
 *   sheet instead, which is the same upgrade `channel-top-bar.tsx` made for a space: seven channels,
 *   a QR step, and a minted link that attributes the share. `features/share`'s own barrel doc lists
 *   the six surfaces it opens from; this is the seventh, and the first to name a **live**
 *   (`liveShareContext` — no legacy twin, see its note and **B115**).
 * - **Preview** — an eye button that, on a desktop, opened a QR dialog and on a phone bounced to the
 *   app. **Not ported, deliberately**: the watch panel below this card *is* that hand-off, with the
 *   same QR and the same store links, and it is there unconditionally rather than behind a control
 *   whose label ("Preview") describes neither of the two things it did.
 * - **Report** — a flag button that opens the *channel* report form. **Not ported this pass**, and
 *   the reason is a boundary rather than a product call: the form is `features/channel`'s
 *   `ChannelReportDialog`, it takes a full `Channel` (44 fields; this payload sends a six-field
 *   projection), and reaching it would pull the entire channel feature — profile, tabs, settings —
 *   into this page's bundle for one control. The right fix is on that side: the dialog wants a
 *   narrower barrel and a target descriptor, the same shape `MembershipTarget` and `DonationTarget`
 *   already have. `docs/EVENT.md` §3 carries it.
 *
 * A single control still gets the row rather than being inlined above: the row is where the second
 * and third go back, and a card whose last block changes shape when Report lands is a worse diff
 * than one that gains a button.
 */
export function EventActions({ event }: { event: EventDetail }) {
    const { t } = useTranslation()
    const [shareOpen, setShareOpen] = useState(false)

    const slug = event.channel?.slug ?? ''

    /*
     * ## Whether the button works is decided from the **payload**, and the URL is built at the press
     *
     * `shareable_url` is what the backend minted and what the sheet's rows fall back to, so it is
     * preferred. For the payload that omits it the URL is derivable — the reader is standing on it —
     * and a Share button that cannot be pressed because one field was absent is worse than one that
     * shares a link we reconstructed.
     *
     * ⚠ But `window.location.origin` **must not be read during render**, and this is the second
     * time that has bitten in this repo. The page is server-rendered, so the fallback evaluated to
     * `null` on the server and to a real URL in the browser — which put `disabled` on the button in
     * the HTML and off after hydration. React reported it as a mismatch on `disabled` and threw the
     * server's markup away; nothing else looked wrong.
     *
     * So `canShare` reads only fields both sides have, and `shareUrl()` is called from inside the
     * `shareOpen` branch — which cannot render before a press, i.e. never on the server.
     */
    const canShare = Boolean(event.shareable_url || (event.code && slug))

    const shareUrl = () =>
        event.shareable_url ??
        (event.code ? `${window.location.origin}${eventPath(slug, event.code)}` : null)

    return (
        <div className="flex min-w-0 items-center gap-2">
            <Button
                data-testid="event-share"
                variant="secondary"
                size="medium"
                // Not `fullWidth`: `Button` is `shrink-0`, so two full-width buttons in a flex row
                // push the trailing one off screen. With one control, growing is what fills the row
                // — and when Report lands the row becomes a `grid grid-cols-2`, which is the shape
                // that actually holds two of them.
                className="grow"
                // Nothing to share. Disabled rather than hidden: the control's absence would read
                // as this page not offering sharing at all.
                disabled={!canShare}
                onClick={() => setShareOpen(true)}
            >
                <Icon name="share" size={20} />
                {t('event_share')}
            </Button>

            {/*
             * Mounted only once there is something to share, and only after the first press — the
             * sheet's `useShareLink` mints eagerly when `open`, so an always-mounted dialog would
             * be a link minted (and a `share_link_created_v2` emitted) on every page view.
             */}
            {canShare && shareOpen && (
                <ShareDialog
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    // `canShare` is true, so one of the two branches resolves; the `??` is what
                    // keeps `url` a `string` rather than making the prop nullable for a case that
                    // cannot happen.
                    url={shareUrl() ?? ''}
                    title={event.title}
                    // The stream's own art, not the creator's avatar: the preview card is about
                    // this broadcast. Falls back to the space's picture when there is no banner.
                    image={event.images.banner ?? event.channel?.images.thumb}
                    context={liveShareContext(event, slug)}
                />
            )}
        </div>
    )
}
