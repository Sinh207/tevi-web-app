'use client'

import { RISE, riseDelay } from '@shared/lib/motion'
import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import {
    ListHeader,
    ListHeaderAction,
    ListHeaderDesc,
    ListHeaderText,
    ListHeaderTitle,
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
} from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import type { ReactNode, Ref } from 'react'

/**
 * A ledger — a month-grouped, paginated list of movements with a sticky header and a filter slot.
 *
 * ## Props only, and that is the whole point of it living here
 *
 * `/my-star` and `/my-wallet` are two independent features. They read **different endpoints** with
 * **different filter vocabularies** in **different units**, so neither can own the other's ledger —
 * but the *presentation* is one thing, and legacy proves what happens when it is copied: its two
 * ledger components are ~300 near-identical lines each and have already drifted (the currency one
 * reuses the Star one's resize-observer id).
 *
 * So this file knows nothing about billy, about `TVS`, about currencies or about transaction types.
 * It takes rows that are already formatted and already labelled. Each feature maps its own DTO into
 * `LedgerRowModel` and supplies its own filter control. That keeps `shared/` free of any import from
 * `features/` — the rule — while leaving exactly one copy of the layout.
 *
 * ## The states are the caller's to choose, not inferred
 *
 * `LedgerPanel` renders whichever of `loading` / `error` / `empty` / rows it is given, because only
 * the feature's hook knows the difference between "no transactions" and "no transactions *matching
 * this filter*" — and those need different copy. Inferring from `rows.length === 0` here would
 * collapse them, which is legacy's bug: it shows "you have no activity" to somebody who has merely
 * filtered.
 */

/** One movement, already formatted for display. Nothing here is parsed or converted. */
export interface LedgerRowModel {
    /** List key. Must be stable across pages — never an array index. */
    id: string
    /** The row's own words: a backend description, or a translated type label. */
    title: string
    /** When it happened, formatted. Dropped from the row when empty. */
    subtitle?: string
    /** The signed figure, formatted with its unit — `+500`, `-₫6,350,000`. */
    amount: string
    /** `true` for money in, `false` for money out. Decides the amount's colour. */
    isCredit: boolean
    /** The glyph in the row's 40px leading disc. */
    icon: TeviIconName
    /**
     * A raster mark beside the amount, for units whose symbol is an image rather than a character —
     * the Tevi Star. `{ src, size }` so the caller keeps control of the asset.
     */
    amountMark?: { src: string; size: number }
    /**
     * A second figure under the amount — today the Tevi Coin bonus a movement earned.
     *
     * Fully formed by the caller: the label is a translation, the amount is already signed and
     * formatted in the reader's locale, and the mark is a `{ src, size }` like `amountMark`. This
     * component therefore does not need to know what Tevi Coin is, which is what keeps a *shared*
     * component free of a product fact — the same division `amountMark` already draws.
     *
     * Absent, not zero, when a row has no bonus: most rows do not have one, and an empty second line
     * would put a blank under every amount in the column.
     */
    bonus?: { label: string; amount: string; mark: { src: string; size: number } }
}

/** A month's worth of rows. The label is the caller's, formatted in the reader's locale. */
export interface LedgerGroupModel {
    /** Locale-independent identity, so a language switch does not re-bucket the list. */
    key: string
    label: string
    rows: LedgerRowModel[]
}

/**
 * One ledger row.
 *
 * Exported on its own because `/dev/*` previews it directly — the real screens need a signed-in
 * account that has actually transacted, which is the same reason `BlockedAccountRow` is exported.
 */
export function LedgerRow({
    row,
    /** Draw the hairline above this row — every row but the first in its group. */
    rule,
    /**
     * Open this movement's detail sheet. Omit and the row is static text.
     *
     * A real `<button>` when present, never a `div` with a handler — `ListRow` documents the
     * distinction and `ActionRows` makes the same call: a row that is not a URL still has to be
     * keyboard-reachable, which a `div` is not. `web-app` sets `cursor: pointer` on a `Grid` and
     * loses the keyboard entirely.
     */
    onPress,
    testId,
}: {
    row: LedgerRowModel
    rule?: boolean
    onPress?: () => void
    /**
     * The row's own `data-testid`. Paired with `data-ledger-id={row.id}` — the entry's id goes in a
     * companion attribute, never into the id string, because a ledger id is a wire value that can
     * contain `-` and a prefix selector cannot be split back out of it (`shared/lib/test-id.ts`).
     */
    testId?: string
}) {
    return (
        <ListRow
            as={onPress ? 'button' : 'div'}
            onClick={onPress}
            data-testid={testId}
            data-ledger-id={row.id}
            rightAction
            className={cn(
                onPress &&
                    'cursor-pointer text-start hover:bg-(--button-ghost-bg-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)',
            )}
        >
            <ListRowLeading>
                {/*
                 * A 40px disc, not the DS's 48px `ListLeading` box: the comps draw a ledger row with
                 * a circular 40 on Background/Segment, which is a different part from the squared
                 * 32-inside-48 tile an action row uses. Using the tile here would make the two lists
                 * look like one list with inconsistent icons.
                 */}
                <span
                    /*
                     * Brand-tinted, which is `web-app`'s treatment and **not** the comp's: the comp
                     * draws this disc on Background/Segment (grey) and the glyph is what the
                     * divergence is really about — a ledger's leading column reads as the app's own
                     * when it carries the brand, and grey-on-grey made every row look disabled next
                     * to the coloured action tiles above it. Chosen deliberately over the comp, the
                     * same call as the **View all** link's colour; both tokens carry the arithmetic.
                     */
                    className={cn(
                        'flex size-[40px] flex-none items-center justify-center rounded-full',
                        /*
                         * `--text-on-brand`, **not** `--text-brand`: the ground here is the tinted
                         * disc, not the page. Sharing one token left Dark's glyph at 3.14:1 on its
                         * own disc — see both tokens in `globals.css`, which carry the numbers.
                         */
                        'bg-(--background-brand) text-(--text-on-brand)',
                    )}
                >
                    <Icon name={row.icon} size={20} />
                </span>
            </ListRowLeading>
            <ListRowContent>
                {rule && <ListRowRule />}
                {/*
                 * `rightAction` on **both**, and it is load-bearing rather than symmetry: without it
                 * `ListRowText` takes `w-full` instead of `min-w-0 flex-1`, so a long description
                 * pushes the amount clean off the row — measured at 97px past the card's right edge,
                 * leaving a sliver of the figure visible. The amount is the reason the row exists.
                 */}
                <ListRowAccessory rightAction>
                    <ListRowText rightAction>
                        <ListRowTitleRow>
                            {/* `truncate`, not a clamp: a long title must not push the amount off,
                                and one line keeps the rows on a common rhythm. */}
                            <ListRowTitle className="truncate">{row.title}</ListRowTitle>
                        </ListRowTitleRow>
                        {row.subtitle && <ListRowSubtitle>{row.subtitle}</ListRowSubtitle>}
                    </ListRowText>
                    {/*
                     * `flex-col items-end` **only when there is a bonus**, so a row without one keeps
                     * the DS's single-line trailing exactly as it was. `web-app` stacks the two the
                     * same way (`transactionItem/index.js`: the bonus `Stack` follows the amount
                     * inside one column), and the figures right-align because the column does.
                     */}
                    <ListRowTrailing
                        className={cn('gap-1', row.bonus && 'flex-col items-end gap-0.5')}
                    >
                        <span className="flex items-center gap-1">
                            {row.amountMark && (
                                <Image
                                    src={row.amountMark.src}
                                    alt=""
                                    aria-hidden
                                    width={row.amountMark.size}
                                    height={row.amountMark.size}
                                    className="block flex-none"
                                />
                            )}
                            <span
                                /*
                                 * ## `dir="ltr"` is an RTL **correctness** fix, not a preference
                                 *
                                 * A leading `+` is bidi class ES (European Separator), which resolves to
                                 * the *paragraph* direction when it is not between two numbers. In Arabic
                                 * that puts it after the digits, so `+500` renders as `500+` and
                                 * `-₫6,350,000` as `₫6,350,000-` — a credit that reads as "500 plus" and
                                 * a debit whose minus has wandered to the wrong end of the figure. On a
                                 * money column that is not cosmetic.
                                 *
                                 * `dir` on an inline element carries `unicode-bidi: isolate` in the HTML
                                 * spec's own UA stylesheet, so this makes the amount one LTR run inside
                                 * the RTL line — the number keeps its direction and the row still
                                 * mirrors. Verified in `ar`.
                                 */
                                dir="ltr"
                                className={cn(
                                    'type-body-strong whitespace-nowrap',
                                    /*
                                     * Legacy's `#45B26B` / `#EF4444` become tokens: a raw hex cannot move
                                     * between Light and Dark, and a deep green on a dark surface is
                                     * exactly where it fails. Same substitution, same reasoning, as
                                     * `channel-owner-actions.tsx`'s green.
                                     *
                                     * The sign is in the string too, so the information never depends on
                                     * colour alone — `docs/DEFINITION_OF_DONE.md` §10, and the case that
                                     * matters is a reader with deuteranopia scanning a column.
                                     */
                                    row.isCredit
                                        ? 'text-(--text-success)'
                                        : 'text-(--accents-error-active)',
                                )}
                            >
                                {row.amount}
                            </span>
                        </span>
                        {row.bonus && (
                            /*
                             * `Bonus: ◎ +10` — legacy's line, in its order.
                             *
                             * ## The **size** is the one deliberate divergence, and it is a ratio
                             *
                             * `web-app` sets the bonus label and figure to **16px** and its own row
                             * amount to **14/600** (`transactionItem/index.js`: `bonusSx`,
                             * `bonusAmountSx`, `getAmountSx`) — so in legacy the bonus is *larger*
                             * than the amount it annotates. This row's amount is `type-body-strong`
                             * (16/600), because that is the DS's trailing type, so copying 16 here
                             * would make the annotation exactly as loud as the figure.
                             *
                             * `type-dense-*` (14) keeps legacy's *relationship* — a quieter second
                             * line — which is also what the product screenshot shows. Reported rather
                             * than silently matched: the absolute number differs from legacy's,
                             * the reading does not.
                             *
                             * Label `--text-body`, figure `--text-success` — the tokens for its
                             * `#666666` / `#009934`. A raw hex cannot cross Light and Dark, and a deep
                             * green on a dark surface is exactly where it fails.
                             *
                             * `dir="ltr"` on the figure for the same bidi reason as the amount above
                             * — a leading `+` is class ES and lands after the digits in Arabic.
                             */
                            <span className="flex items-center gap-1">
                                <span className="type-dense-default text-(--text-body)">
                                    {row.bonus.label}
                                </span>
                                <Image
                                    src={row.bonus.mark.src}
                                    alt=""
                                    aria-hidden
                                    width={row.bonus.mark.size}
                                    height={row.bonus.mark.size}
                                    className="block flex-none"
                                />
                                <span
                                    dir="ltr"
                                    className="type-dense-strong whitespace-nowrap text-(--text-success)"
                                >
                                    {row.bonus.amount}
                                </span>
                            </span>
                        )}
                    </ListRowTrailing>
                </ListRowAccessory>
            </ListRowContent>
        </ListRow>
    )
}

/**
 * The ledger's loading shape.
 *
 * Built from the same `ListRow` parts the real row is, which is a correctness measure rather than
 * tidiness: `EarningsReportSkeleton`'s doc records what happens otherwise — a hand-rolled skeleton
 * measured 70px against the real row's 50px, so every load ended with the list jumping 20px per row.
 * Sharing the components makes the geometry match by construction.
 *
 * `count` is 6 rather than legacy's 10: ten shimmering rows standing in for what may turn out to be a
 * brand-new account's empty ledger is a worse first impression than a short, honest wait.
 *
 * No hooks, so it renders on the server — which is what lets a route's `loading.tsx` use it.
 */
export function LedgerSkeleton({
    count = 6,
    'data-testid': testId,
}: { count?: number } & TestIdProps) {
    return (
        <div aria-busy="true" data-testid={testId} className="flex flex-col">
            {Array.from({ length: count }, (_, index) => index).map((index, position) => (
                <ListRow key={`ledger-skeleton-${index}`} rightAction>
                    <ListRowLeading>
                        {/* A circle, matching the real row's 40px disc rather than a squared tile —
                            the kind of mismatch that is invisible in a screenshot and obvious in
                            motion. */}
                        <Skeleton w={40} h={40} circle delay={position * 160} />
                    </ListRowLeading>
                    <ListRowContent>
                        {position > 0 && <ListRowRule />}
                        <ListRowAccessory rightAction>
                            <ListRowText rightAction>
                                <ListRowTitleRow>
                                    <Skeleton w="60%" delay={position * 160} />
                                </ListRowTitleRow>
                                <Skeleton w="35%" delay={position * 160 + 80} />
                            </ListRowText>
                            <ListRowTrailing>
                                <Skeleton w={64} delay={position * 160} />
                            </ListRowTrailing>
                        </ListRowAccessory>
                    </ListRowContent>
                </ListRow>
            ))}
        </div>
    )
}

/**
 * The panel header's own height, which is what the month header has to clear.
 *
 * `ListHeader` is `py-3` around a `type-body-strong` line (24px), and its trailing slot holds the
 * filter's `size-6` trigger — so 24 + 24 either way. A literal because CSS cannot ask an element how
 * tall it is: the alternative is measuring it every render, and this header's height is fixed by the
 * DS rather than by content.
 */
const PANEL_HEADER_HEIGHT = 48

/**
 * The panel: a sticky header with an action slot, then the groups, then a sentinel.
 *
 * ## The header's trailing slot is an `action`, not a filter
 *
 * It was `filter`, and it held one on both screens. `/my-wallet` now puts a **View all** link there
 * instead — the filter moved to `/my-wallet/transaction-history`, which is the page that shows the
 * whole ledger a filter is asked about — while `/my-star` still passes a `FilterMenu`. One node, two
 * kinds of control, so the prop is named for the slot rather than for what one caller puts in it.
 *
 * ## `showHeader={false}` for a page whose title is already above it
 *
 * `/my-wallet/transaction-history` carries "Transaction history" in its `PageBackBar` and its filter
 * in that bar's `actions` slot — the arrangement legacy's own top bar has. Repeating the same words
 * in a panel header 8px below the bar reads as a rendering bug, so the panel drops its header there
 * and the month labels take over the top sticky position. `title` is still required: it stays the
 * section's `aria-label`, which is the one thing the missing header would otherwise have named.
 *
 * ## The month header is `nested`, and the two sticky offsets are deliberate
 *
 * `nested` is the DS's quieter header variant — 16/600 in Text - Body rather than Text - Title —
 * which is right for a divider inside a panel that already has a Title-weight header of its own. Two
 * Title-weight headers in one panel compete for the same job.
 *
 * The month header parks one panel-header height below the panel header, so a month label never
 * covers the word the panel is titled with. Both need the panel's own background: a transparent
 * sticky header has rows sliding visibly behind its text.
 *
 * ## `overflow-clip`, and it is load-bearing rather than a synonym
 *
 * The panel was `overflow-hidden` — which clips the rounded corners *and* makes the section a
 * **scroll container**. Both sticky headers then resolve against that scrollport instead of the
 * window, and since the section never scrolls internally (its height is its content) neither one
 * ever moved: the panel header and every month label scrolled away with the rows. `overflow: clip`
 * clips identically, respects the border radius identically, and creates no scrollport — so the
 * headers stick to the page again. The symptom of getting this wrong is nothing at all in a
 * screenshot; it only shows while scrolling, which is how it survived a design pass.
 *
 * ## `stickyTop` is the caller's, because only the page knows what is above it
 *
 * `top: 0` means the top of the *viewport*, not the top of the free space — so on a page with a
 * sticky bar the header parks underneath it and is covered (`PageBackBar` is 60px and `z-20`
 * against this header's `z-[2]`, so the header loses). The offset cannot be decided here: the same
 * panel sits under a 60px back bar on `/my-star` and `/my-wallet`, and under nothing in a `/dev`
 * preview. Hence a number from the caller, defaulting to 0 — pass `APP_BAR_HEIGHT` when the page
 * wears a bar. The month header takes the same offset plus the panel header's own height.
 *
 * ## The sentinel, and why it is a sentinel
 *
 * `sentinelRef` comes from the caller's `useInView`, not from here, because the enabled/disabled
 * logic belongs with the query that knows whether there is a next page. Legacy attaches a
 * `handleScroll` to a shared page container and compares `scrollTop + clientHeight + 200` against
 * `scrollHeight` — which needs the scroll container to be a known ancestor, and is the reason its two
 * ledgers had to live inside one page shell. An observer needs nothing from its surroundings, so this
 * panel works anywhere, including in a `/dev` preview.
 */
export function LedgerPanel({
    title,
    action,
    showHeader = true,
    groups,
    loading,
    error,
    empty,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
    stickyTop = 0,
    onRowPress,
    pageSize,
    fullBleed = false,
    ref,
    className,
    testId,
}: {
    /** Names the section. Shown in the header when there is one, and its `aria-label` either way. */
    title: string
    /** The header's trailing control — a filter, a "View all" link. Omit for a bare header. */
    action?: ReactNode
    /** `false` when the page already shows this panel's title above it — see the doc. */
    showHeader?: boolean
    groups: LedgerGroupModel[]
    /** Rendered instead of the rows. The caller decides which state it is in — see the doc above. */
    loading?: boolean
    error?: ReactNode
    empty?: ReactNode
    hasNextPage?: boolean
    isFetchingNextPage?: boolean
    sentinelRef?: (node: HTMLDivElement | null) => void
    /**
     * How far from the top of the viewport the sticky headers park, in px — the height of whatever
     * the page has sticking above the panel. `0` for a page with nothing above it.
     */
    stickyTop?: number
    /**
     * Called with a row's `id` when it is pressed. Omit and rows are static.
     *
     * The **id**, not the row model: what a caller needs is its own DTO, which it has, and handing
     * back the formatted display row would mean re-deriving the entry from strings. Every row's `id`
     * is the entry's, so a lookup is a `find`.
     */
    onRowPress?: (id: string) => void
    /**
     * The query's page size, for the entrance stagger.
     *
     * The delay is `index % pageSize`, which is `channel-live-tab`'s own arithmetic: it restarts the
     * ramp on every page, so appending page four staggers those twenty rows from zero instead of
     * delaying the first of them by sixty times sixty milliseconds. Omit and the rows simply appear
     * — which is what `/dev` previews and a fixture list want.
     */
    pageSize?: number
    /**
     * Drop the card treatment — the side inset and the corners — **below `md`**, and keep it from
     * `md` up. A breakpoint, not a scroll position; see the note above.
     */
    fullBleed?: boolean
    /**
     * The panel's own element, for a caller that has to move the page relative to it — resetting the
     * scroll when a filter changes the list under the reader.
     *
     * A ref rather than the panel doing it itself: *when* to reset is a screen's decision (a filter
     * changed, a tab switched), and a props-only layout component that scrolls the window on its own
     * is the kind of side effect that surprises the third caller. React 19 takes `ref` as a plain
     * prop, so no `forwardRef` is needed.
     */
    ref?: Ref<HTMLElement>
    className?: string
    /**
     * Base `data-testid`. Everything this panel renders itself derives from this one string:
     * `-header`, `-group` (+ `data-group-key`), `-row` (+ `data-ledger-id`), `-skeleton`,
     * `-sentinel`. The `error` and `empty` slots are caller-supplied nodes, so the caller names
     * them — the rule throughout is that whoever renders an element owns its id.
     *
     * One prop covers eleven consumers — the wallet and Star ledgers, both transaction histories,
     * star-transfer, and three `loading.tsx` files — which is why this is the highest-leverage
     * testid in the repo. Loading is *also* readable as `aria-busy="true"` on the skeleton root;
     * `-skeleton` exists so a driver has something to wait for the absence of.
     */
    testId?: string
}) {
    return (
        <section
            ref={ref}
            aria-label={title}
            data-testid={testId}
            className={cn(
                // `overflow-clip`, never `overflow-hidden` — see the note above.
                'relative flex flex-none flex-col overflow-clip rounded-xl bg-(--background-surface)',
                /*
                 * Below `md` the panel meets the bezel: no corners, and the column's 16px inset
                 * cancelled. From `md` it is a card again — there the column is a centred 612 and a
                 * panel spanning a 1440px window would not read as the same object.
                 *
                 * `-mx-4` and not a width: the inset belongs to the *column*, so cancelling the
                 * margin is what makes the panel meet the bezel without either element having to
                 * know the other's padding.
                 */
                fullBleed && '-mx-4 rounded-none md:mx-0 md:rounded-xl',
                className,
            )}
        >
            {showHeader && (
                <ListHeader
                    style={{ top: stickyTop }}
                    data-testid={subTestId(testId, 'header')}
                    className="sticky z-[2] bg-(--background-surface)"
                >
                    <ListHeaderDesc>
                        <ListHeaderText>
                            <ListHeaderTitle as="h2">{title}</ListHeaderTitle>
                        </ListHeaderText>
                    </ListHeaderDesc>
                    {action && <ListHeaderAction>{action}</ListHeaderAction>}
                </ListHeader>
            )}

            {loading ? (
                <LedgerSkeleton data-testid={subTestId(testId, 'skeleton')} />
            ) : (
                (error ??
                empty ?? (
                    <>
                        {(() => {
                            /*
                             * A running index **across** the groups, not within one: a month header
                             * is a divider, not a restart, so basing the stagger on the position in
                             * a group would make the first row of every month animate at zero and
                             * the ramp would visibly reset mid-list.
                             */
                            let position = 0
                            return groups.map(group => (
                                <div
                                    key={group.key}
                                    data-testid={subTestId(testId, 'group')}
                                    data-group-key={group.key}
                                    className="flex flex-col"
                                >
                                    <ListHeader
                                        variant="nested"
                                        rule={false}
                                        style={{
                                            top: showHeader
                                                ? stickyTop + PANEL_HEADER_HEIGHT
                                                : stickyTop,
                                        }}
                                        className="sticky z-[1] bg-(--background-surface)"
                                    >
                                        <ListHeaderDesc>
                                            <ListHeaderText>
                                                <ListHeaderTitle>{group.label}</ListHeaderTitle>
                                            </ListHeaderText>
                                        </ListHeaderDesc>
                                    </ListHeader>
                                    {group.rows.map((row, index) => {
                                        const delay = pageSize
                                            ? riseDelay(position++ % pageSize)
                                            : undefined
                                        return (
                                            <div
                                                key={row.id}
                                                className={pageSize ? RISE : undefined}
                                                style={delay}
                                            >
                                                <LedgerRow
                                                    row={row}
                                                    rule={index > 0}
                                                    testId={subTestId(testId, 'row')}
                                                    onPress={
                                                        onRowPress && (() => onRowPress(row.id))
                                                    }
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            ))
                        })()}

                        {hasNextPage && (
                            <div
                                ref={sentinelRef}
                                // A loading mechanism, not content: the rows it brings in announce
                                // themselves.
                                aria-hidden="true"
                                data-testid={subTestId(testId, 'sentinel')}
                                className="flex items-center justify-center py-4"
                            >
                                {isFetchingNextPage && <Loader />}
                            </div>
                        )}
                    </>
                ))
            )}
        </section>
    )
}
