'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { FilterMenu } from '@shared/components/filter-menu'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderAction, ListHeaderTitle, ListSeparator } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { useEffect } from 'react'
import { FOLLOWED_ORDERINGS, type FollowedOrdering } from '../api/types'
import { useFollowedChannels } from '../hooks/use-followed-channels'
import { useFollowedLives } from '../hooks/use-followed-lives'
import { formatExactCount } from '../lib/channel-format'
import { FOLLOWING_ART } from '../lib/illustrations'
import { ChannelEmptyState } from './channel-empty-state'
import { FollowingChannelRow } from './following-channel-row'
import { FollowingLimitNotice } from './following-limit-notice'
import { FollowingLiveRow } from './following-live-row'
import { FollowingSkeleton } from './following-skeleton'

/**
 * The screen's content surface — the blocked list's panel, unchanged.
 *
 * `overflow-clip`, not `overflow-hidden`: the list's header is `sticky` (see below), and
 * `overflow: hidden` makes the card a scroll container, so the header would stick inside the card's
 * own box and never move. `clip` still tucks the first and last rows' square corners inside the
 * card's rounded ones without creating a scrollport.
 *
 * `--background-surface` rather than `--background-listing`, which is `--black` in dark mode and
 * would make the card vanish; `flex-1` so it fills the viewport without arithmetic; all four corners
 * rounded from `md` with the page's `md:pb-6` behind the bottom two.
 */
const SURFACE =
    'flex flex-1 flex-col overflow-clip bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * `/following` — the spaces this account follows, and which of them are on air.
 *
 * ## Five states, and the fifth is the one legacy does not have
 *
 * DoD §1's loading / error / empty / success, plus **signed out** — because the app always keeps an
 * anonymous session, so `currentUser` being present says nothing. An anonymous visitor who reaches
 * this URL gets a prompt to sign in, not an empty list telling them they follow nobody. The prompt
 * gates the *action* (`useRequireAuth` raises the login dialog) rather than redirecting, per DoD §3:
 * the URL stays put and signing in leaves them on the screen they asked for. Legacy renders the
 * empty state for a guest.
 *
 * ## Both headers stick, at the same offset
 *
 * Legacy pins three things — "Live now" at `top: 48`, "Following" at `top: 56`, the limit alert at
 * `top: 112.5` — inside a scroll container of its own. This app scrolls the **document**, and the
 * top of the viewport already holds a 60px bar at every width: the global `AppTopBar` below `md`
 * (`(tabs)/layout.tsx`), `PageBackBar` from `md` (`following/page.tsx`). Both are `sticky top-0`
 * and both are `h-[60px]`, so each header parks at `top-[60px]` with no breakpoint-dependent
 * offset. Change either bar's height and this number moves with it.
 *
 * Both use the **same** offset, and they never collide because of where each one sits: "Live now"
 * is inside the strip's own wrapper, so it can only stick while that block is on screen and is
 * carried off with it; "Following" is a direct child of the card, so it takes the slot over as the
 * strip leaves. That hand-off is what legacy's three stacked offsets were trying to fake.
 *
 * ## The Live now strip fails quietly
 *
 * `useFollowedLives` publishes `isError` and this drops the whole block on it. An error card over a
 * working follow list spends the reader's attention on the wrong thing, and an empty strip would
 * claim nobody is live — which the screen does not know. See the hook.
 *
 * ## The limit notice is a notice
 *
 * Past 900 follows the screen says the ceiling is 1,000. It is not a gate: the Follow button is on
 * the channel page, so this screen cannot refuse anything, and a client-side cap would only hide the
 * backend's own error. `FOLLOWING_WARN_AT` records the environment-dependent version of this number
 * that legacy ships and why it is one constant here.
 *
 * ## Two headings, one level apart
 *
 * `/following/page.tsx` renders `PageBackBar`, which carries the page's `h1` — **from `md` up
 * only**, since the bar is hidden on a phone (that page's own note says why). Everything in here is
 * a **section** under it and takes `h2`: "Live now" and the follow list's own header, which repeats
 * the word "Following" on purpose. The bar names the screen, this names the section, and without it
 * the card reads as two headed sections and one unheaded remainder — on a phone it is also the only
 * thing naming the screen at all. See the header itself.
 *
 * ## The list is a `<ul>`, and the count is a live region
 *
 * It is a list of spaces; a stack of `<div>`s says none of that to a screen reader. The count is
 * `sr-only` — the design has no line for it — but it stays a live region because unfollowing is
 * otherwise silent: the row is `aria-hidden` while it plays its exit, so without it the only feedback
 * is the toast.
 */
export function FollowingView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()

    const {
        entries,
        total,
        ordering,
        setOrdering,
        isLoading,
        isError,
        isReordering,
        isEmpty,
        isSignedOut,
        isOverLimit,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        pendingSlug,
        exitingSlugs,
        togglePin,
        toggleMute,
        unfollow,
    } = useFollowedChannels()

    const lives = useFollowedLives()

    /**
     * The sentinel, and the effect that acts on it. `enabled` detaches the observer once there is
     * nothing left to fetch — and while a page is in flight, which is what keeps `inView` from
     * re-firing for the whole duration of the request. `loadMore` is guarded in the hook as well;
     * belt and braces, because the failure here is a request loop rather than a wrong pixel.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    /**
     * Which rows draw a hairline above them: **every row that has a *visible* row above it.**
     *
     * Not `index > 0`, and not a `:not(:first-child)` rule in CSS — both count rows that are still
     * mounted, and during the exit the row on its way out *is* still mounted at a height of nearly
     * zero. The row beneath it would keep a rule now sitting flush against the card's top edge. One
     * pass with a carried flag rather than a `slice().some()` per row, which is quadratic on a list
     * built to be paginated. Same construction as `FollowRequestsView`.
     */
    const rules: boolean[] = []
    let visibleAbove = false
    for (const entry of entries) {
        rules.push(visibleAbove)
        if (!exitingSlugs.has(entry.slug)) visibleAbove = true
    }

    /** The two orderings, labelled. Built here rather than in `lib/` because it is only labels. */
    const sortOptions = FOLLOWED_ORDERINGS.map(value => ({
        key: value,
        label: t(
            value === '-last_activity_at'
                ? 'following_sort_last_activity'
                : 'following_sort_last_follow',
        ),
    }))
    const sortLabel = sortOptions.find(option => option.key === ordering)?.label ?? ''

    /**
     * The Live now block, or nothing.
     *
     * Absent while bootstrapping and while signed out as well as on error: a strip of live streams
     * above a sign-in prompt is a promise the screen cannot keep, and the query is gated on the same
     * account anyway.
     *
     * ## It has **no loading state**, and that is the deliberate part
     *
     * The common case is that nobody a reader follows is live, so a "Live now" header over two
     * shimmer rows would appear and then vanish for most people on most visits — a layout shift
     * standing in for content that was never coming. Nothing below it depends on its height, and the
     * list underneath is already showing its own skeleton, so there is no moment where the screen
     * looks idle. The strip simply arrives if there is anything in it.
     *
     * ## One entrance for the block, and the disclosure is instant both ways
     *
     * The strip is a **unit** — a header, its rows and the band under them — and it arrives all at
     * once, from its own query, after the list below it has already painted. So the `RISE` is on the
     * block and there is no per-row stagger: staggering inside a container that is itself animating
     * is two animations arguing, and the thing that actually arrived here is the section.
     *
     * That also settles "Show more" / "Show less", which used to rise the revealed rows in and then
     * make them vanish on the way back — an entrance with no exit, which is the asymmetry that
     * reads as broken. Both directions are now immediate, which is the right answer for a press:
     * the reader asked for the rest of the list and gets it in the same frame. It cannot reuse the
     * row exit the follow list uses, either — these rows sit in a `gap-3` column, so a row
     * collapsing to zero height would leave its 12px gap behind.
     */
    const liveBlock =
        isBootstrapping ||
        isSignedOut ||
        lives.isError ||
        lives.isLoading ||
        lives.total === 0 ? null : (
            <div className={RISE}>
                {/* Sticks at the same `top-[60px]` as the list header — see "Both headers stick". */}
                <ListHeader className="sticky top-[60px] z-10 bg-(--background-surface)">
                    <ListHeaderTitle as="h2">{t('following_live_now')}</ListHeaderTitle>
                </ListHeader>
                <ul className="flex list-none flex-col gap-3 p-4">
                    {lives.visible.map(live => (
                        <FollowingLiveRow
                            testId="channel-following-live"
                            /*
                             * The **channel's** slug, which is what `data-channel-slug` says it is.
                             * This passed `live.code` — the event's id — so the attribute named one
                             * thing and carried another, and the home page's Lives tab would have
                             * had to copy the mistake to stay consistent with it. Found when that
                             * second caller arrived.
                             */
                            channelSlug={live.channel?.slug ?? undefined}
                            key={live.code}
                            live={live}
                            locale={currentLanguage}
                        />
                    ))}
                </ul>
                {(lives.canExpand || lives.canCollapse) && (
                    <div className="flex justify-center pb-4">
                        {/*
                         * `ghost`, so the control reads as secondary to the streams above it, and
                         * the glyph follows the direction of travel. `aria-expanded` rather than a
                         * changed label alone: a screen reader should be told this is a disclosure,
                         * not two different buttons that happen to swap places.
                         */}
                        <Button
                            data-testid="channel-following-lives-toggle"
                            variant="ghost"
                            size="small"
                            aria-expanded={lives.canCollapse}
                            onClick={lives.canCollapse ? lives.collapse : lives.expand}
                        >
                            <Icon name={lives.canCollapse ? 'angle-up' : 'angle-down'} size={16} />
                            {t(lives.canCollapse ? 'following_show_less' : 'following_show_more')}
                        </Button>
                    </div>
                )}
                <ListSeparator size="large" />
            </div>
        )

    const list = isBootstrapping ? (
        <FollowingSkeleton />
    ) : isSignedOut ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="user-heart-alt"
            title={t('following_signed_out_title')}
            body={t('following_signed_out_body')}
            action={
                /* The action *is* the gate: `useRequireAuth` raises the dialog when there is no real
                   account and runs the callback when there is — by which point there is nothing left
                   to do, because the query un-gates itself and this branch stops rendering. Hence
                   the empty callback. */
                <Button
                    data-testid="channel-following-sign-in"
                    variant="primary"
                    size="large"
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    ) : isLoading ? (
        <FollowingSkeleton />
    ) : isError ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('following_error_title')}
            body={t('following_error_body')}
            action={
                <Button
                    data-testid="channel-following-retry"
                    variant="secondary"
                    size="large"
                    onClick={refetch}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={FOLLOWING_ART.empty}
            title={t('following_empty_title')}
            body={t('following_empty_body')}
            action={
                /*
                 * Legacy's own action on this state, and its own destination — "Explore Creators" →
                 * `/search`. It is the only action that can change the state: an empty follow list
                 * is emptied by finding somebody to follow, and nothing on this screen can do that.
                 *
                 * A literal rather than `features/search`'s `SEARCH_PATH`, because a feature may not
                 * import another feature's internals — the same trade `TAB_PATHS` makes for
                 * `/following`, and recorded in `lib/routes.ts`.
                 */
                <Button
                    data-testid="channel-following-find-people"
                    variant="accent"
                    size="large"
                    render={<Link href="/search" />}
                >
                    {t('following_empty_action')}
                </Button>
            }
        />
    ) : (
        <>
            {/*
             * The count, for screen readers only — the design has no line for it.
             *
             * It is the **server's** total, so it does not move when a row is hidden pending its
             * unfollow; it drops five seconds later, when the request goes out and the row leaves
             * the cache. That is the honest number for it to report (the space is still followed
             * until then), and the press is not silent regardless — the toast is a live region and
             * carries the name and the Undo. What this covers is the *settled* change, which
             * nothing else announces.
             *
             * `Intl` formats the number (`1,024` is `1.024` in German) and it is the exact count
             * rather than a compact one: a rounded total would be visibly wrong next to the rows it
             * counts.
             */}
            <p role="status" aria-live="polite" className="sr-only">
                {t('following_count', {
                    count: total,
                    formatted: formatExactCount(total, currentLanguage),
                })}
            </p>

            {/*
             * Dimmed and `aria-busy` while a different ordering is in flight — see `isReordering`
             * and the `placeholderData` note in the hook. These rows are the *previous* ordering's,
             * kept on screen instead of being replaced by the skeleton, so the screen has to say
             * that it is working rather than look settled under a control that already reads the new
             * value. `pointer-events-none` with it: a menu opened on a row that is about to move
             * would act on the right space in the wrong place.
             *
             * The transition is on opacity only, so nothing reflows — and it is short, because this
             * is a state the reader should barely catch.
             */}
            <ul
                aria-busy={isReordering || undefined}
                className={cn(
                    'list-none transition-opacity duration-150',
                    isReordering && 'pointer-events-none opacity-60',
                )}
            >
                {entries.map((entry, index) => (
                    <FollowingChannelRow
                        testId="channel-following-row"
                        channelSlug={entry.slug}
                        key={entry.slug}
                        channel={entry}
                        rule={rules[index]}
                        pending={pendingSlug === entry.slug}
                        busy={pendingSlug !== null}
                        exiting={exitingSlugs.has(entry.slug)}
                        onTogglePin={() => togglePin(entry)}
                        onToggleMute={() => toggleMute(entry)}
                        onUnfollow={() => unfollow(entry)}
                        /* First screen only: rows appended by pagination mount below the fold and
                           are scrolled to, not revealed. 40ms rather than 60, because ten rows at
                           60 would still be arriving 600ms in. */
                        enterDelay={index < 10 ? index * 40 : 0}
                        locale={currentLanguage}
                    />
                ))}
            </ul>

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
        <div className={cn(SURFACE, className)}>
            {liveBlock}

            {/*
             * The list's own header: its name, and the ordering control beside it — legacy's
             * arrangement for this row, unchanged.
             *
             * ## The word appears twice on the screen, and that is the intent
             *
             * The bar above says "Following" too. This shipped without the label for a while on the
             * argument that two identical titles 44px apart read as a bug — but the two are not the
             * same statement: the bar names the **screen**, this names the **section**, and the
             * section genuinely needs naming because there is a second one ("Live now") directly
             * above it whenever anybody followed is on air. Drop the label and that block reads as
             * two headed sections and one unheaded remainder.
             *
             * ## `h2`, not a second `h1`
             *
             * `PageBackBar` carries the `h1`. This is a section inside it, so it is one level down —
             * which is also what keeps the document to a single top-level heading (pinned in
             * `e2e/following.spec.ts`). A copy-paste that makes this an `h1` gives the page two, and
             * nothing on screen changes to say so.
             *
             * `justify-between` is `ListHeader`'s own, so with a title and an action there is
             * nothing to position by hand — the `ms-auto` this needed while the row was
             * title-only is gone.
             *
             * Rendered only when there is something to sort. Over an empty list, a sign-in prompt or
             * a failed load it is a control with nothing to act on, and a header over no rows.
             */}
            {!isBootstrapping && !isSignedOut && !isError && (isLoading || !isEmpty) && (
                /* `sticky top-[60px]` clears the 60px bar above — see "Both headers stick". It
                   needs its own surface fill or the rows scroll visibly through it, and `z-10` keeps
                   it over the rows' entrance animations, which create stacking contexts. */
                <ListHeader className="sticky top-[60px] z-10 bg-(--background-surface)">
                    <ListHeaderTitle as="h2">{t('following_title')}</ListHeaderTitle>
                    <ListHeaderAction>
                        <FilterMenu
                            testId="channel-following-filter"
                            variant="compact"
                            options={sortOptions}
                            value={ordering}
                            onChange={key => setOrdering(key as FollowedOrdering)}
                            /*
                             * The same sentence the trigger renders. `FilterMenu` requires a
                             * `triggerLabel` and **ignores it whenever `trigger` is given** — the
                             * supplied element brings its own name — so a key of its own here would
                             * be a string translated into nine languages and shown in none of them.
                             */
                            triggerLabel={t('following_sort_by', {
                                value: sortLabel.toLowerCase(),
                            })}
                            /*
                             * Legacy's trigger is the *current* sort spelled out ("Sort by last
                             * activity"), not a filter glyph — the value is worth a line of text
                             * here, because there are two orderings and which one is on changes what
                             * the list means. `FilterMenu`'s `trigger` slot is exactly this case:
                             * base-ui merges `onClick`, `aria-haspopup`, `aria-expanded` and the ref
                             * onto whatever element is handed in.
                             */
                            trigger={
                                <button
                                    type="button"
                                    data-testid="channel-following-sort"
                                    className="type-dense-default flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-(--text-title) outline-none focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {t('following_sort_by', { value: sortLabel.toLowerCase() })}
                                    <Icon name="angle-down" size={16} className="flex-none" />
                                </button>
                            }
                        />
                    </ListHeaderAction>
                </ListHeader>
            )}

            {isOverLimit && (
                /* Inside the card and under the header, where the rows it is about are. The notice
                   itself is its own component so `/dev/following` can render it — see it for why a
                   state that needs 901 follows to reach is a state nobody has checked. */
                <div className={cn('p-4', RISE)}>
                    <FollowingLimitNotice />
                </div>
            )}

            {list}
        </div>
    )
}
