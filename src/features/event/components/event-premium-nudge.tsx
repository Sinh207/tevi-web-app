'use client'

import { PREMIUM_PATH } from '@features/premium/routes'
import { Sheen } from '@shared/components/sheen'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_IN, GIFT_OUT, GIFT_OUT_MS, POP } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PREMIUM_NUDGE_SECONDS } from '../hooks/use-premium-nudge'
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
    open,
    secondsLeft,
    onClose,
}: {
    /**
     * Whether the card should be up. It is mounted on this rather than by the caller so that it can
     * **leave** — `GIFT_OUT` toward the edge it came from — instead of vanishing in a frame when
     * ✕, *Close* or the countdown ends it.
     */
    open: boolean
    secondsLeft: number
    onClose: () => void
}) {
    const { t } = useTranslation()
    const [mounted, setMounted] = useState(open)
    const [entered, setEntered] = useState(false)
    useEffect(() => {
        if (open) {
            setMounted(true)
            return
        }
        const timer = setTimeout(() => {
            setMounted(false)
            setEntered(false)
        }, GIFT_OUT_MS)
        return () => clearTimeout(timer)
    }, [open])

    if (!mounted) return null
    const leaving = !open

    return (
        <aside
            data-testid="event-premium-nudge"
            onAnimationEnd={e => {
                if (e.target === e.currentTarget) setEntered(true)
            }}
            className={cn(
                'relative w-[140px] overflow-hidden rounded-lg shadow-[0_8px_24px_rgba(75,0,224,0.35)]',
                /*
                 * In from — and out toward — the **trailing** edge it is pinned to: the gift
                 * banner's motion with the direction flipped (`--gift-dir: -1` is "from the end"),
                 * and flipped back in Arabic, where the end is the left.
                 */
                '[--gift-dir:-1] rtl:[--gift-dir:1]',
                leaving ? cn(GIFT_OUT, 'pointer-events-none') : !entered && GIFT_IN,
            )}
            style={{
                background: 'linear-gradient(180deg, #040013 0.48%, #4B00E0 68.49%, #C096FF 100%)',
            }}
        >
            {/* The glare every Premium surface in the app carries, on its own timing. */}
            <Sheen />
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
                    // Pops a beat after the card lands.
                    className={cn('size-[52px]', POP, '[animation-delay:160ms]')}
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
                    className="type-micro-overline relative flex h-7 w-full items-center justify-center overflow-hidden rounded-md bg-black/15 text-white"
                >
                    {/*
                     * The countdown, drawn: a fill that drains a second at a time, eased over the
                     * second so it moves continuously rather than in ten jumps.
                     */}
                    <span
                        aria-hidden
                        className="absolute inset-y-0 start-0 bg-white/15 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
                        style={{
                            width: `${Math.max(0, Math.min(1, secondsLeft / PREMIUM_NUDGE_SECONDS)) * 100}%`,
                        }}
                    />
                    <span className="relative">
                        {t('event_studio_premium_nudge_close', { seconds: `${secondsLeft}s` })}
                    </span>
                </button>
            </div>
        </aside>
    )
}
