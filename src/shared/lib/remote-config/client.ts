import { env } from '@shared/config/env'
import { getFirebaseApp } from '@shared/lib/firebase'
import {
    EVENT_CONFIG_DEFAULTS,
    type EventConfig,
    normalizeEventConfig,
    normalizeThirdPartyConfig,
    normalizeWebConfig,
    THIRD_PARTY_CONFIG_DEFAULTS,
    type ThirdPartyConfig,
    WEB_CONFIG_DEFAULTS,
    type WebConfig,
} from './types'

/**
 * Reading the Firebase Remote Config template — the one place this app talks to that service.
 *
 * Not an axios model, so no `createApiModel`: Remote Config is a Firebase product with its own
 * SDK, its own transport and its own on-device cache. The rest of the app still reaches it the
 * usual way — through a query hook (`use-remote-config.ts`), never directly.
 *
 * ## One fetch, every parameter
 *
 * This is the whole difference from legacy, and it is not a micro-optimisation.
 *
 * Remote Config has **no per-parameter API**. `fetchConfig` downloads the entire template in
 * one request; `getValue` is then a synchronous read out of memory. Legacy's
 * `models/remoteConfig.js` does not model it that way — it exposes five getters, each of which
 * calls `fetchAndActivate` itself. So its provider fires two of them in a `Promise.all` on
 * mount (the same payload, twice, concurrently) and a third later when a viewer joins a live
 * (the same payload, a third time). Two of the five getters — `getGameConfig` and
 * `getGamifyConfig` — are **never called from anywhere**, and are not ported for that reason;
 * `features/permission/api/permission-api.ts` sets the precedent for saying so out loud.
 *
 * Here there is one function, it fetches once, and it returns all three parameters. `event`
 * needs no lazy path because by the time anything wants it, it is already in memory.
 *
 * ## Fetch and activate are separate calls, on purpose
 *
 * `fetchAndActivate` is fetch-then-activate with no seam, so a **failed fetch means no
 * activation** — and legacy wraps the whole thing in a `try` that returns `null`, throwing away
 * the template it already had on disk.
 *
 * That matters because the fetch fails routinely, not exceptionally: Remote Config throttles
 * clients server-side, and a reader who reloads a few times in a minute gets a
 * `FetchThrottledException`. Offline is the other case. In both, the SDK still holds the last
 * template it fetched, persisted in IndexedDB — so splitting the calls means a throttled or
 * offline load runs on **the last known real config** instead of dropping to code defaults.
 * Which is the difference between a kill switch staying switched off and quietly turning back
 * on when somebody's train goes into a tunnel.
 *
 * ## Fail-soft, always
 *
 * This function does not reject. Every failure — no IndexedDB, blocked SDK, throttle, a comma
 * somebody left in the console — resolves to the code defaults from `types.ts` with
 * `isRemote: false`. A screen that must not show a figure it is unsure of checks that flag; a
 * kill switch does not need to, because its default is already the safe answer.
 *
 * Rejecting instead would make the query `isError`, and then every consumer would need to
 * decide what a config error means — which is exactly the fifteen-way disagreement `types.ts`
 * exists to remove.
 */

/**
 * The console parameter names. Verbatim, upper-snake, and shared with the iOS and Android
 * apps — renaming one here does not rename it there.
 */
const PARAMETERS = {
    web: 'WEB_CONFIG',
    thirdParty: 'THIRD_PARTY_CONFIG',
    event: 'DEFAULT_EVENT_CONFIG',
} as const

/**
 * How long the SDK may serve its on-device template without going back to the network.
 *
 * **Zero in production, and that is deliberate.** These parameters include kill switches, and a
 * kill switch is flipped during an incident: an interval here would be a delay on the one
 * occasion the value matters. The cost of zero is one small request per cold load, and the
 * per-session cost is nil because `use-remote-config.ts` caches the result in the query
 * client — a navigation re-reads memory, not Firebase.
 *
 * Firebase's own default is 12 hours, which is tuned for parameters that are experiments.
 * Legacy also sets 0, though only inside `getWebConfig`, which means whether the *other* four
 * getters honour it depends on which one ran first — they share one SDK singleton.
 *
 * Development is 30 seconds rather than 0 only to keep the console's server-side throttle out
 * of the way while somebody is hot-reloading; a config change still lands on the next reload
 * after half a minute.
 */
const MINIMUM_FETCH_INTERVAL_MS = env.NEXT_PUBLIC_ENV === 'development' ? 30_000 : 0

/**
 * 10 seconds, matching `shared/lib/api/server-client.ts`'s timeout and for the same reason: a
 * silent upstream must not be able to hold something open indefinitely. The SDK's own default
 * is 60s, which is long enough for a consumer to sit on a loading state for a minute over one
 * config read.
 */
const FETCH_TIMEOUT_MS = 10_000

export interface RemoteConfigSnapshot {
    web: WebConfig
    thirdParty: ThirdPartyConfig
    event: EventConfig
    /**
     * Whether these values came from Firebase rather than from the code defaults.
     *
     * `true` when at least one parameter resolved with source `'remote'`. Consumers that
     * *display* a configured figure — a price, a fee — should gate on this; consumers reading a
     * kill switch should not, because its default is already the answer they want.
     */
    isRemote: boolean
}

/** Code defaults, as a snapshot. Returned whenever Firebase cannot be read. */
const FALLBACK_SNAPSHOT: RemoteConfigSnapshot = {
    web: WEB_CONFIG_DEFAULTS,
    thirdParty: THIRD_PARTY_CONFIG_DEFAULTS,
    event: EVENT_CONFIG_DEFAULTS,
    isRemote: false,
}

/**
 * Query keys.
 *
 * **Not account-scoped** — and that is the point of the whole feature, so it is worth stating
 * where somebody will look for it. Every other query in this app is keyed on the active account
 * because it answers a question about that account. This one answers a question about the
 * *platform*: the same template, the same values, for a guest and for all ten signed-in
 * accounts. Keying it on an account would refetch the identical payload on every account
 * switch and hold ten copies of it.
 */
export const remoteConfigKeys = {
    all: ['remote-config'] as const,
    snapshot: () => ['remote-config', 'snapshot'] as const,
}

/** `JSON.parse`, but a bad parameter yields the defaults instead of taking the page down. */
function parseParameter(name: string, raw: string): unknown {
    if (raw.trim() === '') return {}
    try {
        return JSON.parse(raw)
    } catch {
        // A malformed parameter is a console typo, i.e. an operational mistake somebody needs
        // to see. It is not the reader's problem, so it is logged and swallowed.
        console.warn(`[remote-config] ${name} is not valid JSON; using defaults`)
        return {}
    }
}

/**
 * Fetch, activate and parse the whole template. Never rejects — see the file note.
 */
export async function fetchRemoteConfigSnapshot(): Promise<RemoteConfigSnapshot> {
    // Remote Config is browser-only: it needs IndexedDB to persist the template. Nothing
    // prefetches this on the server today, and nothing should — a snapshot dehydrated from a
    // render would arrive at the client already `isRemote: false` and, with a stale time, sit
    // there unrefreshed.
    if (typeof window === 'undefined') return FALLBACK_SNAPSHOT

    try {
        const { activate, fetchConfig, getRemoteConfig, getValue, isSupported } = await import(
            'firebase/remote-config'
        )

        // Same guard the ETag store makes for IndexedDB: a browser in a mode that blocks it, or
        // an embedded webview that has none, degrades to defaults rather than throwing.
        if (!(await isSupported())) return FALLBACK_SNAPSHOT

        const remoteConfig = getRemoteConfig(await getFirebaseApp())
        remoteConfig.settings.minimumFetchIntervalMillis = MINIMUM_FETCH_INTERVAL_MS
        remoteConfig.settings.fetchTimeoutMillis = FETCH_TIMEOUT_MS

        try {
            await fetchConfig(remoteConfig)
        } catch {
            // Throttled, offline, or the service is down. Fall through to `activate`, which
            // promotes whatever template was last fetched — see the file note on why these two
            // calls are separate.
        }
        await activate(remoteConfig)

        const read = (name: string) => {
            const value = getValue(remoteConfig, name)
            return {
                parsed: parseParameter(name, value.asString()),
                isRemote: value.getSource() === 'remote',
            }
        }

        const web = read(PARAMETERS.web)
        const thirdParty = read(PARAMETERS.thirdParty)
        const event = read(PARAMETERS.event)

        return {
            web: normalizeWebConfig(web.parsed),
            thirdParty: normalizeThirdPartyConfig(thirdParty.parsed),
            event: normalizeEventConfig(event.parsed),
            isRemote: web.isRemote || thirdParty.isRemote || event.isRemote,
        }
    } catch (error) {
        console.warn('[remote-config] unavailable; using defaults', error)
        return FALLBACK_SNAPSHOT
    }
}
