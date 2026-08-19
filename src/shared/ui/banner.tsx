import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Banner — Figma "Banner/Marketing" (37:8711), ported from the DS `preview/banner.html`.
 *
 * ## Only `branded` is here
 *
 * The DS draws eight types (branded · strip · glass · countdown · gradient · feature ·
 * campaign · share). Seven of them are marketing surfaces with no caller in this app yet —
 * countdown timers, gradient upsells, campaign art — and porting a variant nobody renders
 * means shipping geometry no screen can prove. `branded` is ported because a screen needs
 * exactly its anatomy: **a 48px illustration tile, a title + subtitle column, and one action
 * on the trailing edge, on one centred row.** Add the others when something renders them,
 * from `preview/banner.html`, not from memory.
 *
 * ## Banner vs Alert
 *
 * `Alert` is the DS's "here is what went wrong" surface: neutral card, a status glyph it
 * chooses itself, actions **under** the text. `Banner` is the "here is something to do"
 * surface: brand fill, an illustration you supply, the action **beside** the text. Reach for
 * the second when the card is a call to action rather than a report — the row layout is the
 * difference a reader actually sees, and it is why the two exist separately in Figma.
 *
 * ## The gradient is a `style`, not a class
 *
 * Four stops with percentages do not survive Tailwind's arbitrary-value escaping legibly, and
 * `components.css` scopes it as a component custom property rather than a token — so it is
 * not something `globals.css` may hold either (that file matches `colors_and_type.css`
 * verbatim). Written inline, it still references `--primary-500/600`, which **flip between
 * modes** (`#501bc0`/`#4316a0` light, `#501bc0`/`#8a4fe3` dark). Figma binds this gradient per
 * stop for exactly that reason; do not flatten it to hexes.
 *
 * The angle is Figma's own: `gradientTransform` is normalised object space, so 102.2deg is the
 * angle at the 370px design width and drifts if the card is much wider. The DS export says so
 * and ships it anyway — reproduced rather than "corrected".
 *
 * ## `tone` — the one axis the DS does not have
 *
 * Every type Figma draws is a **promotion**: a trial ending, a sale, a feature launch. So the
 * fill is brand art and the foreground is White, mode-invariantly. This app also needs the
 * same anatomy for a **state notice** — "your space is unpublished" — where a purple marketing
 * gradient actively misreads: it says *offer*, and the card is a warning. Legacy paints that
 * band `#FFF8D7`, and this repo has the token for it, so `tone="warning"` is the DS geometry
 * over `--accents-warning-bg-active` (`#fefce8` light, `#1f1c0d` dark).
 *
 * A tone carries **four** colours, not one — surface, title, subtitle, and the tile's own
 * fill and glyph — because White-on-gradient and near-black-on-pale-yellow disagree about all
 * of them. They are published as custom properties on the root so the parts read one name
 * each and a fifth tone stays a four-line addition. Do not colour a part at the call site: a
 * tone that is set in five places is a tone that will only be half-changed.
 */
export type BannerType = 'branded'

/** `brand` is Figma's; `warning` is ours, for state notices. See the note above. */
export type BannerTone = 'brand' | 'warning'

const BRANDED_GRADIENT =
    'linear-gradient(102.2deg, var(--primary-600) 0%, var(--primary-500) 17.42%, var(--primary-500) 70.82%, var(--primary-600) 100%)'

const TONE: Record<BannerTone, string> = {
    brand: cn(
        '[--banner-fg:var(--white)] [--banner-fg-subtle:var(--white)]',
        '[--banner-tile-bg:var(--opacity-white-25)] [--banner-tile-fg:var(--white)]',
    ),
    warning: cn(
        'bg-(--accents-warning-bg-active)',
        '[--banner-fg:var(--text-title)] [--banner-fg-subtle:var(--text-subtitle)]',
        /*
         * The tile is `--background-surface`, which is White in Light and the raised dark grey
         * in Dark — legacy's white disc, minus the hard-coded `#FFFFFF` that would vanish
         * against a dark card. The glyph then carries the status colour, which is how `Alert`
         * already does it, rather than legacy's near-black: a black padlock inside a white
         * disc on a yellow band reads as a sticker rather than as part of the notice.
         */
        '[--banner-tile-bg:var(--background-surface)] [--banner-tile-fg:var(--text-warning)]',
    ),
}

export function Banner({
    type = 'branded',
    tone = 'brand',
    className,
    style,
    ...props
}: ComponentPropsWithoutRef<'div'> & { type?: BannerType; tone?: BannerTone }) {
    return (
        <div
            data-slot="banner"
            data-type={type}
            data-tone={tone}
            className={cn(
                'relative box-border flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-xl)] border-0 p-4',
                // Same inset-shadow-as-stroke trick as `Alert`, and for the same two reasons:
                // Figma aligns the 0.5px stroke inside, and Chromium snaps a 0.5px border up.
                // Shared chrome: `components.css` puts it on every type, so it survives a tone.
                'shadow-[inset_0_0_0_0.5px_var(--button-secondary-border),var(--shadow-md)]',
                TONE[tone],
                className,
            )}
            // Only `brand` paints from `style`; `warning` has a plain token fill and a
            // `background` here would win over its class.
            style={tone === 'brand' ? { background: BRANDED_GRADIENT, ...style } : style}
            {...props}
        />
    )
}

/**
 * The 48×48 illustration tile. Fill and glyph colour come from the root's `tone`.
 *
 * A 24px icon sits in it with 8px of padding on each side. It is a slot rather than an `Icon`
 * prop because the DS fills it with per-banner artwork; a caller passing `<Icon size={24}/>`
 * gets the Figma composition, and one passing an `<img>` gets it too.
 */
export function BannerTile({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="banner-tile"
            className={cn(
                'flex size-[48px] flex-none items-center justify-center rounded-[var(--radius-xl)] p-2',
                'bg-(--banner-tile-bg) text-(--banner-tile-fg)',
                className,
            )}
            {...props}
        />
    )
}

/** The column that flexes. Gap 0 — the two lines are set by their line-height, as in Figma. */
export function BannerText({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="banner-text"
            className={cn('flex min-w-0 flex-1 flex-col justify-center gap-0', className)}
            {...props}
        />
    )
}

/** 16 / Semi Bold, in the tone's foreground — a banner paints its own text colour. */
export function BannerTitle({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
    return (
        <p
            data-slot="banner-title"
            className={cn('type-body-strong text-(--banner-fg)', className)}
            {...props}
        />
    )
}

/**
 * 14 / Regular, in the tone's subtitle foreground.
 *
 * **`truncate` defaults to `true` because Figma sets `textTruncation: ENDING` on this node** —
 * it is what holds the branded card at exactly 80px tall. Pass `truncate={false}` when the
 * subtitle is a sentence the reader actually has to finish; the card then grows, which is a
 * deliberate trade rather than a slip.
 */
export function BannerSubtitle({
    className,
    truncate = true,
    ...props
}: ComponentPropsWithoutRef<'p'> & { truncate?: boolean }) {
    return (
        <p
            data-slot="banner-subtitle"
            className={cn(
                'type-dense-default text-(--banner-fg-subtle)',
                truncate && 'overflow-hidden text-ellipsis whitespace-nowrap',
                className,
            )}
            {...props}
        />
    )
}

/** The trailing action. Figma puts the branded card's single button *in the row*. */
export function BannerTrailing({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="banner-trailing"
            className={cn('flex flex-none items-center gap-3', className)}
            {...props}
        />
    )
}
