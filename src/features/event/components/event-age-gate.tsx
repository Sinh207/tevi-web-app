'use client'

import { Sheen } from '@shared/components/sheen'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH, PIN_OUT, PIN_OUT_MS, POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EVENT_STUDIO_NOTICE } from '../lib/studio'

/**
 * **Age-Restricted Content** — the wall over an event the creator marked 18+.
 *
 * Legacy's copy and its two controls, verbatim: *No, take me back* and *Yes, I'm over 18*.
 *
 * ## In front of the player, and nowhere else
 *
 * Legacy raises this inside its live view only (`LiveView`, rendered for `matchUpMd && isLive`), so
 * it is drawn in one place here too: centred in `EventStudioShell`, the studio's frame with nothing
 * running in it. Live details and the phone's *not available on mobile web* notice never ask —
 * there it was a question whose answer unlocked nothing. This port once gated the whole page;
 * `docs/EVENT.md` §2a records why that was undone.
 *
 * ## A panel, not a dialog
 *
 * The same reasoning `NsfwGatePanel` sets out: a modal is for a question that interrupts what
 * somebody is doing, and this *is* the state of the page they asked for. Drawn as a dialog it also
 * needs a page underneath to be faked, and the only way out becomes a Close button that leaves the
 * site.
 *
 * ## *No, take me back* goes back, and to the space only when there is no back
 *
 * The same rule as `EventStudioBackButton`. It was a link to the space, which *pushed* the space on
 * top of this page: the space's own back then returned here, to the same question — a loop. A plain
 * `router.back()` is not the answer either: this page is often the **first** of a session (a shared
 * link, a QR on a poster), where `history.length` is 1 and back leaves the site. So: back when there
 * is history, the space when there is none. Legacy sends them to `/`, a step further from where they
 * were going.
 */
export function EventAgeGate({
    onConfirm,
    /** Where *take me back* goes when there is no history — the host's space; `null`, the home feed. */
    slug,
}: {
    onConfirm: () => void
    slug: string | null
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const mayAnimate = useMayAnimate()
    const [leaving, setLeaving] = useState(false)

    useEffect(() => {
        if (!leaving) return
        const timer = setTimeout(onConfirm, PIN_OUT_MS)
        return () => clearTimeout(timer)
    }, [leaving, onConfirm])

    // Under reduced motion the exit would be a 200ms pause with nothing moving — confirm at once.
    const confirm = () => (mayAnimate ? setLeaving(true) : onConfirm())

    return (
        <section
            data-testid="event-age-gate"
            className={cn(
                'flex min-w-0 flex-col items-center gap-5 text-center',
                EVENT_STUDIO_NOTICE,
                /*
                 * The studio's notice plate, arriving on `RISE` with the 18+ mark popping in after
                 * it, and **leaving** on confirm (`PIN_OUT`) before the studio takes its place, so
                 * the swap is a hand-over rather than a cut. The room's own material — dark glass,
                 * lit edge, deep drop — as the ended card has it. Inks are stated, not inherited:
                 * `--text-subtitle` is resolved at `:root`, so a theme scope cannot reach it on the
                 * glass.
                 */
                'bg-[rgba(20,16,30,0.72)] backdrop-blur-2xl ring-1 ring-inset ring-white/10',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.45)]',
                '[&_h1]:text-white [&_p]:text-white/70',
                leaving ? PIN_OUT : RISE,
            )}
        >
            {/*
             * The NSFW mark, and it is the DS's own token for this: `--accents-nsfw`, solid, with
             * the glyph knocked out in white and a wide halo `color-mix`ed from the same hue.
             * `nsfw-gate-panel.tsx` carries the full measurement — white on `#f43fca` is 3.3:1 and
             * clears WCAG's 3:1 for a graphic, while pink ink on a tint of itself does not at any
             * mix ratio that still reads as a tint. Reproduced rather than imported because
             * `features/event` may not reach into another feature's internals, and the treatment is
             * six utility classes; the reasoning lives in one place and is linked from here.
             */}
            <span
                className={cn(
                    'relative flex size-14 flex-none items-center justify-center rounded-(--radius-fill) bg-(--accents-nsfw) text-(--white) ring-8 ring-[color-mix(in_srgb,var(--accents-nsfw)_16%,transparent)]',
                    POP,
                    '[animation-delay:120ms]',
                )}
            >
                {/*
                 * A pink halo breathing behind the mark — the one colour on the card, so the eye
                 * lands on what is being asked before it reads the words.
                 */}
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accents-nsfw)_55%,transparent),transparent)] blur-lg',
                        LIVE_BREATH,
                    )}
                />
                <Icon name="nsfw" size={32} title={t('event_age_gate_title')} />
            </span>

            <div
                className={cn(
                    'flex min-w-0 max-w-[340px] flex-col gap-1.5',
                    !leaving && cn(RISE, '[animation-delay:160ms]'),
                )}
            >
                <h1 className="type-title-t2-semibold text-balance text-(--text-title)">
                    {t('event_age_gate_title')}
                </h1>
                <p className="type-dense-default text-pretty text-(--text-subtitle)">
                    {t('event_age_gate_body')}
                </p>
            </div>

            {/*
             * Confirm first in the DOM and visually. Legacy puts *No, take me back* on the left,
             * which is the same order in a row; stacked, the affirmative on top is what every other
             * paired action in this app does, and the destructive-looking one is not the default
             * focus target.
             */}
            <div
                className={cn(
                    'flex w-full min-w-0 max-w-[340px] flex-col gap-2',
                    !leaving && cn(RISE, '[animation-delay:260ms]'),
                )}
            >
                <Button
                    data-testid="event-age-confirm"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={leaving}
                    onClick={confirm}
                    className="relative overflow-hidden"
                >
                    {/* A slow sheen across the answer that lets the reader in. */}
                    <Sheen />
                    <span className="relative">{t('event_age_gate_confirm')}</span>
                </Button>
                <Button
                    data-testid="event-age-decline"
                    variant="ghost"
                    size="large"
                    fullWidth
                    onClick={() => {
                        if (window.history.length > 1) router.back()
                        else router.push(slug ? `/@${encodeURIComponent(slug)}` : '/')
                    }}
                    // Quieter than the confirm on the glass — it is the way out, not the ask.
                    className="text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                    {t('event_age_gate_decline')}
                </Button>
            </div>
        </section>
    )
}
