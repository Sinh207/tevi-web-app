import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import type { SubmissionsResponse, SumsubLevel, SumsubSession } from './types'

/**
 * Identity verification lives on the **auth** service, not `core`
 * (`${W_API}/auth/v1/identification/…`) — legacy's `models/identification.js` builds on
 * `ApiAuthModel`, and the endpoints are account-scoped rather than content-scoped.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/auth` })

/**
 * Query keys.
 *
 * Account-scoped for the same reason `authKeys.me` is: verification is a property of one
 * account, and an unscoped entry would tell account B that it is verified because account A
 * is. Multi-account is a first-class state in this app — the switcher is two taps from every
 * screen — so this is a real case, not a hypothetical one.
 */
export const identificationKeys = {
    all: ['identification'] as const,
    submissions: (accountId: string | null) =>
        ['identification', 'submissions', accountId ?? 'anon'] as const,
}

export const identificationApi = {
    /**
     * Every KYC submission the account has made.
     *
     * `accountId` pins which account the request acts as, rather than letting it pick up
     * whichever bearer happens to be active when the request goes out — same reasoning as
     * `authApi.getMe`, and the same failure it prevents (one account's verification state
     * filed under another's key).
     */
    getSubmissions(accountId?: string | null) {
        return api.get<SubmissionsResponse>(
            'v1/identification/submissions/',
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Open (or resume) a Sumsub applicant session and get a WebSDK access token for it.
     *
     * `level` goes in the **body**: legacy's `post(uri, params, data)` puts `{}` in the
     * query string and `{ level }` in the payload, which is easy to mirror wrongly here
     * because this repo's `post(path, body, config)` has the two swapped round.
     *
     * Not retried on a 5xx — the API client only replays idempotent methods, and this one
     * creates an applicant. See the retry note in `CLAUDE.md`.
     */
    requestSumsubSession(level: SumsubLevel, accountId?: string | null) {
        return api.post<SumsubSession>(
            'v1/identification/sumsub/request/',
            { level },
            accountId ? { accountId } : undefined,
        )
    },
}
