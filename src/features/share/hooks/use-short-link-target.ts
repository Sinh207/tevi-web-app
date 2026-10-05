'use client'

import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { shareKeys, shareLinkApi } from '../api/share-link-api'

/** A short link's target does not change; an hour is the cache, not a guess about freshness. */
const TARGET_TTL = 60 * 60_000

/**
 * The URL behind a Tevi short link, for a caller that needs to know what it *is* — the message
 * bubble, which cards a shared post as a post rather than as an opaque `/s/{code}`.
 *
 * `undefined` while unknown, `null` when it resolves to nothing. One key per code, so twenty bubbles
 * carrying the same link make one request.
 */
export function useShortLinkTarget(code: string | null): string | null | undefined {
    const query = useQuery({
        queryKey: shareKeys.target(code ?? ''),
        queryFn: ({ signal }) => shareLinkApi.resolveShortLink(code ?? '', signal),
        enabled: Boolean(code),
        ...keepFor(TARGET_TTL),
    })
    if (!code) return null
    if (query.isError) return null
    return query.data
}
