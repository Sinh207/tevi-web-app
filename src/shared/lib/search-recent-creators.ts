import { STORAGE_KEYS, storage } from './storage'

/**
 * The spaces this account opened from `/search`, most recent first — the screen's
 * **Recent creators** row.
 *
 * ## In `shared/`, for the reason `search-recents.ts` is
 *
 * `AuthProvider.forgetAccount` is the one place an account's traces are erased, and `features/auth`
 * may not import `features/search`. Which creators somebody looked up is as personal as the terms
 * they typed, so it leaves with the account.
 *
 * ## A snapshot of the row, not just a slug
 *
 * The tile draws an avatar, a name, the verified tick and the Premium crown. Storing only the slug
 * would mean a request per tile to redraw what the reader already saw, so the row keeps the five
 * fields it renders. They can go stale (a creator renames), and that is acceptable for a
 * convenience list: the tile links to `/@{slug}`, which is the live answer.
 *
 * ## Five, because the spec says five
 *
 * Figma's Search page: "Giới hạn hiển thị tối đa 5 creators" and "Giới hạn lưu 5 items mỗi loại".
 * The cap is the store's, so nothing past five is ever written.
 *
 * Same external-store shape as `search-recents.ts` (`subscribe` + a snapshot cached against the
 * raw string), for the same reason: the list is written by the rows and read by the strip, and two
 * `useState` mirrors of one key disagree.
 */

export interface RecentCreator {
    slug: string
    name: string | null
    thumb: string | null
    verifiedImage: string | null
    isPremium: boolean
    /**
     * Kept so the strip can withhold the tile when the account has since turned *Show NSFW spaces
     * when searching* off — the list outlives the setting it was recorded under.
     */
    isNsfw: boolean
    /** `Date.now()` when it was last opened. */
    at: number
}

type CreatorsRecord = Record<string, RecentCreator[]>

export const MAX_RECENT_CREATORS = 5

/** Stable, or `useSyncExternalStore` re-renders forever. */
const EMPTY: RecentCreator[] = []

const listeners = new Set<() => void>()

let cache: { raw: string | null; byAccount: Map<string, RecentCreator[]> } | null = null

function emit(): void {
    for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
    if (event.key === null || event.key === STORAGE_KEYS.searchRecentCreators) emit()
}

export function subscribeRecentCreators(listener: () => void): () => void {
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

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Corrupt or foreign JSON degrades to "nothing opened yet" rather than throwing. */
function read(): CreatorsRecord {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.searchRecentCreators)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: CreatorsRecord = {}
    for (const [account, list] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const rows: RecentCreator[] = []
        for (const row of list) {
            if (!row || typeof row !== 'object') continue
            const r = row as Record<string, unknown>
            const slug = text(r.slug)?.trim()
            if (!slug) continue
            rows.push({
                slug,
                name: text(r.name),
                thumb: text(r.thumb),
                verifiedImage: text(r.verifiedImage),
                isPremium: r.isPremium === true,
                isNsfw: r.isNsfw === true,
                at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
            })
        }
        out[account] = rows.slice(0, MAX_RECENT_CREATORS)
    }
    return out
}

function write(record: CreatorsRecord): void {
    storage.setJSON(STORAGE_KEYS.searchRecentCreators, record)
    emit()
}

/** This account's recent creators, newest first. Referentially stable while the store is unchanged. */
export function getRecentCreators(accountId: string): RecentCreator[] {
    if (!accountId) return EMPTY
    const raw = storage.get(STORAGE_KEYS.searchRecentCreators)
    if (!cache || cache.raw !== raw) cache = { raw, byAccount: new Map() }
    const hit = cache.byAccount.get(accountId)
    if (hit) return hit
    const rows = read()[accountId]
    const list = rows?.length ? rows : EMPTY
    cache.byAccount.set(accountId, list)
    return list
}

/** Record one opened space, or move it back to the front. Matched by slug, case-insensitively. */
export function addRecentCreator(
    creator: Omit<RecentCreator, 'at'>,
    accountId: string,
): RecentCreator[] {
    const slug = creator.slug.trim()
    if (!accountId || slug === '') return EMPTY
    const record = read()
    const folded = slug.toLocaleLowerCase()
    const next: RecentCreator[] = [
        { ...creator, slug, at: Date.now() },
        ...(record[accountId] ?? []).filter(row => row.slug.toLocaleLowerCase() !== folded),
    ].slice(0, MAX_RECENT_CREATORS)
    record[accountId] = next
    write(record)
    return next
}

export function removeRecentCreator(slug: string, accountId: string): RecentCreator[] {
    if (!accountId) return EMPTY
    const record = read()
    const existing = record[accountId]
    if (!existing?.length) return EMPTY
    const folded = slug.trim().toLocaleLowerCase()
    const next = existing.filter(row => row.slug.toLocaleLowerCase() !== folded)
    if (next.length === existing.length) return existing
    record[accountId] = next
    write(record)
    return next
}

/** Forget this account's list — `forgetAccount`'s teardown. */
export function clearRecentCreators(accountId: string): void {
    if (!accountId) return
    const record = read()
    if (!(accountId in record)) return
    delete record[accountId]
    write(record)
}
