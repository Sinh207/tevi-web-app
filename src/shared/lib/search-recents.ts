import { STORAGE_KEYS, storage } from './storage'

/**
 * What this account has searched for, most recent first.
 *
 * ## In `shared/`, because the account layer has to be able to erase it
 *
 * The same reason `nsfw-consent.ts` is here, and it is not stylistic: **`AuthProvider.forgetAccount`
 * is the single place an account's traces are cleaned up** (its bearer, its ETag scope, its cached
 * `/me`, its consents), and `features/auth` may not import `features/search`. A list of the terms
 * somebody typed is exactly the kind of thing that must not survive them signing out on a borrowed
 * laptop — it is the search history, and it is legible at a glance.
 *
 * ## The record, and why it is not legacy's shape
 *
 * `{ [accountId]: { term, at }[] }`.
 *
 * - **Keyed by account**, because this app holds up to ten at once and a search history is a
 *   person's, not a device's. Legacy writes `` `${currentUser.id}_recent_searches` `` — one
 *   unregistered key per account, which cannot be migrated and cannot be cleaned up, and which is
 *   simply absent for anyone without a real account (`STORAGE_KEY` is `''`, and every write is a
 *   no-op) — so an anonymous visitor's recents silently never save.
 * - **An array, not a map of term → timestamp**, because order *is* the content here. A map would
 *   have every read re-sort by timestamp to recover what the array already states, and it would put
 *   arbitrary user input in the key position for no gain.
 * - **A timestamp per entry** even though the order carries the recency, because it is what lets a
 *   future "clear searches older than…" exist without a migration, and it costs eight bytes.
 *
 * ## No TTL, deliberately — unlike `nsfw-consent.ts`
 *
 * That file expires entries at 90 days because consent is an *answer* that should go stale ("yes, I
 * am over 18" should not still be answered a year later on a device that may have changed hands).
 * This is not an answer, it is a convenience, and `MAX_TERMS` is already the bound: five entries
 * is the whole of it, and a term nobody has searched since is on its way out of the list by being
 * pushed off the end. A TTL on top would only make a *short* list shorter.
 *
 * ## One store, and every reader sees the same one
 *
 * The list is read in **two places at once**: `useChannelSearch` needs to *write* a term when the
 * reader commits one, and `SearchView` needs to *render* the list. Two `useState` mirrors of the
 * same `localStorage` key is the obvious shape and it is wrong — a term written through one
 * instance leaves the other stale, so pressing Enter and then clearing the field showed a Recents
 * list with the term you just searched missing from it. (That is not hypothetical; it is what the
 * first version of this did.)
 *
 * So the module is an **external store**: `subscribeSearchRecents` + `getSearchRecents` feed
 * `useSyncExternalStore`, exactly as `shared/lib/api/token.ts` does for the account map, which has
 * the same shape of problem. Every reader is one subscriber to one value.
 *
 * The snapshot is cached against the **raw string** rather than behind a version counter, which is
 * what makes the cache correct rather than merely fast: `useSyncExternalStore` requires
 * `getSnapshot` to return a referentially stable value or it re-renders forever, and keying on the
 * raw text means the cache also self-invalidates when the store is changed by something this
 * module never saw — another tab, or a test writing `localStorage` directly.
 *
 * ## No minimum term length — this is where legacy loses the CJK locales
 *
 * Legacy refuses to record anything under **three characters** (`MIN_TERM_LENGTH = 3`). That is not
 * a threshold, it is a locale assumption: this app ships `ko`, `zh-CN` and `zh-TW`, where a display
 * name of one or two characters is ordinary — so a Korean reader's searches are simply never
 * remembered, and nothing about the screen says so. `useBlockedAccounts` makes the same point about
 * a search *floor* for the same locales. One character is a search; it is recorded.
 */

interface RecentEntry {
    term: string
    /** `Date.now()` when it was last searched. */
    at: number
}

type RecentsRecord = Record<string, RecentEntry[]>

/**
 * The only bound this needs — see the note above. Five, from the Figma Search page ("Giới hạn lưu 5
 * items mỗi loại"); legacy's `MAX_SEARCHES` was 20.
 */
export const MAX_TERMS = 5

/**
 * A ceiling on one stored term, not on what may be *typed*.
 *
 * A pasted paragraph is a legitimate (if hopeless) search, and the field accepts it; what must not
 * happen is twenty of them sitting in a store whose quota is shared with the token map and the
 * ETag cache. 120 characters is longer than any display name or handle the backend issues, so
 * nothing a reader would actually want back is lost.
 */
const MAX_TERM_LENGTH = 120

/**
 * The one array every empty answer returns.
 *
 * A module constant rather than a fresh `[]`, and it is load-bearing: `getSnapshot` returning a
 * new array each call is the classic `useSyncExternalStore` infinite loop.
 */
const EMPTY: string[] = []

const listeners = new Set<() => void>()

/**
 * The parsed view of the store, keyed by the raw text it was parsed from.
 *
 * One `getItem` and a string compare per render; a `JSON.parse` only when the text actually
 * changed. See the note at the top for why the key is the raw string and not a counter.
 */
let cache: { raw: string | null; byAccount: Map<string, string[]> } | null = null

function emit(): void {
    for (const listener of listeners) listener()
}

/**
 * Another tab wrote the store. `key === null` is a `localStorage.clear()`, which the spec reports
 * with no key at all — treating that as "not ours" is how a cleared store stays on screen.
 */
function onStorage(event: StorageEvent): void {
    if (event.key === null || event.key === STORAGE_KEYS.searchRecents) emit()
}

/**
 * Subscribe to the store — the `useSyncExternalStore` half.
 *
 * The `storage` listener is attached for as long as there is at least one subscriber and detached
 * with the last one, so a page that never renders the search screen adds no window listener. Only
 * ever called from a hook's `subscribe`, which does not run on the server; the `window` guard is
 * for the non-browser environments the rest of this file already tolerates.
 */
export function subscribeSearchRecents(listener: () => void): () => void {
    listeners.add(listener)
    if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage)
    }
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('storage', onStorage)
        }
    }
}

/** Corrupt or foreign JSON degrades to "no history" rather than throwing. */
function read(): RecentsRecord {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.searchRecents)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: RecentsRecord = {}
    for (const [account, list] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const entries: RecentEntry[] = []
        for (const row of list) {
            if (!row || typeof row !== 'object') continue
            const { term, at } = row as { term?: unknown; at?: unknown }
            if (typeof term !== 'string' || term === '') continue
            entries.push({ term, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 })
        }
        out[account] = entries.slice(0, MAX_TERMS)
    }
    return out
}

/**
 * Persist, then tell every reader. The `emit` is not optional — it is the whole reason a write
 * through one component's hook shows up in another's.
 *
 * The snapshot cache needs no explicit invalidation: the raw text has changed, so the next
 * `getSearchRecents` misses on the string compare and re-parses.
 */
function write(record: RecentsRecord): void {
    storage.setJSON(STORAGE_KEYS.searchRecents, record)
    emit()
}

/**
 * This account's recent terms, newest first — and the `getSnapshot` half of the store.
 *
 * **Referentially stable** while the underlying text is unchanged, which is what
 * `useSyncExternalStore` requires of it. An account with no history gets the shared `EMPTY`.
 *
 * `accountId` is required and **not nullable**, for the reason `hasNsfwConsent` states: a term
 * recorded before the session is known would be filed under a placeholder and never read back. A
 * caller with no id yet has no history to show, and says so by passing `''`.
 */
export function getSearchRecents(accountId: string): string[] {
    if (!accountId) return EMPTY
    const raw = storage.get(STORAGE_KEYS.searchRecents)
    if (!cache || cache.raw !== raw) cache = { raw, byAccount: new Map() }
    const hit = cache.byAccount.get(accountId)
    if (hit) return hit
    const entries = read()[accountId]
    const terms = entries?.length ? entries.map(entry => entry.term) : EMPTY
    cache.byAccount.set(accountId, terms)
    return terms
}

/**
 * Record one term, or move it back to the top if it is already there.
 *
 * Trimmed, capped, and **de-duplicated case-insensitively** — searching "Ada" after "ada" is the
 * same search, and legacy's exact-match dedupe (`prev.includes(trimmedTerm)`) leaves both in the
 * list looking like a rendering bug. The spelling that survives is the **new** one, because it is
 * the one the reader just typed.
 *
 * ## A term that *extends the head* replaces it, and that is what makes recording-while-typing safe
 *
 * `useChannelSearch` records every term the reader settles on, so typing "adam" writes "a", "ad",
 * "ada" and "adam" as the debounce fires — four rows for one search, which is exactly the defect
 * legacy has and the reason this app used to record nothing until a press. The fix belongs here
 * rather than in the caller's timing: when the new term **starts with the term currently at the top**
 * (folded), the reader is still typing that same search, so the head is replaced instead of pushed
 * down.
 *
 * Scoped to the head deliberately. A blanket "drop every prefix of the new term" would also delete
 * "ada" from last week when today's search is "adamsmith" — two different searches that happen to
 * share a stem. Only the entry written moments ago by the previous keystroke can be the one being
 * typed over, and only the head can be that entry.
 *
 * Backspacing is the case this does **not** collapse, and correctly: "adam" → "ada" does not extend
 * the head, so both stand. That is a reader narrowing a search rather than continuing one, and the
 * shorter term is a real thing they looked at.
 *
 * Returns the resulting list so a caller can render it without a second read.
 */
export function addSearchRecent(term: string, accountId: string): string[] {
    if (!accountId) return EMPTY
    const trimmed = term.trim().slice(0, MAX_TERM_LENGTH)
    if (trimmed === '') return getSearchRecents(accountId)

    const record = read()
    const existing = record[accountId] ?? []
    const folded = trimmed.toLocaleLowerCase()

    /*
     * `startsWith` on the folded pair, and `!==` so an identical term takes the ordinary dedupe path
     * below rather than being treated as "still typing" — the two do the same thing to the list, but
     * only one of them is worth reading as an extension.
     */
    const head = existing[0]?.term.toLocaleLowerCase()
    const kept =
        head !== undefined && head !== folded && folded.startsWith(head)
            ? existing.slice(1)
            : existing

    const next: RecentEntry[] = [
        { term: trimmed, at: Date.now() },
        ...kept.filter(entry => entry.term.toLocaleLowerCase() !== folded),
    ].slice(0, MAX_TERMS)

    record[accountId] = next
    write(record)
    return next.map(entry => entry.term)
}

/** Drop one term. Matched case-insensitively, so it removes what `addSearchRecent` would fold. */
export function removeSearchRecent(term: string, accountId: string): string[] {
    if (!accountId) return EMPTY
    const record = read()
    const existing = record[accountId]
    if (!existing?.length) return EMPTY

    const folded = term.trim().toLocaleLowerCase()
    const next = existing.filter(entry => entry.term.toLocaleLowerCase() !== folded)
    if (next.length === existing.length) return existing.map(entry => entry.term)

    record[accountId] = next
    write(record)
    return next.map(entry => entry.term)
}

/** Forget this account's history — the screen's "Clear". */
export function clearSearchRecents(accountId: string): void {
    if (!accountId) return
    const record = read()
    if (!(accountId in record)) return
    delete record[accountId]
    write(record)
}
