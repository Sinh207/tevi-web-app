import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import type { ShareContext } from '../lib/share-context'

/**
 * The link service — **two endpoints, and which one runs is decided by what the caller can name.**
 *
 * | call | endpoint | when |
 * |---|---|---|
 * | `createLink` | `POST v1/links` | there is a `ShareContext`: mints one link **per channel**, records the context, and the backend emits `share_link_created_v2` |
 * | `createShortLink` | `POST v1/shorten/` | there is not: one plain short link, no channel, no attribution |
 *
 * Both live under `shortlink/api`, which is a **service base of its own** — not `/core`, not
 * `/billy`. `lib/share-context.ts` argues the split; this file only carries it out.
 *
 * ## The response shape, once
 *
 * `{ url_shortener, share_id }` — flat, because `apiClient` unwraps Tevi's `{ data }` envelope
 * before a model sees it (`shared/lib/api/unwrap.ts`). Legacy reads `res.data.data.url_shortener`
 * and gates on `res.status === 200`; here a rejection is an `ApiError` and a resolution is a body,
 * so the only thing left to check is whether the body actually carried a URL.
 *
 * `parseShareLink` answers `null` for a 2xx that did not — a real case rather than defensive
 * padding, and the reason the caller falls back to the unshortened URL instead of showing an empty
 * field (see `use-share-link.ts`). `share_id` is parsed and returned because it is the id the
 * `tevi.com/{creator}/s/{id}` route resolves; nothing in this client needs it yet, and dropping it
 * here is what would make the next caller re-derive the shape.
 *
 * ## Neither call is retried, and both are POSTs
 *
 * `apiClient` replays a POST only with `{ retry: true }`. A replayed mint is not dangerous — it
 * costs a spare row and a duplicate analytics event — but the *value* of a retry is nil here: the
 * caller already has a working URL to fall back to, so a second attempt buys a prettier link at the
 * cost of a slower press. So: no `retry`, and a failure degrades instead of waiting.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/shortlink/api` })

/** A minted link. `shareId` is `null` for `v1/shorten/`, which does not mint one. */
export type ShareLink = { url: string; shareId: string | null }

export const shareKeys = {
    all: ['share'] as const,
    /**
     * One key per (account, target, channel).
     *
     * **The account is in the key** because the link is minted *as* somebody: it records
     * `creator_id` and `source_screen` against the bearer that asked for it, so a link minted by the
     * account that has since been switched away from must not be handed to the new one.
     *
     * `channel` is the caller's cache channel and **not always the pressed one** — a share with no
     * content context mints a single link for every row, so the hook passes a constant there. That
     * is legacy's own cache key (`isContentShare ? channel : 'legacy'`), which is the thing worth
     * keeping from its two `useRef` maps: TanStack Query then does the deduplication and the
     * in-flight sharing that those refs were hand-rolling.
     */
    link: (accountId: string | null, target: string, channel: string) =>
        ['share', 'link', accountId ?? 'anon', target, channel] as const,
    /** Where a short link goes. Not per account: a short link means the same thing to everyone. */
    target: (code: string) => ['share', 'target', code] as const,
}

function parseShareLink(body: unknown): ShareLink | null {
    const dto = (body ?? {}) as { url_shortener?: unknown; share_id?: unknown }
    const url = typeof dto.url_shortener === 'string' ? dto.url_shortener.trim() : ''
    if (!url) return null
    return { url, shareId: typeof dto.share_id === 'string' ? dto.share_id : null }
}

export const shareLinkApi = {
    /**
     * Mint a tracked link for one channel.
     *
     * `original_url` has to be the content's own public URL — the service reads the handle out of it
     * (`/@{handle}/…`) and refuses a URL that carries none, which is the other half of why a caller
     * with no context takes the `shorten/` path.
     */
    createLink({
        url,
        channel,
        context,
        accountId,
    }: {
        url: string
        channel: string
        context: ShareContext
        accountId?: string | null
    }): Promise<ShareLink | null> {
        return api
            .post<unknown>(
                'v1/links',
                {
                    original_url: url,
                    content_type: context.contentType,
                    content_id: context.contentId,
                    creator_id: context.creatorId ?? undefined,
                    source_screen: context.sourceScreen ?? undefined,
                    share_channel: channel,
                },
                accountId ? { accountId } : undefined,
            )
            .then(parseShareLink)
    },

    /**
     * Where a short link points — `GET v1/params/{code}`, legacy's `getLongLink`, answering
     * `{ original_url }`. `null` when the code resolves to nothing usable.
     */
    async resolveShortLink(code: string, signal?: AbortSignal): Promise<string | null> {
        const body = await api.get<{ original_url?: unknown }>(
            `v1/params/${encodeURIComponent(code)}`,
            undefined,
            { signal },
        )
        const url = typeof body?.original_url === 'string' ? body.original_url.trim() : ''
        return url || null
    },

    /** The older endpoint: a short link and nothing else. No channel, so one link serves them all. */
    createShortLink({
        url,
        accountId,
    }: {
        url: string
        accountId?: string | null
    }): Promise<ShareLink | null> {
        return api
            .post<unknown>(
                'v1/shorten/',
                { original_url: url },
                accountId ? { accountId } : undefined,
            )
            .then(parseShareLink)
    },
}
