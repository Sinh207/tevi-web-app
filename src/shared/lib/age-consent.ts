import { STORAGE_KEYS, storage } from './storage'

/**
 * Which **age-restricted live events** a reader has confirmed being over 18 for.
 *
 * ## In `shared/`, because the account layer has to be able to erase it
 *
 * The same reason `nsfw-consent.ts` is here, and it is not a style preference:
 * **`AuthProvider.forgetAccount` is the single place an account's traces are cleaned up**, and
 * `features/auth` may not import `features/event`. Left in the feature, "yes, I am over 18" would
 * survive the account that said it — readable by whoever used the browser next, on a device that may
 * have changed hands.
 *
 * ## Per event, not per space
 *
 * `age_restriction` is a flag a creator sets on **one broadcast**. A space can host an 18+ stream on
 * Friday and a family one on Saturday, so consent keyed by slug would carry the wrong answer
 * forwards. This is the one substantive difference from sensitive-content consent, and it is why
 * this is a second module rather than a second key in the first one: the shape of the question is
 * different, and merging them would mean one of the two call sites passing a value that means
 * something else.
 *
 * ## The record
 *
 * `{ [accountId]: { [eventCode]: confirmedAtMs } }`.
 *
 * - **Keyed by account**, because this app holds up to ten at once and this is a person's answer,
 *   not a device's.
 * - **A timestamp per event, not a bare array**, so the list is pruned by age rather than truncated
 *   arbitrarily. An array grows for as long as the browser lives, in a quota shared with everything
 *   else this app persists.
 *
 * Two bounds on every write: entries older than `TTL_MS` are dropped and an account over
 * `MAX_PER_ACCOUNT` keeps only its most recent. Both prune **on write**, so reading stays a parse
 * and nothing runs on a timer.
 *
 * ⚠ **`accountId` is required and not nullable**, unlike the anonymous-friendly stores in this
 * directory. An answer recorded before the session is known cannot be read back afterwards: it would
 * be filed under a placeholder while the lookup uses the real id. `useAgeGate` holds the answer in
 * component state until the id arrives, which is the same thing `useNsfwGate` does and for the same
 * reason.
 *
 * A TTL on this is a product call, not only hygiene: an age confirmation given once for one stream
 * should not still stand a year later on a shared browser. Ninety days matches sensitive-content
 * consent, which is long enough that nobody is asked twice in a session.
 */
type ConsentRecord = Record<string, Record<string, number>>

/** Ninety days, in milliseconds — the same window as sensitive-content consent. */
const TTL_MS = 90 * 24 * 60 * 60 * 1000
/** A ceiling, not a target — reaching it means something is wrong, and truncating is the backstop. */
const MAX_PER_ACCOUNT = 200

/** Corrupt or foreign JSON degrades to "nothing confirmed" rather than throwing. */
function read(): ConsentRecord {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.ageConfirmed)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: ConsentRecord = {}
    for (const [account, events] of Object.entries(raw as Record<string, unknown>)) {
        if (!events || typeof events !== 'object' || Array.isArray(events)) continue
        const entries: Record<string, number> = {}
        for (const [code, at] of Object.entries(events as Record<string, unknown>)) {
            if (typeof at === 'number' && Number.isFinite(at)) entries[code] = at
        }
        out[account] = entries
    }
    return out
}

/** Drops what has expired and caps what is left, newest first. */
function prune(entries: Record<string, number>, now: number): Record<string, number> {
    const fresh = Object.entries(entries)
        .filter(([, at]) => now - at < TTL_MS)
        .sort(([, a], [, b]) => b - a)
        .slice(0, MAX_PER_ACCOUNT)
    return Object.fromEntries(fresh)
}

export function hasAgeConsent(eventCode: string, accountId: string): boolean {
    if (!eventCode || !accountId) return false
    const at = read()[accountId]?.[eventCode]
    return typeof at === 'number' && Date.now() - at < TTL_MS
}

/** Idempotent in effect: confirming again just refreshes the timestamp. */
export function grantAgeConsent(eventCode: string, accountId: string): void {
    if (!eventCode || !accountId) return
    const now = Date.now()
    const record = read()
    record[accountId] = prune({ ...record[accountId], [eventCode]: now }, now)
    storage.setJSON(STORAGE_KEYS.ageConfirmed, record)
}

/**
 * Forget everything one account confirmed — called from `AuthProvider.forgetAccount`, beside the
 * ETag scope, the cached profile, the sensitive-content consent and the search history.
 */
export function clearAgeConsent(accountId: string): void {
    const record = read()
    if (!(accountId in record)) return
    delete record[accountId]
    storage.setJSON(STORAGE_KEYS.ageConfirmed, record)
}
