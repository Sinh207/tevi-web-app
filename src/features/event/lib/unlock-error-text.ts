import { ApiError } from '@shared/lib/api/errors'

/**
 * The API's own sentence for a refused **unlock**, or `null`.
 *
 * `docs/API_ERRORS.md`'s rule: on a 4xx write the backend is the only party that knows why *that*
 * write was refused, so its sentence is shown first and ours is the fallback. Read off the
 * **response body**, never `ApiError.message`, whose fallback chain ends in axios's own English
 * (*"Request failed with status code 400"*) — which is the one string that must not reach a money
 * screen in nine locales.
 *
 * ## Why a copy, and why this one
 *
 * `CLAUDE.md` records the existing copies of this predicate and the argument for each staying a
 * **union** of field spellings: only `payout-request-errors.ts` reads `detail`, only
 * `use-create-channel.ts` reads `errors[0].error`, and a shared helper that missed either would fail
 * *silently* — the message simply never appears. That is an argument against one helper spanning
 * features whose spellings nobody owns; it is not an argument against a copy at the feature that
 * owns an endpoint. Same position, and the same reasoning, as
 * `features/monetization/lib/write-error-text.ts`.
 *
 * ## This endpoint in particular needs it
 *
 * `POST billy/v1/ecom/purchase/` refuses for reasons this client cannot enumerate and must not
 * guess at: the event closed between the read and the charge, the order already exists, the product
 * is no longer on sale, the account is restricted. `422 EC0001` is the one code that *is* known —
 * insufficient Star — and `useRequireStars` normally intercepts that before the request leaves. So
 * what is left is precisely the set only the backend can phrase, and printing our generic line over
 * it is what makes a refusal undiagnosable.
 *
 * The three exclusions are the repo's, everywhere: **5xx** (nobody phrases a server fault for a
 * user), **429** (a throttle's text is often the proxy's, and `Retry-After` is already parsed) and a
 * **network** failure (no body to read). A **403** is not excluded: this endpoint has no capability
 * gate, so a 403 here is the backend's own sentence rather than `features/permission`'s vocabulary.
 */
export function unlockErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.isNetwork || error.isCanceled) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    if (error.status === 429) return null
    if (!error.data || typeof error.data !== 'object') return null
    const body = error.data as {
        message?: unknown
        detail?: unknown
        error?: unknown
        data?: { message?: unknown }
        errors?: { error?: unknown }[]
    }
    const raw = [
        body.message,
        body.data?.message,
        body.detail,
        body.error,
        body.errors?.[0]?.error,
    ].find(candidate => typeof candidate === 'string' && candidate.trim())
    if (typeof raw !== 'string') return null
    const text = raw.trim()
    // Longer than a sentence is not a sentence for a user — it is a dump.
    return text.length <= 200 ? text : null
}
