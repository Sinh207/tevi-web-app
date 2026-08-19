/**
 * What this app is holding on the device, for the "Data and storage" screen.
 *
 * Three numbers, and they are deliberately not three slices of one pie:
 *
 *   · `cachedResponses` — entries in the ETag store. A **count**, not a size: the
 *     only way to weigh those records is to read every one of them back out and
 *     serialise it, which is a lot of work to put a number on a screen. The count
 *     is what the Clear cache row below it actually removes, so it is the honest
 *     figure to show next to it.
 *   · `localDataBytes` — the `tevi.*` localStorage keys: settings, session,
 *     device id. Exact and cheap, because localStorage is strings all the way down.
 *   · `siteBytes` — the browser's own estimate for the whole origin. It is a superset
 *     of the other two (and of anything the browser caches on our behalf), it is
 *     deliberately fuzzy — padded, so a page cannot use it to fingerprint — and it can
 *     lag behind a write. The screen says so.
 *
 * The same estimate also reports a `quota`, and it is deliberately **not** carried
 * here. Browsers hand out a budget in the tens of gigabytes and pad that figure too,
 * so "12 MB of 38 GB" answers a question nobody asked while implying a limit this app
 * will never approach. Add it back when there is a limit worth warning about.
 *
 * Every read is best-effort: storage APIs are the first thing a locked-down or
 * private-mode browser takes away, and a settings screen that throws because it
 * could not measure itself is worse than one that shows a dash.
 */

import { countETagEntries } from './api/interceptors/etag'
import { STORAGE_NAMESPACE } from './storage'

export interface StorageUsage {
    /** Response bodies in the ETag cache, across every account on this device. */
    cachedResponses: number
    /** Bytes of `tevi.*` localStorage. */
    localDataBytes: number
    /** Everything this origin stores, as the browser estimates it. */
    siteBytes: number | null
}

/**
 * Bytes of localStorage that are ours.
 *
 * UTF-16 code units × 2, which is how browsers actually account for it — a
 * localStorage value is a DOMString, not UTF-8. The key counts too, and for a store
 * of short values under long namespaced keys that is not a rounding error.
 */
export function measureLocalData(): number {
    if (typeof window === 'undefined') return 0
    try {
        const ls = window.localStorage
        const prefix = `${STORAGE_NAMESPACE}.`
        let bytes = 0
        for (let i = 0; i < ls.length; i++) {
            const key = ls.key(i)
            if (!key?.startsWith(prefix)) continue
            bytes += (key.length + (ls.getItem(key)?.length ?? 0)) * 2
        }
        return bytes
    } catch {
        // Disabled or partitioned storage — nothing of ours is stored, so 0 is true.
        return 0
    }
}

async function estimateSiteBytes(): Promise<number | null> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
        return null
    }
    try {
        const { usage } = await navigator.storage.estimate()
        return usage ?? null
    } catch {
        return null
    }
}

/** All three figures at once — the two async reads overlap. */
export async function readStorageUsage(): Promise<StorageUsage> {
    const [cachedResponses, siteBytes] = await Promise.all([
        countETagEntries(),
        estimateSiteBytes(),
    ])
    return { cachedResponses, localDataBytes: measureLocalData(), siteBytes }
}

/**
 * Decimal, not binary: the unit names below are SI, and 1 MB meaning 1,048,576
 * bytes under a label that says "megabyte" is the mismatch that makes a storage
 * figure argue with the one the operating system shows. Both are defensible; only
 * one of them agrees with the word next to the number.
 */
const STEP = 1000
const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

/**
 * A byte count in the user's language — `Intl` supplies both the unit name and the
 * grouping, so this does not need a translation key per unit.
 *
 * Bytes get no decimal (a fraction of a byte is not a thing); everything above
 * gets one, which is as much precision as an estimate this coarse can support.
 */
export function formatBytes(bytes: number, locale = 'en'): string {
    const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
    let value = safe
    let unit = 0
    while (value >= STEP && unit < UNITS.length - 1) {
        value /= STEP
        unit++
    }
    const options: Intl.NumberFormatOptions = {
        style: 'unit',
        unit: UNITS[unit],
        unitDisplay: 'short',
        maximumFractionDigits: unit === 0 ? 0 : 1,
    }
    try {
        return new Intl.NumberFormat(locale, options).format(value)
    } catch {
        // An unknown locale tag, or an engine without the `unit` style. The number
        // still has to render.
        try {
            return new Intl.NumberFormat(undefined, options).format(value)
        } catch {
            return `${Math.round(value * 10) / 10} ${UNITS[unit]}`
        }
    }
}
