import { ApiError } from '@shared/lib/api/errors'

/**
 * The rules about a gift code itself — what counts as one, and what a refusal to redeem it
 * means. Pure functions, so the screen and the sequencing can both be reasoned about without a
 * browser or a server.
 */

/**
 * The shortest string worth sending.
 *
 * Legacy's own floor (`code.length < 6` gates both the button and the Enter key) and it is a
 * client-side courtesy, not a format claim: nobody knows the real grammar of a Tevi gift code —
 * see `docs/BACKEND_QUESTIONS.md`. Six characters keeps the two round trips below from firing on
 * a stray keystroke, and nothing here rejects a code the server might have accepted.
 */
export const MIN_CODE_LENGTH = 6

/**
 * The value that goes on the wire.
 *
 * **Trimmed, and nothing else.** A code arrives by copy-paste out of an email or a chat message,
 * so leading and trailing whitespace is the one transformation that is certainly safe — pasting
 * `" ABC-123 "` and being told it is invalid is the most avoidable failure this screen has.
 *
 * It is deliberately **not** upper-cased and internal characters are left alone: whether the
 * backend compares codes case-insensitively is unknown (B-series question), and folding case on a
 * case-sensitive code turns a valid one into a rejection that looks like the code was already
 * used. Legacy sends the raw field value, so a code that works there works here.
 */
export function normalizeCode(raw: string): string {
    return raw.trim()
}

/** Whether there is enough in the field to be worth two requests. */
export function canRedeem(raw: string): boolean {
    return normalizeCode(raw).length >= MIN_CODE_LENGTH
}

/**
 * Whether a failed redemption means **"that is not a code of ours"** rather than "we could not
 * find out".
 *
 * The distinction is the whole error story on this screen, and legacy does not make it: every
 * failure there prints *"The code entered is not valid."* — so a 502 from the billing service
 * tells someone holding a perfectly good gift card that their card is worthless, and the sentence
 * is stuck on the field until they retype it.
 *
 * A 4xx is the server having looked and said no. Four statuses inside that range are **not** that:
 *
 * - **401** — the session, not the code. The interceptor owns it (single-flight refresh, and a
 *   dead account drops to anonymous in place); by the time anything here sees it the answer about
 *   the code is unknown.
 * - **403** — the account may not redeem, which is a different sentence and not one to invent.
 * - **408 / 429** — the request never ran to a verdict. Retrying is the honest advice.
 *
 * Anything else — a 5xx, a network drop, an abort — is also "unknown", so it fails this test and
 * the caller raises a *try again* toast instead of marking the field wrong.
 */
export function isCodeRejection(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    const { status } = error
    if (status === undefined) return false
    if (status === 401 || status === 403 || status === 408 || status === 429) return false
    return status >= 400 && status < 500
}

/** How long a Premium grant runs for, in the largest unit that does not read as a rounding error. */
export type PremiumDuration = { unit: 'month' | 'day'; count: number }

const DAY_MS = 86_400_000
/** The mean Gregorian month. 365.25 / 12 — so a 365-day grant reads "12 months", not "11". */
const MONTH_DAYS = 30.4375

/**
 * "3 months", "14 days" — the *Duration* row on the Premium result panel.
 *
 * Measured from `now` to the grant's expiry rather than taken from the redemption response,
 * because the response does not carry it: `premium/v1/redeem/`'s body is undocumented and legacy
 * ignores it entirely, re-reading `premium/v1/user/info/` for `expires_at` instead. So this is a
 * subtraction, and the *shape* of the answer is chosen here rather than in the component.
 *
 * Two units, because one is wrong at both ends: a 7-day trial code rendered in months is "0
 * months" (or, rounded up, a month it does not grant), and a 2-year code rendered in days is a
 * number nobody can read. The switch is at one month.
 *
 * Rounding is **up** on days — a grant with nine hours left on it still has a day of use in it —
 * and **nearest** on months, where a day either way is not a claim anybody is making.
 *
 * `null` for a grant that is missing, unreadable or already expired: the panel drops the row
 * rather than printing "0 days", which reads as a defect in the gift.
 */
export function premiumDuration(
    expiresAt: number | null | undefined,
    now: number,
): PremiumDuration | null {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
    const remaining = expiresAt - now
    if (remaining <= 0) return null

    const days = Math.ceil(remaining / DAY_MS)
    // 30, not `MONTH_DAYS`: a 30-day grant is the shortest month anybody sells, and comparing
    // against 30.4375 would print it as "30 days" while a 31-day one printed "1 month".
    if (days < 30) return { unit: 'day', count: days }
    return { unit: 'month', count: Math.max(1, Math.round(days / MONTH_DAYS)) }
}

/**
 * A grant's date — `19 Aug 2026`, in the reader's own order and **own zone**.
 *
 * Date only, no time: what the panel is answering is "until when do I have this", and an hour on a
 * subscription expiry is noise the reader cannot act on. `shared/lib/ledger-time.ts` keeps the time
 * for the opposite reason — a ledger row is a *moment*, and "did I really spend that at 2am" is a
 * question only the clock answers.
 *
 * Local zone, so this is **not** safe to render during SSR: the server's zone is not the reader's and
 * React would report a hydration mismatch. That is fine here and not a latent trap — the panel only
 * exists after a redemption, which cannot happen anywhere but the browser.
 *
 * `''` for an unreadable value, so the caller can drop the row rather than print `Invalid Date`.
 */
const GRANT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
}

export function formatGrantDate(value: number | null | undefined, locale = 'en'): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, GRANT_DATE_FORMAT).format(date)
    } catch {
        // An unsupported locale tag must not blank the row — the DS's own rule for every formatter.
        return new Intl.DateTimeFormat('en', GRANT_DATE_FORMAT).format(date)
    }
}
