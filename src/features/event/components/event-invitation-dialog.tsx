'use client'

import { useMyChannel } from '@features/channel'
import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { StoreButtons } from '@shared/components/get-app-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_IN, INVITE_DOT } from '@shared/lib/motion'
import { qrImageUrl } from '@shared/lib/qr-image'
import { cn } from '@shared/lib/utils'
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
 * 342px, the inviter's avatar at 48 (beside the reader's own — see the row), the QR at 108×110 on white, the stores under it — legacy's
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
    const { myChannel } = useMyChannel()
    const name = invitation?.name ?? ''

    return (
        <Dialog open={invitation !== null} onOpenChange={open => !open && onClose()}>
            <DialogContent data-testid="event-invitation" className="w-[342px] max-w-full">
                <div className="flex flex-col items-center gap-4 text-center">
                    {/*
                     * **Inviter ··· you** — who is asking, and who is being asked, with the dots
                     * between them as the call going out. The two faces arrive from their own
                     * sides (`GIFT_IN` along `--gift-dir`, mirrored in RTL), then the dots start a
                     * wave once both are in. Legacy shows the inviter alone; the reader's own face
                     * is a deliberate addition — it is what makes "you've been invited" read as
                     * *you*. Before the reader's channel resolves, their slot holds initials rather
                     * than collapsing, so the row never re-centres.
                     */}
                    <div
                        data-testid="event-invitation-faces"
                        aria-hidden
                        className="flex items-center gap-4"
                    >
                        <span className={cn('flex', GIFT_IN, '[--gift-dir:1] rtl:[--gift-dir:-1]')}>
                            <InvitationFace url={invitation?.avatar ?? null} name={name} />
                        </span>
                        <span className="flex items-center gap-1.5">
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    className={cn(
                                        'size-1.5 rounded-full bg-(--text-title)',
                                        INVITE_DOT,
                                    )}
                                    style={{ animationDelay: `${420 + i * 160}ms` }}
                                />
                            ))}
                        </span>
                        <span
                            className={cn(
                                'flex',
                                GIFT_IN,
                                '[--gift-dir:-1] rtl:[--gift-dir:1] [animation-delay:80ms]',
                            )}
                        >
                            <InvitationFace
                                url={myChannel?.images.thumb ?? null}
                                name={myChannel?.name ?? ''}
                            />
                        </span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <DialogTitle className="type-body-strong text-(--text-title)">
                            {t('event_studio_invitation_title')}
                        </DialogTitle>
                        <DialogDescription className="type-dense-default text-(--text-subtitle)">
                            {t('event_studio_invitation_body')}
                        </DialogDescription>
                    </div>
                    {shareUrl && (
                        /*
                         * White on purpose, in both themes: a QR needs a light quiet zone to scan.
                         * ⚠ The zone is **padding**, not a 1px margin. At 108-in-110 the image's own
                         * square corners sat on the rounded ones and the radius was cut flat, with
                         * the finder patterns touching the edge. `p-2` + `overflow-clip` gives the
                         * corners room to round, the same card `share-qr-panel.tsx` draws.
                         */
                        <span className="flex items-center justify-center overflow-clip rounded-(--radius-lg) bg-white p-2">
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

/** One face in the inviter ··· you row — 48px, initials while there is no picture. */
function InvitationFace({ url, name }: { url: string | null; name: string }) {
    return (
        <Avatar size="large" type={url ? 'image' : 'initials'}>
            {url ? (
                <Image
                    src={url}
                    alt=""
                    width={48}
                    height={48}
                    className="size-full rounded-full object-cover"
                />
            ) : (
                <AvatarInitials>{(name || '?').slice(0, 2).toUpperCase()}</AvatarInitials>
            )}
        </Avatar>
    )
}
