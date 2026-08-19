'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchRemoteConfigSnapshot, remoteConfigKeys } from './client'
import {
    EVENT_CONFIG_DEFAULTS,
    type EventConfig,
    THIRD_PARTY_CONFIG_DEFAULTS,
    type ThirdPartyConfig,
    WEB_CONFIG_DEFAULTS,
    type WebConfig,
} from './types'

/**
 * Platform configuration, read from anywhere.
 *
 * ```ts
 * const { characterLimit } = useWebConfig().post.createPost   // always a number
 * const { isKnown, refresh } = useRemoteConfig()               // did Firebase answer at all
 * ```
 *
 * ## There is no `RemoteConfigProvider`, and that is the design
 *
 * Legacy has one, mounted in `_app.js` above everything, holding four `useState`s and fetching
 * on mount. It needs a provider because it has no query cache: without one, "fetch once and
 * share the result" has to be a context.
 *
 * This app has one, and remote config is the case it fits best — a **single global value**, the
 * same for every account, read in many unrelated places. One query key, so the twentieth
 * consumer to mount joins the same in-flight request as the first, and TanStack owns the
 * deduplication, the stale time and the retry. A provider on top of that would add a second
 * copy of the state and a second thing to keep in sync, which is what CLAUDE.md's rule about not
 * mirroring server data into another store is about. `features/permission` and
 * `features/balance` *are* providers for reasons that do not apply here: both are keyed on the
 * active account, both own a gate, and both hold imperative helpers screens call. This owns a
 * value.
 *
 * The consequence worth naming: **a page that reads no config pays nothing.** No Firebase chunk,
 * no request, no IndexedDB. Which matters for `/app/*` webviews specifically — `app/providers.tsx`
 * spells out how the session stack ended up costing a static legal page three round trips, and
 * mounting a config provider above every document would have been the same mistake with the same
 * shape.
 *
 * ## The stale time is a day
 *
 * Longer than anything else in the app (the balance is 60s, grants are 5 minutes), because a
 * navigation must not re-read Firebase: the SDK's `minimumFetchIntervalMillis` is 0, so a
 * refetch is a real network request. Freshness comes from the **cold load** instead, which is
 * when a kill switch needs to land, plus `refresh()` for anything that wants it sooner. A
 * `gcTime` to match, so the config is not collected and re-fetched while the reader is on a page
 * that happens not to read it.
 */

export interface RemoteConfigValue {
    /** `WEB_CONFIG` — always fully populated, defaults included. */
    web: WebConfig
    /** `THIRD_PARTY_CONFIG` — Datadog audience overrides. */
    thirdParty: ThirdPartyConfig
    /** `DEFAULT_EVENT_CONFIG` — the sustained-fee rules. */
    event: EventConfig
    /**
     * Whether the template was read from Firebase at all, rather than the code defaults being
     * used because it could not be.
     *
     * **This is a transport signal, not a per-value one, and the distinction matters.** All three
     * parameters come out of one template, so this answers "did Firebase answer" — it cannot tell
     * you whether any *particular* field was configured. A console holding `WEB_CONFIG` and no
     * `interaction` key gives `isKnown: true` and an unconfigured price.
     *
     * So: use it for a loading state, or to decide whether a retry is worth offering. Do **not**
     * use it to decide whether a value is trustworthy — a field where "unset" has to be visible
     * says so in its own type instead (`interaction.billing` is `null`, `video.resolutionMax` is
     * `null`, `defaultCountry` is `null`). And do not gate a kill switch on it at all: a flag's
     * default is already the answer you want, and waiting only adds a frame in which the feature
     * flickers.
     */
    isKnown: boolean
    isLoading: boolean
    /**
     * Effectively always `false` — `fetchRemoteConfigSnapshot` resolves to defaults rather than
     * rejecting, and `client.ts` says why. Exposed so a consumer is not forced to
     * assume that, and so this stays honest if that ever changes.
     */
    isError: boolean
    /** Re-read the template. What a "config might have changed" signal calls. */
    refresh: () => Promise<void>
}

/**
 * One day. See the note above on why this is the longest stale time in the app.
 */
const STALE_TIME_MS = 24 * 60 * 60_000

export function useRemoteConfig(): RemoteConfigValue {
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: remoteConfigKeys.snapshot(),
        queryFn: () => fetchRemoteConfigSnapshot(),
        staleTime: STALE_TIME_MS,
        gcTime: STALE_TIME_MS,
        /*
         * No `meta.showErrorToast`. A configuration read is not something the reader asked for
         * and not something they can act on, so a toast would be an error message about the
         * app's internals appearing over a page that is working fine on its defaults.
         */
    })

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: remoteConfigKeys.snapshot() })
    }, [queryClient])

    /*
     * `??` all the way down rather than a `data ?? FALLBACK_SNAPSHOT`: the three defaults are
     * module constants, so a consumer memoising on `web` sees a stable reference for the whole
     * loading window instead of a fresh object per render.
     */
    return {
        web: query.data?.web ?? WEB_CONFIG_DEFAULTS,
        thirdParty: query.data?.thirdParty ?? THIRD_PARTY_CONFIG_DEFAULTS,
        event: query.data?.event ?? EVENT_CONFIG_DEFAULTS,
        isKnown: query.data?.isRemote ?? false,
        isLoading: query.isLoading,
        isError: query.isError,
        refresh,
    }
}

/**
 * `WEB_CONFIG` alone — the shorthand for the common case.
 *
 * Thirteen of legacy's fifteen consumers read only this parameter, and every one of them wants a
 * value rather than a loading state: a character limit, a price, a flag. So this returns the
 * config and nothing else, and it is never `null` — which is what removes the `?.` chains and
 * the per-call-site fallbacks that `types.ts` catalogues.
 *
 * Reach for `useRemoteConfig()` when you need `isKnown`, `refresh`, or one of the other two
 * parameters.
 */
export function useWebConfig(): WebConfig {
    return useRemoteConfig().web
}
