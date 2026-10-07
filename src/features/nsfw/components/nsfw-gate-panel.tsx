'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RIPPLE, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ListLeadingTile } from '@shared/ui/list'
import { Toggle } from '@shared/ui/toggle'
import { type CSSProperties, useEffect } from 'react'
import { useNsfwGate } from '../hooks/use-nsfw-gate'

/**
 * "This space might include sensitive content." — the age gate, **in the page** rather than over it.
 *
 * ## Why it is not a dialog
 *
 * It was one, and a dialog says the wrong thing here. A modal is for a question that interrupts what
 * somebody is doing; this is the *state of the page they asked for*. Drawn as a dialog it also cost
 * three things at once: the space's identity was hidden behind a scrim (the visitor could not tell
 * they had reached the right URL), the page underneath had to be faked — a blurred band and a
 * `220px` spacer standing in for a header nobody could see — and the only way out was a Close button
 * that left the site.
 *
 * As a panel, the space renders its **identity**: name, handle, stats, and the description that
 * says what it is. What is withheld is the content — the tabs are replaced by this — along with the
 * art and the creator's destinations: the cover and avatar are blurred and the links are not drawn
 * at all (the caller's call; on a space it is `ChannelHeader`'s `blurred`). The reader can see
 * whose space it is and decide.
 *
 * ## Two faces, and they are mutually exclusive
 *
 * `useNsfwGate` owns why (both of legacy's conditions have to hold). With filtering **on**, the only
 * offer worth making is the age confirmation; with it already **off**, the setting is not the
 * obstacle and the switch is what is left. A caller decides *where* this appears and what to do when
 * the gate opens — nothing else.
 *
 * ## No dismissal
 *
 * There is nothing to close. The two legitimate ways past are the two controls this draws, and a
 * reader who wants neither leaves the way they arrived — with the space's own navigation, not with a
 * button we put in front of them. That is also why the old dialog's `onDismiss`
 * (`router.back()`, or `/` when the referrer was not ours) is gone: it existed to undo a modal.
 */
export function NsfwGatePanel({
    slug,
    onAllowed,
    className,
}: {
    /** The space being asked about — the key consent is filed under. */
    slug: string
    /** Called once the viewer has satisfied the gate, by either route. */
    onAllowed: () => void
    className?: string
}) {
    const { t } = useTranslation()
    const { isAllowed, showsSensitive, confirmAge, disableFiltering, isSaving } = useNsfwGate(slug)

    /*
     * The hook is the source of truth for *whether* the gate is satisfied; the caller is told and
     * decides what to reveal. Reporting it from here keeps both faces — and the stored answer read
     * back on mount — on one path out, so the caller holds a boolean and no consent logic.
     *
     * In an effect, not during render: `onAllowed` sets state in the parent, and doing that while
     * rendering a child is the "cannot update a component while rendering a different component"
     * warning, plus a render React has to throw away.
     */
    useEffect(() => {
        if (isAllowed) onAllowed()
    }, [isAllowed, onAllowed])

    return (
        <section
            /*
             * `aria-live` is deliberately absent: this is not an update to announce, it is the page.
             * The heading below is a real heading, so a screen reader meets it in document order.
             */
            className={cn(
                'relative flex min-w-0 flex-col items-center gap-4 overflow-clip py-10 text-center',
                className,
            )}
        >
            {/*
             * ## Motion — the same entrance the protected-space wall makes
             *
             * `channel-protected-notice.tsx` is the other "this space is behind something" state,
             * and the two now move alike: a soft wash of the hue around the mark, the mark popping
             * in with two rings pulsing out of it, then the sentence and the control rising in at
             * 160 / 240ms. Every value is an existing one from `shared/lib/motion.ts` — no new
             * keyframe, so the gate arrives on the app's one "something arrived" curve.
             *
             * The wash is anchored to the **mark**, not to the section's top as the protected wall's
             * is: this panel grows to fill the column and centres its content, so a wash pinned to
             * the top lit an empty band above the mark. `overflow-clip`, not `overflow-hidden`: the
             * wash must not spill past the card's rounded corners, and `hidden` would make this a
             * scrollport.
             */}

            {/*
             * The mark: a solid **NSFW pink** disc with the glyph knocked out in white, ringed by a
             * wide halo of the same hue at low opacity.
             *
             * ## The hue is `--accents-nsfw`, and it is the DS's own answer to this exact question
             *
             * This was Warning gold, which is the token for "something may go wrong". Sensitive
             * content is not a fault — it is a category — and the DS ships one token for it,
             * `--accents-nsfw` (`#f43fca` light, `#ff5ed9` dark). It had **no call site in the app**
             * until here, which is why the gate reached for the nearest status colour instead. Pink
             * is also what the platform's own "18" mark reads as everywhere else it appears.
             *
             * Before that it was a pale tint holding a gold glyph, and the two were close enough in
             * luminance that the "18" stopped reading as a mark and started reading as a washed-out
             * decoration. Solid-on-white is how every tile in this app paints a status glyph
             * (`ListLeadingTile`: a filled tile, `--white` foreground) — this is that pattern at hero
             * size, not a new idea, so only the hue moved. **Not** pink ink on a pink tint, which is
             * the shape the request could also have taken: white on `#f43fca` is 3.3:1 and clears
             * WCAG's 3:1 for a graphic, while the pink glyph on a tint of itself lands at 2.8 at
             * every mix ratio that still reads as a tint.
             *
             * ## The halo is mixed, not a second token
             *
             * `--accents-nsfw` is a standalone hue — unlike `error`/`warning`/`success` it ships no
             * `-bg-*` companion — so the halo is `color-mix`ed from it rather than invented as a
             * literal. That also makes it correct in both themes for free: the token flips, the mix
             * follows, and compositing over `transparent` lets it sit on whichever surface is behind
             * it (the page ground on a phone, the card from `md`).
             *
             * The halo is a `ring`, not a second element: it takes no layout, so the disc stays 56
             * and the spacing above and below is the disc's, not the halo's.
             */}
            {/* `POP` on a wrapper whose box is the disc's 56px, so the scale moves nothing around
                it. The rings start at the halo's edge (`-inset-2` = `ring-8`) — from the disc's edge
                they spent most of their travel hidden under it — and are hidden under reduced
                motion rather than frozen half-way out. */}
            <span
                className={cn(
                    'relative grid flex-none place-items-center',
                    POP,
                    '[animation-delay:80ms]',
                )}
            >
                <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-28 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accents-nsfw)_14%,transparent),transparent)]"
                />
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -inset-2 rounded-(--radius-fill) border-2 border-[color-mix(in_srgb,var(--accents-nsfw)_45%,transparent)]',
                        RIPPLE,
                    )}
                />
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -inset-2 rounded-(--radius-fill) border-2 border-[color-mix(in_srgb,var(--accents-nsfw)_45%,transparent)]',
                        RIPPLE,
                        '[animation-delay:1200ms]',
                    )}
                />
                <span className="relative flex size-14 items-center justify-center rounded-(--radius-fill) bg-(--accents-nsfw) text-(--white) ring-8 ring-[color-mix(in_srgb,var(--accents-nsfw)_16%,transparent)]">
                    <Icon name="nsfw" size={32} title={t('channel_nsfw')} />
                </span>
            </span>

            {/* Capped at the same 340 as the controls below, so the sentence breaks over the
                button rather than running the full width of a 612px column above a short one. */}
            <div
                className={cn(
                    'relative flex min-w-0 max-w-[340px] flex-col gap-1',
                    RISE,
                    '[animation-delay:160ms]',
                )}
            >
                <h2 className="type-title-t2-semibold text-balance text-(--text-title)">
                    {t('channel_nsfw_gate_title')}
                </h2>
                <p className="type-dense-default text-pretty text-(--text-subtitle)">
                    {t('channel_nsfw_gate_body')}
                </p>
            </div>

            {/* Capped rather than full-width: a 612px column would otherwise draw a button as wide
                as the page for a one-line label. */}
            <div
                className={cn(
                    'relative flex w-full min-w-0 max-w-[340px] flex-col gap-2',
                    RISE,
                    '[animation-delay:240ms]',
                )}
            >
                {showsSensitive ? (
                    /*
                     * `accent` — the app's CTA, and the product's call.
                     *
                     * The argument for `primary` was that a purple "do it" under a question about
                     * somebody's age reads as persuasion. The argument that won is the one the rest
                     * of the app already makes: this is the screen's **single action**, the thing
                     * the reader came to press, and every other such button in Tevi is accent. A
                     * neutral press here made the one control on the page look like the quieter half
                     * of a pair that was not there. It was `secondary` before that — a pale outline,
                     * which was the same mistake with less ink.
                     *
                     * The **label is shorter than legacy's** — "I'm over 18", not "Yes, I'm over 18
                     * years old". A deliberate divergence from the spec, recorded here per the usual
                     * rule: legacy's sentence answers a question nobody asked in words, and at
                     * `size="large"` inside this 340px column it filled the button edge to edge in
                     * English and wrapped outright in `fil` and `ar`. The nine locales are cut to
                     * match, so no single one is the odd short one.
                     */
                    <Button
                        data-testid="nsfw-confirm-age"
                        variant="accent"
                        size="large"
                        fullWidth
                        onClick={confirmAge}
                    >
                        {t('channel_nsfw_gate_confirm')}
                    </Button>
                ) : (
                    /*
                     * A settings row, not a button: it reports a **preference**, and it is the same
                     * account-level control the Settings screen draws, met here at the moment it
                     * matters.
                     *
                     * A `div`, not a `<label>`, and that is this app's own idiom rather than a
                     * concession: `Toggle` is a `role="switch"` **button**, so a label has no form
                     * control to be for — it would announce nothing and associate with nothing. The
                     * switch carries its own name (`aria-label`), exactly as the two rows on the
                     * Privacy screen do. The cost is that only the switch is pressable, not the whole
                     * row; the DS's own settings rows accept the same.
                     */
                    <div className="flex w-full min-w-0 items-center gap-3 rounded-(--radius-lg) bg-(--background-segment) px-4 py-3 text-start">
                        {/*
                         * The **same** glyph and tile the Privacy & security screen puts on this
                         * setting (`privacy-security-screen.tsx`: `exclamation-diamond` filled on
                         * `TILE.error`). It is one switch writing one field, met in two places, and a
                         * reader who has seen it in Settings should recognise it here without
                         * reading the label again.
                         *
                         * `ListLeadingTile` rather than a hand-built square: it is the DS's own
                         * 32px tile with the 20px glyph inside, and it takes its two colours from
                         * CSS variables — which is exactly how the drawer's rows paint theirs.
                         */}
                        <ListLeadingTile
                            style={
                                {
                                    '--tevi-left-bar-tile': 'var(--accents-error-active)',
                                } as CSSProperties
                            }
                        >
                            <Icon name="exclamation-diamond" weight="filled" size={20} />
                        </ListLeadingTile>
                        <span className="type-dense-strong min-w-0 flex-1 text-(--text-title)">
                            {t('channel_nsfw_disable_filtering')}
                        </span>
                        <Toggle
                            data-testid="nsfw-filter-toggle"
                            checked={false}
                            disabled={isSaving}
                            onCheckedChange={disableFiltering}
                            aria-label={t('channel_nsfw_disable_filtering')}
                        />
                    </div>
                )}
            </div>
        </section>
    )
}
