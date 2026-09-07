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
import Image from 'next/image'
import { useEffect } from 'react'
import type { GiftRecipient } from '../api/gift-types'
import { useGiftRecipients } from '../hooks/use-gift-recipients'
import {
    GIFT_PREMIUM_FIELD_INSET,
    GIFT_PREMIUM_PANEL,
    GIFT_PREMIUM_PICKER_SCREEN,
    GIFT_PREMIUM_STATE_MIN,
} from '../lib/container'
import { GIFT_PREMIUM_ART } from '../lib/illustrations'
import { GiftFollowingStrip, GiftFollowingStripSkeleton } from './gift-following-strip'
import { GiftRecipientRow } from './gift-recipient-row'
import { GiftRecipientSkeleton } from './gift-recipient-skeleton'

/**
 * Step one — **who is this gift for?**
 *
 * A field, the spaces this account follows that match it, and the exhaustive list under them.
 *
 * ## Five states, and legacy renders two of them as an empty white card
 *
 * `docs/DEFINITION_OF_DONE.md` §1's loading / error / empty / success, plus the one this screen has
 * of its own:
 *
 * - **Idle** — nothing typed. The invitation ("Gift Premium, Share the Love"), which is what the
 *   screen is *for*: somebody who arrived from a drawer row does not necessarily know that a gift
 *   goes to a creator by handle.
 * - **Loading** — six row-shaped placeholders. Legacy shows a spinner inside the field and leaves
 *   the card blank underneath it.
 * - **Error** — a sentence and a retry. Legacy `console.error`s, empties both lists, and therefore
 *   renders *"Oops! No results found"* — telling somebody their search matched nobody when what
 *   actually happened is that the request failed.
 * - **Nothing matched** — Brand's art and legacy's own words, plus a second line that says what to
 *   try.
 * - **Success** — the two sections.
 *
 * ## Both sections are optional and neither implies the other
 *
 * `hasResults` is not the negation of `isEmpty`: `isEmpty` needs **both** lists empty, so a term
 * that matches only somebody you follow reaches the success branch with no global rows at all.
 * Without the gate that state drew a "Global search" heading over an empty `<ul>`.
 *
 * The heading itself is drawn only when the Following block is above it — a heading earns its line
 * by telling two things apart, and with one list on screen the field above already names it. The
 * section keeps its accessible name either way.
 *
 * ## The field is not sticky, and that is the panel's doing
 *
 * `GIFT_PREMIUM_PANEL` clips its children so the rows' square corners are cut by the card's rounded
 * ones, which makes it the containing block a `sticky` descendant would stick inside — the field
 * would park itself at the bottom of the card rather than under the bar. Legacy's field *is*
 * sticky; here the page's own bar is the chrome that stays, which is the trade `SearchView`
 * documents for the identical construction.
 */
export function GiftRecipientPicker({
    onSelect,
}: {
    onSelect: (recipient: GiftRecipient) => void
}) {
    const { t } = useTranslation()
    const {
        search,
        setSearch,
        commit,
        following,
        results,
        isIdle,
        isFollowingLoading,
        isResultsLoading,
        isError,
        isEmpty,
        retry,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
    } = useGiftRecipients()

    /**
     * The sentinel, and the effect that acts on it.
     *
     * `enabled` detaches the observer once there is nothing left to fetch, and detaching it *while*
     * a page is in flight is what keeps `inView` from re-firing for the duration of the request.
     * `loadMore` is guarded in the hook as well — belt and braces, because the failure here is a
     * request loop rather than a wrong pixel.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    const hasFollowing = following.length > 0
    const hasResults = results.length > 0

    return (
        /*
         * The column — and it is what paints the phone's plane, not `<main>`: see
         * `GIFT_PREMIUM_PICKER_SCREEN` for why one `<main>` cannot serve all three steps.
         *
         * **No side padding below `md`.** The screen *is* the surface there and the content is inset
         * from the bezel by the row's own `px-4`; a `px-4` here would double it at one end and be
         * wrong at the other (`docs/DESIGN_SYSTEM.md` §6). `md:pb-6` is what leaves the card's bottom
         * two corners something to be seen against once it becomes one.
         */
        <div className={cn(GIFT_PREMIUM_PICKER_SCREEN, 'flex flex-1 flex-col md:pb-6')}>
            <div className={GIFT_PREMIUM_PANEL}>
                {/*
                 * **The field is the panel's first child, not a control floating above it.**
                 *
                 * Legacy's card is one white block holding the field, both lists and the empty
                 * states (`padding: '24px'`), and `/search` is built the same way. Floated above, it
                 * reads as two surfaces for one screen: its own inset stops lining up with the rows
                 * underneath, and the gap between them is page colour interrupting a control and the
                 * thing it controls.
                 *
                 * A `<search>` landmark around a real `<form>`, and all three parts do work. The
                 * **form** is what makes Enter settle the term — a bare input has no submit
                 * behaviour, so legacy's field cannot be committed at all and the only way to search
                 * is to stop typing and wait out its 1000ms debounce. **`<search>`** is the
                 * landmark, so a screen-reader user can jump straight here; it has to be a
                 * *wrapper* rather than the form itself, because a `<search>` has no submit
                 * behaviour to hang Enter on. `noValidate` because any string is a legitimate
                 * search, including one that will match nobody.
                 */}
                <search className={GIFT_PREMIUM_FIELD_INSET}>
                    <form
                        data-testid="premium-gift-form"
                        noValidate
                        onSubmit={event => {
                            event.preventDefault()
                            commit()
                        }}
                    >
                        <SearchBar
                            data-testid="premium-gift-search"
                            value={search}
                            onValueChange={setSearch}
                            label={t('giftpremium_search_label')}
                            clearLabel={t('giftpremium_search_clear')}
                            placeholder={t('giftpremium_search_placeholder')}
                            /*
                             * Autofocused, as legacy's is: this step exists to be typed into, it
                             * is the first control under the bar, and there is nothing above it
                             * for focus to scroll past. Safe as a *page*-level autofocus in a way
                             * it would not be inside a dialog.
                             */
                            autoFocus
                            /* A magnifier on a phone's action key — the only signal the
                               virtual keyboard gets about what Enter does here. */
                            enterKeyHint="search"
                            /* A creator's handle is not a word: iOS capitalises the first letter
                               and autocorrects "ada" to "Ada" by default, and both change the term
                               the reader typed. */
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                    </form>
                </search>

                {isIdle ? (
                    <GiftInvitation />
                ) : isError ? (
                    <ChannelEmptyState
                        testId="premium-gift-error"
                        className={cn('flex-1', GIFT_PREMIUM_STATE_MIN, RISE)}
                        icon="exclamation-diamond"
                        tone="error"
                        title={t('giftpremium_error_title')}
                        body={t('giftpremium_error_body')}
                        action={
                            <Button
                                data-testid="premium-gift-retry"
                                variant="secondary"
                                size="large"
                                onClick={retry}
                            >
                                {t('common_retry')}
                            </Button>
                        }
                    />
                ) : isEmpty ? (
                    /*
                     * Legacy's own words for this state ("Oops! No results found"), which is what
                     * people recognise, over the repo's standard actionable second line. The term is
                     * deliberately **not** quoted back: it is four lines up in a field the reader is
                     * still looking at, and interpolating it would be another string to translate
                     * into nine locales for something already on screen.
                     *
                     * No action button either — the way out is the field's own cancel, a few pixels
                     * above. The call `SearchView` and `BlockedAccountsView` both make.
                     */
                    <ChannelEmptyState
                        testId="premium-gift-empty"
                        className={cn('flex-1', GIFT_PREMIUM_STATE_MIN, RISE)}
                        art={GIFT_PREMIUM_ART.empty}
                        title={t('giftpremium_no_results_title')}
                        body={t('giftpremium_no_results_body')}
                    />
                ) : (
                    <>
                        {/*
                         * **Two sections, each showing its own state** — which is what makes the
                         * placeholder match the screen. They were behind one merged `isLoading`, so
                         * the panel drew six row-shaped bars until *both* lists had settled and then
                         * dropped everything 215px to make room for a strip it had not reserved.
                         * `useGiftRecipients` splits the two; see its note, and
                         * `GiftFollowingStripSkeleton` for why drawing a conditional block is safe
                         * here.
                         *
                         * **A strip of faces, not more rows.** The block above the results answers
                         * "did you mean one of the people you already follow?", which is usually a
                         * two- or three-item answer and is the one most gifts actually want — so it
                         * is a horizontal strip of avatars, as legacy draws it here. See
                         * `GiftFollowingStrip` for what that costs and why it is not Swiper.
                         */}
                        {isFollowingLoading ? (
                            <GiftFollowingStripSkeleton />
                        ) : (
                            hasFollowing && (
                                <GiftFollowingStrip
                                    recipients={following}
                                    onSelect={onSelect}
                                    className={RISE}
                                />
                            )
                        )}

                        {(hasResults || isResultsLoading) && (
                            <section aria-label={t('giftpremium_global')} className={RISE}>
                                {/*
                                 * The header earns its line by telling two blocks apart, so it is
                                 * drawn whenever one is above — **including while that one is still a
                                 * placeholder**, which is the whole point: it is 48px of the real
                                 * layout, and a skeleton that omits it reserves 48px too few.
                                 */}
                                {(hasFollowing || isFollowingLoading) && (
                                    <ListHeader rule={false}>
                                        <ListHeaderTitle as="h2">
                                            {t('giftpremium_global')}
                                        </ListHeaderTitle>
                                    </ListHeader>
                                )}
                                {/*
                                 * One or the other, never both: `isFetching` is also true for a
                                 * background refetch of a key that already has rows, and rendering
                                 * the placeholder *above* those rows would double the list's height
                                 * for the length of a request nobody asked for.
                                 */}
                                {isResultsLoading ? (
                                    <GiftRecipientSkeleton />
                                ) : (
                                    <ul data-testid="premium-gift-results" className="list-none">
                                        {results.map((recipient, index) => (
                                            <GiftRecipientRow
                                                key={recipient.slug}
                                                recipient={recipient}
                                                /*
                                                 * No rule above the first row, in either
                                                 * arrangement. It used to draw one whenever the
                                                 * Following block was above — correct while that
                                                 * block was a list of rows this one continued, and
                                                 * wrong now it is a strip of tiles with its own mass
                                                 * and its own bottom padding: the "Global search"
                                                 * header is what separates them, and a hairline
                                                 * directly under a header is the DS's rule drawn
                                                 * twice.
                                                 */
                                                rule={index > 0}
                                                onSelect={() => onSelect(recipient)}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}

                        {/*
                         * The pagination sentinel and its spinner. `useInView`'s default 600px lead
                         * time means the next page is usually in the cache before the reader reaches
                         * the bottom, so this row is rare rather than a spinner per scroll.
                         */}
                        <div ref={sentinelRef} className="flex justify-center py-4">
                            {isFetchingNextPage && <Loader label={t('common_loading')} />}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

/**
 * The opening block: Brand's picture, the pitch, and nothing to press.
 *
 * Not a `ChannelEmptyState` — nothing is missing here and nothing has failed. It is the screen's
 * *instruction*, and it is the one thing legacy's version of this page gets unambiguously right:
 * "Gift Premium, Share the Love", then a sentence explaining that this buys Premium **for somebody
 * else**, which is not otherwise deducible from a search field.
 *
 * The art is declared at the box it is drawn in (`GIFT_PREMIUM_ART.invite`) and `priority` is not
 * set: it is below the bar on the first screen but it is 20 KB of decoration, and the field above it
 * is what the reader needs first.
 */
function GiftInvitation() {
    const { t } = useTranslation()

    return (
        <div
            data-testid="premium-gift-invite"
            className={cn(
                'flex flex-1 flex-col items-center justify-center gap-4 px-3 py-10 text-center',
                GIFT_PREMIUM_STATE_MIN,
                RISE,
            )}
        >
            <Image
                src={GIFT_PREMIUM_ART.invite.src}
                alt=""
                width={GIFT_PREMIUM_ART.invite.width}
                height={GIFT_PREMIUM_ART.invite.height}
                /*
                 * Decorative: the heading under it says the same thing in the reader's own language,
                 * so an `alt` would have a screen reader announce the invitation twice.
                 */
                aria-hidden
                className="h-auto w-full max-w-[400px]"
            />
            {/* The empty-state treatment this app uses everywhere: a 16/600 title over a body
                capped at 400px, so the sentence wraps at a readable measure on a 612 column. */}
            <h2 className="type-body-strong text-(--text-title)">
                {t('giftpremium_invite_title')}
            </h2>
            <p className="type-dense-default max-w-[400px] text-(--text-body)">
                {t('giftpremium_invite_body')}
            </p>
        </div>
    )
}
