'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { useAuth } from '@features/auth'
import { ActionMenu, ActionMenuContent, ActionMenuItem } from '@shared/components/action-menu'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { useMarkInboxRead } from '../hooks/use-mark-inbox-read'
import { useUnreadInbox } from '../hooks/use-unread-inbox'
import { NotificationFilterDialog } from './notification-filter-dialog'

/**
 * The inbox's page-bar overflow menu — legacy's `iconBtnMore`: **Mark all as read** and
 * **Filter notification**.
 *
 * ## It is a leaf, and that is a hard constraint rather than tidiness
 *
 * This is a client component the *page* hands to `PageBackBar`'s `actions` slot, rather than a bar
 * this feature composes for itself. The reason is a module cycle: `features/navigation` imports
 * this feature (the bell's unread dot reads `useUnreadInbox`), so this feature must never import
 * `features/navigation` back — ESM resolves a cycle by handing one side a half-initialised module,
 * which surfaces as `undefined is not a function` at render time rather than as a build error.
 * `features/channel` hit the same wall from the other direction and answered it by composing its
 * own bar (`ProfileTopBar`); this answers it by staying below the bar instead, which costs nothing
 * because a server component can pass a client element as a prop.
 *
 * ## "Mark all as read" is always rendered. Only its enabled state moves.
 *
 * It was hidden on `!hasUnread`, and that was wrong for a reason worth writing down:
 * `useUnreadInbox` reports `count: 0` for three different situations — nothing unread, still
 * loading, and the request failed. So the row vanished for *transport* reasons rather than state
 * ones, which reads as a missing feature; and when it did arrive, it arrived a beat later, once the
 * count landed, which can put a new row under the reader's finger as they reach for the one below.
 *
 * So it is always there and disabled only when the count is **known** to be zero:
 * `isKnown && !hasUnread`. That is what `isKnown` was added to `useUnreadInbox` for, and it is the
 * same transport-level distinction `shared/lib/remote-config` draws under the same name. While the
 * answer is still unknown the row stays live — pressing it costs one idempotent request, which is a
 * far better failure than a control that is not there.
 *
 * The unread **count** is what gates it, not the rows on screen: the route marks the whole inbox,
 * including pages this browser has never fetched, so gating on the loaded rows would disable the
 * control on a fully-read first page while unread notifications sat on page three. The query is
 * already mounted for the bell, so this costs no request.
 *
 * It is **confirmed**, because it cannot be undone in bulk: there is an `unread/` route but it
 * takes explicit ids, so putting an inbox back would mean naming every notification that had been
 * unread — which this client no longer knows. Legacy confirms it too, and it is the one part of
 * that screen this copies wholesale.
 *
 * ## Nothing is rendered at all for a guest
 *
 * Both items need an account: "Mark all as read" acts on an inbox and the filter reads
 * `inbox-types/` as this bearer. With neither, the kebab opens an empty popup — and worse, the
 * filter's query is gated on `isAuthenticated`, so it never runs and the sheet renders its
 * *empty* state: "There is nothing to configure for this account yet", which is a sentence about
 * a configuration rather than about not being signed in. Found by opening the menu on the
 * signed-out screen rather than by reading, which is the only way that kind of copy bug surfaces.
 *
 * So the whole control goes. The screen behind it already says what is wrong and offers the way
 * out, which is the one thing an overflow menu could not.
 *
 * ## It wears the app's action-menu skin
 *
 * `shared/components/action-menu.tsx`, the same one `/following`'s kebab uses — see
 * `NotificationRowMenu` for why the DS dropdown port was the wrong choice for a product whose every
 * other overflow menu is this one. Each row carries its glyph trailing at 20 — the size a 14px row
 * calls for; `ActionMenuContent`'s note has the arithmetic.
 *
 * ## "Notifications settings" is not here, and legacy's is dead
 *
 * Legacy ships a third item whose `onClick` is `onClose?.()` — a row that closes the menu and does
 * nothing, with untranslated hard-coded English copy. It is not ported. The drawer's own
 * `menu_notification` row is commented out for the same reason (there is no settings screen yet),
 * and adding a second door to a room that does not exist is worse than one.
 */
export function NotificationBarActions() {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const { hasUnread, isKnown } = useUnreadInbox()
    const { isPending, markAllRead } = useMarkInboxRead()

    /**
     * Known to have nothing to do — **not** the same as "we have not been told yet".
     *
     * `hasUnread` alone conflates the two, and `!hasUnread` was what hid this row while the count
     * was still in flight. See the note at the top of this file.
     */
    const nothingUnread = isKnown && !hasUnread

    const [confirming, setConfirming] = useState(false)
    const [filtering, setFiltering] = useState(false)

    /*
     * After the hooks, never before: an early return above them would change the hook order
     * between renders the moment the session bootstraps. Both are cheap when disabled — the
     * queries are gated on the same flag.
     */
    if (!isAuthenticated) return null

    return (
        <>
            <ActionMenu>
                {/*
                 * `render` hands base-ui the element to be the trigger and it merges its own
                 * `onClick`, `aria-haspopup`, `aria-expanded` and ref onto it. That is what lets the
                 * menu open from the 40px disc every page bar uses instead of the row-sized kebab
                 * `ActionMenuTrigger` draws — reproducing that disc from a class string is the drift
                 * `BarIconButton`'s own note was written about.
                 */}
                <BaseMenu.Trigger
                    render={
                        <BarIconButton
                            data-testid="notification-actions"
                            name="more-horizontal"
                            label={t('notification_actions')}
                        />
                    }
                />
                <ActionMenuContent>
                    {/*
                     * Always rendered, disabled only when the count is *known* to be zero. It used
                     * to be `{hasUnread && …}`, which also hid it while the count was loading and
                     * after a failed request — see the note at the top of this file.
                     */}
                    <ActionMenuItem
                        data-testid="notification-mark-all"
                        disabled={isPending || nothingUnread}
                        onClick={() => setConfirming(true)}
                    >
                        {t('notification_mark_all_read')}
                        {/*
                         * `check-double`, not the row menu's `envelope-check`. Both rows mean "read";
                         * the doubled tick is what carries **all of them** — the same mark the DS
                         * uses for a selection, and the one a reader already associates with a
                         * bulk read.
                         */}
                        <Icon name="check-double" size={20} className="flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid="notification-open-filter"
                        onClick={() => setFiltering(true)}
                    >
                        {t('notification_filter_action')}
                        <Icon name="filter" size={20} className="flex-none" />
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            <ConfirmDialog
                testId="notification-mark-all-confirm"
                open={confirming}
                onOpenChange={setConfirming}
                title={t('notification_confirm_mark_all_title')}
                description={t('notification_confirm_mark_all_body')}
                confirmLabel={t('notification_confirm_mark_all_yes')}
                /*
                 * Not `destructive`. It is irreversible in bulk, but it *clears* something rather
                 * than destroying it — painting it red would say the reader is about to lose
                 * something they are not. Same call `follow_requests`' Accept all makes.
                 */
                pending={isPending}
                onConfirm={() => {
                    markAllRead()
                    /* Closed on press: the mutation's own toast reports the outcome, and a dialog
                       held open behind a spinner for a request that fails makes the reader confirm
                       twice. */
                    setConfirming(false)
                }}
            />

            <NotificationFilterDialog open={filtering} onOpenChange={setFiltering} />
        </>
    )
}
