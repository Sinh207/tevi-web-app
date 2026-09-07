import { ApiError } from './errors'

/**
 * The backend's own words for a failed **write**, or `null`.
 *
 * This is the home [`docs/API_ERRORS.md` §5](../../../../docs/API_ERRORS.md#5-implementation)
 * specifies for the predicate that exists five times in `features/` today, and it is deliberately
 * empty of anything else: `shared/` may not import `features/`, and this depends on nothing but
 * `ApiError`.
 *
 * **It is not yet wired into `query-client.ts`, and the five copies are still there.** Doing either
 * changes the toast on ~34 unrelated call sites, which is a migration and not a side effect of one
 * screen. What this file buys today is that the sixth copy was never written — see the note on
 * `useMcnInvitation`, which is its first caller. When the migration in §5 lands, this is the
 * function `mutationCache.onError` calls and the five copies collapse into.
 *
 * ## The rule, in one place
 *
 * A write (POST/PUT/PATCH/DELETE) refused with a **4xx** shows the message the API sent; a
 * translated key of ours is the fallback. The backend is the only party that knows why *that* write
 * was refused — "This wallet address is already registered", "You can't change username of verified
 * space" — and a generic key in front of that is information destroyed.
 *
 * ## The four things that make it safe
 *
 * 1. **The body, never `error.message`.** `normalizeApiError` builds that as
 *    `body.message || body.error || axiosErr.message || 'Request failed'`, so on a response with no
 *    message it is *axios's own English* — "Request failed with status code 400" — in nine locales.
 *    Reading the body instead is what makes "no message ⇒ use ours" actually fire.
 * 2. **4xx only, minus 429, 403 and 401.** A 5xx is the server saying it broke: nobody wrote that
 *    text for a reader, and it is where upstream wording and stack fragments live. A 429's sentence
 *    is as likely to be the proxy's as ours, and `Retry-After` is already parsed. A 403 is
 *    `features/permission`'s vocabulary and names grants the reader cannot act on. 401 never reaches
 *    a feature — `client.ts` retires the account first. §2a/§2b argue each one.
 * 3. **The field list is the *union* of all five copies, in this order.** This is the part that can
 *    go wrong silently: only `payout-request-errors.ts` reads `detail` (DRF's spelling, and what
 *    billy sends) and only `use-create-channel.ts` reads `errors[0].error`, so a helper that missed
 *    either would return `null` for those responses and the screen would fall back to its generic
 *    key **forever, with nothing failing**.
 * 4. **200 characters.** Long enough for a real sentence, short enough that a JSON blob or a stack
 *    fragment cannot masquerade as one. The four copies that cap at 200 keep their behaviour;
 *    `payout-error.ts`'s 160 is the only outlier and widening is the safe direction.
 *
 * ⚠ **A body that names *fields* is a different surface and outranks this** (§4): those sentences go
 * under the inputs they are about, with **no toast**. `parseChannelFieldErrors` is the reference
 * parser. `errors[0].error` is read here only as a whole-request message, which is what
 * `use-create-channel.ts` uses it for — a form that has the field should be showing it inline.
 */
export const MAX_API_MESSAGE = 200

export function apiErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    // Network, abort and timeout have no body at all.
    if (error.isNetwork || error.isCanceled) return null
    // §2b — both are 4xx, so the range check below would let them through.
    if (error.isRateLimited() || error.isForbidden() || error.isAuthError()) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    if (!error.data || typeof error.data !== 'object') return null

    const body = error.data as {
        message?: unknown
        detail?: unknown
        error?: unknown
        data?: { message?: unknown }
        errors?: unknown
    }
    /*
     * `data.message` is one level down because the response interceptor unwraps the
     * `{ data: payload }` envelope on the **success** path only (`client.ts`) — an error body keeps
     * its envelope, and nothing later flattens it.
     */
    const firstError = Array.isArray(body.errors)
        ? (body.errors[0] as { error?: unknown } | undefined)?.error
        : undefined
    const raw = [body.message, body.data?.message, body.detail, body.error, firstError].find(
        candidate => typeof candidate === 'string' && candidate.trim() !== '',
    )
    if (typeof raw !== 'string') return null

    const text = raw.trim()
    return text.length <= MAX_API_MESSAGE ? text : null
}
