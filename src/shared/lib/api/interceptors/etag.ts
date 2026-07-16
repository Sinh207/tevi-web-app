import { getActiveAccountId } from '@shared/lib/api/token'

/**
 * Two-tier ETag cache (ported from legacy app):
 *   - Memory: Map of cacheKey → { etag, data } with LRU trim.
 *   - Persistent: IndexedDB, namespaced per active account, with TTL.
 *
 * GET requests send `If-None-Match`; a 304 (delivered as an axios rejection)
 * resolves to the cached body with status 200.
 */

const MAX_MEMORY = 1000
const DEFAULT_TTL_MS = 86_400_000 // 24h
const DB_NAME = 'tevi-etag'
const STORE = 'etags'

interface CacheRecord {
    etag: string
    data: unknown
    expiresAt: number
}

const memory = new Map<string, CacheRecord>()

const metrics = {
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errorCount: 0,
}

export function getPerformanceMetrics() {
    return { ...metrics }
}
export function resetPerformanceMetrics() {
    metrics.requestCount = 0
    metrics.cacheHits = 0
    metrics.cacheMisses = 0
    metrics.errorCount = 0
}

/** Stable cache key: strips the volatile `verify` (HMAC) query param. */
export function generateCacheKey(url: string, params?: Record<string, unknown>): string {
    try {
        const u = new URL(url, 'http://x')
        u.searchParams.delete('verify')
        const extra = params
            ? Object.entries(params)
                  // `verify` (HMAC) is volatile — exclude so keys stay stable.
                  .filter(([k, v]) => k !== 'verify' && v != null && v !== '')
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => `${k}=${v}`)
                  .join('&')
            : ''
        return `${u.pathname}?${u.searchParams.toString()}${extra ? `&${extra}` : ''}`
    } catch {
        return url
    }
}

function accountScope() {
    return getActiveAccountId() ?? 'anon'
}
function scopedKey(key: string) {
    return `${accountScope()}::${key}`
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
function openDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    return new Promise(resolve => {
        try {
            const req = indexedDB.open(DB_NAME, 1)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
}

async function idbGet(key: string): Promise<CacheRecord | null> {
    const db = await openDB()
    if (!db) return null
    return new Promise(resolve => {
        try {
            const tx = db.transaction(STORE, 'readonly')
            const req = tx.objectStore(STORE).get(key)
            req.onsuccess = () => resolve((req.result as CacheRecord) ?? null)
            req.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
}

async function idbSet(key: string, rec: CacheRecord) {
    const db = await openDB()
    if (!db) return
    try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(rec, key)
    } catch {
        // ignore
    }
}

async function idbClear() {
    const db = await openDB()
    if (!db) return
    try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).clear()
    } catch {
        // ignore
    }
}

// ── Public API used by the axios interceptors ──────────────────────────────

/** Look up a stored ETag (memory → IndexedDB). */
export async function getStoredEtag(cacheKey: string): Promise<string | null> {
    const sk = scopedKey(cacheKey)
    const mem = memory.get(sk)
    if (mem && mem.expiresAt > Date.now()) return mem.etag
    const rec = await idbGet(sk)
    if (rec && rec.expiresAt > Date.now()) {
        memory.set(sk, rec)
        return rec.etag
    }
    return null
}

/** Read cached body for a 304 response. */
export async function getCachedData(cacheKey: string): Promise<unknown> {
    const sk = scopedKey(cacheKey)
    const mem = memory.get(sk)
    if (mem && mem.expiresAt > Date.now()) return mem.data
    const rec = await idbGet(sk)
    return rec && rec.expiresAt > Date.now() ? rec.data : undefined
}

/** Persist a 200 response's ETag + body. */
export function storeEtag(cacheKey: string, etag: string, data: unknown, ttlMs = DEFAULT_TTL_MS) {
    const sk = scopedKey(cacheKey)
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
export function recordError() {
    metrics.errorCount++
}

export async function clearETagCache() {
    memory.clear()
    await idbClear()
}

export function invalidateETagCache(url: string, params?: Record<string, unknown>) {
    const sk = scopedKey(generateCacheKey(url, params))
    memory.delete(sk)
}
