'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import {
    ListLeading,
    ListLeadingTile,
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import type { CSSProperties } from 'react'

/**
 * A grouped list of destinations — a coloured tile, a label, a chevron.
 *
 * The shape the DS's `List/Action` rows make when several sit on one rounded surface. `/my-star` uses
 * it for "Get more Star" and "Gift Star"; `/my-wallet` for the three withdraw rows. Both are separate
 * features, so this lives in `shared/` — props only, no hooks, no domain.
 *
 * ## A row with no `href` is **visibly not ready**
 *
 * The state that matters, and the repo already has a rule for it, written at
 * `channel-owner-actions.tsx` from when the earnings report was in this position:
 *
 * > a button that navigates to a 404 is worse than one that is visibly not ready — and a button that is
 * > silently inert is worse than both, because the reader keeps pressing it.
 *
 * So such a row is dimmed, is a real `<button disabled>`, and carries the reason as its accessible
 * description. `disabled` rather than `aria-disabled` + `pointer-events: none`: the two differ in
 * whether the control stays focusable, and here it should not — there is nothing to do with it, and a
 * focus stop that does nothing is worse than one fewer stop. It is still *announced*, because the row's
 * title is its own explanation of what is coming.
 *
 * Giving a row a destination later is one `href` and nothing else.
 *
 * ## Rows are data, not markup
 *
 * The same call `features/navigation/lib/menu-rows.ts` makes: order, glyphs and tile colours are a
 * table, so the composition is written once rather than five near-identical times — and every screen's
 * list is visibly one component rather than several that resemble each other.
 *
 * Labels arrive resolved. This file holds no `useTranslation`, which is what keeps it previewable from
 * `/dev/*` without a provider.
 */

export interface ActionRow {
    /** Stable identity for the list, and the id the disabled description is hung off. */
    key: string
    /** Already translated. */
    label: string
    icon: TeviIconName
    /** A CSS colour for the 32px tile — pass a `TILE.*`-shaped `var(...)`. */
    tile: string
    /** Where it goes. Omit for "not ready yet". */
    href?: string
}

/**
 * `--tevi-left-bar-tile` / `-glyph` are the DS's own custom property names, which is the mechanism
 * `ListLeadingTile` documents: named for the component that introduced them, and worth nothing if
 * renamed — the property would simply never match and every tile would fall back to Indigo.
 */
function tileStyle(tile: string): CSSProperties {
    return {
        '--tevi-left-bar-tile': tile,
        '--tevi-left-bar-glyph': 'var(--white)',
    } as CSSProperties
}

export function ActionRows({
    rows,
    /** Why a row is unavailable — becomes the disabled row's accessible description. */
    unavailableLabel,
    className,
}: {
    rows: ActionRow[]
    unavailableLabel: string
    className?: string
}) {
    return (
        <div
            className={cn(
                'flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)',
                className,
            )}
        >
            {rows.map((row, index) => (
                <ListRow
                    key={row.key}
                    /*
                     * `a` when it goes somewhere, `button` when it does not — never a `div` with a
                     * handler. `ListRow` documents the distinction: a row with a URL should be
                     * middle-clickable, copyable and announced as a link, which a button can never be;
                     * a row that is not a URL should be keyboard-reachable, which a div cannot be.
                     */
                    as={row.href ? 'a' : 'button'}
                    href={row.href}
                    disabled={row.href ? undefined : true}
                    aria-describedby={row.href ? undefined : `${row.key}-unavailable`}
                    rightAction
                    className={cn(
                        'text-start',
                        row.href
                            ? 'cursor-pointer hover:bg-(--button-ghost-bg-hover)'
                            : 'cursor-not-allowed opacity-40',
                    )}
                >
                    <ListRowLeading>
                        <ListLeading variant="rounded">
                            <ListLeadingTile style={tileStyle(row.tile)}>
                                <Icon name={row.icon} size={20} />
                            </ListLeadingTile>
                        </ListLeading>
                    </ListRowLeading>
                    <ListRowContent>
                        {/* Every row but the first. The DS's rule lives inside the content column, so it
                            stops short of the leading tile instead of running the full width. */}
                        {index > 0 && <ListRowRule />}
                        {/* `rightAction` on **both** — without it `ListRowText` takes `w-full` instead
                            of `min-w-0 flex-1` and a long label pushes the chevron off the row. */}
                        <ListRowAccessory rightAction>
                            <ListRowText rightAction>
                                <ListRowTitleRow>
                                    <ListRowTitle className="truncate">{row.label}</ListRowTitle>
                                </ListRowTitleRow>
                            </ListRowText>
                            <ListRowTrailing>
                                {!row.href && (
                                    <span id={`${row.key}-unavailable`} className="sr-only">
                                        {unavailableLabel}
                                    </span>
                                )}
                                <Icon
                                    name="angle-right"
                                    size={20}
                                    // The chevron points the way the language reads.
                                    className="text-(--text-body) rtl:-scale-x-100"
                                />
                            </ListRowTrailing>
                        </ListRowAccessory>
                    </ListRowContent>
                </ListRow>
            ))}
        </div>
    )
}

/**
 * The action list's loading shape.
 *
 * Built from the same `ListRow` parts the real rows are, which is a correctness measure rather than
 * tidiness: `EarningsReportSkeleton`'s doc records what happens otherwise — a hand-rolled skeleton
 * measured 70px against the real row's 50px, so every load ended with the list jumping 20px per row.
 *
 * Worth a skeleton at all because these rows are the tallest thing after the hero card, and the only
 * thing on the screen whose count is known in advance: leaving them out would mean the ledger loading
 * into position and then being pushed down as the rows arrive.
 *
 * No hooks, so it renders on the server — which is what lets a route's `loading.tsx` use it.
 */
export function ActionRowsSkeleton({ count = 2 }: { count?: number }) {
    return (
        <div
            aria-busy="true"
            className="flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)"
        >
            {Array.from({ length: count }, (_, index) => index).map((index, position) => (
                <ListRow key={`action-row-skeleton-${index}`} rightAction>
                    <ListRowLeading>
                        <ListLeading variant="rounded">
                            <Skeleton w={32} h={32} />
                        </ListLeading>
                    </ListRowLeading>
                    <ListRowContent>
                        {position > 0 && <ListRowRule />}
                        {/* `rightAction` because the real row is one — it carries a chevron. The
                            chevron itself is not drawn: it is chrome that is present the whole time,
                            so shimmering it would animate something that never changes. */}
                        <ListRowAccessory rightAction>
                            <ListRowText rightAction>
                                <ListRowTitleRow>
                                    <Skeleton w={128} delay={position * 160} />
                                </ListRowTitleRow>
                            </ListRowText>
                        </ListRowAccessory>
                    </ListRowContent>
                </ListRow>
            ))}
        </div>
    )
}
