import { STORAGE_KEYS, storage } from '@shared/lib/storage'

/**
 * Which channels a viewer has agreed to see sensitive content from.
 *
 * Per **account**, not per browser: two people sharing a device, or one person with a work and a
 * personal account, should not inherit each other's choices. Anonymous sessions get their own
 * bucket rather than a key containing the literal `undefined`, which is what legacy's
 * `` `${currentUser?.id}_nsfw_confirmed_list` `` produces.
 *
 * Everything goes through `shared/lib/storage`, never `localStorage` directly — that wrapper is
 * SSR-safe and swallows quota and disabled-storage errors, so a consent write can never be the
 * thing that throws inside a click handler.
 */

type ConsentMap = Record<string, string[]>

const ANON = 'anon'

/** Corrupt JSON degrades to "nothing confirmed" rather than throwing. Someone else's data, once. */
function read(): ConsentMap {
    const raw = storage.getJSON<unknown>(STORAGE_KEYS.nsfwConfirmed)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const map: ConsentMap = {}
    for (const [account, slugs] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(slugs)) map[account] = slugs.filter(s => typeof s === 'string')
    }
    return map
}

export function hasNsfwConsent(slug: string, accountId: string | null): boolean {
    if (!slug) return false
    return read()[accountId ?? ANON]?.includes(slug) ?? false
}

/** Idempotent: confirming twice does not grow the list. */
export function grantNsfwConsent(slug: string, accountId: string | null): void {
    if (!slug) return
    const map = read()
    const account = accountId ?? ANON
    const slugs = map[account] ?? []
    if (slugs.includes(slug)) return
    map[account] = [...slugs, slug]
    storage.setJSON(STORAGE_KEYS.nsfwConfirmed, map)
}

/**
 * Exported for the day the gate moves out of this feature.
 *
 * When `features/post` lands, a sensitive **post** in a feed needs the same question, and at that
 * point this belongs in `shared/` rather than here. Noted so the move is a lift rather than a
 * rediscovery.
 */
export function revokeNsfwConsent(slug: string, accountId: string | null): void {
    const map = read()
    const account = accountId ?? ANON
    if (!map[account]) return
    map[account] = map[account].filter(s => s !== slug)
    storage.setJSON(STORAGE_KEYS.nsfwConfirmed, map)
}
