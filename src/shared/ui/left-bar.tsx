import { cn } from '@shared/lib/utils'
import Link from 'next/link'
import type { CSSProperties, ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from 'react'
import { Icon, type IconProps } from './icon'
import {
    ListLeading,
    ListLeadingTile,
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from './list'

/**
 * Left Bar — Figma 3626:26373, one composed screen (342 × 2025).
 *
 * The account drawer the web rail's Menu entry opens. It is an **assembly, not a new
 * primitive**: two `Card` variants over nine `FieldLabel` + list sections. Everything
 * here adds layout and the per-row tile paint; the rows themselves are the shipped
 * list parts.
 *
 * ── two source quirks reproduced rather than normalised ────────────────────────────
 * 1. The first five lists carry 8px of vertical padding (`inset`); the last four
 *    carry none. Nothing in the file explains the split — it is reproduced because
 *    Figma is the contract.
 * 2. Power Ups is the only list with a border, and it is a *gradient* hairline —
 *    Primary 500 → Accents/Yellow — not the flat Primary 500 the variable binding
 *    suggests. Only the first stop is bound.
 *
 * ── one deliberate divergence, inherited from the DS ──────────────────────────────
 * The Figma frame pins the whole drawer to Colors:Light. That pin is a canvas artefact
 * of an `Examples`-page mockup, not a design decision — shipping it would make the
 * drawer the one component in the library that ignores the host theme. It is dropped.
 * The Dark pin on the profile card is kept, because that one *is* the design: white
 * text over a purple gradient in either theme.
 */

/**
 * 64 of top padding is the status-bar inset Figma authors above the profile card — a
 * mobile artefact, so a web host overrides it (see `features/navigation/components/menu/menu-drawer.tsx`).
 *
 * `as="aside"` when the drawer is a panel beside other content rather than the screen.
 */
function LeftBar({
    className,
    as: As = 'div',
    ...props
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'aside' }) {
    return (
        <As
            data-slot="left-bar"
            className={cn(
                'flex w-[342px] flex-col gap-2 bg-(--background) pt-16 pr-4 pb-4 pl-4',
                className,
            )}
            {...props}
        />
    )
}

/* ============================ profile card ============================ */

function LeftBarProfileContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="left-bar-profile-content"
            className={cn('flex min-w-0 flex-auto flex-col', className)}
            {...props}
        />
    )
}

/** Name and handle share a baseline; the name truncates, the handle never does. */
function LeftBarProfileHandle({
    className,
    name,
    at,
    ...props
}: ComponentPropsWithoutRef<'div'> & { name: ReactNode; at: ReactNode }) {
    return (
        <div
            data-slot="left-bar-profile-handle"
            className={cn('flex min-w-0 items-baseline gap-1', className)}
            {...props}
        >
            <span className="type-body-strong overflow-hidden text-ellipsis whitespace-nowrap text-(--text-title)">
                {name}
            </span>
            <span className="type-dense-default flex-none text-(--text-subtitle)">{at}</span>
        </div>
    )
}

/** The copy affordance is the one glyph in the card that is not white. */
function LeftBarProfileMeta({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="left-bar-profile-meta"
            className={cn('type-dense-default flex items-center gap-1 text-(--text-title)', className)}
            {...props}
        >
            {children}
        </div>
    )
}

const leftBarProfileCopyClass = 'text-(--text-link)'

/** The plan chip, pinned to the card's top corner. */
function LeftBarProfilePlan({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="left-bar-profile-plan"
            className={cn('absolute top-0 end-0', className)}
            {...props}
        />
    )
}

/* ============================ balance card ============================ */

function LeftBarBalanceStats({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="left-bar-balance-stats"
            className={cn('flex self-stretch', className)}
            {...props}
        />
    )
}

function LeftBarBalanceItem({
    className,
    label,
    value,
    ...props
}: ComponentPropsWithoutRef<'div'> & { label: ReactNode; value: ReactNode }) {
    return (
        <div
            data-slot="left-bar-balance-item"
            className={cn('flex min-w-0 flex-1 flex-col gap-1 p-4', className)}
            {...props}
        >
            <span className="type-dense-default text-(--text-body)">{label}</span>
            <span className="type-subheading-strong text-(--text-title)">{value}</span>
        </div>
    )
}

function LeftBarBalanceActions({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="left-bar-balance-actions"
            className={cn('flex items-stretch self-stretch', className)}
            {...props}
        />
    )
}

/**
 * Figma authors these as `Button Size=Large, Style=Ghost` with the label repainted
 * Text - Link. Rebuilt rather than composed so the two halves can split the card
 * exactly in two; a real `<Button>` hugs its label.
 *
 * The Radius LG that comes with `Button Size=Large` is **dropped**. It is there because
 * the node is a Button instance, and it contradicts the same node being stretched to
 * fill half the card: a 12px radius on a full-bleed cell leaves four white gaps against
 * the card edge and puts round top corners against the flat divider above, so the ghost
 * hover reads as a detached pill instead of a segment lighting up. Square here is not
 * cornerless — the card is Radius XL with `overflow: hidden`, so it clips the two outer
 * corners to 16 and the visible shape is the card's, which is the one Figma draws.
 */
function LeftBarBalanceAction({
    className,
    href,
    disabled,
    ...props
}: ComponentPropsWithoutRef<'button'> & {
    /**
     * Render an `<a>` instead, for a half that is a **destination** — *Get Star* is `/get-star`.
     *
     * A prop rather than a `<Link>` wrapped around the call site, for the reason `Button`'s own
     * `rendersLink` note gives at length: wrapping would put a `<button>` inside an `<a>`, which is
     * invalid and un-focusable in the way that matters. Same fork, and the same order of checks, as
     * `AppBarButton`.
     *
     * `disabled` wins over `href`. A destination that is not built yet stays a dimmed `<button>`,
     * because an `<a>` has no disabled state — it would still be middle-clickable into a 404.
     */
    href?: string
}) {
    /*
     * `flex items-center justify-center` rather than leaning on the `<button>`'s own centring: an
     * `<a>` does not centre its text or fill its height the way a button does, and without this the
     * link half would sit top-left against a 48px cell while the button half stayed centred. For a
     * single text child a centred flex box and a centred button render identically, so the
     * `<button>` path is unchanged.
     */
    const shared = {
        'data-slot': 'left-bar-balance-action',
        className: cn(
            'type-body-strong m-0 flex h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-none border-0 bg-(--button-ghost-bg) px-6 py-2 text-(--text-link)',
            'hover:bg-(--button-ghost-bg-hover) focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
            /*
             * The DS draws no disabled state for this button — it is a bespoke half-card
             * segment, not a `Button` instance — so the treatment is the app's own, matching
             * what `BalanceActionRows` uses for a control whose destination is not built yet:
             * 40% and no pointer. Kept here rather than passed in by the one caller, so the
             * next screen to use this segment cannot invent a second version of it.
             */
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-(--button-ghost-bg)',
            className,
        ),
    }

    if (href && !disabled) {
        return <Link href={href} {...shared} {...(props as ComponentPropsWithoutRef<'a'>)} />
    }

    return <button type="button" disabled={disabled} {...shared} {...props} />
}

/**
 * Figma draws the divider as a zero-width VECTOR with a stroke — it has no box, so
 * the hairline is rebuilt as a 1px rule rather than a 0px one.
 */
function LeftBarBalanceRule({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="left-bar-balance-rule"
            aria-hidden="true"
            className={cn('w-px flex-none bg-(--separator-default)', className)}
            {...props}
        />
    )
}

/* ============================== sections ============================== */

function LeftBarSection({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
    return (
        <section
            data-slot="left-bar-section"
            className={cn('flex flex-col', className)}
            {...props}
        />
    )
}

export type LeftBarListProps = ComponentPropsWithoutRef<'div'> & {
    /** The 8px of vertical padding the first five lists carry and the last four don't. */
    inset?: boolean
    /** Power Ups only: the 1px inside gradient hairline. */
    featured?: boolean
    /**
     * A 1px `--separator-default` outline. Not in the DS — Figma's lists sit on
     * Background/Surface with no stroke — but the `My Star — Desktop` comp puts one
     * on every list the gradient hairline doesn't already ring, because on web the
     * drawer's surface and the page's are close enough to need the edge.
     */
    bordered?: boolean
}

/**
 * A 1px INSIDE gradient stroke: a padding-box/border-box mask difference, which keeps
 * the ring off the box model the way Figma's INSIDE alignment does.
 *
 * Written as an inline style on a real overlay rather than a Tailwind `after:[…]`
 * arbitrary property — the two-layer `mask` shorthand and `mask-composite` do not
 * survive Tailwind's arbitrary-value escaping, and the failure mode is silent: the
 * gradient stops being a ring and becomes a filled block over the rows.
 */
const FEATURED_RING: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    padding: '1px',
    background: 'linear-gradient(109deg, var(--primary-500), var(--accents-yellow))',
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    maskComposite: 'exclude',
    pointerEvents: 'none',
}

/**
 * The rounded surface a section's rows sit on.
 *
 * `featured` is Power Ups: the one list with a border, and it is a gradient hairline.
 * The 109deg is the Figma gradientTransform resolved against this list's authored
 * 310 × 160 box: inverse(A)·(1,0) = (1.100, 0.729) → (341px, 117px) → 90° + 18.9°.
 */
function LeftBarList({
    className,
    inset,
    featured,
    bordered,
    children,
    ...props
}: LeftBarListProps) {
    return (
        <div
            data-slot="left-bar-list"
            data-inset={inset ? 'true' : undefined}
            data-featured={featured ? 'true' : undefined}
            className={cn(
                'relative overflow-hidden rounded-xl bg-(--background-surface)',
                inset && 'py-2',
                bordered && 'border border-(--separator-default)',
                className,
            )}
            {...props}
        >
            {featured && (
                <span data-slot="left-bar-list-ring" aria-hidden="true" style={FEATURED_RING} />
            )}
            {children}
        </div>
    )
}

/**
 * The three raster app icons — same 48/32 geometry as the tile they replace, so a
 * brand mark can stand in for a glyph without shifting the row.
 */
function LeftBarBrand({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="left-bar-brand"
            className={cn('flex size-[48px] flex-none items-center justify-start', className)}
            {...props}
        />
    )
}

const leftBarBrandTileClass = 'block size-[32px] rounded-[var(--spacing-2)] object-cover'

/* ============================== the row ============================== */

export type LeftBarRowProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
    title: ReactNode
    /**
     * A second line under the title, at Dense/Default in Text - Subtitle
     * (`.tevi-list-row__subtitle`). The DS drawer has no two-line row; its sub-screens
     * do, wherever a setting needs saying what it actually does.
     */
    subtitle?: ReactNode
    /**
     * Marks the subtitle so a `control` can point `aria-describedby` at it. Generate it
     * with `useId()` at the call site — the row cannot mint one the caller could name.
     */
    subtitleId?: string
    /** The glyph in the tile. Omit for a row whose leading is a brand image. */
    icon?: IconProps
    /** Paints the 32px tile — a colour token, e.g. `var(--accents-indigo-active)`. */
    tile?: string
    /** Paints the glyph on that tile. Defaults to White, as the DS tile does. */
    glyph?: string
    /** Stands in for the tile: a 32px brand mark. */
    brand?: ReactNode
    /**
     * Right-hand value or control, shown before the chevron. The comp sets the gap to
     * 4 for a text value and 8 when it is a notification badge; 4 is the default here.
     */
    trailing?: ReactNode
    /**
     * An **interactive** trailing control — a `Toggle`, in practice.
     *
     * Separate from `trailing` because it changes what the row itself may be: a control
     * inside a `<button>` is a nested interactive element, which no browser resolves the
     * way the markup suggests and which makes the row untabbable to the switch inside it.
     * So a row with a `control` defaults to `as="div"` and hands the interaction to the
     * control alone, and its trailing slot takes the DS's `toggle` variant (gap 0,
     * top-aligned) rather than the centred one.
     */
    control?: ReactNode
    /** The hairline above the row — every row but the first in a list. */
    rule?: boolean
    /**
     * The drilldown chevron. On by default: every row in the shipped drawer is a
     * `right-action` row that ends in one. Turn it off for a row that toggles or
     * fires in place rather than navigating — a row with a `control` is already off.
     */
    chevron?: boolean
    /**
     * `button` unless the row's destination is a URL, in which case `a` + `href` — a row
     * that navigates should be middle-clickable, copyable and announced as a link.
     *
     * `div` is the fourth case the DS drawer does not have but its sub-screens do: a row
     * that only *reports* something (a size, a count) and does nothing when pressed. It
     * keeps the row's geometry and loses the pointer cursor, because a control that
     * cannot be operated should not offer itself as one.
     */
    as?: 'div' | 'button' | 'a'
    href?: string
}

/**
 * One drawer row. `ListLeadingTile` hardcodes an Indigo tile because that is what its
 * own Figma exemplar ships; the drawer uses eight different tokens across its rows, so
 * each row hands the tile a value through `--tevi-left-bar-tile` / `-glyph`.
 * Unset, the component's own default stays intact everywhere else.
 */
function LeftBarRow({
    className,
    title,
    subtitle,
    subtitleId,
    icon,
    tile,
    glyph,
    brand,
    trailing,
    control,
    rule,
    chevron,
    as: asProp,
    ...props
}: LeftBarRowProps) {
    // A row that owns a control is a container, not a control — see `control` above.
    const as = asProp ?? (control ? 'div' : 'button')
    // On by default, as every row in the shipped drawer is; off by default for a row
    // whose trailing *is* the affordance, since there is nothing to drill into.
    const showChevron = chevron ?? control === undefined
    const rightAction = showChevron || trailing !== undefined || control !== undefined
    return (
        <ListRow
            as={as}
            rightAction={rightAction}
            className={cn('text-start no-underline', as !== 'div' && 'cursor-pointer', className)}
            {...props}
        >
            <ListRowLeading>
                {brand ? (
                    <LeftBarBrand>{brand}</LeftBarBrand>
                ) : (
                    <ListLeading
                        variant="rounded"
                        style={
                            {
                                '--tevi-left-bar-tile': tile,
                                '--tevi-left-bar-glyph': glyph,
                            } as CSSProperties
                        }
                    >
                        <ListLeadingTile>{icon ? <Icon size={20} {...icon} /> : null}</ListLeadingTile>
                    </ListLeading>
                )}
            </ListRowLeading>
            <ListRowContent>
                {rule && <ListRowRule />}
                <ListRowAccessory rightAction={rightAction}>
                    <ListRowText rightAction={rightAction}>
                        <ListRowTitleRow>
                            <ListRowTitle>{title}</ListRowTitle>
                        </ListRowTitleRow>
                        {subtitle !== undefined && (
                            <ListRowSubtitle id={subtitleId}>{subtitle}</ListRowSubtitle>
                        )}
                    </ListRowText>
                    {rightAction && (
                        <ListRowTrailing
                            variant={control ? 'toggle' : undefined}
                            className={cn('text-(--icon-secondary)', control ? '' : 'gap-1')}
                        >
                            {control ?? trailing}
                            {/* A drilldown chevron points the way the list reads, so it
                                mirrors in RTL — the convention `page-back-bar.tsx` uses
                                for every other directional glyph in the app. */}
                            {showChevron && (
                                <Icon name="angle-right" size={20} className="rtl:-scale-x-100" />
                            )}
                        </ListRowTrailing>
                    )}
                </ListRowAccessory>
            </ListRowContent>
        </ListRow>
    )
}

export {
    LeftBar,
    LeftBarBalanceAction,
    LeftBarBalanceActions,
    LeftBarBalanceItem,
    LeftBarBalanceRule,
    LeftBarBalanceStats,
    LeftBarBrand,
    LeftBarList,
    LeftBarProfileContent,
    LeftBarProfileHandle,
    LeftBarProfileMeta,
    LeftBarProfilePlan,
    LeftBarRow,
    LeftBarSection,
    leftBarBrandTileClass,
    leftBarProfileCopyClass,
}
