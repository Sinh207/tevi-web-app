'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderAction, ListHeaderTitle } from '@shared/ui/list'

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
            {/* `rule={false}` for the reason the Following grid's header gives: what follows is
                not a rowed list that the hairline would continue. */}
            <ListHeader rule={false}>
                <ListHeaderTitle as="h2" id="search-recents-heading">
                    {t('search_recents')}
                </ListHeaderTitle>
                <ListHeaderAction>
                    {/*
                     * `ghost`, and the DS has no "text link" button — `ghost` is the boxless one.
                     * Legacy paints this in `#007AFF`, iOS's system blue, which is not a Tevi
                     * token at all; `--accents-indigo-active` is the ramp's own interactive blue
                     * and it inverts with the theme, which the literal does not.
                     *
                     * `-me-2` against the button's own padding: with no box to see, the *label*
                     * is what should line up with the header's 16px inset, not the hit area.
                     * Same trick `BlockedAccountRow`'s Unblock uses.
                     */}
                    <Button
                        data-testid="search-recents-clear-all"
                        variant="ghost"
                        size="small"
                        onClick={onClear}
                        className="-me-2 text-(--accents-indigo-active) hover:not-disabled:bg-(--background-segment)"
                    >
                        {t('search_clear_recents')}
                    </Button>
                </ListHeaderAction>
            </ListHeader>

            <ul className="flex list-none flex-col">
                {recents.map((term, index) => (
                    <li key={term} className="flex items-center gap-2 px-4 py-1">
                        {/*
                         * The term takes the row's width so the whole line is pressable, and its
                         * text is start-aligned inside it — a centred label in a full-width
                         * button is what makes a list of terms look like a list of buttons.
                         *
                         * `truncate` because a recent term is user input and can be 120
                         * characters (see `MAX_TERM_LENGTH`); `min-w-0` is what lets it.
                         */}
                        <Button
                            data-testid="search-recent"
                            data-index={index}
                            variant="ghost"
                            size="medium"
                            onClick={() => onPick(term)}
                            className="-mx-2 min-w-0 flex-1 justify-start gap-3 px-2 text-(--text-title)"
                        >
                            <Icon
                                name="clock"
                                size={20}
                                aria-hidden="true"
                                className="size-5 flex-none text-(--icon-secondary)"
                            />
                            <span className="min-w-0 truncate">{term}</span>
                        </Button>
                        <Button
                            data-testid="search-recent-forget"
                            data-index={index}
                            variant="ghost"
                            size="medium"
                            iconOnly
                            aria-label={t('search_remove_recent', { term })}
                            onClick={() => onForget(term)}
                            className="flex-none text-(--icon-secondary)"
                        >
                            <Icon name="xmark" size={20} className="size-5" />
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    )
}
