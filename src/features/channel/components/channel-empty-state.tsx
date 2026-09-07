import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * The block every "there is nothing here" moment on this page uses — led by an illustration
 * where Brand has published one, and by a sprite glyph everywhere else.
 *
 * ## Why this is not a DS component
 *
 * **The design system ships no empty state and no empty-state art.** Checked: `Alert` is the
 * feedback component but it is a card with a status colour, not a centred illustration;
 * `.tevi-bottom-sheet__illustration` and `.tevi-dialog__illustration` are *slots*, not artwork; and
 * `banner`'s eight types are marketing (branded, campaign, countdown…), so using one to say "no
 * posts yet" would be a misuse of a component with a gradient and a CTA.
 *
 * ## `art` beats `icon`, and most states still have neither
 *
 * Legacy has real artwork for exactly **two** of this feature's states — "no blocked accounts"
 * and "no follow requests" — plus two hand-drawn inline SVGs on the channel walls. The two CDN
 * pieces are used (see `lib/illustrations.ts`); the hand-drawn pair is not, because pasting 177
 * lines of path data into this repo creates an un-versioned copy with no source.
 *
 * So the component takes either, and prefers `art`: a 32px glyph is the honest minimum for a
 * state nobody has drawn, not a design choice to keep once somebody has. States still on a
 * glyph are a standing request to Brand, and each becomes a two-line change here.
 *
 * Composed from tokens and `.type-*` utilities only, so it is not "a component the DS does not
 * have" so much as a layout of components it does.
 */
export interface EmptyStateArt {
    src: string
    /** Intrinsic size — reserves the box so nothing reflows when the art decodes. */
    width: number
    height: number
}

export function ChannelEmptyState({
    icon,
    art,
    title,
    body,
    action,
    tone = 'default',
    testId,
    className,
}: {
    /** The fallback mark. Ignored when `art` is given, and required when it is not. */
    icon?: TeviIconName
    /** Brand artwork for this state, where there is any. */
    art?: EmptyStateArt
    title: string
    /**
     * The wall's own id. `e2e/README.md` calls these the most valuable thing to regression-test, and
     * a wall was previously asserted by its English sentence — nine locales, one selector.
     */
    testId?: string
    /** Optional — some states are self-explanatory from the title alone. */
    body?: string
    action?: ReactNode
    /**
     * Colours the glyph, and nothing else.
     *
     * `'error'` exists because a failed region and an empty one are the **same shape of moment** —
     * there is nothing to show and the reader needs a sentence — but not the same news. Everything
     * about the block stays put; only the mark changes from muted to the error accent, which is what
     * lets the two be told apart before the title is read.
     */
    tone?: 'default' | 'error'
    className?: string
}) {
    return (
        <div
            data-testid={testId}
            className={cn(
                'flex min-w-0 flex-col items-center justify-center px-3 py-10 text-center',
                // The art needs more air under it than a 32px glyph does — 16 against the
                // glyph's 12, which is legacy's own gap for this block.
                art ? 'gap-4' : 'gap-3',
                className,
            )}
        >
            {art ? (
                <Image
                    src={art.src}
                    /*
                     * Decorative: the title under it says the same thing in words, so an `alt`
                     * would have a screen reader announce the state twice. Legacy sets
                     * `alt="No blocked accounts"` and does exactly that.
                     */
                    alt=""
                    width={art.width}
                    height={art.height}
                    /*
                     * Capped at the art's **own** intrinsic width, never a constant.
                     *
                     * This was `max-w-[190px]`, and 190 is not a design decision — it is the
                     * width of the *first* illustration this component was given
                     * (`no-blocked-accounts.png`, 190×127). Every piece narrower than that was
                     * therefore upscaled to 190 by the `w-full` beside it: measured,
                     * `theo-search.svg` (94×118) rendered at **190×238**, twice its own size, and
                     * `no-live-events.png` (154×183) at 190×226. Brand draws each piece at the
                     * size it is meant to be seen; a shared cap silently overrides that for
                     * everything except the one it was copied from.
                     *
                     * `w-full` stays, so the art still shrinks with a narrow phone rather than
                     * forcing the card wider than the screen — it just cannot grow past its
                     * natural size any more. `h-auto` keeps the ratio while `next/image` still
                     * renders the width/height attributes that reserve the box.
                     */
                    style={{ maxWidth: art.width }}
                    className="h-auto w-full"
                    /*
                     * **Eager, because this block only exists when there is nothing else.**
                     *
                     * `next/image` lazy-loads by default, and a lazy image that turns out to be the
                     * Largest Contentful Paint is a deferred request for the one thing on screen —
                     * which is exactly what an empty state is: the list it replaces rendered nothing,
                     * so the art is the page's largest element and Next says so in the dev console
                     * (`Image with src "/illustrations/theo-search.svg" was detected as the LCP`).
                     *
                     * `loading="eager"` and not `priority`: `priority` additionally preloads at high
                     * fetch priority, and that is a claim about the *document*, not this block. These
                     * walls also appear inside a tab, a dialog and a scrolled panel, where the art is
                     * not the LCP and a preload would compete with what is. Dropping the lazy
                     * deferral is free either way — every piece here is a committed local asset a few
                     * KB in size (`docs/STATIC_ASSETS.md`), not a remote fetch worth postponing.
                     */
                    loading="eager"
                />
            ) : icon ? (
                <Icon
                    name={icon}
                    size={32}
                    className={cn(
                        'flex-none',
                        tone === 'error'
                            ? 'text-(--accents-error-active)'
                            : 'text-(--icon-secondary)',
                    )}
                />
            ) : null}
            {/*
             * ## The three parts arrive in order, 60ms apart
             *
             * The block already rises as a whole where a caller passes `RISE`; this staggers what is
             * *inside* it, so the mark lands, then the sentence, then the button — which is the order
             * a reader takes them in anyway. A single slab appearing at once is what made these read
             * as a page that had failed rather than one with nothing to show.
             *
             * `riseDelay`'s own 60ms increment, and the same arithmetic `channel-live-tab` uses for
             * its cards: three parts are all in within 120ms of the first, well under where a screen
             * starts to feel like it is assembling itself. `RISE` carries
             * `motion-reduce:animate-none`, so a reader who asked for less motion simply sees them.
             *
             * The delays start at 1 because the mark above is index 0 — it is the first thing to land
             * and needs no delay of its own.
             */}
            <div className={cn('flex min-w-0 flex-col gap-1', RISE)} style={riseDelay(1)}>
                {/*
                 * `type-body-strong` — 16/**600**, which is legacy's own weight for this line
                 * (`NoPayoutsYet` and every sibling set `fontWeight: '600'`). It was
                 * `type-body-emphasis` at 500, a step too light to read as the heading of the block
                 * when the sentence under it is 14/400 — the two sat at nearly the same weight and
                 * the title stopped being a title.
                 */}
                <p className="type-body-strong text-(--text-title)">{title}</p>
                {body && (
                    <p
                        /*
                         * **400px, not the full column.** Legacy caps this line at exactly that
                         * (`maxWidth: '400px'`), and the reason shows on a 612px card: a sentence
                         * running the full width has to be tracked back across the whole block for
                         * each line, so a centred paragraph reads as a banner rather than as a
                         * caption under the mark. `mx-auto` keeps it centred inside whatever room
                         * there is; narrower containers are unaffected, since this is a maximum.
                         */
                        className="type-dense-default mx-auto max-w-[400px] text-(--text-subtitle)"
                    >
                        {body}
                    </p>
                )}
            </div>
            {action && (
                <div className={RISE} style={riseDelay(2)}>
                    {action}
                </div>
            )}
        </div>
    )
}
