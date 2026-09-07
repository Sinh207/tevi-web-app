'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { searchCurrencies } from '@shared/lib/currency-search'
import type { Currency } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { LeftBarList } from '@shared/ui/left-bar'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowRule,
    ListRowText,
    ListRowTitleRow,
} from '@shared/ui/list'
import { SearchBar } from '@shared/ui/search-bar'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import { PickerList, type PickerOption } from './picker-list'

/**
 * Pick the currency the account's money is shown in — a searchable pick-one list over the exchange
 * service's ~150 rows.
 *
 * **One component, both switchers.** The account drawer pushes it as a sub-screen and `/my-wallet`
 * opens it in a dialog, and they are the same choice, so they are the same list: the same ranking, the
 * same skeleton, the same empty copy, the same keyboard. It was the drawer's alone for a while and
 * `/my-wallet` had a dropdown of 150 bare rows beside it; the two did not look related, which is the
 * whole reason this lives in `shared/`. Neither feature could own it anyway — `features/my-wallet` and
 * `features/navigation` cannot import each other (see the cycle note on the former's barrel).
 *
 * It renders **no header**: the drawer's is an App Bar in a pushed screen and the dialog's is a title
 * with a close, and those are the hosts' own. What is here is everything below that line.
 *
 * ## The field is the difference between a control and a scroll
 *
 * Legacy lists all 150 rows with no search, and finding `VND` there means scrolling past a hundred
 * codes nobody has ever spent. So: a DS Search Bar, ranked matches (see `searchCurrencies`), and it
 * **sticks** to the top of the scroll box so it is still there after the scroll it saves you.
 *
 * It appears only once the list is long enough to need it (`SEARCHABLE_FROM`) — a guest, whose list is
 * the single stand-in row, gets no field, because a search over one row is furniture.
 *
 * ## Flush rows, no card, no mark column
 *
 * The rows run edge to edge (`PickerList`'s `flush`, which states the measurement): a bordered card
 * inside a scroll box shows neither of its corners and leaves its side borders hanging as two stray
 * vertical lines.
 *
 * ## The mark column, and why the symbols lost it
 *
 * The rows carried `currency.symbol` in the leading slot for a while, on the Language screen's logic
 * (a flag says which language a row is). It does not transfer: a symbol is only sometimes a glyph.
 * `₫` and `€` look like marks, but `Af`, `Rp`, `RM`, `NT$` and `CHF` are letters, and a column of
 * letters beside a column of codes reads as the code printed twice, badly. So the slot is dropped for
 * every row — `PickerOption.mark` is optional for this — and each row is the code over its name, which
 * is also exactly what legacy's dialog lists.
 */

/**
 * Below this many rows there is nothing to search: the list is short enough to read at a glance.
 * Eight is about where a panel this tall stops showing the whole list without a scroll — the exact
 * number is a judgement, not a measurement, and the point of it is that one row never gets a field.
 */
const SEARCHABLE_FROM = 8

/** Bars in the loading list — enough to read as "a list is coming", short enough not to promise one. */
const SKELETON_ROWS = 6

export function CurrencyList({
    active,
    currencies,
    selected,
    isLoading,
    onSelect,
    stickyClassName = 'top-0',
    className,
    testId,
}: {
    /**
     * Whether the list is the thing on screen. Drives the term reset and the scroll-to-selection, and
     * it is a prop because both hosts keep it mounted while it is not visible — the drawer parks its
     * screens, a dialog can keep its popup for the closing animation.
     */
    active: boolean
    currencies: Currency[]
    selected: Currency
    /** The service's list is still in flight, so `currencies` is the one-row stand-in. */
    isLoading: boolean
    onSelect: (code: string) => void
    /**
     * Where the search field sticks — an offset from the top of **whatever box scrolls**.
     *
     * `top-0` (the default) is right whenever that box starts at the field, which is the dialog: its
     * header is a flex sibling of the scrolling body, so nothing is above the field inside it. The
     * drawer passes `top-[60px]`, its App Bar's own fixed height, because there the bar is *inside*
     * the scroll container and sticky at 0, so the field has to clear it.
     *
     * Getting it the wrong way round does not look like a small offset error: a value larger than the
     * field's natural position sticks it that far **below** the box's edge, where it covers the first
     * rows and swallows their clicks.
     */
    stickyClassName?: string
    className?: string
    /**
     * Base `data-testid`. Derives, with no further work at the call site:
     * `${testId}-search` (the field) → `${testId}-search-clear` (its X, derived again inside
     * `SearchBar`), `${testId}-option` + `data-option-value` (each row, via `PickerList`),
     * `${testId}-skeleton`, and `${testId}-empty` (the no-results line).
     *
     * The option value **is** the ISO currency code, so it rides the same `data-option-value` this
     * repo's other pick-one lists use rather than a `data-currency-code` of its own: one companion
     * name per component beats one per domain, and `PickerList` is the component doing the
     * rendering. Three levels of nesting cost one prop each — that is what `subTestId` is for.
     */
    testId?: string
}) {
    const { t } = useTranslation()
    const [term, setTerm] = useState('')

    /*
     * The term is dropped when the list leaves, not when it arrives: both hosts keep it mounted, so
     * clearing on arrival would fight the reader's own typing on the render that shows it. Same rule
     * the drawer follows for `view` — a reopened panel that remembers a half-typed search reads as a
     * bug.
     */
    useEffect(() => {
        if (!active) setTerm('')
    }, [active])

    const shown = useMemo(() => searchCurrencies(currencies, term), [currencies, term])

    /*
     * Where this list is scrolled to is `PickerList`'s job now — it opens at the checked row and
     * returns to the top when the option set changes. This file had the only copy of that, written for
     * one list and one host; the payout country picker needed the same thing and a second copy is how
     * the two would drift. `active` is passed straight through.
     */

    const options: PickerOption[] = shown.map(option => ({
        value: option.code,
        label: option.code,
        /*
         * Dropped when it would only repeat the code — the synthetic record `useCurrency` builds for a
         * code the service no longer lists sets `name` to the code, and `VND / VND` reads as a bug
         * rather than as a fallback.
         */
        subtitle: option.name === option.code ? undefined : option.name,
    }))

    return (
        <div className={cn('flex flex-col', className)}>
            {(isLoading || currencies.length >= SEARCHABLE_FROM) && (
                /*
                 * Rendered while loading too, even though the stand-in list is one row: the field is
                 * what the real list will need, so leaving it out until the data lands means the whole
                 * list jumps down 56px the moment it arrives. Typing during the wait cannot mislead —
                 * the skeleton branch below wins over "nothing matched" while `isLoading`.
                 *
                 * Full-bleed and opaque (`-mx-4` cancelling the host's padding, then `px-4` back): the
                 * Search Bar has no fill of its own outside its pill, so without a background here the
                 * rows would scroll visibly through the space around it.
                 *
                 * The hairline under it is what turns that opaque band into a header rather than a
                 * seam: rows disappear *under a line* instead of being sliced by nothing.
                 *
                 * `py-3` and not `pb-3`: the padding has to be **inside** the sticky box, because that
                 * box is what pins to the top. Spacing supplied by the host above it — a flex gap, a
                 * container's `pt` — is only there at rest; the moment the list scrolls, the block
                 * lands flush against the header and the pill touches the hairline. So the 12px above
                 * the pill is the field's own, and both hosts read the same stuck or not.
                 */
                <div
                    className={cn(
                        'sticky z-10 -mx-4 border-b border-(--separator-default)',
                        'bg-(--background-surface) px-4 py-3',
                        stickyClassName,
                    )}
                >
                    <SearchBar
                        value={term}
                        onValueChange={setTerm}
                        data-testid={subTestId(testId, 'search')}
                        label={t('balance_currency_search_label')}
                        placeholder={t('balance_currency_search_placeholder')}
                        clearLabel={t('balance_currency_search_clear')}
                    />
                </div>
            )}

            {isLoading ? (
                <CurrencyListSkeleton data-testid={subTestId(testId, 'skeleton')} />
            ) : options.length === 0 ? (
                /*
                 * Copy alone, centred — no illustration and no "clear" button. The way out is the
                 * field's own cancel, which is eight pixels above this (`BlockedAccountsView` makes the
                 * same call about the second control), and neither host has an artwork vocabulary for a
                 * list this deep inside them.
                 */
                <p
                    role="status"
                    data-testid={subTestId(testId, 'empty')}
                    className={cn(
                        'type-dense-default px-4 py-6 text-center text-(--text-body)',
                        RISE,
                    )}
                >
                    {t('balance_currency_no_results')}
                </p>
            ) : (
                /*
                 * `pb-4` on the list's own wrapper rather than on the host's scroll box: it has to be
                 * *inside* the scrolled content, or the last row ends flush against the bottom edge —
                 * on a phone that put "South African Rand" half inside the dialog's corner radius.
                 */
                <div className="pb-4">
                    <PickerList
                        flush
                        // Straight through: `PickerList` opens the list at the chosen currency and
                        // returns it to the top when the term changes. See the note above.
                        active={active}
                        label={t('balance_change_currency')}
                        options={options}
                        value={selected.code}
                        onSelect={onSelect}
                        testId={testId}
                    />
                </div>
            )}
        </div>
    )
}

/**
 * The list's loading shape — the same DS row parts the real rows are built from, so nothing shifts
 * when the data lands and the two cannot drift apart. `blocked-accounts-skeleton.tsx` explains why
 * that matters more than it sounds, and why each bar sits in a box reserved at its **real** line
 * height (24 for the code, 21 for the name) rather than at the bar's own 12px.
 *
 * No leading slot, because the rows have none either — a shimmering circle standing in for a mark
 * that never arrives is a promise the list does not keep. Flush for the same reason the real list is
 * (see `PickerList`'s `flush`): a card here and none there would move every row 16px sideways the
 * moment the data landed.
 *
 * Composed from `ListRow*` rather than from `LeftBarRow`, which the real rows use: that component's
 * `title` is typed `ReactNode & string` — `HTMLAttributes` already declares a `title` attribute and
 * the intersection wins — so a bar cannot be passed through it. Same call `BlockedAccountsSkeleton`
 * makes with `ListUserItem*`.
 */
function CurrencyListSkeleton({ 'data-testid': testId }: TestIdProps) {
    return (
        <LeftBarList
            aria-busy="true"
            data-testid={testId}
            className="-mx-4 rounded-none bg-transparent"
        >
            {Array.from({ length: SKELETON_ROWS }, (_, index) => `currency-skeleton-${index}`).map(
                (key, index) => (
                    <ListRow key={key}>
                        <ListRowContent>
                            {index > 0 && <ListRowRule />}
                            <ListRowAccessory>
                                <ListRowText>
                                    <ListRowTitleRow>
                                        <span className="flex h-[24px] items-center">
                                            <Skeleton w={56} delay={index * 160} />
                                        </span>
                                    </ListRowTitleRow>
                                    <span className="flex h-[21px] items-center">
                                        <Skeleton w={110} delay={index * 160} />
                                    </span>
                                </ListRowText>
                            </ListRowAccessory>
                        </ListRowContent>
                    </ListRow>
                ),
            )}
        </LeftBarList>
    )
}
