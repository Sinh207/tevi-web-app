'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { SearchBar } from '@shared/ui/search-bar'
import { useEffect } from 'react'
import { useBlockedAccounts } from '../hooks/use-blocked-accounts'
import { formatExactCount } from '../lib/channel-format'
import { BLOCKED_ACCOUNTS_ART } from '../lib/illustrations'
import { BlockedAccountRow } from './blocked-account-row'
import { BlockedAccountsSkeleton } from './blocked-accounts-skeleton'
import { ChannelEmptyState } from './channel-empty-state'

/**
 * The screen's content surface — the white (Listing) panel every state renders inside.
 *
 * ## It fills the height under the bar, and it does that with flex rather than arithmetic
 *
 * `min-h-[calc(100dvh-60px)]` is the obvious spelling and it is wrong twice over here. It
 * hardcodes the bar's 60px, so a bar that ever changes height leaves this silently off; and
 * `app/(web)/(main)/layout.tsx` says in writing not to put a viewport min-height inside its 84px
 * tab-bar reserve — the two add up and put a scrollbar on every mobile page.
 *
 * The chain that already exists does it exactly: the layout's column is
 * `min-h-[var(--window-height)]`, `<main>` is `flex-1`, the page's content column is `flex-1`,
 * so that column measures **viewport − bar** on its own (measured: 740 in an 800 viewport with
 * a 60 bar, bottom flush at 800). All that was missing is the panel claiming it, hence
 * `flex-1` here — and this *is* the view's root element, so the chain has one link fewer than
 * it used to: the `flex flex-col gap-3` wrapper existed to stack the count line above the
 * panel, and the count is `sr-only` now.
 *
 * ## All four corners, and the 24px under it that makes the bottom two visible
 *
 * This was briefly `rounded-t` only, on the theory that a panel reaching the bottom of the
 * viewport cannot round corners that sit on the edge. The precedent quoted for it —
 * the channel header's `md:rounded-t-[var(--radius-xl)]` — does not transfer: that header
 * rounds only its top because **another surface continues below it** (the tab strip, then the
 * threads). Nothing continues below this one. It is the end of the page, so its bottom edge is
 * a real edge, and a real edge with a square corner under a rounded top reads as unfinished.
 *
 * So: rounded all round, and the page's own `md:pb-6` keeps the last 24px as background rather
 * than surface — which is what the bottom corners need in order to be seen at all. That
 * padding is *inside* the flex chain, so `flex-1` here still resolves to exactly the height
 * that is left: **viewport − bar − 24** from `md` up, and **viewport − bar** below it, where
 * the panel is full-bleed, unrounded, and should meet the bottom edge. Matches the sibling
 * settings screen, which reserves the same gap with `md:mb-6`.
 *
 * ## `--background-surface`, not `--background-listing`
 *
 * This panel was briefly Listing, because that is what the DS paints `List/User Item` with.
 * **In dark mode that made the whole card invisible**: `--background-listing` is `--white` in
 * Light but plain `--black` in Dark — *the same value as `--background`* — so the panel, its
 * edge and both of the rounded corners above vanished into the page. Verified against the DS's
 * own `colors_and_type.css`, so this is Figma's intent rather than a porting slip.
 *
 * The intent, read properly: **Listing is for a list that *is* the screen** (the DM list),
 * where black-on-black costs nothing because there is no card edge to lose. **Surface is the
 * elevated card**, and it is `--white` / `#18181b` — a real step off the page in both modes.
 * Every other card in this app already says so: the DS `Card` itself, the channel header, the
 * channel tabs, the NSFW gate, the thread placeholders, the space-visibility options.
 *
 * The rows override the same way (`blocked-account-row.tsx`), because `ListUserItem` paints
 * Listing on itself and would otherwise repaint black straight back over this.
 */
const SURFACE =
    'flex flex-1 flex-col overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * `/settings/blocked-accounts` — everything below the page's back bar.
 *
 * ## The four states, and the two this screen has that most do not
 *
 * DoD §1's loading / error / empty / success, plus **signed out** and **nothing matched**.
 * The blocked list belongs to a real account and the app always keeps an anonymous session,
 * so `currentUser` being present says nothing: an anonymous visitor who reaches this URL gets
 * a prompt to sign in, not an empty list telling them they have blocked nobody. The prompt
 * gates the *action* (`useRequireAuth` opens the login dialog) rather than redirecting, per
 * DoD §3 — the URL stays where it is, and signing in leaves them on the screen they asked for.
 *
 * The sixth is the search's: a list that came back empty because of the **term** is not an
 * empty list, and telling a reader who has typed a name that they "have not blocked anyone
 * yet" sends them looking for a block they made. `useBlockedAccounts` splits the two.
 *
 * ## The list is a `<ul>`, and that is not decoration
 *
 * It is a list of people; a stack of `<div>`s says none of that to a screen reader, which is
 * what legacy ships. The count above it is now `sr-only` — the field took its line — but it is
 * still a live region, because unblocking a row is otherwise silent: the row is `aria-hidden`
 * while it plays its exit, so without it the only feedback for a keyboard or screen-reader
 * user would be the toast.
 *
 * ## The search is the server's
 *
 * `q` on the request, not a filter over `entries` — the list is paginated, so a client-side
 * filter would only search the pages that happen to be loaded. The hook owns the term, the
 * debounce and the cache key; see it for why the field carries no character floor.
 *
 * ## Pagination is real, not deferred
 *
 * DoD §6 asks for it, and a blocked list is exactly the kind that is short for almost everyone
 * and enormous for the handful of accounts that need this screen most. `useInView`'s default
 * 600px lead time means the next page is usually already in the cache by the time the reader
 * gets to the bottom, so the "loading more" row is rare rather than a spinner on every scroll.
 */
export function BlockedAccountsView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()

    const {
        entries,
        total,
        search,
        setSearch,
        canSearch,
        isLoading,
        isError,
        isEmpty,
        isSearchEmpty,
        isSignedOut,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        unblockingId,
        isUnblocking,
        exitingIds,
        unblock,
    } = useBlockedAccounts()

    /**
     * The sentinel, and the effect that acts on it.
     *
     * `enabled` detaches the observer once there is nothing left to fetch, rather than leaving
     * one attached to an element whose callback would do nothing — and detaching it while a
     * page is in flight is what keeps `inView` from re-firing for the whole duration of the
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
     * Which rows draw a hairline above them: **every row that has a *visible* row above it.**
     *
     * Not `index > 0`, and not a `:not(:first-child)` rule in CSS. Both of those count rows
     * that are still mounted, and during the 320ms exit the row on its way out *is* still
     * mounted, at a height of nearly zero. So the row beneath it keeps a rule that now sits
     * flush against the top edge of the card — a stray line across the list for a third of a
     * second, every time somebody unblocks the first row.
     *
     * One pass with a carried flag, rather than asking each row to look at its predecessors:
     * the obvious `entries.slice(0, index).some(…)` inside the map is quadratic, and this list
     * is paginated, so "a few hundred rows loaded" is a state it is designed to reach.
     */
    const rules: boolean[] = []
    let visibleAbove = false
    for (const entry of entries) {
        rules.push(visibleAbove)
        if (!exitingIds.has(entry.id)) visibleAbove = true
    }

    /**
     * The panel's contents — one branch per state, in the order the states can shadow each
     * other.
     *
     * A chain rather than the early `return`s this used to be, and the search field is the
     * reason: the field belongs to the panel, so every state below it has to render *inside*
     * the same box. With early returns each state built its own panel and the field would have
     * had to be repeated in each of them — or, worse, be dropped from the two states that need
     * it most (a search that matched nothing, and a search whose request failed), leaving the
     * reader typing into a control that had disappeared.
     *
     * `isBootstrapping` is first for the same reason it was: the session has not resolved, so
     * "signed out" is not yet true and showing the sign-in prompt here would flash it at every
     * signed-in visitor on every load. The skeleton is the honest answer to "we do not know
     * yet".
     */
    const body = isBootstrapping ? (
        <BlockedAccountsSkeleton />
    ) : isSignedOut ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="ban"
            title={t('blocked_accounts_signed_out_title')}
            body={t('blocked_accounts_signed_out_body')}
            action={
                /*
                 * The action *is* the gate: `useRequireAuth` opens the login dialog when
                 * there is no real account and runs the callback when there is — and by
                 * then there is nothing left to do, because the query un-gates itself and
                 * this whole branch stops rendering. Hence the empty callback: the button
                 * is honestly "sign in", not "sign in and then also do X".
                 */
                <Button
                    data-testid="channel-blocked-sign-in"
                    variant="primary"
                    size="large"
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    ) : isLoading ? (
        <BlockedAccountsSkeleton />
    ) : isError ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="exclamation-diamond"
            title={t('blocked_accounts_error_title')}
            body={t('blocked_accounts_error_body')}
            action={
                <Button
                    data-testid="channel-blocked-retry"
                    variant="secondary"
                    size="large"
                    onClick={refetch}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        /* The one state on this screen Brand has actually drawn. */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={BLOCKED_ACCOUNTS_ART.empty}
            title={t('blocked_accounts_empty_title')}
            body={t('blocked_accounts_empty_body')}
        />
    ) : isSearchEmpty ? (
        /*
         * Copy only — the art is the empty state's. The two say different things ("you have
         * blocked nobody" versus "nothing matched what you typed") and only the words carry
         * that; a second drawing to say it is not worth a request. `MyMembershipView` splits
         * its own pair the same way.
         *
         * No action button: the way out is the field's own cancel, which is on screen and
         * eight pixels above this — a "clear search" button here would be a second control
         * for the same job.
         */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={BLOCKED_ACCOUNTS_ART.empty}
            title={t('blocked_accounts_no_results_title')}
            body={t('blocked_accounts_no_results_body')}
        />
    ) : (
        <>
            {/*
             * The count, kept for screen readers only.
             *
             * It used to be a visible line above the panel, and the search field took that
             * line: two stacked strings of secondary text above a card is exactly the clutter
             * the field would have added to. Its *a11y* job is not decorative, though —
             * unblocking a row is otherwise silent to a screen reader, because the row is
             * `aria-hidden` while it plays its exit — so the live region stays and only its
             * pixels go. `role="status"` rather than a bare `aria-live`, so it is announced as
             * a status update and not as part of the list.
             *
             * Inside the list branch, so it counts something that is on screen: on the
             * search-empty state the same string would announce "0 blocked accounts" over a
             * panel that already says nothing matched.
             *
             * `Intl` formats the number, because `1,024` is `1.024` in German — and this one is
             * exact rather than compact, since a rounded total would be visibly wrong next to
             * the rows it counts.
             */}
            <p role="status" aria-live="polite" className="sr-only">
                {t('blocked_accounts_count', {
                    count: total,
                    formatted: formatExactCount(total, currentLanguage),
                })}
            </p>

            <ul className="list-none">
                {entries.map((entry, index) => (
                    <BlockedAccountRow
                        key={entry.id}
                        entry={entry}
                        rule={rules[index]}
                        unblocking={unblockingId === entry.id}
                        busy={isUnblocking}
                        exiting={exitingIds.has(entry.id)}
                        onUnblock={() => unblock(entry)}
                        /*
                         * The stagger is a **first-paint** flourish, so only the first screen
                         * gets one. Rows appended by pagination mount below the fold and are
                         * scrolled to, not revealed — a delay there makes them look late
                         * rather than orderly. 40ms rather than the 60 in `riseDelay`,
                         * because ten rows at 60 would still be arriving 600ms in.
                         */
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
            {/*
             * The field is **inside** the card, not on the page above it: it filters the rows
             * below, and a control floating on the page background next to the content it acts
             * on reads as belonging to the page instead. Same call `MyMembershipView` makes,
             * and the same padding — 16 on the sides, which is the inset the DS list row gives
             * its avatar, so the field's edge lines up with the rows under it at every width.
             * `pb-3` rather than a symmetric 16, because the first row brings 8 of its own.
             *
             * `canSearch` is the hook's, not a condition assembled here: it is the union of
             * three states in which a search box has nothing to act on (no account, nothing
             * blocked at all, a first load that failed with nothing typed) and only the hook
             * knows all three.
             */}
            {canSearch && (
                <div className="px-4 pt-4 pb-3">
                    <SearchBar
                        data-testid="channel-blocked-search"
                        value={search}
                        onValueChange={setSearch}
                        label={t('blocked_accounts_search_label')}
                        clearLabel={t('blocked_accounts_search_clear')}
                        placeholder={t('blocked_accounts_search_placeholder')}
                    />
                </div>
            )}
            {body}
        </div>
    )
}
