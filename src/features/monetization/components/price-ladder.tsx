'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { MEMBERSHIP_PRICE_LADDER } from '../lib/membership-tier'

/** The thumb's diameter, in px — `size-5` below, and the inset every stop is placed against. */
const THUMB = 20

/**
 * The monthly price control — five stops on a track, each labelled with its dollar figure over its
 * Star equivalent.
 *
 * ## A **native `input[type=range]`**, where legacy uses MUI's `Slider` and this file once used radios
 *
 * The first cut here was a radio group, on the reasoning that five named options is what a radio
 * group is for and that a slider claims a continuous range the product does not have. That is a fair
 * argument about controls and the wrong call about *this* screen: the comps draw a slider, legacy
 * ships one, and the shape of the control is the design's to decide.
 *
 * What is not negotiable is that it stays reachable, and a native range input is how that is free
 * rather than rebuilt:
 *
 * - arrow keys, Home/End and the whole `role="slider"` contract come from the browser;
 * - the value is a real form value, so nothing has to be mirrored into ARIA and kept in sync;
 * - **`aria-valuetext`** is the one thing that has to be said out loud: without it a screen reader
 *   announces "2 of 4", which is the index rather than the price. With it the reader hears the
 *   dollar figure and the Star count, which is what the two label lines show.
 *
 * The alternative — a styled `div` with `role="slider"` — is the version where all of that is
 * hand-written and one of the five keys is eventually missed.
 *
 * ## The paint is legacy's, in tokens
 *
 * Legacy hard-codes a `#0061FF` fill on a `#BFBFBF` rail with 2×8 marks and a 20px white thumb under
 * `0 2px 10px rgba(0,0,0,0.1)`. `#0061FF` **is** `--accents-indigo-active`, so the fill and the
 * active marks take that token rather than the hex; the rail is `--separator-strong` and the thumb is
 * `--background-surface` under the DS's own `shadow-sm`, so all three flip with the theme where
 * legacy's three greys do not.
 *
 * ⚠ **The thumb needs both vendor pseudo-elements.** `::-webkit-slider-thumb` and
 * `::-moz-range-thumb` cannot be combined in one selector — a browser that does not recognise one
 * half drops the whole rule — so they are written twice. Missing the Firefox half leaves a default
 * thumb that looks nothing like the design and only shows up in a browser nobody screenshots.
 *
 * ## RTL
 *
 * The labels are placed with the logical `start`, and the track is a native input, which mirrors
 * itself under `dir="rtl"`. The fill is drawn with a gradient whose direction follows the same
 * `to right` / `to left` flip, because a gradient has no logical form.
 */
export function PriceLadder({
    value,
    onChange,
    label,
    className,
}: {
    /** Index into `MEMBERSHIP_PRICE_LADDER`, or `null` when nothing is chosen yet. */
    value: number | null
    onChange: (index: number) => void
    /** Names the control for a screen reader — the section's own heading. */
    label: string
    className?: string
}) {
    const { currentLanguage } = useTranslation()

    const max = MEMBERSHIP_PRICE_LADDER.length - 1

    /**
     * Where stop `i` actually sits, as a CSS length.
     *
     * ⚠ **Not `i / max` as a percentage.** A native range's thumb travels from `half a thumb` to
     * `width − half a thumb`, not from `0` to `width` — the browser insets it so the thumb never
     * overhangs the track. Labels and marks laid out across the full width therefore drift from the
     * thumb by up to 10px, worst in the middle, and at the first stop the mark peeked out to the left
     * of the thumb as a blue sliver. Measured at 390 with legacy's 30px inset, that is a tenth of the
     * spacing between two stops.
     *
     * So everything is placed along the **thumb's** travel instead. `THUMB` is the one number the
     * three of them share; changing the thumb size without changing it here is what puts the drift
     * back.
     */
    const stopAt = (i: number) => `calc(${THUMB / 2}px + ${i / max} * (100% - ${THUMB}px))`
    /** `null` sits the thumb at the first stop without claiming that rung is chosen. */
    const index = value ?? 0
    const rung = MEMBERSHIP_PRICE_LADDER[index]
    const fill = stopAt(index)

    return (
        <div className={cn('flex flex-col', className)}>
            {/*
             * Legacy's arrangement: the labels are their own row above the track, each centred on its
             * stop. Absolute rather than a flex row because the first and last must sit *on* the ends
             * of the track, which evenly-spaced flex items do not.
             */}
            <div className="relative h-11">
                {MEMBERSHIP_PRICE_LADDER.map((stop, i) => (
                    <div
                        key={stop.usd}
                        style={{ insetInlineStart: stopAt(i) }}
                        className="-translate-x-1/2 absolute flex flex-col items-center rtl:translate-x-1/2"
                    >
                        {/*
                         * Every label the same ink, which is legacy's (`PriceLabel` paints `#141414`
                         * whatever is selected). Highlighting the current stop was added here and
                         * taken back out: the thumb already says where the value is, and a second
                         * indicator for one fact is the kind of embellishment the comps do not have.
                         */}
                        <span className="type-dense-strong text-(--text-title)">${stop.usd}</span>
                        <span className="flex items-center gap-0.5 whitespace-nowrap">
                            <span className="type-caption-meta text-(--text-placeholder)">
                                {stop.stars.toLocaleString(currentLanguage)}
                            </span>
                            <StarMark size={12} />
                        </span>
                    </div>
                ))}
            </div>

            <div className="relative flex h-5 items-center">
                {/* The four inner marks. The ends are covered by the thumb and the track's own caps,
                    which is why legacy draws them the same way — a mark under the thumb is invisible
                    and a mark at the far end reads as a stray tick. */}
                {MEMBERSHIP_PRICE_LADDER.map((stop, i) => (
                    <span
                        key={stop.usd}
                        aria-hidden
                        style={{ insetInlineStart: stopAt(i) }}
                        className={cn(
                            '-translate-x-1/2 pointer-events-none absolute h-2 w-0.5 rounded-full rtl:translate-x-1/2',
                            i <= index ? 'bg-(--accents-indigo-active)' : 'bg-(--separator-strong)',
                        )}
                    />
                ))}

                <input
                    type="range"
                    data-testid="monetization-membership-price"
                    min={0}
                    max={max}
                    step={1}
                    value={index}
                    onChange={event => onChange(Number(event.target.value))}
                    aria-label={label}
                    /* The price, not the index — see the note above. */
                    aria-valuetext={`$${rung.usd} · ${rung.stars.toLocaleString(currentLanguage)}`}
                    style={{
                        /*
                         * A gradient rather than two elements: the filled half has to end exactly
                         * where the thumb sits, and one background can say that in one number — on
                         * the same inset travel as the stops above, since a `${percent}%` stop would
                         * run past the thumb at the far end.
                         *
                         * ⚠ **The direction is a variable this file defines**, in the class list
                         * below. It read `var(--tw-gradient-dir, right)` — a name that exists
                         * nowhere in this repo and is not a Tailwind built-in, so it silently
                         * resolved to its `right` fallback at every width and in every direction.
                         * Under `dir="rtl"` the browser mirrors the range input and `insetInlineStart`
                         * mirrors the stop marks, while a hard `to right` fill does not: the filled
                         * segment ends up on the wrong side of the thumb. A missing custom property
                         * cannot warn — it just takes the fallback.
                         */
                        backgroundImage: `linear-gradient(to var(--ladder-fill-dir), var(--accents-indigo-active) ${fill}, var(--separator-strong) ${fill})`,
                    }}
                    className={cn(
                        'relative h-0.5 w-full cursor-pointer appearance-none rounded-full bg-transparent',
                        /*
                         * The gradient's direction, mirrored by the same `rtl:` variant `Toggle`
                         * uses for its knob travel. Declared here rather than in `globals.css`
                         * because it belongs to this one background; declared as a **pair**, because
                         * a variable with only an RTL arm would fall back to `initial` in LTR and
                         * paint no gradient at all.
                         */
                        '[--ladder-fill-dir:right] rtl:[--ladder-fill-dir:left]',
                        'outline-none focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-(--focus-ring)',
                        // ⚠ Written twice on purpose — see the note above.
                        '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none',
                        '[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full',
                        '[&::-webkit-slider-thumb]:bg-(--background-surface) [&::-webkit-slider-thumb]:shadow-sm',
                        '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-pointer',
                        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0',
                        '[&::-moz-range-thumb]:bg-(--background-surface) [&::-moz-range-thumb]:shadow-sm',
                    )}
                />
            </div>
        </div>
    )
}
