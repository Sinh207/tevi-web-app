'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { StoreButtons } from '@shared/components/get-app-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@shared/ui/dialog'
import Image from 'next/image'
import type { LiveInvitation } from '../hooks/use-live-invitation'

/**
 * **Invited up on camera** — the host asked this reader to join the broadcast as a participant.
 *
 * Legacy's `liveSession/.../dialogs/invitation`, and on the web it is a hand-off, not an accept:
 * legacy's own sentence says "the participant experience isn't supported on web yet", and the
 * dialog offers a QR of the stream plus the two store badges. There is no Accept here because there
 * is none there — joining means publishing a camera, which only the app does.
 *
 * 342px, the inviter's avatar at 48, the QR at 108×110 on white, the stores under it — legacy's
 * measurements. `StoreButtons` rather than a second pair of badges: it reads the store links from
 * remote config (`get-app-dialog.tsx`), which is also where legacy reads them.
 *
 * `shareUrl` is computed by the caller when this opens, never during a render — the fallback reads
 * `window.location.origin` (`event-share-button.tsx` has the hydration measurement). This dialog
 * only ever opens on a socket frame, which is after hydration by construction.
 */
export function EventInvitationDialog({
    invitation,
    shareUrl,
    onClose,
}: {
    invitation: LiveInvitation | null
    shareUrl: string | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const name = invitation?.name ?? ''

    return (
        <Dialog open={invitation !== null} onOpenChange={open => !open && onClose()}>
            <DialogContent data-testid="event-invitation" className="w-[342px] max-w-full">
                <div className="flex flex-col items-center gap-4 text-center">
                    <Avatar size="large" type={invitation?.avatar ? 'image' : 'initials'}>
                        {invitation?.avatar ? (
                            <Image
                                src={invitation.avatar}
                                alt=""
                                width={48}
                                height={48}
                                className="size-full rounded-full object-cover"
                            />
                        ) : (
                            <AvatarInitials>
                                {(name || '?').slice(0, 2).toUpperCase()}
                            </AvatarInitials>
                        )}
                    </Avatar>
                    <div className="flex flex-col gap-1">
                        <DialogTitle className="type-body-strong text-(--text-title)">
                            {t('event_studio_invitation_title')}
                        </DialogTitle>
                        <DialogDescription className="type-dense-default text-(--text-subtitle)">
                            {t('event_studio_invitation_body')}
                        </DialogDescription>
                    </div>
                    {shareUrl && (
                        // White on purpose, in both themes: a QR needs a light quiet zone to scan.
                        <span className="flex size-[110px] items-center justify-center rounded-lg bg-white">
                            {/* `unoptimized`, as the ⋯ panel's QR is: the optimiser would proxy a
                                108px black-and-white square for nothing. */}
                            <Image
                                src={qrImageUrl(shareUrl)}
                                alt=""
                                width={108}
                                height={108}
                                unoptimized
                                className="size-[108px] object-contain"
                            />
                        </span>
                    )}
                    <p className="type-dense-default text-(--text-subtitle)">
                        {t('event_studio_invitation_stores')}
                    </p>
                    <StoreButtons testId="event-invitation-stores" />
                </div>
                {/* Trailing and last in the DOM, so the dialog's first focus is not the way out. */}
                <DialogCloseButton
                    onClose={onClose}
                    className="absolute end-2 top-2"
                    data-testid="event-invitation-close"
                />
            </DialogContent>
        </Dialog>
    )
}
