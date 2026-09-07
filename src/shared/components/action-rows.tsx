'use client'

import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon, type IconGlyphProps } from '@shared/ui/icon'
import type {
    TeviIconName,
    TeviIconNameDuotone,
    TeviIconNameDuotoneLine,
    TeviIconNameFilled,
    TeviIconNameLight,
} from '@shared/ui/icon-names'
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
import Link from 'next/link'
import type { CSSProperties } from 'react'

/**
 * A grouped list of destinations — a coloured tile, a label, a chevron.
 *
 * The shape the DS's `List/Action` rows make when several sit on one rounded surface. `/my-star` uses
 * it for "Get more Star" and "Gift Star"; `/my-wallet` for the three withdraw rows. Both are separate
 * features, so this lives in `shared/` — props only, no hooks, no domain.
 *
 * ## A row with no `href` and no `onClick` is **visibly not ready**
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
 * ## …and a row with `disabledReason` is **unavailable to this reader**
 *
 * The same treatment, a different sentence, and the prop's own note says why they are not one thing:
 * "not built yet" is a fact about the app, while a reason is a fact about the account that goes away
 * when it does. `/my-star`'s Gift Star row uses it at a zero Star balance.
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

/**
 * The glyph, as a **name/weight pair** rather than two independent fields.
 *
 * `IconGlyphProps`'s shape with `icon`/`iconWeight` in place of `name`/`weight` — the same rename
 * `BarIconButton` makes, and for the same reason (`name` collides with `<button name>`). What the
 * union buys is what that component's note spells out: a weight a glyph does not have becomes a
 * **compile error** rather than an empty box at runtime, which is a failure nothing about the
 * rendered page reports.
 *
 * Omitting `iconWeight` keeps the default weight, so the eight rows that want one stay
 * `icon: 'bank'` and nothing had to change when the first weighted row arrived.
 *
 * (`design-system/icons.md` marks which glyphs ship more than one weight, and 65 bare ids are
 * `<use>` aliases onto `--filled` — for those the weight is a no-op either way. `star` is **not**
 * one of them: the bare id aliases `star--regular`, so the filled version has to be asked for.)
 */
type ActionRowGlyph =
    | { icon: TeviIconName; iconWeight?: undefined }
    | { icon: TeviIconNameFilled; iconWeight: 'filled' }
    | { icon: TeviIconNameLight; iconWeight: 'light' }
    | { icon: TeviIconNameDuotone; iconWeight: 'duotone' }
    | { icon: TeviIconNameDuotoneLine; iconWeight: 'duotone-line' }

export type ActionRow = ActionRowGlyph & {
    /** Stable identity for the list, and the id the disabled description is hung off. */
    key: string
    /** Already translated. */
    label: string
    /** A CSS colour for the 32px tile — pass a `TILE.*`-shaped `var(...)`. */
    tile: string
    /** Where it goes. Omit for "not ready yet" — or for a row that acts rather than navigates. */
    href?: string
    /**
     * What the row **does**, when it does not go anywhere.
     *
     * A row that raises a dialog is not a destination: it has no URL to be middle-clicked or copied,
     * and giving it one so it could live in this list would mean inventing a route for a modal. So the
     * list accepts an action, renders it as a real `<button>`, and keeps the "not ready" treatment for
     * the case it was written for — a row with **neither** an `href` nor an `onClick`.
     *
     * `/settings/two-step-verification` is the caller: *Change passcode* and *Turn off* both open the
     * passcode gate. Ignored when `href` is set — one row, one job.
     */
    onClick?: () => void
    /**
     * Why the row cannot be pressed **right now**, already translated. Present ⇒ disabled, whatever
     * `href` or `onClick` say.
     *
     * A different state from the one above, and worth its own prop because the two are not the same
     * news: "not built yet" is about the *app* and never changes while the reader looks at it, while
     * this is about **their account** and goes away when the thing it names does. `/my-star`'s Gift
     * Star row is the caller — legacy dims it at a zero Star balance (`disabled={!balanceTVS}`), and
     * dimming it under `unavailableLabel` would tell that reader the feature is coming soon.
     *
     * It becomes the row's accessible description, exactly as the unavailable string does, so the
     * reason is announced rather than left to the 40% opacity to imply.
     */
    disabledReason?: string
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
    testId,
}: {
    rows: ActionRow[]
    unavailableLabel: string
    className?: string
    /**
     * Base `data-testid`. The list takes it; each row is `${testId}-row` carrying
     * `data-row-key={row.key}`.
     *
     * `row.key` is a code-authored slug (`menu_get_star`), not display text, so it is safe as an
     * identity — but it is not the *testid*, deliberately: deriving the id from a translation key
     * would couple a QC selector to a translation-key rename, which this repo does. The key goes in
     * the companion attribute where it is data, not a selector.
     */
    testId?: string
}) {
    return (
        <div
            data-testid={testId}
            className={cn(
                'flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)',
                className,
            )}
        >
            {rows.map((row, index) => {
                /*
                 * Two ways to be inert and one treatment, so the branches below read a boolean rather
                 * than re-deriving the condition at each of the five places it is needed. A row with a
                 * `disabledReason` keeps its `href`/`onClick` in the data — the caller states *why*
                 * rather than having to strip the destination and put it back.
                 */
                const reason = row.disabledReason
                const inert = Boolean(reason) || (!row.href && !row.onClick)
                const description = reason ?? unavailableLabel

                return (
                    <ListRow
                        key={row.key}
                        data-testid={subTestId(testId, 'row')}
                        data-row-key={row.key}
                        /*
                         * `Link` for a destination, `button` for anything else — never a `div` with a
                         * handler. `ListRow` documents the distinction: a row with a URL should be
                         * middle-clickable, copyable and announced as a link, which a button can never be;
                         * a row that is not a URL should be keyboard-reachable, which a div cannot be. And
                         * `Link` rather than a bare `'a'`: every destination these rows carry is an
                         * internal route, where an anchor costs a full document load (router cache, query
                         * cache and scroll position).
                         *
                         * An **inert** row is a `button` whatever its data says, because a disabled link is
                         * not a thing: `disabled` is not an anchor attribute, so a dimmed `Link` still
                         * navigates on press and on Enter. That is what lets a row keep its destination
                         * while a `disabledReason` holds it shut.
                         */
                        as={!inert && row.href ? Link : 'button'}
                        href={inert ? undefined : row.href}
                        onClick={inert || row.href ? undefined : row.onClick}
                        disabled={inert || undefined}
                        aria-describedby={inert ? `${row.key}-unavailable` : undefined}
                        rightAction
                        className={cn(
                            'text-start',
                            inert
                                ? 'cursor-not-allowed opacity-40'
                                : 'cursor-pointer hover:bg-(--button-ghost-bg-hover)',
                        )}
                    >
                        <ListRowLeading>
                            <ListLeading variant="rounded">
                                <ListLeadingTile style={tileStyle(row.tile)}>
                                    {/* Forwarded as the pair they were typed as — the cast is
                                        `BarIconButton`'s, and for its reason: the union was checked
                                        at the call site that wrote the row, and re-narrowing it here
                                        would be five branches rendering the same element. */}
                                    <Icon
                                        {...({
                                            name: row.icon,
                                            weight: row.iconWeight,
                                        } as IconGlyphProps)}
                                        size={20}
                                    />
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
                                        <ListRowTitle className="truncate">
                                            {row.label}
                                        </ListRowTitle>
                                    </ListRowTitleRow>
                                </ListRowText>
                                <ListRowTrailing>
                                    {inert && (
                                        <span id={`${row.key}-unavailable`} className="sr-only">
                                            {description}
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
                )
            })}
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
export function ActionRowsSkeleton({
    count = 2,
    'data-testid': testId,
}: { count?: number } & TestIdProps) {
    return (
        <div
            aria-busy="true"
            data-testid={testId}
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
