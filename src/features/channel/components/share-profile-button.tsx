'use client'

import { ShareDialog, spaceShareContext } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useMyChannel } from '../providers/my-channel-provider'

/**
 * "Share profile" — legacy's own empty-state action (`followRequests/…/emptyState`), which is the
 * one thing that can change the state it appears in: nobody can ask to follow a space they have
 * not found.
 *
 * ## It reads the space itself rather than taking a URL
 *
 * The button is only ever about **the signed-in account's own** space, so a `url` prop would be a
 * parameter every call site has to get right — and the failure mode is a Share button that shares
 * somebody else's link. `useMyChannel` is already above every screen this can appear on, and it
 * is what decides the second question too: it **renders nothing** without a `shareable_url`. A
 * share control for a link that does not exist yet (the account has no space, or the payload has
 * not landed) is a press that silently does nothing.
 *
 * ## It opens the share sheet, the same one the space bar opens
 *
 * `features/share`'s `ShareDialog`, which is what legacy's own empty state opens
 * (`containers/followRequests/…/emptyState`). It pressed `navigator.share` while there was nothing
 * to open; the sheet exists now, and both call sites moved together so the gesture means one thing.
 * The dialog is mounted here rather than raised through a provider: it takes the link and the
 * space's name as props, and this component is the only thing on the screen that knows them.
 *
 * `accent`, because on an empty screen this is the only thing to do and the app paints the brand
 * action in the brand colour. `large`, matching the other empty states' actions — a small button
 * under a 190px illustration reads as an afterthought.
 */
export function ShareProfileButton() {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const [open, setOpen] = useState(false)

    const url = myChannel?.shareable_url
    if (!url) return null

    /** The bar's own fallback, so the two never disagree about what an unnamed space is called. */
    const title = myChannel.name ?? (myChannel.slug ? `@${myChannel.slug}` : null)

    return (
        <>
            <Button
                data-testid="channel-share-profile"
                variant="accent"
                size="large"
                onClick={() => setOpen(true)}
            >
                {/* Outline, like the bar's — `share` ships in both weights, and the filled form is
                    a solid mass that outweighs the label beside it. */}
                <Icon name="share" size={20} aria-hidden />
                {t('follow_requests_share_profile')}
            </Button>

            <ShareDialog
                open={open}
                onOpenChange={setOpen}
                url={url}
                title={title}
                image={myChannel.images.thumb}
                context={spaceShareContext(myChannel)}
            />
        </>
    )
}
