'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi, authKeys } from '../api/auth-api'
import { type DisplayNameRule, toDisplayNameRules } from '../lib/display-name-rules'
import { useAuth } from '../providers/auth-provider'

/**
 * The rules a display name must satisfy, for validating one while it is being typed.
 *
 * ## What this buys, and what it deliberately does not
 *
 * `validate-display-name/` is debounced but still a round trip per pause, and it is the *only*
 * thing that ever answered "that name has a character you can't use" — so the reader typed, waited,
 * and was told. These rules answer the mechanical half of that instantly. They do **not** replace
 * the call: the server checks more than a regex can, so it still runs before the form unlocks. The
 * rules can reject; only the server can accept.
 *
 * ## Everything about it fails towards "ask the server"
 *
 * No rules loaded, a failed request, a body that would not parse, a regex Python accepts and
 * JavaScript does not — every one of them yields `[]`, and `[]` is the behaviour this app had
 * before: debounce, ask, report. There is no state in which a rules failure can block a name or
 * cost a reader anything, which is what makes it safe to leave un-retried.
 *
 * `staleTime: Infinity` because these are platform constants — the query key is not even
 * account-scoped (see `authKeys.displayNameRules`). One fetch per page load, shared by every form
 * that asks.
 */
export function useDisplayNameRules(): DisplayNameRule[] {
    const { isAuthenticated } = useAuth()

    const { data } = useQuery({
        queryKey: authKeys.displayNameRules(),
        queryFn: ({ signal }) => authApi.getDisplayNameRules(signal).then(toDisplayNameRules),
        /*
         * The endpoint sits under `me/` and needs a bearer, so an anonymous visitor cannot have
         * it — and `isAuthenticated` is already false for anonymous. They get `[]`, which is the
         * server-only path.
         */
        enabled: isAuthenticated,
        staleTime: Number.POSITIVE_INFINITY,
        // Platform constants, but the dialog that reads them is not always mounted — without a
        // `gcTime` the 5-minute default collects them and "one fetch per page load" is untrue.
        gcTime: 24 * 60 * 60 * 1000,
        // A retry would be three requests for a convenience. The fallback is the whole feature
        // working exactly as it did.
        retry: false,
    })

    return data ?? EMPTY
}

/** A stable identity, so a consumer's `useCallback` does not re-create on every render. */
const EMPTY: DisplayNameRule[] = []
