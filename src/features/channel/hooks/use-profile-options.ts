'use client'

import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'

/**
 * The two server-driven lists the edit-profile form draws its pickers from.
 *
 * ## Why they are queries and not a one-off `useEffect` fetch
 *
 * Legacy fetches both with a `useEffect` + `useState` per component, which means: a request every
 * time the drawer opens, no dedup between the two components that want the same list, no retry,
 * and no way for anything else to reuse the answer. They are ordinary server state and belong in
 * the same cache as everything else (`CLAUDE.md`, primitive 1).
 *
 * ## A long `staleTime`, and no account in the key
 *
 * Neither answer is personal and neither changes on a human timescale — the category taxonomy and
 * the supported-platform list are product decisions, not user data. An hour of `staleTime` means
 * opening the form twice in a session costs one request, and `channelKeys.categories()` carries no
 * account id precisely because the body would be identical for every one of them.
 *
 * A failure is **not** surfaced as an error state by the callers: an empty category list renders as
 * "no categories to choose from", which is the truth, while the rest of the form stays usable. A
 * picker that takes the whole form down because its options failed to load would be the wrong
 * trade on a screen where six other fields work.
 */

const OPTIONS_QUERY = {
    ...keepFor(60 * 60_000),
    // These fill pickers on a form. Nothing about them is worth a toast — see the note above.
    meta: undefined,
} as const

/** Every category a space may be filed under. `[]` while loading or on failure. */
export function useChannelCategories() {
    const query = useQuery({
        queryKey: channelKeys.categories(),
        queryFn: ({ signal }) => channelApi.getCategories(signal),
        ...OPTIONS_QUERY,
    })

    return { categories: query.data ?? [], isLoading: query.isLoading }
}

/** The platforms a social link may point at. `[]` while loading or on failure. */
export function useSocialPlatforms() {
    const query = useQuery({
        queryKey: channelKeys.socialPlatforms(),
        queryFn: ({ signal }) => channelApi.getSocialPlatforms(signal),
        ...OPTIONS_QUERY,
    })

    return { platforms: query.data ?? [], isLoading: query.isLoading }
}
