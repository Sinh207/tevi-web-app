'use client'

import { POP } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon, type IconGlyphProps } from '@shared/ui/icon'
import type { CheckoutState } from '../lib/checkout-machine'

/**
 * The mark a finished — or nearly finished — payment wears, and the five states it can be in.
 *
 * Extracted from `checkout-status-dialog.tsx` when a **second** surface needed it: the app's webview
 * checkout (`/app/[channelSlug]/membership/[packageId]`) shows its outcome in place rather than in a
 * modal, because a webview has no room for one. Two surfaces drawing the same verdict from two copies
 * of this table is how a success mark comes to animate in one place and not the other, and how `slow`
 * comes to look like a failure in exactly one of them.
 *
 * So the *mark* lives here and the *layout* stays with each surface. That split is deliberate: the
 * dialog centres it under a title with a footer of buttons, the webview screen fills a phone with it
 * and pins its action to the bottom. Neither is the other one wearing different padding.
 */

/**
 * The five states a checkout *outcome* can be in.
 *
 * Narrower than `CheckoutState` on purpose: `idle`, `creating`, `card`, `confirming`… are things the
 * surface that started the order is responsible for drawing. These five are the ones that have a mark
 * and a sentence, and they are the same five wherever the payment is happening — the website's dialog
 * and the app's webview screen must not describe one payment two ways.
 */
export type CheckoutStatusKind = 'confirming' | 'settling' | 'slow' | 'succeeded' | 'failed'

export function checkoutStatusKind(state: CheckoutState): CheckoutStatusKind | null {
    switch (state.kind) {
        case 'confirming':
        case 'settling':
        case 'slow':
        case 'succeeded':
        case 'failed':
            return state.kind
        default:
            return null
    }
}

/**
 * The real artwork — `public/illustrations/payment/`, built by `scripts/build-payment-art.mjs` from the
 * three GIFs the design team published.
 *
 * **There is no tile.** The build keys the sources' white background out to real transparency, so the
 * marks sit straight on the dialog in either theme. They were briefly shown on a white plate, which is
 * what art with no alpha channel forces, and in dark mode it read as a sticker.
 *
 * `size` differs per state because the art was **normalised on the mark, not on the frame**: all three
 * marks read at the DS's 60px, and `size` is the canvas that carries them — the success mark brings a
 * confetti burst that reaches 2.4× its badge, the other two barely leave their own silhouette. The
 * canvas is transparent, so a wider one costs nothing on screen; it just must not be clipped, which is
 * why the slot below sets no `overflow`.
 *
 * - `succeeded` / `failed` — **animated WebP that plays once.** A mark that redraws itself every few
 *   seconds under a "Payment successful" heading is a fidget rather than a state; the sources loop
 *   ~63 777 times.
 * - `confirming` / `settling` — **one turn of the loop**, repeating. The source is 7.08s of frames that
 *   are all unique, but they are a rotation: the build measures the period and keeps a single turn.
 * - `slow` — **no art, and deliberately so.** The set has success, failure and *in progress*; `slow` is
 *   none of those. It means the money has left, the payment has not landed, and nobody is watching any
 *   more — so it keeps the amber clock tile, which says that and does not animate.
 *
 * Every entry has a **still** for `prefers-reduced-motion`: the finished mark for the two verdicts, one
 * frame of the ring for the loop. An animation that may not animate should hold its conclusion.
 *
 * `unoptimized` is not a shortcut: `next/image` runs an animated file through the optimiser and gets
 * the **first frame**, so the tick would arrive already drawn and the arrows would never turn.
 */
const ART = {
    succeeded: { motion: 'success.webp', still: 'success-still.webp', size: 144, pop: true },
    failed: { motion: 'failed.webp', still: 'failed-still.webp', size: 78, pop: true },
    working: { motion: 'progress.webp', still: 'progress-still.webp', size: 78, pop: false },
} as const

const ART_BASE = '/illustrations/payment'

/**
 * `slow`'s tile: a **solid fill with a white glyph**, the app's own tile idiom
 * (`features/navigation/lib/menu-tiles.ts`). `filled` rather than the outline weight because a white
 * glyph on a saturated fill needs the mass — at 32px the outline reads as a thin scratch.
 *
 * **warning**, not neutral: it is the one verdict that is not one. The money has left, the payment has
 * not landed yet, and nobody is watching it any more. Grey said "nothing to see here", which is the
 * opposite of what that state means.
 *
 * ⚠ `name` and `weight` are **adjacent, literal, and in that order**, and `weight` lives here rather
 * than on the tag below. `scripts/build-icon-sprite.mjs` subsets the sprite by scanning source: a
 * computed `name={…}` is invisible to its pass 1, and pass 2 keeps only the *bare* id — so
 * `<Icon name={SLOW_GLYPH.name} weight="filled" />` shipped a `<use href="#clock--filled">` pointing at
 * a symbol that was not in the file: **an empty amber tile**, found by looking at a screenshot, not by
 * any test. Pass 3 exists for exactly this shape (`{ name: 'x', weight: 'y' }` spread into `<Icon />`)
 * and its regex needs the two keys touching, which is why `tile` comes last.
 */
const SLOW_GLYPH: IconGlyphProps & { tile: string } = {
    name: 'clock',
    weight: 'filled',
    tile: 'bg-(--accents-warning-active)',
}

/**
 * The illustration slot: 96px of fixed height, whatever the state.
 *
 * Fixed because the art must not move what is around it — three states share this header and two of
 * them arrive while the reader is looking at it. 96 is the DS's 60px mark plus room to breathe, and
 * the success canvas (144px of mostly-transparent confetti) is allowed to overflow it rather than
 * force every other state to reserve that height.
 */
export function CheckoutStatusTile({ kind }: { kind: CheckoutStatusKind }) {
    const art =
        kind === 'confirming' || kind === 'settling'
            ? ART.working
            : kind === 'slow'
              ? null
              : ART[kind]

    /*
     * `slow` is the one state with no artwork — see `ART`. It keeps a solid amber tile with a white
     * glyph, which is what the three states looked like before the art arrived.
     */
    if (!art) {
        return (
            <span className="flex h-24 items-center justify-center">
                <span
                    className={cn(
                        /*
                         * A 60px **disc**, not the DS's rounded-square tile: it stands in a row with
                         * three circular marks, and a squared tile among them reads as a different
                         * design language rather than a fifth state of the same one. Same construction
                         * as the art it sits beside — a saturated disc with a white symbol in it.
                         */
                        'inline-flex size-[60px] items-center justify-center rounded-full',
                        SLOW_GLYPH.tile,
                    )}
                >
                    <Icon {...iconProps(SLOW_GLYPH)} size={32} className="text-(--white)" />
                </span>
            </span>
        )
    }

    const src = `${ART_BASE}/${art.motion}`
    const still = `${ART_BASE}/${art.still}`
    /*
     * A verdict **pops** on arrival; the working states do not. `POP` is the app's "something arrived"
     * (`shared/lib/motion.ts`), and nothing has arrived while a payment is still being confirmed —
     * popping on every step would be three arrivals for one purchase.
     */
    const className = cn('block max-w-none', art.pop && POP)

    return (
        <span className="flex h-24 items-center justify-center">
            {/*
             * `<picture>`, not two images with one hidden by CSS.
             *
             * A hidden `<img>` is still downloaded, so the CSS version made a reader who asked for
             * *less* motion download the animation anyway — 64 KB of rotating arrows to display none of
             * them. `media` lets the browser pick one before it fetches anything, and the choice is
             * still made by the media query rather than by JS, so the server and client renders agree.
             *
             * Plain `<picture>`/`<img>` rather than `next/image`: the optimiser reduces an animated file
             * to its **first frame** (the tick would arrive already drawn, the arrows would never turn),
             * so these were already `unoptimized` — there is nothing left for it to do, and it cannot
             * express a `<source>`.
             */}
            <picture>
                <source media="(prefers-reduced-motion: reduce)" srcSet={still} />
                <img
                    src={src}
                    alt=""
                    aria-hidden
                    width={art.size}
                    height={art.size}
                    className={className}
                />
            </picture>
        </span>
    )
}

/**
 * The glyph half of the table entry, without the tile class.
 *
 * A named helper rather than an inline rest-spread because `IconGlyphProps` is a **union**: destructuring
 * `tile` off with `{ tile, ...rest }` at the call site widens `rest` to the union's common shape and
 * throws away the name/weight pairing the whole type exists to enforce.
 */
function iconProps({ tile: _tile, ...glyph }: IconGlyphProps & { tile: string }): IconGlyphProps {
    return glyph
}
