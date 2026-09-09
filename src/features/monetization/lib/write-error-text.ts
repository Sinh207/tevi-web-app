import { ApiError } from '@shared/lib/api/errors'

/**
 * The API's own sentence for a refused write, or `null`.
 *
 * `docs/API_ERRORS.md`'s rule: on a 4xx write the backend is the only party that knows why *that*
 * write was refused, so its sentence is shown and ours is the fallback. Read off the **response
 * body**, never `ApiError.message`, whose fallback chain ends in axios's own English.
 *
 * ## Why this is a module and not a sixth copy
 *
 * `CLAUDE.md` records five existing copies of this predicate and why they must each stay a **union**
 * of field spellings: only `payout-request-errors.ts` reads `detail` and only `use-create-channel.ts`
 * reads `errors[0].error`, so a helper that missed either would fail *silently* — the message simply
 * never appears. That argument is against a **shared** helper spanning features, whose spellings
 * would have to be reconciled by someone who owns none of them.
 *
 * It is not an argument for two copies inside one feature. `useMembershipTierForm` and
 * `useDonationForm` write to the same service (billy), through the same client, and are read by the
 * same person; a divergence between them would be a bug in this directory and nowhere else. So the
 * copy lives here, at the feature's own `lib/`, and the union is the four-spelling one both forms
 * need.
 *
 * The three exclusions are the repo's, everywhere: **5xx** (nobody phrases a server fault for a
 * user), **429** (a throttle's text is often the proxy's, and `Retry-After` is already parsed) and a
 * **network** failure (no body to read). A 403 is *not* excluded here — neither endpoint has a
 * capability gate, so a 403 would be the backend's own sentence rather than
 * `features/permission`'s vocabulary.
 */
export function writeErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.isNetwork || error.isRateLimited() || error.isServerError()) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
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
