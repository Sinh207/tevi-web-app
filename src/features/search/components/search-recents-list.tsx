'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { SEARCH_SECTION_ACTION, SearchSectionHeader } from './search-section-header'

/**
 * What this account searched for before — the screen's whole content while the field is empty.
 *
 * ## Two controls per row, and they are two controls
 *
 * The term re-runs the search; the ✕ forgets it. Legacy makes the term a `<Typography>` with an
 * `onClick` — not focusable, not a button, announced as nothing — beside a real `IconButton`. Here
 * both are buttons, in the order they are read, so a keyboard user reaches "search for ada" and
 * then "remove ada" rather than tabbing past a line of text to reach the only thing that works.
 *
 * The term is a **button and not a link**, deliberately. It does not navigate: it fills the field
 * on this same screen and fires the query. A link to a URL that does not exist (`/search?q=`, see
 * `SearchView`) would be a lie the browser would then have to honour.
 *
 * ## The ✕ label names the term
 *
 * Twenty rows of a button called "Remove" is twenty identical announcements. `aria-label` carries
 * the term, the same call `BlockedAccountRow` makes for its Unblock button.
 *
 * ## Rendered only when there is history
 *
 * The caller checks. An empty Recents section is a header and a Clear button over nothing, and
 * the state it would be standing in for — "you have not searched yet" — needs no words: the field
 * above it is already the instruction.
 */
export function SearchRecentsList({
    recents,
    onPick,
    onForget,
    onClear,
    className,
}: {
    /** Newest first. Never empty — the caller does not render this otherwise. */
    recents: string[]
    /** Search this term now, skipping the debounce. */
    onPick: (term: string) => void
    onForget: (term: string) => void
    onClear: () => void
    /** The host's entrance — `RISE` on the real screen. */
    className?: string
}) {
    const { t } = useTranslation()

    return (
        <section aria-labelledby="search-recents-heading" className={className}>
            {/*
             * The Figma Search page's `Recents Search` component: a 16/600 title with *Clear all
             * history* at the trailing edge (12px, the interactive blue), then the terms — a 16px
             * clock, the term in 16/400 and a ✕ — 22px lines 24 apart, inset 24 on both sides.
             *
             * The pitch is kept (46px per term) but spent on the hit area rather than on a gap:
             * each row is `py-3` around its 22px line, so the whole band is pressable instead of a
             * 22px strip with dead space between strips.
             */}
            <SearchSectionHeader
                id="search-recents-heading"
                title={t('search_recents')}
                action={
                    <button
                        type="button"
                        data-testid="search-recents-clear-all"
                        onClick={onClear}
                        className={SEARCH_SECTION_ACTION}
                    >
                        {t('search_clear_recents')}
                    </button>
                }
            />

            {/* No vertical padding of its own: each row's `py-3` is the 12 the comp puts above
                the first term and below the last. */}
            <ul className="flex list-none flex-col px-4 md:px-6">
                {recents.map((term, index) => (
                    <li key={term} className="flex items-center gap-2">
                        {/*
                         * The term takes the row's width so the whole line is pressable, start-
                         * aligned so a list of terms does not read as a list of buttons. `truncate`
                         * because a stored term can be 120 characters (`MAX_TERM_LENGTH`).
                         */}
                        <button
                            type="button"
                            data-testid="search-recent"
                            data-index={index}
                            onClick={() => onPick(term)}
                            className="type-body-default flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-3 text-start text-(--text-title) outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
                        >
                            <Icon
                                name="clock"
                                size={16}
                                aria-hidden="true"
                                className="size-4 flex-none text-(--icon-default)"
                            />
                            <span className="min-w-0 truncate">{term}</span>
                        </button>
                        <Button
                            data-testid="search-recent-forget"
                            data-index={index}
                            variant="ghost"
                            size="small"
                            iconOnly
                            aria-label={t('search_remove_recent', { term })}
                            onClick={() => onForget(term)}
                            className="-me-2 flex-none text-(--icon-secondary)"
                        >
                            <Icon name="xmark" size={20} className="size-5" />
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    )
}
