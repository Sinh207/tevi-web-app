import { STORAGE_KEYS, storage } from '@shared/lib/storage'

/**
 * What version of each mini app this **device** last saw.
 *
 * The contract (`docs/MINI_APP.md` §9) puts version handling on the host: the app announces its
 * version in `loadConfig`, and a host holding a different one is holding a stale cache and must
 * drop it and reload. The native hosts wipe the WebView's data store to do that. A web host
 * cannot — there is no API to clear a cross-origin frame's HTTP cache from the embedding page —
 * so it changes the URL instead: the version rides in `?v=`, and a changed `v` is a different
 * resource the browser has never cached. `frame-url.ts` states that half.
 *
 * This file is the memory that makes it work, and the reason it is a *file* rather than three
 * lines inside the bridge is the ordering: the version has to be read **before** the frame's
 * `src` is computed, and written **after** the app has spoken, with a reload in between. Those
 * are three different moments in a tab's life.
 *
 * ## Pure functions over a record, plus two thin accessors
 *
 * The record is exported and the decisions are pure, so the interesting parts — a first run
 * writes but must not reload, a repeat reload must not loop, an old record must expire — are
 * tests rather than comments. `readAppVersions` / `writeAppVersions` are the only lines that
 * touch storage, and `shared/lib/storage` already swallows quota and disabled-storage failures.
 */

export interface AppVersionRecord {
    version: string
    /** Unix ms, for the TTL below. */
    at: number
}

export type AppVersions = Record<string, AppVersionRecord>

/**
 * 30 days. Long enough that a game played weekly keeps its cache bust, short enough that the
 * map does not accumulate every app a device ever opened.
 */
export const APP_VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * At most this many apps remembered, oldest dropped first. A ceiling rather than a limit
 * anybody will reach: it exists so a page that opened a hundred apps cannot grow a
 * localStorage entry without bound.
 */
export const MAX_REMEMBERED_APPS = 50

export function readAppVersions(): AppVersions {
    const raw = storage.getJSON<AppVersions>(STORAGE_KEYS.miniAppVersions)
    if (!raw || typeof raw !== 'object') return {}
    const out: AppVersions = {}
    for (const [appId, record] of Object.entries(raw)) {
        if (!record || typeof record !== 'object') continue
        const { version, at } = record as Partial<AppVersionRecord>
        if (typeof version !== 'string' || version === '') continue
        if (typeof at !== 'number' || !Number.isFinite(at)) continue
        out[appId] = { version, at }
    }
    return out
}

function writeAppVersions(versions: AppVersions) {
    storage.setJSON(STORAGE_KEYS.miniAppVersions, versions)
}

/** Drop expired records, then the oldest over the cap. Pure. */
export function pruneAppVersions(versions: AppVersions, now: number): AppVersions {
    const live = Object.entries(versions).filter(
        ([, record]) => now - record.at < APP_VERSION_TTL_MS,
    )
    const kept = live.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_REMEMBERED_APPS)
    return Object.fromEntries(kept)
}

/**
 * The version to put in a new tab's URL, or `null`.
 *
 * `null` for an app with no id: `v` is keyed on the app, and two different apps sharing a
 * missing id would trade cache busts. It is also `null` on a first run, which is what makes
 * "we have never seen this app" distinguishable from "we have, and it changed".
 */
export function frameVersionFor(appId: string | null, now: number): string | null {
    if (!appId) return null
    const record = readAppVersions()[appId]
    if (!record) return null
    if (now - record.at >= APP_VERSION_TTL_MS) return null
    return record.version
}

/**
 * Record what the app just said it is, and answer whether the frame has to be reloaded.
 *
 * Three cases, and the middle one is the whole reason this returns a boolean:
 *
 * 1. **No app id, or no version reported** — nothing to remember. `false`.
 * 2. **Never seen before** (`frameVersion` is `null`) — remember it, but **do not reload**. The
 *    frame in front of the reader is already this version; reloading would be a visible flash
 *    on the first launch of every app, which is exactly when it looks like a bug.
 * 3. **Seen, and different** — remember the new one and reload. The next load's URL already
 *    carries it, so this cannot repeat: that is what stops the loop an app reporting a rolling
 *    version would otherwise cause.
 */
export function recordReportedVersion({
    appId,
    reported,
    frameVersion,
    now,
}: {
    appId: string | null
    reported: unknown
    frameVersion: string | null
    now: number
}): { version: string | null; shouldReload: boolean } {
    if (!appId) return { version: null, shouldReload: false }
    if (typeof reported !== 'string' || reported.trim() === '') {
        return { version: frameVersion, shouldReload: false }
    }
    const version = reported.trim()

    const next = pruneAppVersions({ ...readAppVersions(), [appId]: { version, at: now } }, now)
    writeAppVersions(next)

    if (frameVersion === null) return { version, shouldReload: false }
    return { version, shouldReload: version !== frameVersion }
}
