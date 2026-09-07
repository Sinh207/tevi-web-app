/**
 * What a failed payout write is allowed to say on screen.
 *
 * ## Why `error.message` cannot be printed
 *
 * `normalizeApiError` builds `ApiError.message` as
 * `body.message || body.error || axiosErr.message || …` — so when the backend sends no message the
 * value is **axios's own English**: *"Request failed with status code 500"*, or *"Network Error"*.
 * Handing that to a toast puts an untranslated library string on the screen that saves somebody's bank
 * details, in nine locales, and it tells them nothing they can act on.
 *
 * This reads the **body** instead, under the same three rules `features/auth`'s
 * `providerSignInErrorText` states (its reasoning is the reference; a feature may not import another
 * feature's internals, hence the second copy):
 *
 * - **4xx only.** "You cannot do this, and here is why" is the one class of failure a server phrases
 *   for a person — *"This wallet address is already registered"* is worth more than any key of ours.
 *   A 5xx body is where internal codes and stack fragments live, and a network failure has no body.
 * - **The body, never `error.message`.** See above.
 * - **One short sentence or nothing.** A paragraph, a stack trace or a JSON blob is not a message.
 *
 * `null` means "use your own translated key", which every caller has.
 */
import { ApiError } from '@shared/lib/api/errors'

/**
 * Long enough for a real sentence, short enough that a stack fragment or a serialised payload cannot
 * masquerade as one. Same number `features/auth` uses.
 */
const MAX_MESSAGE = 160

export function payoutErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    if (!error.data || typeof error.data !== 'object') return null

    const body = error.data as { message?: unknown; error?: unknown }
    const raw = typeof body.message === 'string' ? body.message : body.error
    if (typeof raw !== 'string') return null

    const text = raw.trim()
    if (!text || text.length > MAX_MESSAGE) return null
    return text
}
