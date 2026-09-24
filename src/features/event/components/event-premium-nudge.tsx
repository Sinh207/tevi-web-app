'use client'

import { PREMIUM_PATH } from '@features/premium/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { EVENT_ART } from '../lib/illustrations'

/**
 * **The Premium card** — 140px, bottom-trailing on the stage, a few seconds after the reader pays.
 *
 * Legacy's `liveSession/.../rightPanel/subscribePremium`, at its numbers: 140 wide, 8px radius, the
 * `#040013 → #4B00E0 → #C096FF` gradient, `16px 8px 8px` of padding and 8px between rows, a 52px
 * mark over a 10px sentence, and two 28px buttons — *Subscribe now* on white, and *Close after (Ns)*
 * on a 15% black. When it opens is `usePremiumNudge`'s business; this only draws it.
 *
 * *Subscribe now* opens `/premium` in a **new tab**, as legacy's does: following it in this one
 * would end the broadcast the reader is watching.
 *
 * Literal colours, as all studio furniture is — the ground is a creator's camera, not a surface of
 * ours (`lib/studio.ts`).
 */
export function EventPremiumNudge({
    secondsLeft,
    onClose,
}: {
    secondsLeft: number
    onClose: () => void
}) {
    const { t } = useTranslation()
    return (
        <aside
            data-testid="event-premium-nudge"
            className="relative w-[140px] rounded-lg motion-safe:animate-[tevi-rise_300ms_ease-out]"
            style={{
                background: 'linear-gradient(180deg, #040013 0.48%, #4B00E0 68.49%, #C096FF 100%)',
            }}
        >
            <button
                type="button"
                data-testid="event-premium-nudge-close"
                onClick={onClose}
                aria-label={t('common_close')}
                className="absolute end-0 top-0 flex size-7 items-center justify-center text-white"
            >
                <Icon name="xmark" size={16} />
            </button>
            <div className="flex flex-col items-center gap-2 px-2 pt-4 pb-2 text-center">
                <Image
                    src={EVENT_ART.premiumLogo.src}
                    alt=""
                    aria-hidden
                    width={EVENT_ART.premiumLogo.width}
                    height={EVENT_ART.premiumLogo.height}
                    className="size-[52px]"
                />
                <p className="type-micro-overline text-white">
                    {t('event_studio_premium_nudge_body')}
                </p>
                <Link
                    data-testid="event-premium-nudge-subscribe"
                    href={PREMIUM_PATH}
                    target="_blank"
                    rel="noopener"
                    className="type-micro-overline flex h-7 w-full items-center justify-center rounded-md bg-white text-[#141414]"
                >
                    {t('event_studio_premium_nudge_action')}
                </Link>
                <button
                    type="button"
                    data-testid="event-premium-nudge-dismiss"
                    onClick={onClose}
                    className="type-micro-overline flex h-7 w-full items-center justify-center rounded-md bg-black/15 text-white"
                >
                    {t('event_studio_premium_nudge_close', { seconds: `${secondsLeft}s` })}
                </button>
            </div>
        </aside>
    )
}
