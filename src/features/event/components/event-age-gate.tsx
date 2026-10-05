'use client'

import { Sheen } from '@shared/components/sheen'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH, PIN_OUT, PIN_OUT_MS, POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'
import { EVENT_STUDIO_NOTICE } from '../lib/studio'

/**
 * **Age-Restricted Content** — the wall over an event the creator marked 18+.
 *
 * Legacy's copy and its two controls, verbatim: *No, take me back* and *Yes, I'm over 18*.
 *
 * ## It covers the **whole page**, and legacy's covers less
 *
 * Legacy raises this inside its live view only, which means its own details page shows the banner,
 * the title and the description of an 18+ broadcast with no question asked — and on a phone, or for
 * a scheduled event, the details page is the *only* thing it ever shows. The material being gated is
 * the creator's artwork and their own description of the stream, so gating the player and not the
 * poster protects nothing.
 *
 * This app already made the same call one surface over: `NsfwGatePanel` replaces a space's content
 * while leaving its **identity** visible, where legacy drew a dialog over a faked page. Here there is
 * no identity worth keeping — an event has no name a reader would recognise independently of its
 * art — so the wall is the page. `docs/EVENT.md` §2 records the divergence.
 *
 * ## A panel, not a dialog
 *
 * The same reasoning `NsfwGatePanel` sets out: a modal is for a question that interrupts what
 * somebody is doing, and this *is* the state of the page they asked for. Drawn as a dialog it also
 * needs a page underneath to be faked, and the only way out becomes a Close button that leaves the
 * site.
 *
 * ## *No, take me back* is a link to the space, not `router.back()`
 *
 * Legacy sends them to `/`. Back is worse than either: this page is frequently the **first** page of
 * a session (a shared link, a QR on a poster), so `history.length` is 1 and back leaves the site
 * entirely. The space is the nearest thing the reader was actually looking for.
 */
export function EventAgeGate({
    onConfirm,
    /** Where *take me back* goes — the host's space. `null` falls back to the home feed. */
    slug,
    surface = 'card',
}: {
    onConfirm: () => void
    slug: string | null
    /**
     * `studio` — the card centred in `EventStudioShell`, on the blurred ground: the studio's notice
     * plate, arriving on `RISE` with the 18+ mark popping in after it, and **leaving** on confirm
     * (`PIN_OUT`) before the studio takes its place, so the swap is a hand-over rather than a cut.
     * `card` — the details page's block, still.
     */
    surface?: 'card' | 'studio'
}) {
    const { t } = useTranslation()
    const mayAnimate = useMayAnimate()
    const isStudio = surface === 'studio'
    const [leaving, setLeaving] = useState(false)

    useEffect(() => {
        if (!leaving) return
        const timer = setTimeout(onConfirm, PIN_OUT_MS)
        return () => clearTimeout(timer)
    }, [leaving, onConfirm])

    // Under reduced motion the exit would be a 200ms pause with nothing moving — confirm at once.
    const confirm = () => (isStudio && mayAnimate ? setLeaving(true) : onConfirm())

    return (
        <section
            data-testid="event-age-gate"
            className={cn(
                'flex min-w-0 flex-col items-center gap-4 text-center',
                isStudio
                    ? cn(
                          EVENT_STUDIO_NOTICE,
                          /*
                           * The room's own material — dark glass, lit edge, deep drop — as the
                           * ended card has it. Inks are stated, not inherited: `--text-subtitle`
                           * is resolved at `:root`, so a theme scope cannot reach it on the glass.
                           */
                          'gap-5 bg-[rgba(20,16,30,0.72)] backdrop-blur-2xl ring-1 ring-inset ring-white/10',
                          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.45)]',
                          '[&_h1]:text-white [&_p]:text-white/70',
                          leaving ? PIN_OUT : RISE,
                      )
                    : cn(EVENT_CARD, EVENT_PADDING, 'py-10 md:py-12'),
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
                    isStudio && cn(POP, '[animation-delay:120ms]'),
                )}
            >
                {/*
                 * On the studio, a pink halo breathing behind the mark — the one colour on the
                 * card, so the eye lands on what is being asked before it reads the words.
                 */}
                {isStudio && (
                    <span
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accents-nsfw)_55%,transparent),transparent)] blur-lg',
                            LIVE_BREATH,
                        )}
                    />
                )}
                <Icon name="nsfw" size={32} title={t('event_age_gate_title')} />
            </span>

            <div
                className={cn(
                    'flex min-w-0 max-w-[340px] flex-col gap-1.5',
                    isStudio && !leaving && cn(RISE, '[animation-delay:160ms]'),
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
                    isStudio && !leaving && cn(RISE, '[animation-delay:260ms]'),
                )}
            >
                <Button
                    data-testid="event-age-confirm"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={leaving}
                    onClick={confirm}
                    className={cn(isStudio && 'relative overflow-hidden')}
                >
                    {/* A slow sheen across the answer that lets the reader in. */}
                    {isStudio && <Sheen />}
                    <span className="relative">{t('event_age_gate_confirm')}</span>
                </Button>
                <Button
                    data-testid="event-age-decline"
                    variant="ghost"
                    size="large"
                    fullWidth
                    render={<Link href={slug ? `/@${encodeURIComponent(slug)}` : '/'} />}
                    // Quieter than the confirm on the glass — it is the way out, not the ask.
                    className={cn(
                        isStudio && 'text-white/70 hover:bg-white/[0.06] hover:text-white',
                    )}
                >
                    {t('event_age_gate_decline')}
                </Button>
            </div>
        </section>
    )
}
