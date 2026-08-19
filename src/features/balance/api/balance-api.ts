import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type Balance, normalizeBalance } from './types'

/**
 * The **billing** service: `${W_API}/billy`, `v5`.
 *
 * ⚠ Three services answer questions about a creator's money and it is easy to land on the wrong one.
 * `/billy` is the **wallet** — balances and ledgers. `/report` is the **earnings report**
 * (`features/earnings`). `/analytics` is the public stats block on a channel page
 * (`channelStatsApi`). Legacy keeps all three as sibling model files, which is precisely why the
 * mix-up is available. Getting it wrong 404s.
 *
 * ## One endpoint, and that is the point of this feature
 *
 * This model reads the **balance** and nothing else. The two ledger endpoints live on the same
 * service and are deliberately *not* here: they belong to the screens that read them
 * (`features/my-star`, `features/my-wallet`), each of which builds its own model on the same base
 * URL. A model is not a service wrapper — it is the surface one feature needs.
 *
 * **The account is derived from the bearer, never passed.** No account id, no channel, no slug
 * appears on the request. Which has one consequence that is not optional:
 *
 * Every request must **pin the account** (`accountId`), or a reader with ten accounts gets whichever
 * bearer happened to be active when the request left, filed under the key of the one they were
 * looking at. This is money, so that is not a stale-data annoyance — it is one person's balance shown
 * under another person's name. Same rule, same reason, as `authApi.getMe` and `earningsApi`.
 *
 * There is **no server-side read** of any of this. `createServerApiModel` is for public content and
 * there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`); a balance is the
 * opposite of public.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/**
 * Query keys.
 *
 * `all` is exported so the two ledger features can nest **under** it — `['balance', 'ledger', …]` —
 * which means a single `invalidateQueries({ queryKey: balanceKeys.all })` after a spend refreshes the
 * figure *and* the history that explains it. That is the one thing the three features have to agree
 * on, so it is stated here rather than in each of them.
 *
 * Account-scoped, for the reason above. `'anon'` stands in for a null account so the key is never
 * malformed — no query here ever runs for an anonymous session, so that slot caches nothing.
 */
export const balanceKeys = {
    all: ['balance'] as const,
    balance: (accountId: string | null) => ['balance', 'summary', accountId ?? 'anon'] as const,
}

export const balanceApi = {
    /** Both balances, in one request. */
    async getBalance({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<Balance> {
        const body = await api.get<unknown>('v5/billing/balance/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
        })
        return normalizeBalance(body)
    },
}
