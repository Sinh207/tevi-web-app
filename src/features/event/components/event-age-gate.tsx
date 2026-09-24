'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'

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
}: {
    onConfirm: () => void
    slug: string | null
}) {
    const { t } = useTranslation()

    return (
        <section
            data-testid="event-age-gate"
            className={cn(
                'flex min-w-0 flex-col items-center gap-4 text-center',
                EVENT_CARD,
                EVENT_PADDING,
                'py-10 md:py-12',
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
            <span className="flex size-14 flex-none items-center justify-center rounded-(--radius-fill) bg-(--accents-nsfw) text-(--white) ring-8 ring-[color-mix(in_srgb,var(--accents-nsfw)_16%,transparent)]">
                <Icon name="nsfw" size={32} title={t('event_age_gate_title')} />
            </span>

            <div className="flex min-w-0 max-w-[340px] flex-col gap-1">
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
            <div className="flex w-full min-w-0 max-w-[340px] flex-col gap-2">
                <Button
                    data-testid="event-age-confirm"
                    variant="accent"
                    size="large"
                    fullWidth
                    onClick={onConfirm}
                >
                    {t('event_age_gate_confirm')}
                </Button>
                <Button
                    data-testid="event-age-decline"
                    variant="ghost"
                    size="large"
                    fullWidth
                    render={<Link href={slug ? `/@${encodeURIComponent(slug)}` : '/'} />}
                >
                    {t('event_age_gate_decline')}
                </Button>
            </div>
        </section>
    )
}
