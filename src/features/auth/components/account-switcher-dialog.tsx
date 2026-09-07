'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { type Account, getAccount, MAX_ACCOUNTS } from '@shared/lib/api/token'
import { cn } from '@shared/lib/utils'
import { Avatar, avatarImageClass } from '@shared/ui/avatar'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListSeparator,
} from '@shared/ui/list'
import Image from 'next/image'
import { useState } from 'react'
import { toast } from 'sonner'
import { accountAvatarUrl, accountDisplayName, accountEmail } from '../lib/account-profile'
import { useAuth } from '../providers/auth-provider'
import { useAuthStore } from '../store/auth-store'
import { Spinner } from './provider-button'

/**
 * Switch between the accounts this device holds — legacy's `dialogs/switchAccount`,
 * rebuilt on the DS `Dialog` and `List/Action` row.
 *
 * The store already knew how to hold ten accounts and `useAuth` already exposed
 * `switchAccount` / `removeAccount`; nothing rendered them, so the drawer's
 * "Switch account" row was a `TODO` that raised the sign-in dialog for guests and did
 * nothing at all for everyone else.
 *
 * Mounted once from `app/session-providers.tsx`, beside `LoginDialog` and for the same reason:
 * it reads `useAuth`, so `AuthProvider` cannot render it without an import cycle, and
 * more than one control will want to raise it.
 *
 * ── what the rows can and cannot do ────────────────────────────────────────────────
 * **The active account has no remove control**, which is legacy's rule and worth
 * keeping. Removing the account you are acting as is a sign-out — it has to promote
 * another account or fall back to an anonymous session, and it is one row away from
 * nine other faces. `signOut` (the drawer's own Log out row) is the deliberate path
 * for that, confirmation and all.
 *
 * Anonymous accounts are filtered out. A guest session is not an identity anyone
 * chose, and `purgeAnonymousAccounts` will drop it the moment a real sign-in lands.
 */

/** The row itself: `List/Action` made into the dialog's picker option. */
const ROW = cn(
    'min-w-0 flex-1 cursor-pointer text-start',
    'hover:bg-background-subtle',
    'focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
)

/**
 * The trailing column, reserved on **every** row rather than only the ones carrying a
 * control — `ListRowRule` draws the hairline inside the row's padding box, so a row
 * without the reserve draws a rule 32px longer than its neighbours.
 */
const TRAILING_RESERVE = 'pe-12'

/**
 * Where a trailing indicator sits. One box for all three states, so the check on the
 * active row and the log-out button on the others share a centre — the row's own
 * `ListRowTrailing` puts the check 6px off, being inside the row's padding box where
 * the (necessarily sibling) button is not.
 */
const TRAILING_BOX = 'absolute end-4 flex size-8 items-center justify-center'

export function AccountSwitcherDialog() {
    const { t } = useTranslation()
    const { accounts, activeId, switchAccount, removeAccount } = useAuth()
    const open = useAuthStore(s => s.isAccountSwitcherOpen)
    const close = useAuthStore(s => s.closeAccountSwitcher)
    const openLoginDialog = useAuthStore(s => s.openLoginDialog)

    /** The account being switched to, while `/me` is in flight. */
    const [switchingId, setSwitchingId] = useState<string | null>(null)
    /**
     * The account whose sign-out is waiting to be confirmed. Its name is copied in
     * rather than looked up: the row disappears the instant the removal lands, and a
     * confirm dialog whose sentence empties out while it closes reads as a glitch.
     */
    const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
    const [isRemoving, setIsRemoving] = useState(false)

    const listed = accounts.filter(a => !a.user?.anonymous)
    const busy = switchingId !== null || isRemoving

    const nameOf = (account: Account) =>
        accountDisplayName(account.user) ?? t('auth_switcher_unnamed')

    /**
     * Switch, then close — but only once the profile has actually loaded. Closing
     * first shows the shell rebuilding itself behind an empty dialog, and if the
     * switch fails the user is left as whoever they were with no idea it did.
     */
    const handleSwitch = async (id: string) => {
        if (busy) return
        if (id === activeId) {
            close()
            return
        }
        setSwitchingId(id)
        try {
            await switchAccount(id)
            close()
        } catch {
            // Ask the store what happened rather than inferring it from the error —
            // the same reasoning `AuthProvider`'s bootstrap uses. If the account is
            // gone, its refresh token was dead: `handleDeadAccount` has already
            // dropped it and emitted `auth:session-expired`, which `AuthProvider`
            // has already put on screen as "Your session expired". Adding
            // "Couldn't switch account" underneath is the same event told twice, in
            // two different stories. A surviving account means a 5xx or a dropped
            // connection, which nothing else will mention.
            if (getAccount(id)) toast.error(t('auth_switch_failed'))
            // Either way the dialog stays up, over a list that has already
            // re-rendered around whatever changed.
        } finally {
            setSwitchingId(null)
        }
    }

    /**
     * Removing an account ends its session server-side — the only way back is to sign
     * in again, possibly through a social popup and a Turnstile. Same trade as the
     * drawer's Log out row: cheap to confirm, annoying to undo.
     */
    const confirmRemove = async () => {
        if (!removing) return
        setIsRemoving(true)
        try {
            await removeAccount(removing.id)
        } finally {
            setIsRemoving(false)
            setRemoving(null)
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={next => !next && close()}>
                {/* `p-0` and a hand-placed header: the rows are full-bleed, so the
                    dialog's own 24 of padding would inset the hairlines and leave the
                    hover fill floating in a gutter.

                    `overflow-hidden` is what full-bleed costs. The rows run edge to edge
                    and paint a background on hover and focus, so without clipping the
                    last one draws **square corners over the dialog's rounded bottom** —
                    a 24px radius with a hard rectangle sitting in it. */}
                <DialogContent className="gap-0 overflow-hidden bg-background-elevated p-0">
                    <DialogHeader className="border-b border-separator-default px-6 py-4">
                        <DialogTitle className="type-title-t2-semibold">
                            {t('menu_switch_account')}
                        </DialogTitle>
                    </DialogHeader>

                    {/*
                     * Ten accounts is taller than a laptop viewport, so the list scrolls
                     * inside the dialog rather than the dialog growing past the screen.
                     *
                     * 456 = the 8px top inset plus **six and a half** 69px rows, and the
                     * half is the point. At 420 the fold landed within 3px of a row
                     * boundary, so ten accounts looked like six — macOS overlay
                     * scrollbars stay invisible until you actually scroll, which leaves a
                     * row cut through the middle as the only cue that there is more. On a
                     * short viewport `60vh` wins and the cue survives on its own.
                     */}
                    <ul className="max-h-[min(60vh,456px)] list-none overflow-y-auto overscroll-contain py-2">
                        {listed.map((account, i) => {
                            const isActive = account.id === activeId
                            const isSwitching = account.id === switchingId
                            const name = nameOf(account)
                            const email = accountEmail(account.user)
                            const avatar = accountAvatarUrl(account.user)

                            return (
                                // `relative` is what the sign-out control positions
                                // against — it has to be a sibling of the row, not a
                                // child: a button inside a button is parsed out of it.
                                <li key={account.id} className="relative flex items-center">
                                    <ListRow
                                        data-testid="auth-account-row"
                                        data-account-id={account.id}
                                        as="button"
                                        rightAction
                                        onClick={() => void handleSwitch(account.id)}
                                        aria-current={isActive ? 'true' : undefined}
                                        aria-disabled={busy || undefined}
                                        className={cn(
                                            ROW,
                                            TRAILING_RESERVE,
                                            busy && 'cursor-default',
                                        )}
                                    >
                                        <ListRowLeading>
                                            <Avatar
                                                size="medium"
                                                type={avatar ? 'image' : 'placeholder'}
                                            >
                                                {avatar ? (
                                                    <Image
                                                        alt=""
                                                        src={avatar}
                                                        width={40}
                                                        height={40}
                                                        className={avatarImageClass}
                                                    />
                                                ) : (
                                                    <Icon name="user-simple-alt" size={20} />
                                                )}
                                            </Avatar>
                                        </ListRowLeading>
                                        <ListRowContent>
                                            {i > 0 && <ListRowRule />}
                                            <ListRowAccessory rightAction>
                                                <ListRowText rightAction>
                                                    <ListRowTitleRow>
                                                        <ListRowTitle className="truncate">
                                                            {name}
                                                        </ListRowTitle>
                                                    </ListRowTitleRow>
                                                    {email && (
                                                        <ListRowSubtitle className="truncate">
                                                            {email}
                                                        </ListRowSubtitle>
                                                    )}
                                                </ListRowText>
                                            </ListRowAccessory>
                                        </ListRowContent>
                                    </ListRow>

                                    {isSwitching ? (
                                        <span
                                            className={cn(TRAILING_BOX, 'text-(--icon-secondary)')}
                                        >
                                            <Spinner className="size-5" />
                                        </span>
                                    ) : isActive ? (
                                        /*
                                         * `List/Trailing` Selected (Figma 48:10593), not
                                         * an invented blue tick. The DS paints
                                         * check-circle **Duotone** as a solid
                                         * Accents/Success disc with a White check — so
                                         * the tint path goes opaque and takes the row's
                                         * colour, and the detail path is knocked out to
                                         * White. The Tab Bar drives the same two
                                         * properties; see `build-icon-sprite.mjs`.
                                         */
                                        <span
                                            className={cn(
                                                TRAILING_BOX,
                                                'text-(--accents-success-active)',
                                                '[--tevi-icon-tint:1] [--tevi-icon-detail:var(--white)]',
                                            )}
                                        >
                                            <Icon
                                                name="check-circle"
                                                weight="duotone"
                                                size={24}
                                                title={t('auth_switcher_active')}
                                            />
                                        </span>
                                    ) : (
                                        // `logout-bracket`, the drawer's own Log out glyph
                                        // — not a bin. This ends a session; it does not
                                        // delete an account, and `trash` says it does.
                                        <button
                                            data-testid="auth-account-remove"
                                            data-account-id={account.id}
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setRemoving({ id: account.id, name })}
                                            aria-label={t('auth_switcher_sign_out_of', { name })}
                                            className={cn(
                                                TRAILING_BOX,
                                                'cursor-pointer rounded-full text-(--icon-secondary) transition-colors',
                                                'hover:bg-background-subtle hover:text-(--text-error)',
                                                'focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
                                                'disabled:cursor-not-allowed disabled:opacity-50',
                                            )}
                                        >
                                            <Icon name="logout-bracket" size={20} />
                                        </button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>

                    {/*
                     * Adding an account is **not** one of the accounts, so it sits
                     * outside the list rather than as its last row — semantically (the
                     * `<ul>` is the set of identities), visually (a full-bleed
                     * `List/Separator` divides groups, where the inset row rules only
                     * divide peers), and practically: it stays put while the accounts
                     * scroll, so at ten of them it is still one click away instead of
                     * below the fold.
                     *
                     * The store refuses an eleventh account with a `MaxAccountsError`
                     * *after* the backend has minted a session for it, so at the limit
                     * the row goes away rather than offering a sign-in nothing can keep.
                     */}
                    {accounts.length < MAX_ACCOUNTS && (
                        <>
                            {listed.length > 0 && <ListSeparator size="medium" />}
                            <div className="relative flex items-center py-2">
                                <ListRow
                                    data-testid="auth-account-add"
                                    as="button"
                                    rightAction
                                    // Guarded like the account rows: `aria-disabled`
                                    // says a row is unavailable, it does not stop it
                                    // firing, and handing over to the sign-in dialog
                                    // mid-switch closes this one out from under the
                                    // switch it is still running.
                                    onClick={() => !busy && openLoginDialog()}
                                    aria-disabled={busy || undefined}
                                    className={cn(ROW, TRAILING_RESERVE)}
                                >
                                    <ListRowLeading>
                                        <Avatar size="medium" type="placeholder">
                                            <Icon name="user-plus" size={20} />
                                        </Avatar>
                                    </ListRowLeading>
                                    <ListRowContent>
                                        <ListRowAccessory rightAction>
                                            <ListRowText rightAction>
                                                <ListRowTitleRow>
                                                    <ListRowTitle>
                                                        {t('auth_add_account')}
                                                    </ListRowTitle>
                                                </ListRowTitleRow>
                                            </ListRowText>
                                        </ListRowAccessory>
                                    </ListRowContent>
                                </ListRow>
                            </div>
                        </>
                    )}

                    {/* Esc and the backdrop already close this, but neither is visible.
                        Last in the DOM so base-ui's initial focus lands on the first
                        account rather than on the way out — see `LoginDialog`. */}
                    <DialogCloseButton
                        data-testid="auth-switcher-close"
                        className="absolute end-2 top-2"
                    />
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                testId="auth-switcher-sign-out-confirm"
                open={removing !== null}
                onOpenChange={next => !next && setRemoving(null)}
                title={t('auth_switcher_sign_out_title')}
                description={
                    removing
                        ? t('auth_switcher_sign_out_description', { name: removing.name })
                        : undefined
                }
                confirmLabel={t('common_confirm')}
                onConfirm={confirmRemove}
                pending={isRemoving}
                destructive
            />
        </>
    )
}
