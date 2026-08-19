import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * The wider promo card the campaign programs use — a 64 logo tile, two lines of text, a rule,
 * then a reward figure and its action on one row.
 *
 * Legacy writes it twice, near-identically: `campaign/growYourFans` and
 * `campaign/affiliatePrograms`. The only real difference is that Grow-Your-Fans draws its
 * logo on a red gradient tile it owns, and Affiliate takes the logo straight from the API —
 * hence `tileClassName` rather than two components.
 *
 * ## The action is text, not a button — and that is on purpose
 *
 * In legacy both cards render "Join now" / "Manage" as a `<Box component='span'>` styled to
 * look like a button, because **the whole card is the target**: Grow-Your-Fans wraps
 * everything in a link, Affiliate puts `onClick` on the container. A real `<button>` nested
 * inside a link is invalid HTML and gives a keyboard user two tab stops for one action.
 *
 * So the pill here stays presentational, the caller makes the *card* the control, and the
 * accessible name comes from the card. Callers pass `actionLabel` and `actionJoined`; they
 * do not pass a `Button`.
 *
 * ## Tokens
 *
 * Legacy's `#09090b` / `#3f3f46` / `#71717a` / `#e4e4e7` / `#ffffff` become `--text-title` /
 * `--text-body` / `--text-subtitle` / `--separator-default` / `--background-surface`, so the
 * card survives dark mode. The joined/not-joined pill is the DS's secondary and **accent**
 * button fills rather than `#f4f4f5` and `#501bc0` — note that legacy's purple is
 * `--primary-500`, which the DS spends on `accent`. The DS's `primary` button is Zinc 950,
 * i.e. black, so mapping the purple to "primary" by name would have silently repainted every
 * campaign CTA.
 */
/**
 * `div` by default; `button` when the caller makes the whole card the control.
 *
 * There is no `action` slot to conflict with, because the action pill here is always a `<span>` — so
 * unlike `PromoCard` this needs no union to keep a button out of a button. What it does need is for
 * `actionDecorative` to stay at its default once the card is pressable: the card's own accessible
 * name then covers the pill, and announcing "Join now" twice is noise.
 */
export function ProgramCard({
    logo,
    logoAlt,
    logoUnoptimized = false,
    tileClassName,
    title,
    body,
    reward,
    actionLabel,
    actionJoined = false,
    actionDecorative = true,
    as = 'div',
    className,
    ...props
}: {
    logo: string
    logoAlt: string
    logoUnoptimized?: boolean
    tileClassName?: string
    title: ReactNode
    body?: ReactNode
    reward?: ReactNode
    actionLabel: ReactNode
    actionJoined?: boolean
    actionDecorative?: boolean
    as?: 'div' | 'button'
} & Omit<ComponentPropsWithoutRef<'button'>, 'title' | 'type'>) {
    const Tag = as
    /*
     * One cast, contained here. `Tag` is a union of two intrinsic elements, and TypeScript will not
     * reconcile one props object against both — every DOM handler's element type differs. Widening
     * at the spread keeps the *public* signature honest (button props, which are a superset of the
     * div props a caller would want) while letting the element be either. `PromoCard` does the same,
     * for the same reason.
     */
    const domProps = props as Record<string, unknown>

    return (
        <Tag
            data-slot="program-card"
            // Inert on a div, required on a button: a button inside a form defaults to `submit`.
            {...(as === 'button' ? { type: 'button' as const } : {})}
            className={cn(
                'flex w-full min-w-0 flex-col gap-2 overflow-hidden',
                'rounded-xl bg-(--background-surface) p-4',
                'shadow-[inset_0_0_0_1px_var(--button-secondary-border)]',
                as === 'button' &&
                    'cursor-pointer text-start transition-colors hover:bg-(--button-secondary-bg-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                className,
            )}
            {...domProps}
        >
            <div className="flex items-start gap-3">
                <div
                    className={cn(
                        'relative flex size-16 flex-none items-center justify-center overflow-hidden rounded-xl',
                        tileClassName,
                    )}
                >
                    <Image
                        src={logo}
                        alt={logoAlt}
                        width={64}
                        height={64}
                        unoptimized={logoUnoptimized}
                    />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
                    <p className="type-body-strong text-(--text-title)">{title}</p>
                    {/* Two lines, then ellipsis — the campaign description is server text of
                        unbounded length and the rail column is 318 wide. */}
                    {body ? (
                        <p className="type-dense-default line-clamp-2 text-(--text-body)">{body}</p>
                    ) : null}
                </div>
            </div>

            <hr className="border-(--separator-default)" />

            <div className="flex items-center gap-3 pt-2">
                {/* `min-w-0` + `truncate` so a long localised reward string shortens itself
                    instead of pushing the action pill out of the card. */}
                {reward ? (
                    <p className="type-dense-emphasis min-w-0 flex-1 truncate text-(--text-title)">
                        {reward}
                    </p>
                ) : null}
                <span
                    aria-hidden={actionDecorative || undefined}
                    className={cn(
                        'inline-flex h-9 flex-none items-center justify-center rounded-lg px-4',
                        'type-dense-emphasis',
                        reward ? '' : 'ms-auto',
                        actionJoined
                            ? 'bg-(--button-secondary-bg) text-(--button-secondary-text) shadow-[inset_0_0_0_1px_var(--button-secondary-border)]'
                            : 'bg-(--button-accent-bg) text-(--button-accent-text)',
                    )}
                >
                    {actionLabel}
                </span>
            </div>
        </Tag>
    )
}
