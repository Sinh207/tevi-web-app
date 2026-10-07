'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { cn } from '@shared/lib/utils'
import { Alert, AlertActions, AlertContent, AlertIcon, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { identificationKeys } from '../api/identification-api'
import { useIdentityStatus } from '../hooks/use-identity-status'
import { useSumsubSession } from '../hooks/use-sumsub-session'
import { IDENTIFICATION_PANEL } from '../lib/container'
import { RISE } from '../lib/motion'
import { IdentityIntro } from './identity-intro'
import { IdentityOutcome } from './identity-outcome'
import { SumsubCheckout } from './sumsub-checkout'

/**
 * `/identification` — which of the four screens is showing, and the one transition between
 * them.
 *
 * Two sources decide it, and they are deliberately kept apart:
 *
 * - **the server**, via `useIdentityStatus()` — what the account's submissions say on
 *   arrival. This is the only source on a fresh page load.
 * - **the flow**, via `outcome` — what Sumsub told us in this session, which the server
 *   does not know yet. `idCheck.onApplicantStatusChanged` fires before the backend has
 *   necessarily caught up, so waiting for a refetch would show the intro again for a second
 *   after someone finished the whole thing.
 *
 * `outcome` therefore *overrides* the fetched state, and the refetch behind it is fire-and-
 * forget: it exists so the drawer's Identification row and the next visit agree, not so
 * this screen can render.
 *
 * ## The action is gated, not the route
 *
 * A guest can read this page — it explains what verification is and what it needs — and the
 * *action* is what asks for a session: `useRequireAuth` raises the sign-in dialog instead of
 * navigating away. That is the app's rule everywhere: a dead or absent session never
 * redirects, because whatever the visitor was reading should stay on screen (`CLAUDE.md`).
 *
 * What the guest case also needs is **saying so** — the bar reads "Sign in" and drops the
 * consent box (see `IdentityIntro`). And no request goes out on their behalf: `/submissions/`
 * is gated in `useIdentityStatus`, and nothing else here fires until the dialog returns a real
 * account. An anonymous session counts as signed out for all of it.
 */
export function IdentificationView() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const requireAuth = useRequireAuth()
    /*
     * A **real** account, not just "has a session": the app mints an anonymous one on
     * bootstrap, so `isAuthenticated` is already the right question — it is false for an
     * anonymous user (`Boolean(currentUser?.id && !currentUser?.anonymous)`), which is what
     * both the query gate and `requireAuth` key off. The intro needs it too, to say so on
     * screen instead of letting someone tick a consent box they cannot act on.
     */
    const { isAuthenticated } = useAuth()
    const { state, isLoading, isError, refetch } = useIdentityStatus()
    const { start, isPending } = useSumsubSession()

    /** The Sumsub token for this session. Present ⇒ the WebSDK is on screen. */
    const [accessToken, setAccessToken] = useState<string | null>(null)
    /** What Sumsub said in this session, which outranks the fetched state. */
    const [outcome, setOutcome] = useState<'pending' | 'verified' | null>(null)

    /**
     * Ask for a session and mount the SDK with it.
     *
     * The rejection is caught rather than left to float — an uncaught rejection out of a
     * click handler is a console error nobody can act on — but it is not *swallowed*. The
     * mutation's `meta.showErrorToast` reports the HTTP failures, and `query-client.ts`
     * deliberately stays quiet on a network error on the grounds that "network errors are
     * toasted elsewhere". Nothing does that yet, so pressing Continue with no connection
     * would do nothing at all and read as a dead button. Hence the one explicit case.
     *
     * A cancelled request stays silent: that is the app's own doing, not news.
     */
    const startFlow = useCallback(() => {
        start()
            .then(setAccessToken)
            .catch(error => {
                if (error instanceof ApiError && error.isNetwork) {
                    toast.error(t('identification_start_failed'))
                }
            })
    }, [start, t])

    const handleStart = requireAuth(startFlow)

    /**
     * The SDK's token-expiry handler: it re-initialises the *existing* frame with whatever
     * this resolves to.
     *
     * **It must not touch `accessToken` state.** Doing so re-runs the launch effect, which
     * destroys the iframe and starts the flow from step one — for someone who has been in it
     * long enough for a token to expire, which is precisely the person who has the most to
     * lose. The SDK owns the token from here; React only owns the first one.
     *
     * A failed refresh does drop back to the intro, because a frame with a dead token cannot
     * continue and an iframe stuck on Sumsub's own error screen offers no way out. The
     * rejection is re-thrown so the SDK stops waiting on it.
     */
    const refreshToken = useCallback(
        () =>
            start().catch(error => {
                setAccessToken(null)
                throw error
            }),
        [start],
    )

    const finish = useCallback(
        (result: 'pending' | 'verified') => {
            setOutcome(result)
            // Not awaited and not gating the screen: the outcome above is what renders. This
            // is for everything *else* that reads the same key — the drawer's row, and this
            // page on the next visit.
            queryClient.invalidateQueries({ queryKey: identificationKeys.all })
        },
        [queryClient],
    )

    if (isLoading) {
        return (
            <div
                className={cn(
                    'flex flex-col gap-4 px-3 pt-3 pb-6 md:gap-6 md:px-6 md:pt-6',
                    IDENTIFICATION_PANEL,
                )}
                aria-busy="true"
            >
                <Skeleton h={190} className="rounded-xl" />
                <div className="flex flex-col gap-2">
                    <div className="flex h-[36px] items-center">
                        <Skeleton w="60%" />
                    </div>
                    <Skeleton />
                    <Skeleton w="80%" />
                </div>
                <div className="flex flex-col gap-2">
                    <Skeleton w="45%" />
                    <Skeleton w="70%" />
                    <Skeleton w="65%" />
                </div>
            </div>
        )
    }

    /*
     * A failed fetch is its own screen rather than a silent fall-through to the intro.
     * Starting a verification while we do not know whether one is already approved is how
     * someone ends up re-submitting an ID they submitted last week.
     */
    if (isError) {
        return (
            <div className={cn('px-3 pt-3 pb-6 md:px-6 md:pt-6', IDENTIFICATION_PANEL, RISE)}>
                <Alert status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('identification_load_failed')}</AlertTitle>
                        <AlertActions>
                            <Button
                                data-testid="identification-retry"
                                variant="secondary"
                                size="small"
                                onClick={() => refetch()}
                            >
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            </div>
        )
    }

    const settled = outcome ?? (state === 'unverified' ? null : state)
    if (settled) return <IdentityOutcome state={settled} />

    if (accessToken) {
        return (
            <div
                className={cn(
                    'flex flex-col px-3 pt-3 pb-6 md:px-6 md:pt-6',
                    IDENTIFICATION_PANEL,
                    RISE,
                )}
            >
                <SumsubCheckout
                    accessToken={accessToken}
                    onExpired={refreshToken}
                    onApproved={() => finish('verified')}
                    onPending={() => finish('pending')}
                    onLaunchFailed={() => {
                        // Back to the intro, where the button that starts it lives — an
                        // empty frame with no way out is the alternative.
                        setAccessToken(null)
                        toast.error(t('identification_start_failed'))
                    }}
                />
            </div>
        )
    }

    return <IdentityIntro onStart={handleStart} isStarting={isPending} signedIn={isAuthenticated} />
}
