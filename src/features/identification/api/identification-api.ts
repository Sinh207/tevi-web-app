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
 * The largest page the auth service's list endpoints accept — every one of them takes
 * `?page=&page_size=`, defaults to 50 and caps at this. See `getSubmissions` for why the whole
 * list is asked for in one go rather than paged.
 */
const MAX_PAGE_SIZE = 500

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
     *
     * ## `page_size` is the fix for a bug that could only ever under-report
     *
     * ✅ The endpoint **is** paginated — `?page=&page_size=`, default **50**, max **500**
     * (auth contract, B22) — and this call read `results` and ignored `next`. Since
     * `toIdentityState` treats an approval anywhere in the list as verified, a first-page-only
     * read can only ever miss one: somebody with 50+ submissions whose approval had scrolled
     * off would be shown the intro and told to verify again. Asking for the documented maximum
     * closes that with one parameter, where following `next` would be a paging loop for a list
     * that is a handful of rows for every real account.
     *
     * Deliberately **not** filtered by `level` or `status`, though the endpoint accepts both:
     * the level's casing is unsettled (see `SumsubLevel`), and a filter that silently matches
     * nothing reads exactly like an account with no submissions — which is the one wrong answer
     * this screen must not give.
     */
    getSubmissions(accountId?: string | null) {
        return api.get<SubmissionsResponse>(
            'v1/identification/submissions/',
            { page_size: MAX_PAGE_SIZE },
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
