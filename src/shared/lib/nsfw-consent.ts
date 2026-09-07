import { STORAGE_KEYS, storage } from './storage'

/**
 * Which spaces a viewer has agreed to see sensitive content from.
 *
 * ## In `shared/`, because the account layer has to be able to erase it
 *
 * It began in `features/channel`, which was the wrong home for one reason that only shows up at
 * sign-out: **`AuthProvider.forgetAccount` is the single place an account's traces are cleaned up**
 * (its bearer, its ETag scope, its cached `/me`), and `features/auth` may not import
 * `features/channel`. So consent stayed behind on the device after the account that gave it was
 * removed — readable by whoever used the browser next. Here, `forgetAccount` drops it with the rest.
 *
 * The second reason is the one the old file already predicted: a sensitive **post** in a feed asks
 * the same question, so this was never the channel's to own.
 *
 * ## The record, and why it is not a list of slugs
 *
 * `{ [accountId]: { [slug]: confirmedAtMs } }`.
 *
 * - **Keyed by account**, because this app holds up to ten at once and consent is a person's answer,
 *   not a device's. Legacy writes `` `${currentUser?.id}_nsfw_confirmed_list` `` — one key per
 *   account, outside any registry, and literally `undefined_nsfw_confirmed_list` for a visitor who
 *   is not signed in, which is a **shared bucket every guest on that device inherits**.
 * - **A timestamp per slug, not a bare array**, so the list can be pruned by age rather than
 *   truncated arbitrarily. An array grows for as long as the browser lives: somebody who confirms a
 *   space a week for two years leaves a hundred entries nobody will ever read again, in a store
 *   whose quota is shared with everything else this app persists.
 *
 * Two bounds are applied on every write: entries older than `TTL_MS` are dropped, and an account
 * that somehow exceeds `MAX_PER_ACCOUNT` keeps only its most recent. Both prune **on write**, so
 * reading stays a parse and nothing runs on a timer.
 *
 * A TTL on consent is a deliberate product call, not only hygiene: "yes, I am over 18" answered
 * once for one space should not still be answered a year later on a device that may have changed
 * hands. Ninety days is long enough that nobody is asked twice in a session and short enough that a
 * stale device forgets.
 */
type ConsentRecord = Record<string, Record<string, number>>

/** Ninety days, in milliseconds. */
const TTL_MS = 90 * 24 * 60 * 60 * 1000
/** A ceiling, not a target — reaching it means something is wrong, and truncating is the backstop. */
const MAX_PER_ACCOUNT = 200

/** Corrupt or foreign JSON degrades to "nothing confirmed" rather than throwing. */
function read(): ConsentRecord {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.nsfwConfirmed)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: ConsentRecord = {}
    for (const [account, slugs] of Object.entries(raw as Record<string, unknown>)) {
        if (!slugs || typeof slugs !== 'object' || Array.isArray(slugs)) continue
        const entries: Record<string, number> = {}
        for (const [slug, at] of Object.entries(slugs as Record<string, unknown>)) {
            if (typeof at === 'number' && Number.isFinite(at)) entries[slug] = at
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

/**
 * `accountId` is required and **not nullable**: a consent recorded before the session is known
 * cannot be read back afterwards, because it would have been filed under a placeholder while the
 * lookup uses the real id. `useNsfwGate` holds the answer in state until the id arrives rather
 * than writing it somewhere it will be lost.
 */
export function hasNsfwConsent(slug: string, accountId: string): boolean {
    if (!slug || !accountId) return false
    const at = read()[accountId]?.[slug]
    return typeof at === 'number' && Date.now() - at < TTL_MS
}

/** Idempotent in effect: confirming again just refreshes the timestamp. */
export function grantNsfwConsent(slug: string, accountId: string): void {
    if (!slug || !accountId) return
    const now = Date.now()
    const record = read()
    record[accountId] = prune({ ...record[accountId], [slug]: now }, now)
    storage.setJSON(STORAGE_KEYS.nsfwConfirmed, record)
}

export function revokeNsfwConsent(slug: string, accountId: string): void {
    const record = read()
    const entries = record[accountId]
    if (!entries?.[slug]) return
    delete entries[slug]
    storage.setJSON(STORAGE_KEYS.nsfwConfirmed, record)
}

/**
 * Forget everything one account agreed to — called from `AuthProvider.forgetAccount`, beside the
 * ETag scope and the cached profile, so signing out of an account on a shared device does not leave
 * its answers behind for the next person.
 */
export function clearNsfwConsent(accountId: string): void {
    const record = read()
    if (!(accountId in record)) return
    delete record[accountId]
    storage.setJSON(STORAGE_KEYS.nsfwConfirmed, record)
}
