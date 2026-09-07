'use client'

import { useAuth } from '@features/auth'
import { useBalance } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { transferApi, transferKeys } from '../api/transfer-api'
import type { Transfer, TransferRequest } from '../api/types'

/**
 * The one place Star actually leaves the account.
 *
 * Both flows — one receiver typed in, or a hundred read off a CSV — end in the same request with the
 * same body shape, so they end in the same hook. Legacy has this too (`useTransfer`), and it is worth
 * keeping for a reason beyond deduplication: the rules below are the ones that must not differ between
 * the two paths, and a second copy is how one of them ends up refreshing the balance and the other not.
 *
 * ## What happens on success, and why it is two calls rather than one
 *
 * - `refreshBalance()` — the **narrow** one. It invalidates the figure this account's shell shows, and
 *   nothing else (see `BalanceProvider.refresh`).
 * - `invalidateQueries(transferKeys.all)` — this screen's own history, which nests under
 *   `balanceKeys.all` precisely so that a spend anywhere in the app refreshes it.
 *
 * Invalidating `balanceKeys.all` would cover both in one line and is what the socket path does; it is
 * not what a *write* should do, because it also drops both wallet ledgers on the floor for a screen
 * the reader is not looking at. The two named calls say what moved.
 *
 * ## No optimistic anything
 *
 * The write moves money and the response *is* the receipt — it carries the transfer IDs the screen
 * then prints. There is nothing to guess at, and a locally-invented row would be a transfer the
 * reader could quote to support that never happened.
 */
export function useTransferWrite() {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const { refresh: refreshBalance } = useBalance()
    const queryClient = useQueryClient()

    return useMutation<Transfer[], unknown, TransferRequest[]>({
        /*
         * The account that was active when the button was pressed, threaded through rather than read
         * as the request is built — an account switch mid-flight must not redirect the debit. Same
         * rule as every other write in this app, and the stakes are highest here.
         */
        mutationFn: rows => transferApi.transferStars(rows, activeId),
        onSuccess: () => {
            void refreshBalance()
            void queryClient.invalidateQueries({ queryKey: transferKeys.all })
        },
        /*
         * A message, not a key — the toast is raised outside React by `query-client.ts`. Legacy shows
         * the backend's own `message` field here, which is how an untranslated English sentence ends
         * up in front of a Korean reader; the one exception this app makes for a backend sentence is
         * provider sign-in (see `features/auth/lib/auth-error.ts`), and it is scoped deliberately.
         */
        meta: { showErrorToast: t('star_transfer_error') },
    })
}
