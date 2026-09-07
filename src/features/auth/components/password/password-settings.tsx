'use client'

import { PageSurface } from '@shared/components/page-surface'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Alert, AlertActions, AlertContent, AlertIcon, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { authKeys } from '../../api/auth-api'
import { useUserLogin } from '../../hooks/use-user-login'
import { accountEmail } from '../../lib/account-profile'
import { useAuth } from '../../providers/auth-provider'
import { useAuthStore } from '../../store/auth-store'
import { ChangePasswordForm } from './change-password-form'
import { PasswordDone } from './password-done'
import { PasswordSetupFlow } from './password-setup-flow'
import { PasswordStepHeader } from './password-step-header'

/**
 * `/settings/password` — which of the five screens is showing.
 *
 * Legacy's `containers/settingPassword` picks between them with a string in a context and a
 * chain of ternaries; the same five states, decided here from two sources that are
 * deliberately kept apart:
 *
 * - **the server**, via `useUserLogin()` — whether this account has a password at all. It is
 *   the only source on arrival, and it is `GET v1/user-login/`, *not* `/me`: an account
 *   created with Google carries an email on its profile and has no password, so reading the
 *   profile offers "change your password" to people who have never had one.
 * - **the flow**, via `done` — what just happened in this session. It overrides the fetched
 *   answer, because invalidating the key and waiting for the refetch would flash the form
 *   again for a moment after someone finished with it.
 *
 * ## The action is gated, not the route
 *
 * A visitor with no account is not redirected away — the app's rule everywhere
 * (`CLAUDE.md`). What they get instead is a panel that says what this page is for and the
 * one control that can make it usable. Nothing is fetched on their behalf: `useUserLogin`
 * is disabled without a real session, and an anonymous session counts as none.
 */
export function PasswordSettings() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { currentUser, activeId, isAuthenticated } = useAuth()
    const openLoginDialog = useAuthStore(s => s.openLoginDialog)
    const { email, hasCredentials, isLoading, isError, refetch } = useUserLogin()

    /** What happened in this session, which outranks the fetched state. */
    const [done, setDone] = useState<'created' | 'changed' | null>(null)

    /** `null` → `undefined`, so "no address" is one value rather than two. */
    const profileEmail = accountEmail(currentUser) ?? undefined

    const finish = useCallback(
        (mode: 'created' | 'changed') => {
            setDone(mode)
            /*
             * Not awaited and not gating the screen — the line above is what renders. This is
             * for everything *else* that reads the same answer: the drawer's Password row, and
             * this page on the next visit.
             *
             * `/me` goes too, and only because it might: `setup-credentials` is the one call
             * here that can give an account an address it did not have, and the profile is
             * where the rest of the app reads that from.
             */
            void queryClient.invalidateQueries({ queryKey: authKeys.userLogin(activeId) })
            if (mode === 'created') {
                void queryClient.invalidateQueries({ queryKey: authKeys.me(activeId) })
            }
        },
        [queryClient, activeId],
    )

    if (!isAuthenticated && !isLoading) {
        return (
            <PageSurface>
                <PasswordStepHeader
                    icon={{ name: 'lock-simple', weight: 'filled' }}
                    title={t('password_title')}
                    description={t('password_signed_out_description')}
                />
                <Button
                    data-testid="auth-password-sign-in"
                    size="large"
                    onClick={openLoginDialog}
                    className={cn('self-start active:scale-[0.99]', RISE)}
                    style={riseDelay(2)}
                >
                    {t('auth_sign_in')}
                </Button>
            </PageSurface>
        )
    }

    if (isLoading) {
        return (
            <PageSurface aria-busy="true">
                {/* The bars are laid out at the real heights of what replaces them — a
                    56px mark, a title line, two field rows — so nothing jumps when the
                    answer lands. */}
                <Skeleton h={56} circle w={56} />
                <div className="flex flex-col gap-2">
                    <div className="flex h-[36px] items-center">
                        <Skeleton w="55%" />
                    </div>
                    <Skeleton w="80%" />
                </div>
                <div className="flex flex-col gap-4">
                    <Skeleton h={48} className="rounded-lg" />
                    <Skeleton h={48} className="rounded-lg" />
                </div>
            </PageSurface>
        )
    }

    /*
     * A failed fetch is its own screen rather than a silent fall-through to one of the forms.
     * The two are not interchangeable: showing the create flow to someone who already has a
     * password sends them through an OTP they do not need, and showing the change flow to
     * someone who has none asks for a current password that does not exist.
     */
    if (isError) {
        return (
            <PageSurface>
                <Alert status="error" className={RISE}>
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('password_load_failed')}</AlertTitle>
                        <AlertActions>
                            <Button
                                data-testid="auth-password-retry"
                                variant="secondary"
                                size="small"
                                onClick={() => refetch()}
                            >
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            </PageSurface>
        )
    }

    return (
        <PageSurface className={RISE}>
            {done ? (
                // The login record wins when there is one; the profile is the fallback for
                // an account that has just created its first password, where the refetch
                // behind `finish` may not have landed yet.
                <PasswordDone mode={done} email={email ?? profileEmail} />
            ) : hasCredentials ? (
                <ChangePasswordForm email={email} onChanged={() => finish('changed')} />
            ) : (
                <PasswordSetupFlow
                    // Pre-filled from the profile, as legacy pre-fills it — a social account
                    // usually has the right address already, and it is still verified by code.
                    initialEmail={profileEmail}
                    onCreated={() => finish('created')}
                />
            )}
        </PageSurface>
    )
}
