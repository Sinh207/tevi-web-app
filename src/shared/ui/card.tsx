import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'

/**
 * Card — Figma "Card", ported 1:1.
 *
 * **Partial port.** Figma's Card set has 30-odd `data-type` values; the four here are
 * the ones the Left Bar and the wallet screens assemble over. Everything else is
 * absent rather than guessed — look the variant up in the DS and add it when a screen
 * needs it.
 *
 *   basic              a padded row on Background/Surface with a 1px inside border.
 *   premium            the account header: purple gradient, yellow hairline, and a
 *                      local restatement of the Dark-mode text tokens, because the
 *                      card is white-on-purple in **both** themes.
 *   balance-overview   a zero-padding column on Background/Surface, and the one Card
 *                      variant with no stroke — Figma restates `box-shadow: none`
 *                      after the shared border, so the border is not an oversight.
 *   balance            the money hero card on `/my-star` and `/my-wallet`: a padded
 *                      column on a Zinc gradient, bordered *and* shadowed. Black in
 *                      both themes — see `BALANCE_TOKENS`.
 *   balance-mini       byte-identical root to `balance` in Figma; it is the same card
 *                      with the value block removed, so it is the same recipe here and
 *                      the difference is which children you pass.
 */
export type CardType = 'basic' | 'premium' | 'balance-overview' | 'balance' | 'balance-mini'

/**
 * The Dark-pin tokens the premium card restates locally. `--text-subtitle` is the
 * one Figma left out of its own list: without it a premium card carrying a subtitle
 * paints Zinc 700 dark-on-purple in Light mode.
 */
const PREMIUM_TOKENS =
    '[--primary-300:#371282] [--primary-400:#4316a0] [--primary-500:#501bc0] [--accents-yellow:#ffe537] [--text-title:#ffffff] [--text-subtitle:#d4d4d8]'

/**
 * The same technique, for the same reason, on the balance card — and here it is
 * load-bearing rather than a polish fix.
 *
 * Figma binds the gradient to `--zinc-200` → `--zinc-50`, and **the Zinc ramp inverts
 * between modes** (CLAUDE.md says so in as many words: `--zinc-950` is `#09090b` light
 * and `#fafafa` dark). So the bound gradient is near-black in Dark and near-*white* in
 * Light — the card would flip to a pale grey slab with white text on it, which is not a
 * state the design has anywhere. The `My Star` / `My wallet` comps resolve it by pinning
 * the six tokens below inline, and this is that pin, moved into the component so no
 * screen has to remember it.
 *
 * Values copied verbatim out of the comps
 * (`87e00715-ad01-43ad-9a23-20469b60276d`, `My Star - Mobile.dc.html`), which in turn
 * take them from the Dark block of the DS's own `colors_and_type.css`. This is a pinned
 * *surface*, not a themed one — the money card is black on purpose, the way a bank app's
 * is.
 */
const BALANCE_TOKENS =
    '[--zinc-50:#09090b] [--zinc-200:#27272a] [--text-title:#ffffff] [--text-subtitle:#a1a1aa] [--icon-default:#ffffff] [--button-secondary-border:#ffffff1a]'

/** `balance` and `balance-mini` are one root recipe in Figma; only the children differ. */
const BALANCE_CARD = cn(
    BALANCE_TOKENS,
    'flex-col items-start gap-1 overflow-hidden rounded-xl p-4',
    'bg-[linear-gradient(90deg,var(--zinc-200)_0%,var(--zinc-50)_100%)]',
    'shadow-[inset_0_0_0_1px_var(--button-secondary-border),var(--shadow-md)]',
)

const CARD_TYPE: Record<CardType, string> = {
    basic: 'flex-row items-start gap-3 overflow-hidden rounded-xl bg-(--background-surface) p-4 shadow-[inset_0_0_0_1px_var(--button-secondary-border)]',
    premium: cn(
        PREMIUM_TOKENS,
        'relative flex-row items-center gap-3 overflow-hidden rounded-xl p-4',
        'bg-[linear-gradient(90deg,var(--primary-400)_0%,var(--primary-300)_32.7%,var(--primary-500)_100%)]',
        'shadow-[inset_0_0_0_1px_var(--accents-yellow)]',
    ),
    'balance-overview':
        'flex-col items-start gap-0 overflow-hidden rounded-xl bg-(--background-surface) p-0 shadow-none',
    balance: BALANCE_CARD,
    'balance-mini': BALANCE_CARD,
}

export type CardProps = ComponentPropsWithoutRef<'div'> & { type: CardType }

function Card({ className, type, ...props }: CardProps) {
    return (
        <div
            data-slot="card"
            data-type={type}
            className={cn('flex w-full min-w-0', CARD_TYPE[type], className)}
            {...props}
        />
    )
}

export type CardTrailingType = 'option' | 'badge' | 'button'

/** The 48-tall trailing slot on a card row. `option` is the ⋮/chevron affordance. */
function CardTrailing({
    className,
    type = 'option',
    ...props
}: ComponentPropsWithoutRef<'div'> & { type?: CardTrailingType }) {
    return (
        <div
            data-slot="card-trailing"
            data-type={type}
            className={cn(
                'flex h-[48px] flex-none flex-row gap-[10px] p-0',
                type === 'button'
                    ? 'items-center justify-start'
                    : 'items-start justify-center',
                type === 'option' && 'text-(--text-body)',
                className,
            )}
            {...props}
        />
    )
}

/* ===================== Card/Item — Figma 88:18182 ===================== */

/**
 * The four `Card/Item` types the money cards use, out of Figma's eight.
 *
 * `title-subtitle` is the value block (16/600 Title over 14/400 Subtitle, the subtitle
 * clamped — Figma gives it `textTruncation: ENDING` and every wrapping exemplar lands on
 * exactly two lines, so the clamp is spec rather than an accident). `item` and
 * `large-item` are label rows that differ only in ink and weight. The other four
 * (`icon`, `time`, `user`, `action-*`) are absent until a screen wants them.
 */
export type CardItemType = 'title-subtitle' | 'item' | 'large-item'

/** The three sizes Figma actually overrides `__title` to. 16/600 is the unset default. */
export type CardItemTitleSize = '18' | '20' | '32'

const CARD_ITEM_TYPE: Record<CardItemType, string> = {
    'title-subtitle': 'w-full flex-col items-start gap-0 self-stretch',
    item: 'type-body-default flex-row items-center justify-center gap-1 text-(--text-body)',
    'large-item': 'type-body-strong flex-row items-center justify-center gap-1 text-(--text-title)',
}

/**
 * The title's size arrives as a `.type-*` utility, not a raw `font-size` — CLAUDE.md's
 * rule, and the reason the 25 utilities exist: a size and a weight are paired in exactly
 * one place. Each of Figma's three overrides has an exact utility, matched on all four
 * properties (size, weight, line-height, tracking):
 *
 *   18 / semibold / tight → `type-subheading-strong`
 *   20 / bold     / tight → `type-title-t2-bold`
 *   32 / bold     / tight → `type-heading-h1-bold`
 *
 * ⚠ `type-title-t1-*` is **24px**, not 20 — the DS's T1/T2 numbering runs opposite to the
 * intuition. Reaching for `t1` here is the easy mistake and it is silent, so the sizes are
 * spelled out above.
 */
const CARD_ITEM_TITLE_SIZE: Record<CardItemTitleSize, string> = {
    '18': 'type-subheading-strong',
    '20': 'type-title-t2-bold',
    '32': 'type-heading-h1-bold',
}

export type CardItemTone = 'title' | 'subtitle' | 'body'

const CARD_ITEM_TONE: Record<CardItemTone, string> = {
    title: 'text-(--text-title)',
    subtitle: 'text-(--text-subtitle)',
    body: 'text-(--text-body)',
}

function CardItem({
    className,
    type,
    tone,
    /**
     * Figma's `Balance` instance overrides the value block's clamp from 2 lines to 1
     * (`--card-subtitle-lines: 1`), because a balance is one line by construction.
     */
    subtitleLines,
    titleSize,
    ...props
}: ComponentPropsWithoutRef<'div'> & {
    type: CardItemType
    tone?: CardItemTone
    subtitleLines?: 1 | 2
    titleSize?: CardItemTitleSize
}) {
    return (
        <div
            data-slot="card-item"
            data-type={type}
            data-tone={tone}
            data-title-size={titleSize}
            className={cn(
                'flex min-w-0 gap-0 p-0',
                CARD_ITEM_TYPE[type],
                titleSize && CARD_ITEM_TITLE_SIZE[titleSize],
                tone && CARD_ITEM_TONE[tone],
                className,
            )}
            style={
                subtitleLines
                    ? ({ '--card-subtitle-lines': subtitleLines } as CSSProperties)
                    : undefined
            }
            {...props}
        />
    )
}

/**
 * The value inside a `title-subtitle` item.
 *
 * The size comes from the parent's `titleSize`, which is why this is `[font-size:inherit]`
 * rather than a type utility of its own: `CardItem` puts a `.type-*` class on the wrapper
 * and this inherits it. Without the escape the base 16/600 here would win over a
 * `type-title-h2-bold` on the parent and every balance would render at 16px.
 */
function CardItemTitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-item-title"
            className={cn(
                'type-body-strong block text-(--text-title)',
                '[font-size:inherit] [font-weight:inherit] [letter-spacing:inherit]',
                className,
            )}
            {...props}
        />
    )
}

function CardItemSubtitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-item-subtitle"
            className={cn(
                'type-body-default self-stretch overflow-hidden text-(--text-subtitle)',
                /*
                 * Spelled out rather than `line-clamp-2`, because the line count is a CSS
                 * variable the parent `CardItem` may override to 1 — Tailwind's
                 * `line-clamp-*` inlines a literal, and its `(--var)` shorthand takes no
                 * fallback, so neither can express "2 unless told otherwise".
                 */
                '[display:-webkit-box] [-webkit-box-orient:vertical]',
                '[-webkit-line-clamp:var(--card-subtitle-lines,2)]',
                className,
            )}
            {...props}
        />
    )
}

/** A label inside an `item` / `large-item` row. `nowrap` is Figma's, and it matters on a currency code. */
function CardItemMeta({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-item-meta"
            className={cn('whitespace-nowrap [font-size:inherit]', className)}
            {...props}
        />
    )
}

/**
 * The glyph slot in an `item` / `large-item` row.
 *
 * Default ink is `--text-placeholder`; `iconTone` is the instance-level override Figma
 * uses on the wallet card's currency row (Title, so the chevron reads as white on black).
 */
function CardItemIcon({
    className,
    tone,
    ...props
}: ComponentPropsWithoutRef<'span'> & { tone?: Exclude<CardItemTone, 'subtitle'> }) {
    return (
        <span
            data-slot="card-item-icon"
            data-icon-tone={tone}
            className={cn(
                'flex flex-none items-center',
                tone ? CARD_ITEM_TONE[tone] : 'text-(--text-placeholder)',
                className,
            )}
            {...props}
        />
    )
}

/* ============ Card/Meta and Card/Content — the two card frames ============ */

/**
 * `Meta` / `Meta Large` — a row of meta pills. Centred and hugging by default; the two
 * `justify` values are the overrides Figma uses, and both also stretch to full width
 * (which is what makes `between` put the currency chip against the card's right edge).
 */
function CardMeta({
    className,
    gap = '8',
    justify,
    ...props
}: ComponentPropsWithoutRef<'div'> & {
    gap?: '4' | '8'
    justify?: 'start' | 'between'
}) {
    return (
        <div
            data-slot="card-meta"
            data-gap={gap}
            data-justify={justify}
            className={cn(
                'flex flex-row items-center p-0',
                gap === '4' ? 'gap-1' : 'gap-2',
                justify === undefined && 'justify-center',
                justify === 'start' && 'w-full justify-start self-stretch',
                justify === 'between' && 'w-full justify-between self-stretch',
                className,
            )}
            {...props}
        />
    )
}

/** `Content` / `Item List` / `Item Card` — the vertical stack inside a card. */
function CardContent({
    className,
    gap = '8',
    padded,
    ...props
}: ComponentPropsWithoutRef<'div'> & { gap?: '0' | '4' | '8'; padded?: boolean }) {
    return (
        <div
            data-slot="card-content"
            data-gap={gap}
            data-padded={padded ? '' : undefined}
            className={cn(
                'flex min-w-0 flex-1 flex-col items-start self-stretch',
                gap === '0' ? 'gap-0' : gap === '4' ? 'gap-1' : 'gap-2',
                padded ? 'p-4' : 'p-0',
                className,
            )}
            {...props}
        />
    )
}

export {
    Card,
    CardContent,
    CardItem,
    CardItemIcon,
    CardItemMeta,
    CardItemSubtitle,
    CardItemTitle,
    CardMeta,
    CardTrailing,
}
