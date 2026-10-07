'use client'

import { accountNsfwSettings, useAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { SearchBar } from '@shared/ui/search-bar'
import { useCallback, useEffect } from 'react'
import type { SearchChannel } from '../api/types'
import { useChannelSearch } from '../hooks/use-channel-search'
import { useRecentCreators } from '../hooks/use-recent-creators'
import { useSearchRecents } from '../hooks/use-search-recents'
import { SEARCH_PANEL } from '../lib/container'
import { SEARCH_ART } from '../lib/illustrations'
import { SEARCH_FOLLOWING_SIZE } from '../lib/search-page'
import { SearchFollowingList } from './search-following-list'
import { SearchRecentCreators } from './search-recent-creators'
import { SearchRecentsList } from './search-recents-list'
import { SearchSkeleton } from './search-skeleton'

/**
 * `/search` — everything below the page's back bar. A port of the Figma Search page (the *Search*
 * spec board: idle, typed, no results, and the four "no data" edge cases).
 *
 * ## Idle — three sections, each drawn only when it has something
 *
 * **Recents** (the terms, at most five, *Clear all history*), **Recent creators** (spaces opened
 * from here, at most five) and **Following** (ten of the spaces this account follows, *View all* →
 * `/following`). The edge-case comps hide each one independently when it is empty, and so does this.
 * With all three empty a signed-in reader gets the short "Search creators" prompt rather than a
 * field over an empty card.
 *
 * **Signed out, the idle screen is the field alone** ("Chỉ hiển thị search input + kết quả; ẩn tất
 * cả 3 section trên"). Global search stays public — only the sections that describe an account are
 * withheld, which is also why recents recorded under an anonymous session are not shown.
 *
 * The two device lists cannot be read on the server, so the idle body **holds** (an empty `flex-1`)
 * until both are known rather than painting the prompt and swapping it for a returning reader's
 * history a frame later.
 *
 * ## Typed — Following first, then Global search
 *
 * "Search Priority: (1 Following) Spaces/Creators đang follow → (2 Global search) Similar creators".
 * The followed list is capped at ten ("10 kết quả phù hợp nhất") and the global list paginates.
 * Following failing is silent (the hook explains); global failing is the error state.
 *
 * ## Sensitive spaces
 *
 * Hidden unless the account turned on *Show NSFW spaces when searching* (`nsfw_settings.nsfw_search`)
 * — "nếu user chưa bật filtering: Không show space NSFW". The spec's banner prompting the reader to
 * turn the setting on was struck from the board ("BỎ BANNER KÊU BẬT SETTINGS"), so there is none.
 *
 * ## No results — unchanged ("Case search không ra → Như cũ")
 *
 * ## The URL carries no term
 *
 * `/search?q=` would be shareable and is not implemented: legacy has no such parameter, and writing
 * it on every settle puts a `router.replace` on the typing path. The hook's `submit` is the seam a
 * `?q=` reader would use.
 */
export function SearchView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { currentUser, isAuthenticated } = useAuth()
    const hideNsfw = accountNsfwSettings(currentUser).nsfw_search !== true

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
    } = useChannelSearch({
        followingWhenIdle: isAuthenticated,
        followingPageSize: SEARCH_FOLLOWING_SIZE,
        hideNsfw,
    })
    const { recents, isReady: recentsReady, forget, clear } = useSearchRecents()
    const {
        creators,
        isReady: creatorsReady,
        remember: rememberCreator,
        reopen: reopenCreator,
        forget: forgetCreator,
    } = useRecentCreators()
    /* The store outlives the setting, so the filter is applied on read as well. */
    const visibleCreators = hideNsfw ? creators.filter(creator => !creator.isNsfw) : creators

    /**
     * Opening a row records two things: the term that found it (`record` — `q`, not the field) and
     * the space itself, for the Recent creators row ("creator mà user đã từng tìm hoặc truy cập").
     */
    const open = useCallback(
        (channel: SearchChannel) => {
            record()
            rememberCreator(channel)
        },
        [record, rememberCreator],
    )

    /*
     * The pagination sentinel. `enabled` detaches the observer while a page is in flight, which is
     * what keeps `inView` from re-firing for the whole request; `loadMore` is guarded as well.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    const hasFollowing = following.length > 0
    const hasResults = results.length > 0

    let body: React.ReactNode
    if (isIdle) {
        if (!isAuthenticated) {
            body = <div className="flex-1" aria-hidden="true" />
        } else if (!recentsReady || !creatorsReady) {
            body = <div className="flex-1" aria-hidden="true" />
        } else if (
            recents.length === 0 &&
            visibleCreators.length === 0 &&
            !hasFollowing &&
            !isFollowingLoading
        ) {
            /* A glyph, not art: this is the instruction, not something missing. */
            body = (
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="search"
                    title={t('search_idle_title')}
                />
            )
        } else {
            body = (
                <div className={cn('flex flex-col', RISE)}>
                    {recents.length > 0 && (
                        <SearchRecentsList
                            recents={recents}
                            onPick={submit}
                            onForget={forget}
                            onClear={clear}
                        />
                    )}
                    {visibleCreators.length > 0 && (
                        <SearchRecentCreators
                            creators={visibleCreators}
                            onOpen={reopenCreator}
                            onForget={forgetCreator}
                        />
                    )}
                    {isFollowingLoading ? (
                        <SearchSkeleton
                            count={4}
                            title={t('search_following')}
                            testId="search-following-placeholder"
                        />
                    ) : (
                        hasFollowing && (
                            <SearchFollowingList
                                title={t('search_following')}
                                channels={following}
                                onOpen={open}
                                viewAll
                                rowTestId="search-following-row"
                            />
                        )
                    )}
                </div>
            )
        }
    } else if (isLoading) {
        /*
         * The layout the results are about to have. The Following block is reserved only while
         * that request is actually in flight — an anonymous visitor's never is.
         */
        body = (
            <>
                {isFollowingLoading && (
                    <SearchSkeleton
                        count={2}
                        title={t('search_following')}
                        testId="search-following-loading"
                    />
                )}
                <SearchSkeleton title={t('search_global_results')} />
            </>
        )
    } else if (isError) {
        body = (
            <ChannelEmptyState
                className={cn('flex-1', RISE)}
                icon="exclamation-diamond"
                tone="error"
                title={t('search_error_title')}
                body={t('search_error_body')}
                action={
                    <Button
                        data-testid="search-retry"
                        variant="secondary"
                        size="large"
                        onClick={retry}
                    >
                        {t('common_retry')}
                    </Button>
                }
            />
        )
    } else if (isEmpty) {
        /* Legacy's words over the repo's actionable second line; no button — the field's own
           cancel is the way out, a few pixels above. */
        body = (
            <ChannelEmptyState
                className={cn('flex-1', RISE)}
                art={SEARCH_ART.empty}
                title={t('search_no_results_title')}
                body={t('search_no_results_body')}
            />
        )
    } else {
        body = (
            <>
                {hasFollowing && (
                    <SearchFollowingList
                        title={t('search_following')}
                        channels={following}
                        onOpen={open}
                        stagger
                        rowTestId="search-following-result"
                    />
                )}

                {/*
                 * `hasResults` is not redundant with `isEmpty`: a match in Following alone reaches
                 * this branch with an empty global list, and a heading over nothing is wrong.
                 */}
                {hasResults && (
                    <SearchFollowingList
                        title={t('search_global_results')}
                        channels={results}
                        onOpen={open}
                        stagger
                        rowTestId="search-result"
                    >
                        {/*
                         * The count, for screen readers only: results replace themselves under a
                         * field the reader is still typing into, with no navigation and no focus
                         * change, so without a live region nothing says the list changed. The
                         * server's total, formatted exactly.
                         */}
                        <p role="status" aria-live="polite" className="sr-only">
                            {t('search_results_count', {
                                count: total,
                                formatted: new Intl.NumberFormat(currentLanguage).format(total),
                            })}
                        </p>
                    </SearchFollowingList>
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
    }

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
             * 16 on the sides and 16 on top, as the comp's `Search Bars` instance is; nothing
             * below, because every section under it opens with its own 12px band.
             */}
            <search className="px-4 pt-4">
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
