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
    className,
}: {
    /** The fallback mark. Ignored when `art` is given, and required when it is not. */
    icon?: TeviIconName
    /** Brand artwork for this state, where there is any. */
    art?: EmptyStateArt
    title: string
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
            <div className="flex min-w-0 flex-col gap-1">
                <p className="type-body-emphasis text-(--text-title)">{title}</p>
                {body && <p className="type-dense-default text-(--text-subtitle)">{body}</p>}
            </div>
            {action}
        </div>
    )
}
