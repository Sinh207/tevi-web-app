'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { walletLedgerApi, walletLedgerKeys } from '../api/wallet-ledger-api'

/**
 * Whether this account's next withdrawal has its fee waived — the green banner on `/my-wallet`.
 *
 * Its own query rather than a field on the balance, and the second reason is the real one: it is a different
 * endpoint, so folding it in would make a failure read as "no balance"; and it is a **promise about money**,
 * so it must fail closed. Separate, the balance and the ledger render while this one errors, and the parse
 * defaults to `false` — the banner appears only when the backend has actually said so. Telling somebody a
 * withdrawal is free when it is not is the one error on this screen that costs them money.
 *
 * `staleTime` is left at the app default (60s). The answer flips exactly once in an account's lifetime, but
 * it flips *as a result of a withdrawal* — and its key is under `balanceKeys.all`, so whatever refreshes the
 * balance after one refreshes this too. A long `staleTime` would mean a creator who has just withdrawn still
 * being promised a free one.
 *
 * `false` while loading, so the banner fades in when the answer arrives rather than appearing and then being
 * taken away. A promise that flickers off is worse than one that arrives late.
 */
export function useFirstPayoutFree(): boolean {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: walletLedgerKeys.firstPayoutFree(activeId),
        queryFn: ({ signal }) =>
            walletLedgerApi.getFirstPayoutFree({ accountId: activeId, signal }),
        enabled: isAuthenticated && Boolean(activeId),
    })

    return query.data ?? false
}
