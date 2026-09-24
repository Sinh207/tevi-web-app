import { STORAGE_KEYS, storage } from './storage'

/**
 * **Three free looks at a paid live stream, per device, per event.**
 *
 * Legacy's `PREVIEW_LIMIT = 3` against `preview_view_count` in `localStorage`. The quota is what
 * makes the free preview an advertisement rather than a way to watch the whole broadcast ten
 * seconds at a time, and the shape of it is load-bearing in three ways that are each easy to get
 * wrong:
 *
 * - **Per device, not per account.** See `STORAGE_KEYS.previewQuota`: an account-scoped counter is
 *   reset by signing out, which is not a limit. This is the one piece of per-person device state
 *   `AuthProvider.forgetAccount` deliberately does **not** drop.
 * - **Per event.** Three previews of *this* broadcast. A creator's next stream starts fresh —
 *   legacy keys on the event code and so does this.
 * - **Spent on the request, not on the render.** `spend()` is called before the fetch, because the
 *   backend counts the call. A component that reacted to the response instead would be charged for
 *   a retry, a refetch-on-focus, or React's strict-mode double-mount, and the reader would silently
 *   lose previews they never saw.
 *
 * ## This is not a security control and must not be described as one
 *
 * It is `localStorage`: a reader can clear it, and an incognito window starts at zero. The
 * **backend** enforces the limit — this exists so the client does not *spend* a preview it already
 * knows is refused, which is the difference between showing "Preview limit reached" instantly and
 * showing it after a round trip that consumed the reader's fourth attempt. Same posture as
 * `?verify=`: a speed bump with a real purpose, not a gate.
 */

/** Legacy's `PREVIEW_LIMIT`. */
export const PREVIEW_LIMIT = 3

/**
 * How long a record survives being untouched.
 *
 * Legacy has no expiry at all, so its map grows for the life of the browser profile — one entry per
 * event ever previewed, forever. Thirty days is past any live broadcast's relevance: an event
 * nobody has opened in a month is over, and its counter is holding space for a stream that cannot
 * be watched again.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A hard ceiling on rows, oldest evicted first.
 *
 * The TTL alone does not bound this — somebody who opens a hundred streams in a week has a hundred
 * live records. `storage.setJSON` swallows a quota error rather than throwing, so without a cap the
 * failure is not an exception but a map that silently stops being written, which would hand every
 * subsequent event unlimited previews.
 */
const MAX_EVENTS = 100

type QuotaRow = { spent: number; at: number }
type QuotaRecord = Record<string, QuotaRow>

function read(): QuotaRecord {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.previewQuota)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: QuotaRecord = {}
    for (const [code, row] of Object.entries(raw as Record<string, unknown>)) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const { spent, at } = row as { spent?: unknown; at?: unknown }
        /*
         * Both fields must be real numbers. A malformed row is **dropped**, which fails *open* —
         * the reader gets their previews back. That is the right direction for a counter that is
         * already advisory: the backend is the enforcement, and refusing to serve a preview
         * because our own JSON is corrupt would be punishing somebody for our bug.
         */
        if (typeof spent !== 'number' || !Number.isFinite(spent) || spent < 0) continue
        if (typeof at !== 'number' || !Number.isFinite(at)) continue
        out[code] = { spent: Math.floor(spent), at }
    }
    return out
}

function prune(record: QuotaRecord, now: number): QuotaRecord {
    const fresh = Object.entries(record)
        .filter(([, row]) => now - row.at < TTL_MS)
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, MAX_EVENTS)
    return Object.fromEntries(fresh)
}

/** How many of this event's three previews are left. Never negative. */
export function previewsLeft(eventCode: string): number {
    if (!eventCode) return 0
    const row = read()[eventCode]
    if (!row || Date.now() - row.at >= TTL_MS) return PREVIEW_LIMIT
    return Math.max(0, PREVIEW_LIMIT - row.spent)
}

/** Has this device used up its free looks at this event? */
export function isPreviewExhausted(eventCode: string): boolean {
    return previewsLeft(eventCode) <= 0
}

/**
 * Spend one, and report how many remain **after** the spend.
 *
 * Returns `0` without writing when there was nothing left, so a caller that ignores
 * `isPreviewExhausted` still cannot drive the count past the limit — the two entry points cannot
 * disagree.
 *
 * `at` is refreshed on every spend, so the TTL measures *inactivity* rather than age: a reader
 * coming back to the same stream an hour later has not had their counter quietly reset.
 */
export function spendPreview(eventCode: string): number {
    if (!eventCode) return 0
    const now = Date.now()
    const record = read()
    const existing = record[eventCode]
    const spent = existing && now - existing.at < TTL_MS ? existing.spent : 0
    if (spent >= PREVIEW_LIMIT) return 0

    record[eventCode] = { spent: spent + 1, at: now }
    storage.setJSON(STORAGE_KEYS.previewQuota, prune(record, now))
    return PREVIEW_LIMIT - (spent + 1)
}

/**
 * Drop every record. **Test and `/dev` only** — there is no product affordance for this, by
 * design: a "reset my previews" button is the loophole the counter exists to close.
 */
export function clearPreviewQuota(): void {
    storage.remove(STORAGE_KEYS.previewQuota)
}
