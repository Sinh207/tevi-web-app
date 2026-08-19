'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { getActiveAccountId } from '@shared/lib/api/token'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { identificationApi } from '../api/identification-api'
import { IDENTITY_LEVEL } from '../api/types'

/**
 * Open a Sumsub session and hand back its access token.
 *
 * A mutation, not a query: it creates (or resumes) an applicant on Sumsub's side, and its
 * result is a short-lived credential that must not be cached, replayed on a remount, or
 * shared between accounts.
 *
 * The account is pinned at call time via `getActiveAccountId()` rather than read from a
 * render closure — the same rule `useUpdateMe` follows: a switch landing mid-flight would
 * otherwise open one account's applicant session against the other account's bearer.
 *
 * `start` is also what the WebSDK calls when its token expires, which is why it returns
 * the token instead of only setting state. Legacy's expiry handler `await`ed its request
 * and returned `undefined`, so the SDK re-initialised with nothing and the flow died at
 * the twenty-minute mark.
 */
export function useSumsubSession() {
    const { t } = useTranslation()

    const mutation = useMutation({
        // The backend's own message never reaches the screen — same rule as sign-in. What
        // failed is "we could not start verification", and that is all worth saying.
        meta: { showErrorToast: t('identification_start_failed') },
        mutationFn: async (accountId: string | null) => {
            const session = await identificationApi.requestSumsubSession(IDENTITY_LEVEL, accountId)
            const token = session?.sumsub_access_token
            // An empty token is a failed start, not a session: launching the SDK with it
            // renders a broken iframe instead of an error, which is the harder failure to
            // report. Rejecting here puts it through the same toast as an HTTP error.
            if (!token) throw new Error('Sumsub session came back without an access token')
            return token
        },
    })

    const { mutateAsync, isPending } = mutation

    const start = useCallback(() => mutateAsync(getActiveAccountId()), [mutateAsync])

    return { start, isPending }
}
