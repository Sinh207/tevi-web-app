'use client'

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
import type { ReactNode } from 'react'

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
}: {
    row: LedgerRowModel
    rule?: boolean
}) {
    return (
        <ListRow rightAction>
            <ListRowLeading>
                {/*
                 * A 40px disc, not the DS's 48px `ListLeading` box: the comps draw a ledger row with
                 * a circular 40 on Background/Segment, which is a different part from the squared
                 * 32-inside-48 tile an action row uses. Using the tile here would make the two lists
                 * look like one list with inconsistent icons.
                 */}
                <span
                    className={cn(
                        'flex size-[40px] flex-none items-center justify-center rounded-full',
                        'bg-(--background-segment) text-(--accents-indigo-active)',
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
                    <ListRowTrailing className="gap-1">
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
export function LedgerSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div aria-busy="true" className="flex flex-col">
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
 * The panel: a sticky header with a filter slot, then the groups, then a sentinel.
 *
 * ## The month header is `nested`, and the two sticky offsets are deliberate
 *
 * `nested` is the DS's quieter header variant — 16/600 in Text - Body rather than Text - Title —
 * which is right for a divider inside a panel that already has a Title-weight header of its own. Two
 * Title-weight headers in one panel compete for the same job.
 *
 * The month header parks at `top-[48px]`, directly under the panel header, so a month label never
 * covers the word the panel is titled with. Both need the panel's own background: a transparent
 * sticky header has rows sliding visibly behind its text.
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
    filter,
    groups,
    loading,
    error,
    empty,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
    className,
}: {
    title: string
    /** The filter control, in the header's trailing slot. Omit for a ledger with no filter. */
    filter?: ReactNode
    groups: LedgerGroupModel[]
    /** Rendered instead of the rows. The caller decides which state it is in — see the doc above. */
    loading?: boolean
    error?: ReactNode
    empty?: ReactNode
    hasNextPage?: boolean
    isFetchingNextPage?: boolean
    sentinelRef?: (node: HTMLDivElement | null) => void
    className?: string
}) {
    return (
        <section
            aria-label={title}
            className={cn(
                'flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)',
                className,
            )}
        >
            <ListHeader className="sticky top-0 z-[2] bg-(--background-surface)">
                <ListHeaderDesc>
                    <ListHeaderText>
                        <ListHeaderTitle as="h2">{title}</ListHeaderTitle>
                    </ListHeaderText>
                </ListHeaderDesc>
                {filter && <ListHeaderAction>{filter}</ListHeaderAction>}
            </ListHeader>

            {loading ? (
                <LedgerSkeleton />
            ) : (
                (error ??
                empty ?? (
                    <>
                        {groups.map(group => (
                            <div key={group.key} className="flex flex-col">
                                <ListHeader
                                    variant="nested"
                                    rule={false}
                                    className="sticky top-[48px] z-[1] bg-(--background-surface)"
                                >
                                    <ListHeaderDesc>
                                        <ListHeaderText>
                                            <ListHeaderTitle>{group.label}</ListHeaderTitle>
                                        </ListHeaderText>
                                    </ListHeaderDesc>
                                </ListHeader>
                                {group.rows.map((row, index) => (
                                    <LedgerRow key={row.id} row={row} rule={index > 0} />
                                ))}
                            </div>
                        ))}

                        {hasNextPage && (
                            <div
                                ref={sentinelRef}
                                // A loading mechanism, not content: the rows it brings in announce
                                // themselves.
                                aria-hidden="true"
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
