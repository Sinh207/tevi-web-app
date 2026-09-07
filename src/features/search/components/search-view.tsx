'use client'

import { ChannelEmptyState } from '@features/channel'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ListHeader, ListHeaderTitle } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { SearchBar } from '@shared/ui/search-bar'
import { useEffect } from 'react'
import { useChannelSearch } from '../hooks/use-channel-search'
import { useSearchRecents } from '../hooks/use-search-recents'
import { SEARCH_PANEL } from '../lib/container'
import { SEARCH_ART } from '../lib/illustrations'
import { SearchChannelRow } from './search-channel-row'
import { SearchFollowingStrip } from './search-following-strip'
import { SearchRecentsList } from './search-recents-list'
import { SearchFollowingSkeleton, SearchSkeleton } from './search-skeleton'

/**
 * `/search` — everything below the page's back bar.
 *
 * ## Six states, and the first of them is the one legacy renders as a blank card
 *
 * DoD §1's loading / error / empty / success, plus the two this screen has of its own:
 *
 * - **Idle**: nothing typed. The screen is the Recents list, and when there is no history it is a
 *   short prompt rather than legacy's *nothing at all* — its `Recents` component returns `null`
 *   for an empty list, so a first-time visitor gets a search field over 700px of empty white card
 *   and no indication that the page has finished loading. Which of the two it is, is **not known
 *   until the device's list has been read**, so the idle body holds until it has — see the branch
 *   below.
 * - **Nothing matched**: a list that came back empty because of the **term** is not an empty list,
 *   and it gets Brand's art plus copy that says what to try instead. The distinction is the same
 *   one `BlockedAccountsView` draws between `isEmpty` and `isSearchEmpty`; here *every* empty
 *   result is a search's, because there is no unfiltered list to be empty.
 *
 * There is deliberately **no signed-out state**. Global search is public — legacy's page is too —
 * and the only part that needs an account is the Following grid, which simply is not fetched
 * without one (`useChannelSearch` gates the query rather than the screen). An anonymous visitor
 * gets a working search, which is what a platform's front door should be.
 *
 * ## The URL carries no term, and that is a decision
 *
 * `/search?q=ada` would be shareable, and it is not implemented: the term is client state.
 * Legacy has no such parameter either, so nothing in the wild links to one; and writing it on
 * every settle means a `router.replace` per debounce, which puts a history entry (or a suppressed
 * one) and a server round-trip on the typing path for a page whose content is entirely
 * client-fetched. Worth revisiting the day something needs to *link* to a search — the hook's
 * `submit` is already the seam a `?q=` reader would use.
 *
 * ## Pagination is real
 *
 * DoD §6, and this is the list that most needs it: a two-letter term matches a lot of spaces.
 * `useInView`'s default 600px lead time means the next page is usually in the cache before the
 * reader reaches the bottom, so the "loading more" row is rare rather than a spinner per scroll.
 */
export function SearchView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const {
        search,
        setSearch,
        submit,
        commit,
        record,
        following,
        isFollowingLoading,
        results,
        total,
        isIdle,
        isLoading,
        isError,
        isEmpty,
        retry,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
    } = useChannelSearch()
    const { recents, isReady: recentsReady, forget, clear } = useSearchRecents()

    /**
     * The sentinel, and the effect that acts on it.
     *
     * `enabled` detaches the observer once there is nothing left to fetch, and detaching it while
     * a page is in flight is what keeps `inView` from re-firing for the whole duration of the
     * request. `loadMore` is guarded in the hook as well; belt and braces, because the failure
     * here is a request loop rather than a wrong pixel.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    /**
     * The two sections, each rendered only when it has something in it.
     *
     * `hasResults` looks redundant next to `isEmpty` and is not: `isEmpty` needs **both** lists
     * empty, so `results.length === 0 && hasFollowing` reaches the success branch below. Without
     * this gate that state drew a "Global search" heading and a live region announcing "0 results"
     * over an empty `<ul>` — a section header for a section that is not there.
     *
     * It is an edge case created by an open contract question rather than by a normal payload: the
     * global list ought to be a superset of the spaces you follow, so reaching it means the two
     * endpoints match terms by different rules (B78, question 1). Which is exactly why it is
     * handled rather than assumed away.
     *
     * The **visible** "Global search" header is separate again, and is drawn only when the
     * Following grid is above it: a heading earns its line by telling two things apart, and with no
     * grid there is one list on the screen and the page title already names it. The section keeps
     * its accessible name in both cases (`aria-label`), so a screen reader loses nothing when the
     * line is not drawn.
     */
    const hasFollowing = following.length > 0
    const hasResults = results.length > 0

    const body = isIdle ? (
        !recentsReady ? (
            /*
             * The one frame in which the answer is not known yet.
             *
             * Recents are `localStorage`, so they cannot be read on the server and are not in the
             * hydrating render either (`useSearchRecents` explains where `isReady` comes from). The
             * two states below are a **list** and an **empty state**, so guessing costs a whole
             * block of content: this used to paint "Search creators" at every reader and replace it
             * with the history a returning one has.
             *
             * Nothing is drawn rather than a shimmer of the list, because the alternative to the
             * list is a prompt — a static instruction, not data — and shimmer resolving into
             * *copy* is a placeholder that was standing in for nothing. It holds the panel's height
             * (`flex-1`) so the card does not collapse and reopen. The route's `loading.tsx` paints
             * this same nothing under its field, so the two moments agree.
             */
            <div className="flex-1" aria-hidden="true" />
        ) : recents.length > 0 ? (
            <SearchRecentsList
                recents={recents}
                onPick={submit}
                onForget={forget}
                onClear={clear}
                /* Arrives like every other region in this app — including the empty states it
                   alternates with, so clearing the field does not swap an animated block for a
                   static one. */
                className={RISE}
            />
        ) : (
            /*
             * The prompt, in place of legacy's blank card. A glyph and not art: this is not an
             * empty state — there is nothing missing — it is the instruction, and Brand has drawn
             * nothing for it. `ChannelEmptyState`'s own doc calls a 32px glyph the honest minimum
             * for a state nobody has drawn.
             */
            <ChannelEmptyState
                className={cn('flex-1', RISE)}
                icon="search"
                title={t('search_idle_title')}
            />
        )
    ) : isLoading ? (
        /*
         * The layout the results are about to have, not just its list.
         *
         * `isFollowingLoading` is the gate and it is the honest one: it is true only while the
         * followed-channels request is in flight, i.e. only when a block of tiles is on its way to
         * that exact spot. An anonymous visitor's query is never enabled, so they get the rows
         * alone — which is also all their screen will ever have. The strip's own note explains why
         * a count can be guessed here and `SearchSkeleton`'s why it will not guess the block.
         *
         * The "Global search" heading comes with it, drawn under the same condition the real one
         * uses (`hasFollowing`): the line exists to tell two lists apart, so a screen that is about
         * to have one list does not reserve a line for it. Both headings print their real words —
         * they are chrome, and reserving space for text we already have is what makes a skeleton
         * feel like a different screen.
         */
        <>
            {isFollowingLoading && (
                <>
                    <SearchFollowingSkeleton label={t('search_following')} />
                    <ListHeader rule={false}>
                        <ListHeaderTitle as="h2">{t('search_global_results')}</ListHeaderTitle>
                    </ListHeader>
                </>
            )}
            <SearchSkeleton />
        </>
    ) : isError ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('search_error_title')}
            body={t('search_error_body')}
            action={
                <Button data-testid="search-retry" variant="secondary" size="large" onClick={retry}>
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        /*
         * Legacy's own words for this state ("Oops! No results found"), which is what people
         * recognise, over the repo's own actionable second line — "Try a different name or
         * handle", the same sentence `/settings/blocked-accounts` and `/my-membership` use for
         * the identical moment. Legacy's second line is `dangerouslySetInnerHTML` around a
         * string with a literal `\n` in it that it replaces with a `<br />`; there is nothing
         * to port there.
         *
         * The term is **not** quoted back. It is four lines up in a field the reader is still
         * looking at, and a `t()` call that interpolates it would be a fourteenth string to
         * translate into nine locales for something already on screen.
         *
         * No action button — the way out is the field's own cancel, which is on screen a few
         * pixels above. A "clear search" button here would be a second control for one job, the
         * same call `BlockedAccountsView` makes.
         */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={SEARCH_ART.empty}
            title={t('search_no_results_title')}
            body={t('search_no_results_body')}
        />
    ) : (
        <>
            {hasFollowing && (
                <SearchFollowingStrip
                    channels={following}
                    /* A press records the term that found the tile — see `record` in the hook. */
                    onOpen={record}
                    /* The grid arrives with the results, so it arrives the same way they do. */
                    className={RISE}
                />
            )}

            {hasResults && (
                <section aria-label={t('search_global_results')}>
                    {hasFollowing && (
                        <ListHeader rule={false}>
                            <ListHeaderTitle as="h2">{t('search_global_results')}</ListHeaderTitle>
                        </ListHeader>
                    )}

                    {/*
                     * The count, for screen readers only.
                     *
                     * The design has no line for it, and its job is not decorative: results replace
                     * themselves under a field the reader is still typing into, with no navigation
                     * and no focus change, so without a live region a screen-reader user gets no
                     * signal that the list changed at all. `role="status"` rather than a bare
                     * `aria-live`, so it is announced as a status update and not as part of the list.
                     *
                     * **Inside the gate**, so it counts something that is on screen — the state
                     * this used to be wrong about is the one above (`hasResults`): a match in the
                     * Following grid alone had it announcing "0 results" over visible content. The
                     * cost is that such a match is announced by nothing at all, which is the
                     * quieter of the two wrongs and is the state B78 exists to remove.
                     *
                     * `Intl` formats the number, because `1,024` is `1.024` in German — and it is
                     * exact rather than compact, since this stands in for a list the reader can
                     * count. It is the **server's** total, so it may sit a row or two above what is
                     * rendered once duplicates across pages are dropped; that is the honest figure
                     * for "how many matched", which is what it is announcing.
                     */}
                    <p role="status" aria-live="polite" className="sr-only">
                        {t('search_results_count', {
                            count: total,
                            formatted: new Intl.NumberFormat(currentLanguage).format(total),
                        })}
                    </p>

                    <ul className="list-none">
                        {results.map((channel, index) => (
                            <SearchChannelRow
                                testId="search-result"
                                channelSlug={channel.slug}
                                key={channel.slug}
                                channel={channel}
                                /*
                                 * A hairline above every row but the first. No "is the row above me
                                 * still visible" arithmetic here, unlike the blocked list: nothing
                                 * on this screen removes a row, so there is no exit animation
                                 * during which a mounted-but-collapsed neighbour could leave a rule
                                 * floating against the card's edge.
                                 */
                                rule={index > 0}
                                /*
                                 * Opening a result is the strongest signal the term was a good one,
                                 * so it is what records it — `record` and not `commit`, because the
                                 * term that found this row is `q` rather than whatever is in the
                                 * field by now. See the hook.
                                 */
                                onOpen={record}
                                /*
                                 * The stagger is a **first-paint** flourish, so only the first
                                 * screen gets one. Rows appended by pagination mount below the fold
                                 * and are scrolled to, not revealed — a delay there makes them look
                                 * late rather than orderly. 40ms rather than `riseDelay`'s 60,
                                 * because ten rows at 60 would still be arriving 600ms in.
                                 */
                                enterDelay={index < 10 ? index * 40 : 0}
                            />
                        ))}
                    </ul>
                </section>
            )}

            {/* Zero-height and outside the list, so it is neither a row nor a tab stop. */}
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />

            {isFetchingNextPage && (
                <div className="flex items-center justify-center py-6">
                    <Loader label={t('common_loading')} />
                </div>
            )}
        </>
    )

    return (
        <div className={cn(SEARCH_PANEL, className)}>
            {/*
             * A `<search>` landmark around a real `<form>`, and all three parts are doing work.
             *
             * The **form** is what makes Enter work: a bare input has no submit behaviour, so
             * legacy's field cannot be committed at all — the only way to search is to stop typing
             * and wait out its 1000ms debounce. Here Enter settles the term immediately and
             * records it as a recent, which is also the only way a term gets into the Recents list
             * without opening a result.
             *
             * **`<search>`** is the landmark, so a screen-reader user can jump straight here from
             * anywhere on the page. The element rather than `role="search"` on the form — same
             * role, and `useSemanticElements` is right that the element is the better spelling
             * where one exists. It has to be a *wrapper* rather than the form itself, because a
             * `<search>` has no submit behaviour to hang the Enter key on.
             *
             * And **no `role="search"` on the `<search>` either**, tried and reverted: the pair
             * would carry the landmark on browsers older than the element (Chrome/Safari/Firefox
             * all shipped it in late 2023), but `noRedundantRoles` flags it and is correct to —
             * this app's floor is well above that, and every other primitive here assumes as much.
             *
             * `noValidate` because there is nothing to validate: any string is a legitimate
             * search, including one that will match nothing.
             *
             * 16 on the sides, which is the inset the DS list row gives its avatar — so the
             * field's edge lines up with the rows under it at every width. `pb-3` rather than a
             * symmetric 16, because the first row brings 8 of its own.
             */}
            <search className="px-4 pt-4 pb-3">
                <form
                    data-testid="search-form"
                    noValidate
                    onSubmit={event => {
                        event.preventDefault()
                        commit()
                    }}
                >
                    <SearchBar
                        data-testid="search-field"
                        value={search}
                        onValueChange={setSearch}
                        label={t('search_field_label')}
                        clearLabel={t('search_field_clear')}
                        placeholder={t('search_field_placeholder')}
                        /*
                         * Autofocused, which legacy is not.
                         *
                         * This page exists to be typed into — it is reached by pressing a search
                         * glyph, and the field is the first control on it — so landing with the caret
                         * anywhere else costs every visitor a tap. The trade is a phone keyboard that
                         * opens over the Recents list; that is the behaviour every search screen on
                         * the device has, and the list is still there when the keyboard is dismissed.
                         *
                         * Safe as a *page*-level autofocus in a way it would not be inside a dialog
                         * or halfway down a document: there is nothing above it to scroll past, so
                         * focus cannot move the viewport.
                         */
                        autoFocus
                        /*
                         * `search` rather than the default `go`, so a phone's on-screen keyboard shows
                         * a magnifier on its action key. Costs nothing and is the only signal the
                         * virtual keyboard gets about what Enter does here.
                         */
                        enterKeyHint="search"
                        /*
                         * A creator's handle is not a word: capitalising the first letter and
                         * autocorrecting "ada" to "Ada" both change the term the reader typed, and on
                         * iOS both are on by default.
                         */
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                </form>
            </search>
            {body}
        </div>
    )
}
