import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, ElementType, HTMLAttributes, ReactNode } from 'react'

/**
 * List — Figma "List", ported 1:1.
 *
 * **Partial port.** The List set has 19 `data-variant` values across rows, headers,
 * swipe actions, program rows and user items. What is here is `List/Action`'s row
 * plus its leading, rule and separator parts — the slice the Left Bar assembles
 * over. Everything else is absent rather than approximated.
 *
 * Geometry: the row is full-width with 0/16 padding; the leading and edit slots are
 * both a fixed 48; the text block carries the 12/0 vertical padding, so row height
 * comes from content (48 minimum via the accessory) rather than being pinned.
 *
 * `rightAction` flips the accessory from a centred column (gap 10 — Figma's raw
 * itemSpacing, no variable bound) to a row that puts a trailing control beside the
 * text.
 */

export type ListRowProps = HTMLAttributes<HTMLElement> & {
    rightAction?: boolean
    /**
     * Figma draws the row as a frame, so `div` is the default. Pass `'button'` when
     * the whole row is the control — a menu entry, a picker option — so it is
     * keyboard-reachable instead of a div with an onClick. Pass `'a'` when the row's
     * destination is a URL: a row that goes somewhere should be middle-clickable,
     * copyable and announced as a link, which a button can never be.
     *
     * **A component is allowed too, and `next/link` is the reason.** A bare `'a'` to an
     * internal route is a full document load: the router cache, the query cache and the
     * scroll position all go. `as={Link}` renders the same `<a>` with the same semantics
     * *and* keeps the navigation client-side, so a row that goes somewhere in this app
     * should use it. `ElementType` costs the per-tag prop typing, which is why the three
     * literals stay in the union — they are the common cases and they keep their types.
     *
     * This axis is not the design system's. Figma draws one frame; the tag is this repo's
     * adaptation, so widening it is not a departure from the DS.
     */
    as?: 'div' | 'button' | 'a' | ElementType
    /** With `as="a"`. Not in `HTMLAttributes`, hence declared. */
    href?: string
    /**
     * With `as="button"`. Not in `HTMLAttributes` either, hence declared.
     *
     * The DS ships no disabled *style* for a row, so the caller paints it — this only forwards
     * the native attribute, which is what takes the row out of the tab order and stops it
     * firing. A row that leads nowhere yet is the case (see `BalanceActionRows`).
     */
    disabled?: boolean
}

function ListRow({ className, rightAction, as: As = 'div', ...props }: ListRowProps) {
    return (
        <As
            data-slot="list-row"
            data-right-action={rightAction ? 'true' : undefined}
            type={As === 'button' ? 'button' : undefined}
            className={cn('flex w-full items-center px-4 py-0', className)}
            {...props}
        />
    )
}

/** The fixed 48 slot before the text. */
function ListRowLeading({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-row-leading"
            className={cn('flex w-[48px] flex-none items-center', className)}
            {...props}
        />
    )
}

/** Holds the rule and the accessory; `relative` is what the rule positions against. */
function ListRowContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-row-content"
            className={cn('relative flex min-w-0 flex-1 flex-col', className)}
            {...props}
        />
    )
}

function ListRowAccessory({
    className,
    rightAction,
    ...props
}: ComponentPropsWithoutRef<'div'> & { rightAction?: boolean }) {
    return (
        <div
            data-slot="list-row-accessory"
            className={cn(
                'flex min-h-[48px] w-full',
                rightAction
                    ? 'flex-row items-center gap-2'
                    : 'flex-col items-start justify-center gap-[10px]',
                className,
            )}
            {...props}
        />
    )
}

function ListRowText({
    className,
    rightAction,
    ...props
}: ComponentPropsWithoutRef<'div'> & { rightAction?: boolean }) {
    return (
        <div
            data-slot="list-row-text"
            className={cn(
                'flex flex-col justify-center px-0 py-3',
                rightAction ? 'w-auto min-w-0 flex-1' : 'w-full',
                className,
            )}
            {...props}
        />
    )
}

function ListRowTitleRow({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-row-title-row"
            className={cn('flex w-full min-w-0 items-center gap-1', className)}
            {...props}
        />
    )
}

function ListRowTitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-row-title"
            className={cn('type-body-strong text-(--text-title)', className)}
            {...props}
        />
    )
}

function ListRowSubtitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-row-subtitle"
            className={cn('type-dense-default text-(--text-subtitle)', className)}
            {...props}
        />
    )
}

/**
 * `variant="toggle"` is the DS's own `.tevi-list-trailing[data-variant='toggle']`: gap 0
 * and `align-items: flex-start`.
 *
 * **`items-start` is a no-op, and is reproduced anyway.** In the DS this container holds
 * exactly one 28px switch, so the child *is* the container's height and there is nothing
 * to align against — verified in `preview/list.html`, where the toggle trailing has a lone
 * `<button role="switch">` inside it. It is kept because the stylesheet is the contract; it
 * is documented because the obvious reading ("the switch sticks to the top of a two-line
 * row") is wrong. On a two-line row the accessory's own `items-center` wins and the switch
 * is centred — which is what a settings row should look like, and what the DS would produce.
 */
function ListRowTrailing({
    className,
    variant,
    ...props
}: ComponentPropsWithoutRef<'div'> & { variant?: 'toggle' }) {
    return (
        <div
            data-slot="list-row-trailing"
            data-variant={variant}
            className={cn(
                'flex flex-none',
                variant === 'toggle' ? 'items-start gap-0' : 'items-center',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The hairline between rows. It is absolutely positioned inside the row's content
 * box, not a border on the row — that is how it starts after the 48px leading slot
 * instead of running the full width. Give it to every row but the first in a list.
 */
function ListRowRule({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-row-rule"
            aria-hidden="true"
            className={cn('absolute inset-x-0 top-0 h-px bg-(--separator-default)', className)}
            {...props}
        />
    )
}

export type ListLeadingVariant = 'default' | 'fill' | 'circular' | 'rounded'

/**
 * The 48×48 leading box. `rounded` is the drawer's variant: an 8px-cornered box
 * holding a 32px tile.
 */
function ListLeading({
    className,
    variant = 'default',
    ...props
}: ComponentPropsWithoutRef<'div'> & { variant?: ListLeadingVariant }) {
    return (
        <div
            data-slot="list-leading"
            data-variant={variant === 'default' ? undefined : variant}
            className={cn(
                'flex size-[48px] flex-none items-center text-(--text-body)',
                variant === 'default' && 'rounded-[var(--radius-none)]',
                (variant === 'fill' || variant === 'circular') && 'overflow-hidden',
                variant === 'circular' && 'rounded-[var(--radius-fill)]',
                variant === 'rounded' && 'rounded-[var(--spacing-2)]',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The 32px coloured tile inside a `rounded` leading box. Its paint comes from two
 * custom properties so a host can theme each row without a class per colour; unset,
 * it keeps the DS default (Indigo on White) that Figma's own exemplar ships.
 *
 * The property names are the DS's own — `--tevi-left-bar-tile` / `-glyph`, named for
 * the component that introduced them — so markup copied out of a DS preview or a
 * design comp keeps working. Renaming them to something tidier would break that
 * silently: the custom property would just never match and every tile would fall
 * back to Indigo.
 */
function ListLeadingTile({
    className,
    children,
    ...props
}: ComponentPropsWithoutRef<'span'> & { children?: ReactNode }) {
    return (
        <span
            data-slot="list-leading-tile"
            className={cn(
                'flex size-[32px] flex-none items-center justify-center rounded-[var(--spacing-2)]',
                'bg-[var(--tevi-left-bar-tile,var(--accents-indigo-active))] text-[var(--tevi-left-bar-glyph,var(--white))]',
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}

const listLeadingImageClass = 'block size-full object-cover'

/* ========================= List/Information — Figma 50:15082 ========================= */

/**
 * The label-and-value row: Title on the left, Value on the right, one line.
 *
 * A **third** row shape in this file, and, like `ListUserItem`, a different component
 * rather than a variant of `ListRow`. `ListRow` is built around a 48px leading slot and a
 * two-line text block; this has neither — it is a single 24px line box centred in a 48px
 * row, with no leading column at all, so the rule runs the full content width.
 *
 * What it is *for* is a spec: a stack of facts about one thing, where the eye reads down
 * the left for the label and down the right for the figure. A price breakdown, a transaction
 * summary, a day's earnings split by category.
 *
 * ## The two colours are the wrong way round from what you would guess
 *
 * `Title` is **`--text-subtitle`** and `Value` is **`--text-title`** — the label is the
 * quieter of the two. That is deliberate and it is what makes the column scannable: the
 * labels are known and repeated, the numbers are what changed. Reproduced verbatim from
 * Figma; getting it backwards makes every row shout its own label.
 *
 * ## Reading the parts
 *
 * ```tsx
 * <ListInfo>
 *   <ListInfoContent>
 *     <ListRowRule />
 *     <ListInfoAccessory>
 *       <ListInfoLine>
 *         <ListInfoTitleGroup><ListInfoTitle>Membership</ListInfoTitle></ListInfoTitleGroup>
 *         <ListInfoValue>$42.00</ListInfoValue>
 *       </ListInfoLine>
 *     </ListInfoAccessory>
 *   </ListInfoContent>
 * </ListInfo>
 * ```
 *
 * `ListRowRule` is shared with the other two rows — the same `.tevi-list-rule`, absolutely
 * positioned inside the content column. Give it to every row but the first.
 *
 * **Not ported:** `.tevi-list-info__question` (a `--text-body` recolour for a title that is
 * a question) and `.tevi-list-info__right-icon` (an Indigo trailing glyph). Both are single
 * declarations a caller can pass through `className`, and neither has a screen yet.
 */
function ListInfo({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-info"
            className={cn('flex w-full items-center px-4 py-0', className)}
            {...props}
        />
    )
}

/** Holds the rule and the accessory; `relative` is what the rule positions against. */
function ListInfoContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-info-content"
            className={cn('relative flex min-w-0 flex-1 flex-col', className)}
            {...props}
        />
    )
}

/** The 48px row floor. The line inside it is 24, so it is centred with 12 either side. */
function ListInfoAccessory({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-info-accessory"
            className={cn('flex min-h-[48px] w-full flex-col justify-center', className)}
            {...props}
        />
    )
}

/** The 24px line box: title group on the left, value hard against the right. */
function ListInfoLine({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-info-line"
            className={cn('flex h-[24px] w-full min-w-0 items-center gap-1', className)}
            {...props}
        />
    )
}

/** Takes the slack, so the value is pushed to the end and the title truncates first. */
function ListInfoTitleGroup({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-info-title-group"
            className={cn('flex min-w-0 flex-1 items-center gap-1', className)}
            {...props}
        />
    )
}

function ListInfoTitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-info-title"
            className={cn('type-body-default text-(--text-subtitle)', className)}
            {...props}
        />
    )
}

function ListInfoValue({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-info-value"
            className={cn('type-body-emphasis text-(--text-title)', className)}
            {...props}
        />
    )
}

/* ========================= List/Header — Figma 2068:9169 ========================= */

/**
 * The section header that owns the rows under it: a title, an optional supertitle and
 * subtitle, an optional trailing action, and a hairline along the bottom edge.
 *
 * ## The rule is an `::after`, not a `border-bottom`
 *
 * Figma draws it 0.5px **centre-aligned on the boundary**, so it straddles the edge and
 * does not grow the box — the measured height stays exactly 48 (54 at Extra Prominent). A
 * real border adds its pixel, and these rows are pinned to those heights. Hence the
 * absolutely-positioned pseudo-element at `bottom: -0.25px`. Chromium snaps a 0.5px line
 * to one device pixel at DPR 1; the declared value is the DS's and is kept.
 *
 * `rule={false}` drops it, for the callers that have nothing to divide — a header on a
 * phone screen whose content is already a stack of bordered cards would just draw a
 * second edge.
 *
 * ## The three variants are two decisions
 *
 *   nested           h48, title 16/600 in **Text - Body**, bottom-aligned and centred.
 *                    Figma gives it no trailing slot.
 *   prominent        h48, title 16/600 in Text - Title. The default, and the one the
 *                    project rule in the design workspace says to reach for.
 *   extra-prominent  h54, title 20/700 in Text - Title.
 *
 * The heights are not set here: 12/16 padding around a 24px line box *is* 48, and around
 * a 30px one is 54. Pinning `h-[48px]` on top would fight the padding the moment a
 * subtitle appears — which is a real state (`__subtitle` exists), and Figma grows the row
 * for it.
 */
export type ListHeaderVariant = 'nested' | 'prominent' | 'extra-prominent'

/**
 * The variant's typography lives on the **root**, and `ListHeaderTitle` inherits it.
 *
 * The alternative was a `variant` prop on both, which is two places to keep in step and a
 * silent wrong render when they drift. Inheriting means the variant is stated once. It
 * works because the other two text slots carry their own `.type-*` class, which wins over
 * the inherited one — and because the `.type-*` utilities are plain classes in
 * `@layer components`, so Tailwind cannot generate a `group-data-*` variant of them and a
 * selector-based version of this is not available.
 */
const LIST_HEADER_VARIANT: Record<ListHeaderVariant, string> = {
    nested: 'type-body-strong items-end justify-center text-(--text-body)',
    prominent: 'type-body-strong text-(--text-title)',
    'extra-prominent': 'type-title-t2-bold text-(--text-title)',
}

function ListHeader({
    className,
    variant = 'prominent',
    rule = true,
    ...props
}: ComponentPropsWithoutRef<'div'> & { variant?: ListHeaderVariant; rule?: boolean }) {
    return (
        <div
            data-slot="list-header"
            data-variant={variant}
            className={cn(
                'relative flex w-full items-center justify-between px-4 py-3',
                LIST_HEADER_VARIANT[variant],
                rule &&
                    "after:absolute after:inset-x-0 after:-bottom-[0.25px] after:h-[0.5px] after:bg-(--separator-default) after:content-['']",
                className,
            )}
            {...props}
        />
    )
}

/** The text column. `flex-1` + `min-w-0` so a long title truncates instead of shoving the action off. */
function ListHeaderDesc({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-header-desc"
            // gap 2 is Figma's `itemSpacing`, bound to no variable — hence the literal.
            className={cn('flex min-w-0 flex-1 flex-col items-start gap-[2px]', className)}
            {...props}
        />
    )
}

function ListHeaderText({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-header-text"
            className={cn('flex flex-col items-start', className)}
            {...props}
        />
    )
}

/**
 * The title. Carries no size, weight or ink of its own — all three are inherited from
 * `ListHeader`'s variant class, so the variant is stated once. See `LIST_HEADER_VARIANT`.
 *
 * `as` exists because a section header is often a real heading in the document outline, and the DS
 * port cannot know which level: Figma draws a frame with text in it, and whether that text is an
 * `h2` depends on what is around it. `span` stays the default, so a purely decorative header — a
 * month divider inside a list, say — does not inject a phantom heading into the outline.
 *
 * `h1` is in the union for the screens whose *only* title is a list header — a tab destination has
 * no `PageBackBar` to put one in, so `/following`'s "Following" header is the document's outline
 * root. The alternative is an `sr-only` `<h1>` on the page saying the same word twice.
 */
function ListHeaderTitle({
    className,
    as: As = 'span',
    ...props
}: ComponentPropsWithoutRef<'span'> & { as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' }) {
    return (
        <As
            data-slot="list-header-title"
            className={cn(
                // `m-0` because a real heading arrives with the browser's own margins, which would
                // break the 48px row the variant class is sized for.
                'm-0 text-inherit [font-size:inherit] [font-weight:inherit] [letter-spacing:inherit]',
                className,
            )}
            {...props}
        />
    )
}

/** Both the supertitle and the subtitle are 14/400 in Text - Body — one component, two slots. */
function ListHeaderSubtitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-header-subtitle"
            className={cn('type-dense-default text-(--text-body)', className)}
            {...props}
        />
    )
}

/** The trailing slot — a filter button, an "edit", a count. `flex-none`, so it never shrinks. */
function ListHeaderAction({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-header-action"
            className={cn('flex flex-none items-center', className)}
            {...props}
        />
    )
}

/* ========================= List/User Item — Figma 2089:2965 ========================= */

/**
 * The 80px person row: avatar, then a name / handle / meta stack, then an optional
 * trailing control.
 *
 * A **different component** from `ListRow` above, not a variant of it, and the geometry is
 * why: `ListRow` pads 0/16 and takes its height from its content over a 48px floor, while
 * this one pins the row at 80 and splits the horizontal padding between two columns
 * (avatar `16/8`, content `0/16`) so the hairline starts after the avatar. Trying to
 * express both through one set of props produces a component whose every prop is "…except
 * in the other mode".
 *
 * `data-muted` and `data-pinned` are the DS's own two axes and are ported as props.
 * They are Direct Messages' axes — a muted conversation, a pinned one — and nothing on the
 * blocked-accounts screen sets either. They are here because the port is of the component,
 * not of the first screen to need it; leaving them out would mean the next caller
 * re-derives them from Figma.
 *
 * ## Reading the parts
 *
 * ```tsx
 * <ListUserItem>
 *   <ListUserItemAvatar>…48px avatar…</ListUserItemAvatar>
 *   <ListUserItemContent>
 *     <ListRowRule />
 *     <ListUserItemPreview>
 *       <ListUserItemInfo>
 *         <ListUserItemNameRow>…name + badges…</ListUserItemNameRow>
 *         <ListUserItemHandle>@slug</ListUserItemHandle>
 *         <ListUserItemMeta>Blocked on …</ListUserItemMeta>
 *       </ListUserItemInfo>
 *       <ListUserItemCta>…button…</ListUserItemCta>
 *     </ListUserItemPreview>
 *   </ListUserItemContent>
 * </ListUserItem>
 * ```
 *
 * `ListRowRule` goes on every row **but the first**, as it does in `ListRow`.
 *
 * `ListRowRule` is shared with `ListRow` — it is the same `.tevi-list-rule`, absolutely
 * positioned inside the content column, which is what makes it start after the avatar
 * rather than running the full width.
 *
 * **Not ported:** `List/User Item with Action` (2089:7902), the swipe-action strip. It is a
 * gesture surface with no keyboard or pointer equivalent drawn in Figma, so porting it
 * would mean inventing the interaction, and this screen's action is a plain button.
 *
 * ⚠ **The row paints `--background-listing`, which is `--black` in Dark — the same value as
 * `--background`.** That is Figma's own intent and it is right for what Figma drew: a list
 * that *is* the screen, where there is no card edge to lose. Drop this row into an elevated
 * card and it repaints the page colour over it, so the card disappears in Dark and only in
 * Dark. A host in that position overrides with `className="bg-(--background-surface)"` — see
 * `features/channel/components/blocked-account-row.tsx`, which also has to swap the hover,
 * since `--background-subtle` and `--background-surface` are the same `#18181b` there.
 */
function ListUserItem({
    className,
    muted,
    pinned,
    ...props
}: ComponentPropsWithoutRef<'div'> & { muted?: boolean; pinned?: boolean }) {
    return (
        <div
            data-slot="list-user-item"
            data-muted={muted ? '' : undefined}
            data-pinned={pinned ? '' : undefined}
            className={cn(
                'relative flex w-full items-stretch',
                pinned ? 'bg-(--background-subtle)' : 'bg-(--background-listing)',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The avatar column — 16 before, 8 after, 8 above and below, so a 48px avatar occupies
 * 16 + 48 + 8 = 72 and the content column starts at 72.
 *
 * `items-start`, so the avatar hangs from the top of the row rather than centring against
 * a text block whose height depends on how many lines it has.
 */
function ListUserItemAvatar({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-avatar"
            className={cn('relative flex flex-none items-start py-2 pe-2 ps-4', className)}
            {...props}
        />
    )
}

/**
 * The pin mark, over the avatar's top-right corner.
 *
 * Figma places it at x 48 / y 4 **inside the avatar column** — i.e. measured from the
 * column's edge, not the avatar's — which is why it is `start-[48px]` and not an inset
 * offset. The 1px ring is `--background`, so it reads as a cut-out against the row.
 */
function ListUserItemPin({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-user-item-pin"
            className={cn(
                'absolute top-1 start-[48px] flex size-[20px] items-center justify-center',
                'rounded-[var(--radius-fill)] border border-(--background)',
                'bg-(--accents-indigo-active) text-(--white)',
                className,
            )}
            {...props}
        />
    )
}

/** The column the rule and the preview share. `relative` is what the rule positions against. */
function ListUserItemContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-content"
            className={cn('relative flex min-w-0 flex-1 flex-col', className)}
            {...props}
        />
    )
}

/**
 * The 80px band itself: text on the start side, an optional CTA on the end side.
 *
 * `items-start` is Figma's, and it is drawn for the **three-line** row. A row with only two
 * of those lines leaves 21px of air under the text and looks bottom-heavy, so pass
 * `className="items-center"` for that case — a deliberate override of the comp rather than
 * a second variant, because Figma has not drawn one.
 *
 * ⚠ **The three-line stack is 2px taller than the box it sits in, and that is the DS's own
 * arithmetic**: name 16×1.5 = 24, handle and meta 14×1.5 = 21 each, so 66 inside 80 − 8 − 8
 * = 64. Reproduced rather than corrected — the height, the padding and the three line
 * heights are all bound tokens in Figma, so "fixing" it means picking which one to
 * contradict. What is clipped is 2px of the meta line's *leading*, not its glyphs, and only
 * when an ancestor hides the overflow. Do not raise the height to 82 to make the number
 * come out: every other row in the DS list family is 48 or 80, and one that is 82 is worse
 * than one whose last line has 2px less air.
 *
 * The 10px gap is Figma's raw `itemSpacing` with no variable bound to it, like the one in
 * `ListRowAccessory`.
 */
function ListUserItemPreview({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-preview"
            className={cn(
                'flex h-[80px] items-start gap-[10px] py-2 pe-4 ps-0',
                className,
            )}
            {...props}
        />
    )
}

/** The text stack. Must be able to shrink, or a long display name pushes the CTA off the row. */
function ListUserItemInfo({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-info"
            className={cn('flex min-w-0 flex-1 flex-col items-start', className)}
            {...props}
        />
    )
}

/**
 * The name and whatever sits beside it — the verified mark, the mute glyph.
 *
 * Figma nests a `__username-row` around a `__header` around a `__name-row`, where the outer
 * row exists solely to park the mute glyph beside the name/handle pair when `Muted` is on
 * (`align-items` flips to `flex-start` there). That is three flex containers for one
 * arrangement; this port keeps the two that carry geometry and drops the middle one, which
 * has no padding, no gap and no size of its own. Nothing measurable changes.
 */
function ListUserItemNameRow({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-name-row"
            className={cn('flex min-w-0 items-center gap-1', className)}
            {...props}
        />
    )
}

/**
 * The display name — 16/semibold in Text - Title.
 *
 * `premium` paints it with `--gradient-premium-name`, the token the DS shares between this,
 * Conversation List and Card. ⚠ Same trap as `CardUserHeaderName`: the gradient makes the
 * text's own `color` transparent, so a `text-*` class is silently ignored while `premium`
 * is set and any glyph inlined *inside* the name loses its paint. Badges go in the row
 * beside it, never inside it.
 *
 * `truncate` is not in Figma — every text node there is `WIDTH_AND_HEIGHT`, i.e. the frame
 * grows to fit. It is added because a real display name is user input.
 */
function ListUserItemName({
    className,
    premium,
    ...props
}: ComponentPropsWithoutRef<'span'> & { premium?: boolean }) {
    return (
        <span
            data-slot="list-user-item-name"
            data-premium={premium ? '' : undefined}
            className={cn(
                'min-w-0 truncate type-body-strong',
                premium
                    ? '[background-image:var(--gradient-premium-name)] bg-clip-text text-transparent'
                    : 'text-(--text-title)',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `@handle` — 14/regular in Text - Subtitle.
 *
 * ## ⚠ The children are wrapped in `<bdi>`, and it is a correctness fix rather than a port
 *
 * A handle is a **Latin identifier inside a paragraph whose direction is the reader's**, and `@` is
 * a bidi-neutral character. Under `ar` the Unicode algorithm therefore puts it on the *trailing*
 * side of the Latin run and the line renders **`ada@`** — on every row in the app that draws one:
 * `/search`, `/following`, the blocked list, the follow-request queue, membership holdings and the
 * gift-premium picker, all six of which reach this primitive.
 *
 * The DS cannot express this — Figma has no bidi — so it is not a deviation from it. What the fix
 * had to be was **measured**, because the obvious candidate is wrong (420px viewport, `dir="rtl"`,
 * one `@ada` per mechanism):
 *
 * | | reads | stays on the row's edge |
 * |---|---|---|
 * | plain | `ada@` ✗ | ✓ |
 * | `dir="ltr"` | `@ada` ✓ | **✗ — jumps to the opposite edge** |
 * | `dir="auto"` | `@ada` ✓ | **✗ — same jump** |
 * | **`<bdi>`** | `@ada` ✓ | **✓** |
 * | `unicode-bidi: isolate` alone | `ada@` ✗ | ✓ |
 *
 * `dir` on the element changes its **alignment** as well as its ordering, so the handle would have
 * left-aligned under a right-aligned name — two lines of one identity no longer sharing an edge.
 * `isolate` alone does nothing here: it stops the run affecting its *neighbours*, not its own order.
 * `<bdi>` is `isolate` **plus** `dir="auto"` scoped to the run, which is exactly the one thing
 * needed and nothing else.
 *
 * Nothing changes in an LTR locale — the element is already `ltr`, so `<bdi>` is inert there.
 */
function ListUserItemHandle({
    className,
    children,
    ...props
}: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-user-item-handle"
            className={cn(
                'w-full min-w-0 truncate type-dense-default text-(--text-subtitle)',
                className,
            )}
            {...props}
        >
            <bdi>{children}</bdi>
        </span>
    )
}

/**
 * The third line — 14/regular in Text - **Body**, a step darker than the handle above it.
 * Figma uses it for "Last activity 1 month ago".
 */
function ListUserItemMeta({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-user-item-meta"
            className={cn(
                'w-full min-w-0 truncate type-dense-default text-(--text-body)',
                className,
            )}
            {...props}
        />
    )
}

/** A muted-notifications glyph beside the name, in Text - Placeholder. */
function ListUserItemMute({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="list-user-item-mute"
            className={cn('flex flex-none text-(--text-placeholder)', className)}
            {...props}
        />
    )
}

/**
 * The trailing control slot.
 *
 * It centres its own children but is itself laid out by `ListUserItemPreview`'s
 * `items-start`, so a control shorter than 64px sits against the top of the row. Add
 * `self-center` when it should sit against the middle — which is what a single button
 * wants, and what the `items-center` note on `ListUserItemPreview` makes unnecessary for
 * a two-line row.
 */
function ListUserItemCta({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="list-user-item-cta"
            className={cn('flex flex-none items-center', className)}
            {...props}
        />
    )
}

export type ListSeparatorSize = 'medium' | 'large'

/** A full-bleed divider between blocks — 1px at `medium`, a 6px band at `large`. */
function ListSeparator({
    className,
    size = 'medium',
    ...props
}: ComponentPropsWithoutRef<'div'> & { size?: ListSeparatorSize }) {
    return (
        <div
            data-slot="list-separator"
            data-size={size}
            role="separator"
            className={cn(
                'block w-full border-0 border-solid border-(--separator-default)',
                size === 'medium' ? 'h-px border-t' : 'h-[6px] border-t-[6px]',
                className,
            )}
            {...props}
        />
    )
}

export {
    ListHeader,
    ListHeaderAction,
    ListHeaderDesc,
    ListHeaderSubtitle,
    ListHeaderText,
    ListHeaderTitle,
    ListInfo,
    ListInfoAccessory,
    ListInfoContent,
    ListInfoLine,
    ListInfoTitle,
    ListInfoTitleGroup,
    ListInfoValue,
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
    ListSeparator,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemMeta,
    ListUserItemMute,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPin,
    ListUserItemPreview,
    listLeadingImageClass,
}
