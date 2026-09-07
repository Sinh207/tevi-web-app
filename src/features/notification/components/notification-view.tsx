'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Loader } from '@shared/ui/loader'
import { useCallback, useEffect, useState } from 'react'
import type { InboxMessage } from '../api/types'
import { useInbox } from '../hooks/use-inbox'
import { NOTIFICATION_ART } from '../lib/illustrations'
import { type InboxTarget, resolveInboxTarget } from '../lib/inbox-link'
import { NotificationRow } from './notification-row'
import { NotificationSkeleton } from './notification-skeleton'

/**
 * The screen's content surface.
 *
 * `PROFILE_PANEL`'s reasoning, one width narrower: full-bleed below `md` so the rows run edge to
 * edge as the mobile app's do, a rounded card from `md` with the page's `md:pb-6` behind its bottom
 * corners. `--background-surface` and **not** `--background-listing`, which is `--black` in Dark and
 * would make the card vanish in exactly one mode.
 *
 * `overflow-hidden` is safe here, unlike on `/follow-requests`: that screen ends in a
 * `sticky bottom-0` action bar, and `overflow: hidden` makes an element a scroll container, so a
 * sticky descendant sticks inside *it* instead of to the viewport. This screen's only control is in
 * the page bar above, so nothing sticky lives inside the panel and the clip that tucks the first
 * row's square corners into the card's rounded ones can stay where it belongs.
 */
const SURFACE =
    'flex flex-1 flex-col overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * `/notification` — the account's inbox.
 *
 * ## Five states, and legacy has three
 *
 * DoD §1's loading / error / empty / success, plus **signed out**. Legacy has loading, empty and
 * success: a failed request lands in its `catch`, which sets `notifications` to `[]`, so **a 502
 * renders as "No buzz yet, but your moment's coming!"** — the reader is told their inbox is empty
 * when it could not be read. And there is no signed-out state at all, because the app always keeps
 * an anonymous session: `isAuthenticated` is true for a guest in legacy's sense, so the guest fires
 * the request and gets whatever the anonymous bearer is given.
 *
 * The signed-out prompt gates the **action** rather than the route (`useRequireAuth` raises the
 * login dialog), per DoD §3: the URL stays put and signing in leaves the reader on the screen they
 * asked for.
 *
 * ## The list is a `<ul>`, and the count is a live region
 *
 * These are dated entries in a list; a stack of `<div>`s says none of that to a screen reader,
 * which is what legacy ships (MUI's `List` is a `<ul>`, but its rows carry `onClick` on a
 * `ListItemText`, so nothing is a control). The count is `sr-only` — the design has no line for it
 * — and stays a live region because deleting a row is otherwise silent to a screen reader: the row
 * is `aria-hidden` while it plays its exit, so the toast would be the only feedback.
 *
 * ## The app-only press opens a real screen, not a toast
 *
 * A `money`/`transaction` row, an MCN invitation, and any row whose `clickable_url` is missing have
 * no destination on the website — see `resolveInboxTarget`. Legacy answers them with
 * `messagesContext.warning('Please download app to view detail')`: a toast that vanishes in four
 * seconds and offers nothing to act on. This app already has the right answer to "this exists only
 * in the app" — `GetAppDialog`, with the store links from remote config and a QR — so that is what
 * the press opens. One dialog for the whole list, opened with the pressed row's own copy where the
 * row has any.
 */
/** The count for the live region. Falls back to `en` rather than throwing: a formatter must not
 *  be able to take a list down over an unrecognised locale tag. */
function formatCount(value: number, locale: string): string {
    try {
        return new Intl.NumberFormat(locale).format(value)
    } catch {
        return new Intl.NumberFormat('en').format(value)
    }
}

export function NotificationView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()

    const {
        messages,
        total,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        removingId,
        exitingIds,
        setRead,
        remove,
    } = useInbox()

    /** The row whose press had nowhere to go, or `null` when the dialog is closed. */
    const [appOnly, setAppOnly] = useState<InboxMessage | null>(null)
    /** The row a Delete is being confirmed for. */
    const [confirming, setConfirming] = useState<InboxMessage | null>(null)

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
     * Pressing a row: mark it read, and take the app-only case.
     *
     * The read flag is written for **every** kind of press, including the two that navigate — an
     * opened notification is read whether it went to our own page, to somebody else's, or nowhere.
     * `setRead` is a no-op on a row that is already read, which is what makes it safe to call
     * unconditionally.
     *
     * For a link, `preventDefault` is never called: the browser navigates and the optimistic write
     * has already landed (`useInbox` explains why that one is optimistic). Only the app-only case
     * needs anything else to happen here.
     */
    const open = useCallback(
        (message: InboxMessage, target: InboxTarget) => {
            setRead(message, true)
            if (target.kind === 'app-only') setAppOnly(message)
        },
        [setRead],
    )

    /**
     * Which rows draw a hairline above them: **every row that has a *visible* row above it.**
     *
     * Not `index > 0`, and not a `:not(:first-child)` rule in CSS — both count rows that are still
     * mounted, and during the 320ms exit the row on its way out *is* still mounted at a height of
     * nearly zero. The row beneath it would keep a rule now sitting flush against the card's top
     * edge. One pass with a carried flag rather than a `slice().some()` per row, which is quadratic
     * on a list built to be paginated.
     */
    const rules: boolean[] = []
    let visibleAbove = false
    for (const message of messages) {
        rules.push(visibleAbove)
        if (!exitingIds.has(message.id)) visibleAbove = true
    }

    const body = isBootstrapping ? (
        <NotificationSkeleton />
    ) : isSignedOut ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="bell"
            title={t('notification_signed_out_title')}
            body={t('notification_signed_out_body')}
            action={
                /* The action *is* the gate: `useRequireAuth` raises the dialog when there is no
                   real account and runs the callback when there is — by which point there is
                   nothing left to do, because the query un-gates itself and this branch stops
                   rendering. Hence the empty callback. */
                <Button
                    data-testid="notification-sign-in"
                    variant="primary"
                    size="large"
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    ) : isLoading ? (
        <NotificationSkeleton />
    ) : isError ? (
        /* The state legacy does not have: its `catch` sets the list to `[]`, so a failed request
           renders as an empty inbox. */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="exclamation-diamond"
            tone="error"
            title={t('notification_error_title')}
            body={t('notification_error_body')}
            action={
                <Button
                    data-testid="notification-retry"
                    variant="secondary"
                    size="large"
                    onClick={refetch}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        /* Brand's own art for this state, and legacy's own sentence — kept because it is the
           right one: it says nothing is wrong, which an empty inbox is. */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            art={NOTIFICATION_ART.empty}
            title={t('notification_empty_title')}
            body={t('notification_empty_body')}
        />
    ) : (
        <>
            {/*
             * The count, for screen readers only — the design has no line for it, and deleting a
             * row is otherwise silent because the row is `aria-hidden` while it exits.
             * `role="status"` so it is announced as an update rather than as part of the list.
             */}
            <p role="status" aria-live="polite" className="sr-only">
                {t('notification_count', {
                    count: total,
                    /*
                     * `Intl` formats the number, because `1,024` is `1.024` in German and i18next
                     * interpolates a raw JS number. It is the **exact** count rather than a compact
                     * one: a rounded total announced next to the rows it counts would be audibly
                     * wrong. Formatted inline rather than through a helper — `formatExactCount`
                     * lives in `features/channel` and is not exported, and one `Intl` call is not
                     * worth widening a barrel for.
                     */
                    formatted: formatCount(total, currentLanguage),
                })}
            </p>

            <ul className="list-none">
                {messages.map((message, index) => {
                    /* Resolved once and used twice — as the row's `target` and as the press
                       handler's. It was called in both places, i.e. per row per render, and the two
                       could in principle disagree. */
                    const target = resolveInboxTarget(message)
                    return (
                        <NotificationRow
                            testId="notification-row"
                            rowIndex={index}
                            key={message.id}
                            message={message}
                            target={target}
                            rule={rules[index]}
                            /* Only a delete holds the row's controls: a read toggle is optimistic and
                           several can be in flight at once, so disabling on it would grey out a
                           kebab the reader can legitimately use. */
                            busy={removingId !== null}
                            exiting={exitingIds.has(message.id)}
                            onOpen={() => open(message, target)}
                            onToggleRead={() => setRead(message, !message.read)}
                            onDelete={() => setConfirming(message)}
                            /*
                             * The stagger is a **first-paint** flourish, so only the first screen gets
                             * one: rows appended by pagination mount below the fold and are scrolled
                             * to, not revealed. 40ms rather than 60, because ten rows at 60 would
                             * still be arriving 600ms in.
                             */
                            enterDelay={index < 10 ? index * 40 : 0}
                            locale={currentLanguage}
                        />
                    )
                })}
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
            {body}

            {/*
             * Delete is confirmed, because it cannot be undone by this client: the archive route
             * has no inverse and there is no archived-notifications screen in either app to find
             * the row in again. `destructive`, and `ConfirmDialog` puts focus on Cancel.
             */}
            <ConfirmDialog
                testId="notification-delete-confirm"
                open={confirming !== null}
                onOpenChange={dialogOpen => {
                    if (!dialogOpen) setConfirming(null)
                }}
                title={t('notification_confirm_delete_title')}
                description={t('notification_confirm_delete_body')}
                confirmLabel={t('notification_delete')}
                destructive
                pending={removingId !== null}
                onConfirm={() => {
                    if (confirming) remove(confirming)
                    /* Closed on press rather than on success: the mutation's own toast reports the
                       outcome, and a dialog held open behind a spinner for a request that fails
                       leaves the reader confirming twice. */
                    setConfirming(null)
                }}
            />

            {/*
             * One dialog for the whole list. The pressed row's own title and body are handed to it
             * where it has them, so the ask is about *this* notification ("Star topup
             * successfully — open it in the app") rather than a generic prompt with no connection
             * to what was tapped. Where the row has neither, `GetAppDialog`'s own generic copy is
             * the right fallback and is what its defaults render.
             */}
            <GetAppDialog
                testId="notification-get-app"
                open={appOnly !== null}
                onOpenChange={dialogOpen => {
                    if (!dialogOpen) setAppOnly(null)
                }}
                /*
                 * The pressed row's title, so the dialog is about *this* notification ("Star topup
                 * successfully") rather than a generic prompt with no connection to what was
                 * tapped. `undefined` where the row has none — `GetAppDialog`'s own default is the
                 * right fallback.
                 *
                 * The **body stays ours**, and is not the notification's: the reader needs to be
                 * told why a dialog opened, and replacing the instruction with the notification's
                 * own sentence leaves a get-the-app screen that never says so.
                 */
                title={appOnly?.content?.title ?? undefined}
                body={t('notification_app_only_body')}
            />
        </div>
    )
}
