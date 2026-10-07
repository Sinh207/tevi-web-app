'use client'

import { ChannelEmptyState } from '@features/channel'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
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
import { SearchSectionHeader } from './search-section-header'
import { SearchFollowingSkeleton, SearchSkeleton } from './search-skeleton'

/**
 * **Pick a creator** — `/search`'s two lists, under somebody else's question.
 *
 * `/gift-star` is the only caller. What it does is worth stating plainly, because *Gift Star*
 * suggests otherwise: **nothing is gifted here.** It is a chooser — pressing a creator navigates to
 * their space, and the gift is made there, through `features/donation`. Legacy is the same
 * (`containers/myStar/components/sheetGiftStar`, whose whole select handler is
 * `router.push('/@' + slug)`), and Star never moves in this file.
 *
 * ## Why it lives in `features/search` and not beside the screen that links to it
 *
 * It is `useChannelSearch`, `SearchChannelRow` and `SearchFollowingStrip`, unchanged. Building it in
 * `features/my-star` would mean either exporting the hook and the model out of this feature — which
 * its barrel refuses, at length, for the reason CLAUDE.md gives about calling axios from components —
 * or writing a second search. Legacy wrote the second one: its sheet reaches into
 * `@containers/giftPremium` for four components and a hook, which is how the gift-premium picker and
 * the search page came to debounce at different intervals.
 *
 * So the **question** is this feature's — "which creator?" — and what the answer is *for* is the
 * route's. That is why the page owns the title and this file has no idea what a gift is.
 *
 * ## A page, not a dialog, and the phone is what decided it
 *
 * It was a capped dialog first. Measured on a 390×844 phone with a term typed, that came out 358×416
 * — half the screen — of which the field, the Following grid and the section heading left **one and a
 * half result rows** visible, while the infinite list behind them had already pulled a hundred rows
 * into a 438px scrollport. And `dvh` does not shrink for a virtual keyboard (it tracks browser
 * chrome, not the IME), so `max-h: 72dvh` still measured against the full 844 with the keyboard up —
 * putting the results under it.
 *
 * `features/payment/routes.ts` had already written the rule this follows, about the row directly
 * above *Gift Star* on the same screen: a press that **is a navigation** gets a route, and a press
 * that would tear down something behind it gets a dialog. Pressing a row in a list of destinations is
 * the first kind, so `/get-star` and `/gift-star` are both pages. Nothing presses Gift Star from the
 * middle of another task today, so unlike `/get-star` there is no dialog half — add one when
 * something needs it.
 *
 * Reading legacy as "a dialog" was the mistake: its `ResponsiveModal` is a **`SwipeableDrawer` at
 * 85vh** on a phone, i.e. legacy treats this as a screen there and a step on desktop. This app ships
 * no bottom sheet, so a page is the *closer* port of that behaviour, not a divergence from it.
 *
 * ## The Following list arrives before anything is typed
 *
 * `followingWhenIdle` — see the option on the hook. It is the one behavioural difference from
 * `SearchView`, and it is what makes the screen answer its own question: the reader did not come here
 * to search, they were asked **who**, and the spaces they follow are the answer most of them want.
 * `/search` opens on Recents, which is right for a search page and useless here — a remembered *term*
 * is not a creator.
 *
 * ## …with Recents underneath it, not instead of it
 *
 * The idle screen is **both**, in that order, and the order is the argument: the grid answers "who?"
 * with faces, which is what the reader was asked; the terms answer "what did I look for last time",
 * which is a second-best answer and belongs second. `/search` shows only Recents because it has no
 * question of its own to answer — a search page opens on what you searched before.
 *
 * The same `SearchRecentsList` and the same store, one history per **account** rather than one per
 * screen, so a term typed here is offered on `/search` and the other way round. That is deliberate:
 * "who have I looked for" is one list wherever the looking happened.
 *
 * The prompt below is now the **neither** case — no follows and no history — rather than the
 * no-follows case.
 *
 * ## No signed-out wall
 *
 * The same call `/search` makes and pins in its spec ("gives a signed-out visitor a working field
 * rather than a prompt"), and the same one `/get-star` makes: the **action** here is choosing a
 * creator and going to their space, which is public. Gating the route would be gating a public thing
 * because of what the reader might do three screens later, which is what
 * `docs/DEFINITION_OF_DONE.md` §3 forbids. `/my-star`'s prompt is not a counter-example — there the
 * account's balance *is* the content, so a guest has nothing to render at all.
 *
 * A guest simply gets no Following grid (`useChannelSearch` gates that query, not this screen), and
 * the account is asked for where the money moves: the donate control on the space this sends them to.
 */
export function CreatorPickerView({
    className,
    testId,
}: {
    className?: string
    /**
     * Base `data-testid`. Derives `-field` and `-retry`; each result row is `-item` carrying
     * `data-channel-slug`, so a test can address one creator without matching a display name in nine
     * locales. The `<form>` gets none — it is furniture around the field, and the field is what a
     * test types into.
     */
    testId?: string
}) {
    const { t } = useTranslation()
    const {
        search,
        setSearch,
        submit,
        commit,
        record,
        following,
        isFollowingLoading,
        results,
        isIdle,
        isLoading,
        isError,
        isEmpty,
        retry,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
    } = useChannelSearch({ followingWhenIdle: true })
    const { recents, isReady: recentsReady, forget, clear } = useSearchRecents()

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    const hasFollowing = following.length > 0
    const hasRecents = recents.length > 0
    const hasResults = results.length > 0

    /**
     * The idle screen is two independent blocks, and **each one waits for its own answer**.
     *
     * The grid comes from a request (`isFollowingLoading`) and the terms from `localStorage`
     * (`recentsReady` — see `useSearchRecents`), so they are never known at the same moment. Two
     * gates rather than one: a single "still loading" flag would either hold the grid back for a
     * disk read or paint the prompt before the request had answered, and the prompt is the
     * *neither* case — the one state that must not be shown while either half is still unknown.
     */
    const idleKnown = !isFollowingLoading && recentsReady
    const isIdleEmpty = idleKnown && !hasFollowing && !hasRecents

    const body = isIdle ? (
        isIdleEmpty ? (
            /*
             * Nothing followed and nothing searched before — or nobody signed in, which produces the
             * same screen. A glyph rather than art: nothing is *missing*, this is the instruction,
             * which is the distinction `ChannelEmptyState` draws and the same call `/search`'s idle
             * state makes. Legacy renders nothing at all in this state: its `Following` returns
             * `null` for an empty list, its `GlobalSearch` returns `null` with no term and
             * `NoResultFound` needs one, so its sheet opens as a field over blank space.
             *
             * Drawn only once **both** halves have answered — see `idleKnown` above.
             */
            <ChannelEmptyState
                className={cn('flex-1', RISE)}
                icon="search"
                title={t('search_idle_title')}
            />
        ) : (
            /*
             * Faces first, terms second — see the note at the top for why that order rather than the
             * reverse. Both blocks arrive with the same `RISE` the rest of the screen uses, and each
             * is withheld when it is empty: an empty grid takes its heading with it, and
             * `SearchRecentsList` documents why an empty Recents section is a header and a Clear
             * button over nothing.
             */
            <>
                {/*
                 * The grid, or the grid's own shape while it is on its way — **not** a stack of
                 * 80px rows, which is what stood here and is the one thing this block never
                 * resolves into. `SearchFollowingSkeleton` is the strip's header over the strip's
                 * tiles, so the block that arrives is the block that was reserved.
                 *
                 * The heading is part of that skeleton because the real strip carries its own, and
                 * it prints the same word — a section label is not data.
                 */}
                {isFollowingLoading ? (
                    <SearchFollowingSkeleton label={t('search_following')} />
                ) : (
                    hasFollowing && (
                        <SearchFollowingStrip
                            channels={following}
                            onOpen={record}
                            className={RISE}
                        />
                    )
                )}
                {/* Held until the device's list has been read, for the reason `SearchView`'s idle
                    branch spells out: an unread history and an empty one are the same value, and
                    guessing shows a *Recents* header that then disappears. */}
                {recentsReady && hasRecents && (
                    <SearchRecentsList
                        recents={recents}
                        /* A recent row hands over a whole term, so it skips the debounce — see
                           `submit` on the hook. */
                        onPick={submit}
                        onForget={forget}
                        onClear={clear}
                        className={RISE}
                    />
                )}
            </>
        )
    ) : isLoading ? (
        /* The layout the answer will have — the strip's shape above the rows', gated on the
           request that fills it. `SearchView`'s loading branch carries the reasoning. */
        <>
            {isFollowingLoading && (
                <>
                    <SearchFollowingSkeleton label={t('search_following')} />
                    <SearchSectionHeader title={t('search_global_results')} />
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
                <Button
                    data-testid={subTestId(testId, 'retry')}
                    variant="secondary"
                    size="large"
                    onClick={retry}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={SEARCH_ART.empty}
            title={t('search_no_results_title')}
            body={t('search_no_results_body')}
        />
    ) : (
        <>
            {/*
             * The **grid**, where legacy's sheet draws a vertical list of 80px rows
             * (`LAYOUT.VERTICAL`). A stated divergence: this app already answers "spaces you follow
             * that match" with a grid of faces on `/search`, and answering the identical question two
             * different ways in two places is the drift `SearchFollowingStrip` was extracted to stop.
             * Legacy's own reason for the vertical layout was the shape of its sheet, which this app
             * does not ship.
             */}
            {hasFollowing && <SearchFollowingStrip channels={following} onOpen={record} />}

            {hasResults && (
                <section aria-label={t('search_global_results')}>
                    {/* The heading earns its line only when the strip is above it: with one list
                        on screen the page title is the label, and the section keeps its accessible
                        name either way. (`/search` always draws it — its comps title both lists.) */}
                    {hasFollowing && <SearchSectionHeader title={t('search_global_results')} />}

                    <ul className="flex list-none flex-col gap-3 px-6 pb-3">
                        {results.map((channel, index) => (
                            <SearchChannelRow
                                key={channel.slug}
                                testId={subTestId(testId, 'item')}
                                channelSlug={channel.slug}
                                channel={channel}
                                /*
                                 * `record` and not a handler of this screen's own: pressing a row is
                                 * a navigation the `Link` performs, and all that is left to do is
                                 * remember the term that found it. See the hook on why it is `record`
                                 * rather than `commit`.
                                 */
                                onOpen={record}
                                /* First screen only, and the same 40ms ramp `/search` uses. */
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
             * The same `<search>` / `<form>` / `SearchBar` stack `SearchView` documents at length —
             * the landmark so a screen reader can jump here, the form so Enter commits (a bare input
             * has no submit behaviour, which is why legacy's field cannot be committed at all), and
             * the 16px inset so the field's edge lines up with the rows beneath it.
             *
             * **Not autofocused**, where `/search` is. That page is reached by pressing a search
             * glyph and has nothing above its field, so taking the caret costs nothing; this one is
             * reached by pressing *Gift Star*, and its first useful state is the Following grid —
             * opening a phone keyboard over the answer the reader came for is the wrong default.
             */}
            <search className="px-4 pt-4 pb-3">
                <form
                    noValidate
                    onSubmit={event => {
                        event.preventDefault()
                        commit()
                    }}
                >
                    <SearchBar
                        data-testid={subTestId(testId, 'field')}
                        value={search}
                        onValueChange={setSearch}
                        label={t('search_field_label')}
                        clearLabel={t('search_field_clear')}
                        placeholder={t('search_field_placeholder')}
                        enterKeyHint="search"
                        /* A handle is not a word — iOS capitalises and autocorrects one by default,
                           and both change the term that was typed. */
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
