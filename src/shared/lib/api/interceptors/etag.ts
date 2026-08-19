/**
 * Two-tier ETag cache (ported from legacy app):
 *   - Memory: Map of `<scope>::<cacheKey>` → { etag, data }, LRU-trimmed.
 *   - Persistent: IndexedDB, same keys, with TTL.
 *
 * GET requests send `If-None-Match`; a 304 (delivered as an axios rejection)
 * resolves to the cached body with status 200.
 *
 * **This module does not decide whose cache it is touching.** It used to call
 * `getActiveAccountId()` itself, which meant identity was resolved once when the
 * request read its validator and *again* when the response stored its body —
 * seconds apart, with an account switch free to land in between and file one
 * user's response under another's scope. The caller now captures the scope once,
 * at request time, and passes it in (see `_etagScope` in `client.ts`). A cache
 * that picks its own namespace is the bug, not a convenience.
 */

const MAX_MEMORY = 1000
const DEFAULT_TTL_MS = 86_400_000 // 24h
const DB_NAME = 'tevi-etag'
/**
 * Bump to discard the store: a cache is rebuilt, never migrated (see `onupgradeneeded`).
 * v3: `generateCacheKey` now encodes and structurally serialises params, so every
 * key written by v2 is unreachable — and some of them were *wrong* (see below).
 */
const DB_VERSION = 3
const STORE = 'etags'

/** Scope for requests made with no account signed in. */
export const ANON_SCOPE = 'anon'

/**
 * Bodies bigger than this are not cached at all.
 *
 * Neither tier was bounded by size — memory caps entries by *count*, so a
 * thousand slots could hold a thousand multi-megabyte feeds, and IndexedDB took
 * whatever it was given until the origin hit its quota. Payloads worth
 * revalidating are far smaller than this; the ones that aren't are better
 * re-fetched than paid for twice.
 */
const MAX_BODY_BYTES = 256 * 1024

interface CacheRecord {
    etag: string
    data: unknown
    expiresAt: number
}

const memory = new Map<string, CacheRecord>()

/**
 * Cache counters for this page's lifetime.
 *
 * `requestCount` counts cacheable GETs; of those, `cacheMisses` had no validator
 * to send, `cacheHits` came back 304 and were served from the store, and
 * `revalidations` sent a validator but the body had changed. `errorCount` is
 * every request this client ultimately rejected (aborts excluded).
 */
const metrics = {
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    revalidations: 0,
    errorCount: 0,
}

export function getPerformanceMetrics() {
    return { ...metrics }
}
export function resetPerformanceMetrics() {
    metrics.requestCount = 0
    metrics.cacheHits = 0
    metrics.cacheMisses = 0
    metrics.revalidations = 0
    metrics.errorCount = 0
}

// Counters nothing reads are counters nobody trusts. Until there is real
// telemetry, hang them off `window` in dev so `__teviApiMetrics()` in the
// console can answer "is the ETag cache doing anything?".
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__teviApiMetrics = getPerformanceMetrics
}

/**
 * One param value, serialised so that distinct values cannot collapse onto each
 * other.
 *
 * Template-stringifying used to do this: `{ ids: [1, 2] }` became `ids=1,2` and
 * `{ filter: { a: 1 } }` became `filter=[object Object]` — so *every* structured
 * filter on a route shared a single key, and a 304 issued for one filter served
 * another one's body. `JSON.stringify` keeps objects and arrays distinguishable;
 * strings stay bare so the common case reads like a normal query string.
 */
function paramValue(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
        return JSON.stringify(value) ?? ''
    } catch {
        return ''
    }
}

/**
 * Stable cache key: `<origin><pathname>?<sorted params>`, minus the volatile
 * `verify` (HMAC) param.
 *
 * The host is part of the key on purpose — keying on the path alone lets two
 * services that happen to share a route shape serve each other's bodies.
 *
 * The URL's own query and the axios `params` object go through the *same*
 * `URLSearchParams`, so encoding and ordering are one rule rather than two: hand-
 * concatenating the params meant `{ a: '1&b=2' }` produced the same key as
 * `{ a: '1', b: '2' }`.
 */
export function generateCacheKey(url: string, params?: Record<string, unknown>): string {
    try {
        const u = new URL(url, 'http://relative.invalid')
        const search = new URLSearchParams(u.search)
        for (const [k, v] of Object.entries(params ?? {})) {
            if (v == null || v === '') continue
            search.set(k, paramValue(v))
        }
        // `verify` (HMAC) carries a timestamp — it changes on every request, so a
        // key that included it would never be hit twice.
        search.delete('verify')
        search.sort()
        const query = search.toString()
        return `${u.origin}${u.pathname}?${query}`
    } catch {
        return url
    }
}

function scopedKey(scope: string, key: string) {
    return `${scope}::${key}`
}

/** Promote on read so the trim below evicts the coldest entries, not the oldest. */
function touch(key: string, rec: CacheRecord) {
    memory.delete(key)
    memory.set(key, rec)
}

function trimMemory() {
    if (memory.size <= MAX_MEMORY) return
    const drop = Math.ceil(MAX_MEMORY * 0.2)
    let i = 0
    for (const k of memory.keys()) {
        if (i++ >= drop) break
        memory.delete(k)
    }
}

// ── IndexedDB (best-effort, browser-only) ──────────────────────────────────

/**
 * One connection for the page, not one per request.
 *
 * Every `getStoredEtag` / `getCachedData` / `storeEtag` used to call `openDB()`,
 * so a single screen's worth of GETs opened (and never closed) dozens of
 * IndexedDB connections, each with its own open handshake sitting in front of
 * the request in the interceptor. The handle is cached and shared; a connection
 * that dies (`close`/`versionchange`) drops the cache so the next call reopens.
 */
let dbPromise: Promise<IDBDatabase | null> | null = null

/**
 * The open connection, or null while it is still being established.
 *
 * `getStoredEtag` reads this instead of awaiting `openDB()`, because awaiting put
 * the whole IndexedDB open handshake — and, on a `DB_VERSION` bump, a
 * `deleteObjectStore` + `createObjectStore` — directly in front of the first API
 * GET of every cold page load. Nothing was on the wire until the browser had
 * finished opening a *cache*. Missing a validator costs one full response body;
 * blocking costs latency on every request, so the miss is the better trade.
 */
let openDb: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)

    let failedSynchronously = false
    const pending = new Promise<IDBDatabase | null>(resolve => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION)
            req.onupgradeneeded = () => {
                const db = req.result
                // A cache has nothing worth migrating. Any schema change starts the
                // store over rather than reading records written under an older
                // shape — cheaper, and it cannot half-work.
                if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE)
                db.createObjectStore(STORE)
            }
            req.onsuccess = () => {
                const db = req.result
                db.onclose = () => {
                    dbPromise = null
                    openDb = null
                }
                // Another tab is upgrading; let go so it isn't blocked.
                db.onversionchange = () => {
                    db.close()
                    dbPromise = null
                    openDb = null
                }
                openDb = db
                resolve(db)
                schedulePrune()
            }
            req.onerror = () => {
                dbPromise = null
                resolve(null)
            }
            req.onblocked = () => {
                dbPromise = null
                resolve(null)
            }
        } catch {
            // The executor runs before the assignment below, so clearing `dbPromise`
            // from in here would be undone a moment later and this tab would cache a
            // permanent "no database" — hence the flag.
            failedSynchronously = true
            resolve(null)
        }
    })

    dbPromise = pending
    if (failedSynchronously) dbPromise = null
    return pending
}

/**
 * Every write goes through here.
 *
 * Two things a cache must not do: crash the page, and keep failing forever. An
 * unhandled request error bubbles up as a page-level error even though nothing
 * depends on the write, and a store that has hit its quota rejects every
 * subsequent write until something clears it — so `QuotaExceededError` drops the
 * whole cache and lets it rebuild.
 */
async function idbWrite(run: (store: IDBObjectStore) => void) {
    const db = await openDB()
    if (!db) return
    try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.onerror = () => {
            // Handled on abort; assigning this keeps it out of the console.
        }
        tx.onabort = () => {
            if (tx.error?.name === 'QuotaExceededError') void evictAll()
        }
        run(tx.objectStore(STORE))
    } catch {
        // ignore
    }
}

let evicting = false
async function evictAll() {
    if (evicting) return
    evicting = true
    memory.clear()
    await idbWrite(store => {
        store.clear()
    })
    evicting = false
}

/**
 * Drop expired records once per page, when the browser has nothing better to do.
 *
 * TTL was only ever checked on read, so a body whose route is never requested
 * again simply stayed — the store grew for the lifetime of the browser profile
 * and kept stale response bodies of accounts that had long since signed out.
 * Housekeeping waits for idle because a readwrite transaction blocks the
 * readonly reads queued behind it on the same store: running the scan from the
 * connection's `onsuccess` put it directly in front of the page's first request,
 * which is the latency the shared connection exists to remove.
 */
let pruned = false
function schedulePrune() {
    if (pruned) return
    pruned = true
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : null
    if (idle) idle(() => void prune(), { timeout: 10_000 })
    else setTimeout(() => void prune(), 3000)
}

async function prune() {
    const now = Date.now()
    await idbWrite(store => {
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return
            const rec = cursor.value as CacheRecord | undefined
            if (!rec || rec.expiresAt <= now) cursor.delete()
            cursor.continue()
        }
    })
}

/**
 * Read one record — but only if the connection is *already* open.
 *
 * When it is not, kick the open off for next time and report a miss immediately
 * rather than making the caller wait for it (see `openDb`).
 */
async function idbGetIfOpen(key: string): Promise<CacheRecord | null> {
    if (!openDb) {
        void openDB()
        return null
    }
    return idbGet(key)
}

async function idbGet(key: string): Promise<CacheRecord | null> {
    const db = await openDB()
    if (!db) return null
    return new Promise(resolve => {
        try {
            const tx = db.transaction(STORE, 'readonly')
            tx.onerror = () => resolve(null)
            const req = tx.objectStore(STORE).get(key)
            req.onsuccess = () => resolve((req.result as CacheRecord) ?? null)
            req.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
}

function idbSet(key: string, rec: CacheRecord) {
    return idbWrite(store => {
        store.put(rec, key)
    })
}

/**
 * Delete every key under a prefix.
 *
 * A bounded cursor, not `getAllKeys()` + filter: the latter pulls every key in
 * the store into memory to throw most of them away, and touches other accounts'
 * keys to do it. `\uffff` sorts after anything a key of ours can contain, so the
 * range is exactly "starts with this prefix" and IDB walks only that stretch.
 */
function idbDeletePrefix(prefix: string) {
    return idbWrite(store => {
        const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, true)
        const cursorReq = store.openCursor(range)
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return
            cursor.delete()
            cursor.continue()
        }
    })
}

function idbClear() {
    return idbWrite(store => {
        store.clear()
    })
}

// ── Public API used by the axios interceptors ──────────────────────────────

/**
 * Look up a stored ETag (memory → IndexedDB).
 *
 * Never waits on the IndexedDB connection: this sits in front of the request in
 * the interceptor, so a slow open would delay the GET itself.
 */
export async function getStoredEtag(scope: string, cacheKey: string): Promise<string | null> {
    const sk = scopedKey(scope, cacheKey)
    const mem = memory.get(sk)
    if (mem && mem.expiresAt > Date.now()) {
        touch(sk, mem)
        return mem.etag
    }
    const rec = await idbGetIfOpen(sk)
    if (rec && rec.expiresAt > Date.now()) {
        memory.set(sk, rec)
        trimMemory()
        return rec.etag
    }
    return null
}

/**
 * Read cached body for a 304 response.
 *
 * Unlike `getStoredEtag` this one *does* wait for IndexedDB: the server has
 * already told us the body is unchanged, so there is nothing to serve unless we
 * find it. Giving up early here would turn a hit into a second round trip.
 */
export async function getCachedData(scope: string, cacheKey: string): Promise<unknown> {
    const sk = scopedKey(scope, cacheKey)
    const mem = memory.get(sk)
    if (mem && mem.expiresAt > Date.now()) {
        touch(sk, mem)
        return mem.data
    }
    const rec = await idbGet(sk)
    return rec && rec.expiresAt > Date.now() ? rec.data : undefined
}

/**
 * Rough serialised size. UTF-16 code units rather than bytes — it undercounts
 * non-Latin text by up to a third, which is fine for a threshold this coarse.
 * Anything unserialisable is reported as too large: IndexedDB's structured
 * clone would refuse it anyway.
 */
function tooLarge(data: unknown): boolean {
    try {
        const json = JSON.stringify(data)
        return json === undefined || json.length > MAX_BODY_BYTES
    } catch {
        return true
    }
}

/** Persist a 200 response's ETag + body. */
export function storeEtag(
    scope: string,
    cacheKey: string,
    etag: string,
    data: unknown,
    ttlMs = DEFAULT_TTL_MS,
) {
    // Skipping the entry outright, rather than keeping the validator without the
    // body: an ETag with nothing behind it turns the next 304 into a round trip
    // that has to be re-issued unconditionally — strictly worse than not asking.
    if (tooLarge(data)) return
    const sk = scopedKey(scope, cacheKey)
    const rec: CacheRecord = { etag, data, expiresAt: Date.now() + ttlMs }
    memory.set(sk, rec)
    trimMemory()
    void idbSet(sk, rec)
}

export function recordRequest() {
    metrics.requestCount++
}
export function recordHit() {
    metrics.cacheHits++
}
export function recordMiss() {
    metrics.cacheMisses++
}
export function recordRevalidation() {
    metrics.revalidations++
}
export function recordError() {
    metrics.errorCount++
}

export async function clearETagCache() {
    memory.clear()
    await idbClear()
}

/**
 * How many response bodies this device is holding — what "Data and storage" puts
 * next to its Clear cache row.
 *
 * `count()` on the store, not `getAllKeys()`: the number is the whole answer, and
 * pulling every key into memory to take its length is the one way to make reading
 * a cache cost more than using it. Every account's entries are counted, because
 * clearing is device-wide too.
 *
 * With no IndexedDB the persistent tier does not exist and memory is the entire
 * cache, so its size is the honest number rather than a failure.
 */
export async function countETagEntries(): Promise<number> {
    const db = await openDB()
    if (!db) return memory.size
    return new Promise(resolve => {
        try {
            const tx = db.transaction(STORE, 'readonly')
            tx.onerror = () => resolve(memory.size)
            const req = tx.objectStore(STORE).count()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(memory.size)
        } catch {
            resolve(memory.size)
        }
    })
}

/**
 * Forget everything cached for one account — call when it is removed or signed
 * out of. Entries are scoped by account id so they can never be served to the
 * next user, but leaving their response bodies on a shared device is its own
 * problem.
 */
export async function clearETagScope(scope: string | null) {
    const prefix = `${scope ?? ANON_SCOPE}::`
    for (const k of memory.keys()) {
        if (k.startsWith(prefix)) memory.delete(k)
    }
    await idbDeletePrefix(prefix)
}

export function invalidateETagCache(scope: string, url: string, params?: Record<string, unknown>) {
    memory.delete(scopedKey(scope, generateCacheKey(url, params)))
}

/**
 * Open the connection while the page is idle, so the first GET that *does* want a
 * validator finds one instead of taking the miss `getStoredEtag` would hand it.
 */
if (typeof window !== 'undefined') {
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : null
    if (idle) idle(() => void openDB(), { timeout: 5000 })
    else setTimeout(() => void openDB(), 1000)
}
