'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH, POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEffect } from 'react'
import type { EventDetail } from '../api/types'
import { EventSignInPanel, EventWatchPanel } from './event-watch-panel'

/** What raised the paywall — the line over the card says which door the reader just tried. */
export type ExclusiveReason =
    | 'chat'
    | 'gift'
    | 'preview-ended'
    /** The reader pressed Unlock on the preview's own chip — no line needed, they asked. */
    | 'unlock'
    /** The device has had its three looks at this event — said, or the paywall looks like a bug. */
    | 'preview-exhausted'
    /**
     * The preview request came back without a stream — a refusal or a failure. Said, or the
     * paywall looks like the preview is broken.
     */
    | 'preview-unavailable'

/**
 * **The exclusive stream's paywall, over the stage** — not a dialog.
 *
 * The card inside it (`EventWatchPanel`'s locked panel) opens dialogs of its own — *Become a
 * member* and the purchase confirm — and a modal raising a modal is two focus traps arguing over
 * one keyboard. So this is a layer **in the stage area**: the stage is frosted under it, the chat
 * column beside it stays where it is (with its own locked controls pointing here), and the card's
 * own dialogs portal over everything as they always have.
 *
 * Two modes, set by the caller:
 * - **dismissable** — raised from an action during the preview (chat, a gift). The sample keeps
 *   playing behind the frost; ✕, Escape or a press on the frost returns to it.
 * - **a wall** — the preview is over (spent, run out, refused, or the stream was locked
 *   mid-watch). Nothing to return to, so no way to dismiss it; leaving is the back button.
 *
 * Motion: the frost fades up, the card `RISE`s, the reason chip `POP`s above it.
 */
export function EventExclusivePaywall({
    event,
    reason,
    lockedMidStream,
    detail = null,
    signIn = false,
    onClose,
}: {
    event: EventDetail
    reason: ExclusiveReason | null
    lockedMidStream: boolean
    /**
     * The API's own sentence for why the preview was refused (`apiErrorText`), shown on the
     * `preview-unavailable` chip in place of ours — only the backend knows whether it was the limit,
     * the window or something else.
     */
    detail?: string | null
    /**
     * A guest: the card is *Sign in* rather than the purchase — legacy's sneak-peek card, the
     * event's title and description over one button. A guest can act on no price.
     */
    signIn?: boolean
    /** Given, the paywall can be dismissed back to the preview. Omitted, it is the wall. */
    onClose?: () => void
}) {
    const { t } = useTranslation()

    useEffect(() => {
        if (!onClose) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const chip =
        reason === 'chat'
            ? {
                  icon: 'chat' as const,
                  text: t(signIn ? 'event_exclusive_chat_sign_in' : 'event_exclusive_chat_locked'),
              }
            : reason === 'gift'
              ? {
                    icon: 'gift-simple' as const,
                    text: t(
                        signIn ? 'event_exclusive_gift_sign_in' : 'event_exclusive_gift_locked',
                    ),
                }
              : lockedMidStream
                ? null
                : reason === 'preview-ended'
                  ? { icon: 'clock' as const, text: t('event_exclusive_preview_ended') }
                  : reason === 'preview-exhausted'
                    ? { icon: 'clock' as const, text: t('event_exclusive_preview_exhausted') }
                    : reason === 'preview-unavailable'
                      ? {
                            icon: 'lock-simple' as const,
                            text: detail ?? t('event_exclusive_preview_unavailable'),
                        }
                      : null

    return (
        <div
            data-testid="event-exclusive-paywall"
            data-option-value={onClose ? 'prompt' : 'wall'}
            className="absolute inset-0 z-30 flex items-center justify-center p-3"
        >
            {/*
             * The frost: the same 6px the fee's wall uses — the stream (or the art) stays
             * recognisable behind it, which is the case for paying, but no longer comfortable to
             * watch. A press on it dismisses, when dismissing is allowed.
             */}
            <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={onClose}
                disabled={!onClose}
                className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[6px] animate-[tevi-chart-fade_240ms_ease-out_both] motion-reduce:animate-none"
            />
            <div className="relative flex w-full max-w-[390px] flex-col items-center gap-3">
                {chip && (
                    <span
                        className={cn(
                            'type-caption-label-strong flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-white',
                            'bg-[rgba(20,16,30,0.72)] ring-1 ring-inset ring-white/15 backdrop-blur-md',
                            POP,
                            '[animation-delay:120ms]',
                        )}
                    >
                        <Icon name={chip.icon} size={16} className="flex-none text-white/80" />
                        <span className="truncate">{chip.text}</span>
                    </span>
                )}
                <div className={cn('relative w-full', RISE, '[animation-delay:60ms]')}>
                    {signIn ? (
                        <EventSignInPanel event={event} />
                    ) : (
                        <EventWatchPanel
                            event={event}
                            surface="studio"
                            lockedMidStream={lockedMidStream}
                        />
                    )}
                    {onClose && (
                        <DialogCloseButton
                            onClose={onClose}
                            data-testid="event-exclusive-paywall-close"
                            className="absolute end-2 top-2 z-20"
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * **The preview's clock** — a glass chip on the stage: the Exclusive mark, the word *Preview*, and
 * the seconds left inside a ring that drains as they go.
 *
 * The ring is one SVG circle whose dash offset moves a second at a time on a 1s linear transition,
 * so it drains smoothly between ticks rather than jumping. The last three seconds turn amber and
 * breathe: the sample is about to stop, and the reader should not be surprised when it does.
 */
export function EventPreviewCountdown({
    secondsLeft,
    totalSeconds,
    onUnlock,
    signIn = false,
}: {
    secondsLeft: number
    /** The whole look — `PREVIEW_SECONDS`. */
    totalSeconds: number
    /**
     * Buy without waiting for the clock — the preview is the moment the reader is most convinced,
     * so the way in rides on the countdown itself rather than only behind chat and gifts.
     */
    onUnlock?: () => void
    /** A guest: the button says *Sign in*, since that is what it leads to. */
    signIn?: boolean
}) {
    const { t } = useTranslation()
    const r = 9
    const circumference = 2 * Math.PI * r
    const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0
    const urgent = secondsLeft <= 3

    return (
        <div
            data-testid="event-preview-countdown"
            role="timer"
            aria-live="off"
            className={cn(
                'flex h-9 items-center gap-2 rounded-full ps-1.5 pe-3 text-white',
                'bg-[rgba(20,16,30,0.72)] shadow-[0_6px_18px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/15 backdrop-blur-md',
                RISE,
            )}
        >
            <span className="type-caption-label-strong flex h-6 items-center gap-1 rounded-full bg-[linear-gradient(135deg,#FF9900,#FFC700_55%,#FF6B00)] ps-1.5 pe-2">
                <Icon name="crown" weight="filled" size={16} className="size-3" />
                {t('event_exclusive_badge')}
            </span>
            <span className="type-caption-label text-white/85">{t('event_exclusive_preview')}</span>
            <span className={cn('relative grid size-6 place-items-center', urgent && LIVE_BREATH)}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
                    <circle
                        cx="12"
                        cy="12"
                        r={r}
                        fill="none"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="2.5"
                    />
                    <circle
                        cx="12"
                        cy="12"
                        r={r}
                        fill="none"
                        stroke={urgent ? '#FFC700' : '#FFFFFF'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - progress)}
                        className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear motion-reduce:transition-none"
                    />
                </svg>
                <span
                    className={cn(
                        'type-micro-overline relative tabular-nums',
                        urgent ? 'text-[#FFC700]' : 'text-white',
                    )}
                >
                    {secondsLeft}
                </span>
            </span>
            {onUnlock && (
                <button
                    type="button"
                    data-testid="event-preview-unlock"
                    onClick={onUnlock}
                    className="type-caption-label-strong -me-1.5 ms-1 flex h-7 items-center gap-1 rounded-full bg-[#501BC0] px-3 text-white transition-colors hover:bg-[#6B2FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                    <Icon name="lock-simple" weight="filled" size={16} className="size-3.5" />
                    {signIn ? t('auth_sign_in') : t('event_exclusive_unlock')}
                </button>
            )}
        </div>
    )
}
