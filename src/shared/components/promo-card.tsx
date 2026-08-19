import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * The narrow promo card the end rail stacks — a title, a line of body, one action, and a
 * decorative mark tucked into the trailing-bottom corner.
 *
 * Legacy writes this shape three times, inline, with the same twelve `sx` properties each
 * time: `trending/banner/logInBanner`, `campaign/premiumBanner` and
 * `campaign/luckyWheel/banner/desktop`. They differ only in their text, their art and where
 * the button goes. So it is one component, and the three callers are data.
 *
 * ## What moved to the design system
 *
 * Legacy paints `#ffffff` and `#1A1A1A` and `#858585` directly, which is a light-mode-only
 * card in an app that has a dark mode. The fill is `--background-surface`, the ink is
 * `--text-title` / `--text-subtitle`, and the frame is the DS card's inset ring rather than
 * a border — Figma strokes are inside the frame, so a real border would grow the box.
 *
 * The radius is the DS card's 16, not legacy's 12. Every other bounded surface in this app
 * is `rounded-xl`; a 12 here would read as a different kind of thing for no reason.
 *
 * **Type is `type-subheading-strong` (18/600), where legacy sets 18/700 by hand.** The DS has
 * no 18/700 — its 25 text styles are the whole vocabulary, and CLAUDE.md forbids setting
 * `font-weight` directly. This is the closest style, and it is a deliberate move to the DS
 * rather than an approximation of Figma.
 *
 * ## `art` is decorative, always
 *
 * It is a flourish behind the text — a wheel, a crown, a key. It gets `alt=""` and
 * `aria-hidden`, it never carries meaning the copy does not already carry, and it is
 * `pointer-events-none` so it cannot swallow a press meant for the card. It is pinned with
 * the logical `end-0`, not its physical twin — the whole rail mirrors in RTL.
 */
export interface PromoCardArt {
    src: string
    /** Rendered square. Legacy uses 70 for most and 90 for the Premium crown. */
    size: number
}

/**
 * The card is either a plain surface with its own CTA inside it, or it *is* the control — never
 * both. `action` puts a button in the card, so the card stays a `<div>`; `as="button"` makes the
 * whole card pressable, and then there must be nothing pressable inside it. A button inside a
 * button is invalid HTML and gives a keyboard user two stops for one action.
 *
 * The union below is what enforces that: `action` is not accepted on the `button` form.
 */
type PromoCardOwn = {
    title: ReactNode
    body?: ReactNode
    art?: PromoCardArt
    className?: string
}

export type PromoCardProps =
    | (PromoCardOwn & {
          as?: 'div'
          /** The CTA. A `Button`, or a `Button` wrapping a link — the card does not care. */
          action?: ReactNode
      } & Omit<ComponentPropsWithoutRef<'div'>, 'title'>)
    | (PromoCardOwn & { as: 'button'; action?: never } & Omit<
              ComponentPropsWithoutRef<'button'>,
              'title'
          >)

export function PromoCard({ title, body, art, className, ...rest }: PromoCardProps) {
    const {
        as = 'div',
        action,
        ...props
    } = rest as {
        as?: 'div' | 'button'
        action?: ReactNode
    } & Record<string, unknown>
    const Tag = as

    return (
        <Tag
            data-slot="promo-card"
            // `type` is inert on a div and required on a button — a button inside a form
            // defaults to `submit`, which would submit it.
            {...(as === 'button' ? { type: 'button' as const } : {})}
            className={cn(
                'relative flex w-full min-w-0 flex-col items-start gap-3 overflow-hidden',
                'rounded-xl bg-(--background-surface) p-3',
                'shadow-[inset_0_0_0_1px_var(--button-secondary-border)]',
                className,
            )}
            {...props}
        >
            {/* Above the art, so a long title runs over the mark instead of under it. */}
            <div className="relative z-1 flex min-w-0 flex-col gap-1">
                <p className="type-subheading-strong text-(--text-title)">{title}</p>
                {body ? <p className="type-caption-meta text-(--text-subtitle)">{body}</p> : null}
            </div>
            {action ? <div className="relative z-1">{action}</div> : null}
            {art ? (
                <Image
                    src={art.src}
                    alt=""
                    aria-hidden
                    width={art.size}
                    height={art.size}
                    className="pointer-events-none absolute bottom-0 end-0 select-none"
                />
            ) : null}
        </Tag>
    )
}
