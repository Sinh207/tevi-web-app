'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { FollowRequestAction } from '../hooks/use-follow-requests'
import { useFollowRequests } from '../hooks/use-follow-requests'
import { formatExactCount } from '../lib/channel-format'
import { FOLLOW_REQUESTS_ART } from '../lib/illustrations'
import { SPACE_VISIBILITY_PATH } from '../lib/routes'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { FollowRequestRow } from './follow-request-row'
import { FollowRequestsSkeleton } from './follow-requests-skeleton'
import { ShareProfileButton } from './share-profile-button'

/**
 * The screen's content surface, and the one place it differs from the blocked list's panel:
 * **it has no `overflow-hidden` on the root.**
 *
 * That is not a preference. This screen ends in a `sticky bottom-0` action bar, and
 * `overflow: hidden` makes an element a scroll container — a sticky descendant then sticks
 * inside *that* box instead of to the viewport, so the bar would stop following the screen and
 * park itself at the bottom of the panel, below the fold, exactly where a bulk action is no use.
 * `PROFILE_PANEL` carries the same warning, arrived at from the other direction.
 *
 * The clip the blocked panel gets from `overflow-hidden` — rows' square corners tucked inside
 * the card's rounded ones — is still needed, so it moved to the list wrapper below, which
 * contains nothing sticky. Everything else about the panel is that one's, including the reasons:
 * `flex-1` so it fills viewport − bar without arithmetic, all four corners rounded from `md`
 * with the page's `md:pb-6` behind the bottom two, and `--background-surface` rather than
 * `--background-listing`, which is `--black` in dark mode and would make the card vanish.
 */
const SURFACE = 'flex flex-1 flex-col bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * `/follow-requests` — the queue of people asking to follow a **protected** space, and the two
 * answers, per row and in bulk.
 *
 * ## Seven states, and the seventh is the one legacy is missing
 *
 * DoD §1's loading / error / empty / success, plus **signed out**, plus the two this screen
 * needs on its own:
 *
 * - **The space is public.** A public space has no requests to approve — following it is
 *   immediate, which is what `useChannelActions` encodes at the other end. Legacy shows "No
 *   follow requests yet" and leaves the reader waiting for something that cannot arrive; this
 *   says so and points at the switch (`/settings/space-visibility`). Only shown when the queue
 *   is *also* empty: a space switched from protected to public keeps whatever was pending, and
 *   those rows are still answerable.
 * - **Signed out**, because the app always keeps an anonymous session — so `currentUser` being
 *   present says nothing. The prompt gates the *action* (`useRequireAuth` raises the login
 *   dialog) rather than redirecting, per DoD §3: the URL stays put and signing in leaves the
 *   reader on the screen they asked for.
 *
 * ## The bulk bar is confirmed, both ways
 *
 * Neither answer can be undone (see `useFollowRequests`), and "Decline all" on a queue whose
 * true size was never on screen is the most destructive press on the screen. So both go through
 * `ConfirmDialog`, which puts focus on Cancel — legacy confirms both too, and it is the one part
 * of that screen this one copies wholesale.
 *
 * ## The list is a `<ul>`, and the count is a live region
 *
 * It is a list of people; a stack of `<div>`s says none of that to a screen reader, which is
 * what legacy ships. The count is `sr-only` — the design has no line for it — but it stays a
 * live region because answering a row is otherwise silent: the row is `aria-hidden` while it
 * plays its exit, so without it the only feedback a screen-reader user gets is the toast.
 */
export function FollowRequestsView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const { hasChannel, isProtected, isLoading: isMyChannelLoading } = useMyChannel()

    const {
        entries,
        total,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        pendingId,
        pendingAction,
        isResponding,
        exitingIds,
        respond,
        isBulkPending,
        bulkAction,
        respondAll,
    } = useFollowRequests()

    /** Which bulk answer is being confirmed, or `null` when the dialog is closed. */
    const [confirming, setConfirming] = useState<FollowRequestAction | null>(null)

    /**
     * The sentinel, and the effect that acts on it. `enabled` detaches the observer once there
     * is nothing left to fetch — and while a page is in flight, which is what keeps `inView`
     * from re-firing for the whole duration of the request. `loadMore` is guarded in the hook as
     * well; belt and braces, because the failure here is a request loop rather than a wrong
     * pixel.
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
     * Not `index > 0`, and not a `:not(:first-child)` rule in CSS — both count rows that are
     * still mounted, and during the 320ms exit the row on its way out *is* still mounted at a
     * height of nearly zero. The row beneath it would keep a rule that now sits flush against
     * the top edge of the card. One pass with a carried flag rather than a `slice().some()` per
     * row, which is quadratic on a list built to be paginated.
     */
    const rules: boolean[] = []
    let visibleAbove = false
    for (const entry of entries) {
        rules.push(visibleAbove)
        if (!exitingIds.has(entry.id)) visibleAbove = true
    }

    /**
     * `true` only once the account's own space is known to be public.
     *
     * `isMyChannelLoading` is in the condition rather than assumed away: the provider answers a
     * beat after the list does, and `isProtected` is `false` until it lands — so without it,
     * every load of a protected space's queue flashes "your space is public" before the rows
     * arrive. `hasChannel` excludes the account with no space at all, whose problem is a
     * different one and whose queue is empty for a different reason.
     */
    const isPublicSpace = !isMyChannelLoading && hasChannel && !isProtected

    const body = isBootstrapping ? (
        <FollowRequestsSkeleton />
    ) : isSignedOut ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="user-plus"
            title={t('follow_requests_signed_out_title')}
            body={t('follow_requests_signed_out_body')}
            action={
                /* The action *is* the gate: `useRequireAuth` raises the dialog when there is no
                   real account and runs the callback when there is — by which point there is
                   nothing left to do, because the query un-gates itself and this branch stops
                   rendering. Hence the empty callback. */
                <Button
                    data-testid="channel-follow-requests-sign-in"
                    variant="primary"
                    size="large"
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    ) : isLoading ? (
        <FollowRequestsSkeleton />
    ) : isError ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('follow_requests_error_title')}
            body={t('follow_requests_error_body')}
            action={
                <Button
                    data-testid="channel-follow-requests-retry"
                    variant="secondary"
                    size="large"
                    onClick={refetch}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty && isPublicSpace ? (
        /* Copy and a way to fix it — no art. The empty-state drawing says "nothing yet, keep
           waiting", which is the opposite of what this state means. */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="globe"
            title={t('follow_requests_public_title')}
            body={t('follow_requests_public_body')}
            action={
                /* `render={<Link/>}` is this Button's link form — `Button` reads it and
                   announces the element as a link rather than a button. */
                <Button
                    data-testid="channel-follow-requests-accept-all"
                    variant="secondary"
                    size="large"
                    render={<Link href={SPACE_VISIBILITY_PATH} />}
                >
                    {t('follow_requests_public_action')}
                </Button>
            }
        />
    ) : isEmpty ? (
        /* The one state on this screen Brand has drawn — and unlike the blocked list's, this
           one is a real PNG on the CDN rather than a raster smuggled inside an SVG. */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={FOLLOW_REQUESTS_ART.empty}
            title={t('follow_requests_empty_title')}
            body={t('follow_requests_empty_body')}
            action={
                /*
                 * Legacy's own action on this state, and the only one that can change it: nobody
                 * can ask to follow a space they have not found. The button reads the space and
                 * renders nothing without a `shareable_url`, so there is no condition here — see
                 * `ShareProfileButton`.
                 */
                <ShareProfileButton />
            }
        />
    ) : (
        <>
            {/*
             * The count, kept for screen readers only — the design has no line for it, and
             * answering a row is otherwise silent to a screen reader because the row is
             * `aria-hidden` while it plays its exit. `role="status"` so it is announced as a
             * status update rather than as part of the list.
             *
             * `Intl` formats the number (`1,024` is `1.024` in German), and it is the exact
             * count rather than a compact one: a rounded total would be visibly wrong next to
             * the rows it counts.
             */}
            <p role="status" aria-live="polite" className="sr-only">
                {t('follow_requests_count', {
                    count: total,
                    formatted: formatExactCount(total, currentLanguage),
                })}
            </p>

            <ul className="list-none">
                {entries.map((entry, index) => (
                    <FollowRequestRow
                        key={entry.id}
                        entry={entry}
                        rule={rules[index]}
                        pending={pendingId === entry.id ? pendingAction : null}
                        busy={isResponding || isBulkPending}
                        exiting={exitingIds.has(entry.id)}
                        onRespond={action => respond(entry, action)}
                        /*
                         * The stagger is a **first-paint** flourish, so only the first screen
                         * gets one: rows appended by pagination mount below the fold and are
                         * scrolled to, not revealed. 40ms rather than 60, because ten rows at
                         * 60 would still be arriving 600ms in.
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

    /**
     * Both bulk answers act on rows that exist, so an empty queue takes the bar away — and
     * **rows on their way out do not count.**
     *
     * `entries.length > 0` is the obvious version and it leaves the bar sitting under a list that
     * is collapsing to nothing for 320ms, offering Accept all on rows that have already been
     * answered. It also mattered for the single-row case: answering the last request left the bar
     * hanging over an empty panel until the exit finished.
     */
    const showsBulk = entries.some(entry => !exitingIds.has(entry.id))

    return (
        <div className={cn(SURFACE, className)}>
            {/*
             * The clip the panel's own `overflow-hidden` used to do, moved one level in so the
             * action bar below is not inside a scroll container. `flex-1` so the states that
             * centre themselves (empty, error, signed out) still fill the panel, and
             * `md:rounded-t-[…]` so the first row's corners follow the card's at the only widths
             * where the card has any.
             */}
            <div className="flex flex-1 flex-col overflow-hidden md:rounded-t-[var(--radius-xl)]">
                {body}
            </div>

            {showsBulk && (
                <>
                    <ConfirmDialog
                        testId="channel-follow-requests-bulk-confirm"
                        open={confirming !== null}
                        onOpenChange={open => {
                            if (!open) setConfirming(null)
                        }}
                        title={t(
                            confirming === 'accept'
                                ? 'follow_requests_confirm_accept_all_title'
                                : 'follow_requests_confirm_decline_all_title',
                        )}
                        description={t(
                            confirming === 'accept'
                                ? 'follow_requests_confirm_accept_all_body'
                                : 'follow_requests_confirm_decline_all_body',
                        )}
                        confirmLabel={t('follow_requests_confirm_yes')}
                        /*
                         * `destructive` for Decline all only. Accept all is irreversible too,
                         * but it *grants* something — painting it red would say the reader is
                         * about to lose something they are not.
                         */
                        destructive={confirming === 'decline'}
                        pending={isBulkPending}
                        onConfirm={() => {
                            if (confirming) respondAll(confirming)
                            /*
                             * Closed on press rather than on success: the mutation's own toast
                             * reports the outcome, and a dialog held open behind a spinner for a
                             * request that fails leaves the reader confirming twice. The bar's
                             * buttons carry the pending state instead.
                             */
                            setConfirming(null)
                        }}
                    />
                    {/*
                     * `sticky bottom-0` at every width, and **no offset for the mobile tab bar**:
                     * `TabBarShell` renders that bar, and its reserve, only on the four tab
                     * destinations, and `/follow-requests` is not one of them. Holding the bar at
                     * the bar's height anyway is not a harmless margin — with no reserve the column is exactly
                     * the window's height, so the document does not scroll and an offset bar
                     * covers content that cannot be scrolled into view. `identity-intro.tsx`
                     * measured that; if this screen ever becomes a tab destination, the offset
                     * has to come back from `TabBarShell` rather than be typed in twice.
                     *
                     * A top hairline and the card's own bottom corners, like the edit-profile
                     * footer: it is the last thing in the panel, so those corners belong to it.
                     */}
                    <div
                        className={cn(
                            'sticky bottom-0 z-10 flex items-center justify-end gap-3',
                            'border-(--separator-default) border-t bg-(--background-surface) p-3',
                            'md:rounded-b-[var(--radius-xl)]',
                        )}
                    >
                        {/*
                         * `aria-disabled` on the button that is running, `disabled` on the other
                         * — the distinction `blocked-account-row.tsx` draws for its Unblock, and
                         * it is load-bearing here for a reason that only exists on this bar.
                         *
                         * Pressing one of these opens a dialog, which moves focus into it. The
                         * dialog closes on confirm, focus returns to the button that opened it —
                         * and if that button is `disabled` by then (it is: the request is in
                         * flight), the browser has nowhere to put focus and drops it to the
                         * document. A keyboard user is sent to the top of the page by their own
                         * confirmation. The soft form keeps the element focusable; `respondAll`
                         * in the hook refuses the second press.
                         */}
                        <Button
                            data-testid="channel-follow-requests-decline-all"
                            variant="secondary"
                            size="medium"
                            disabled={isResponding || (isBulkPending && bulkAction !== 'decline')}
                            aria-disabled={bulkAction === 'decline' || undefined}
                            onClick={() => {
                                if (isBulkPending) return
                                setConfirming('decline')
                            }}
                        >
                            {bulkAction === 'decline' && <Loader className="size-[18px]" />}
                            {t('follow_requests_decline_all')}
                        </Button>
                        <Button
                            data-testid="channel-follow-requests-accept"
                            variant="accent"
                            size="medium"
                            disabled={isResponding || (isBulkPending && bulkAction !== 'accept')}
                            aria-disabled={bulkAction === 'accept' || undefined}
                            onClick={() => {
                                if (isBulkPending) return
                                setConfirming('accept')
                            }}
                        >
                            {bulkAction === 'accept' && <Loader className="size-[18px]" />}
                            {t('follow_requests_accept_all')}
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}
