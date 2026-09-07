import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { PagedList } from '@shared/lib/api/paged-list'
import {
    GIFT_FOLLOWING_SIZE,
    GIFT_RECIPIENT_FIRST_PAGE,
    type GiftRecipientPage,
} from '../lib/gift-recipient-page'
import { type GiftRecipient, normalizeGiftRecipients, toReceiverUserId } from './gift-types'

/**
 * Finding the person a gift is for — **three calls on two services this feature does not own.**
 *
 * `/gift-premium` starts with a question no premium endpoint can answer ("who is this for?"), so
 * this model reaches for the same two lists `/search` draws and, when a checkout needs it, for one
 * field of a channel profile.
 *
 * ## Why this is a second call site rather than an import
 *
 * `features/search` publishes neither `searchApi` nor `useChannelSearch` on its barrel, and its own
 * doc explains why at length ("A component calling `channelApi` directly is exactly what CLAUDE.md's
 * 'never call axios from components' forbids, and exporting it is the invitation"). That file also
 * documents making exactly this call for exactly this reason against `features/channel`. So this is
 * the pattern, knowingly, and it is the third instance:
 *
 * | endpoint | owner on paper | why it is called from here |
 * |---|---|---|
 * | `search/v3/channel/` | `features/search` | not exported; and this list has no recents to write |
 * | `core/v3/channel/followed-channels/` | `features/channel` | not exported; already a second caller |
 * | `core/v3/channel/channels/{slug}/` | `features/channel` | one field of it — see `resolveReceiverId` |
 *
 * The two callers also want **different things** from the same URLs, which is what makes a shared
 * method a worse fit than it looks. `/search` records what you searched for and links every row to
 * a space; this picks one row and returns nothing to the URL. Wiring this screen through
 * `useChannelSearch` would have a gift recipient's handle land in the reader's global search
 * history, which is a different feature's memory being written by a screen that is not it.
 *
 * Open contract questions about this screen — including whether there is a cheaper way to reach a
 * receiver's user id than a whole channel fetch — are **B99** in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 *
 * ⚠ If `features/search` ever publishes a *pickable* channel-search hook, these two list methods are
 * the thing to delete — a picker driven by it would share a cache with `/search` instead of holding
 * a second copy.
 */
const searchService = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/search` })
const channelService = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Query keys for the picker.
 *
 * **Every key carries the account**, including the two that look platform-wide. Obvious for the
 * followed list; worth stating for global search, which is the reason `searchKeys` gives too:
 * results carry nothing viewer-relative *today*, but the backend is free to rank or filter them per
 * account (blocked spaces first), and an unscoped key hands account B whatever account A saw the
 * moment somebody uses the switcher — which on this screen is two taps away and mid-purchase.
 *
 * `receiver` is account-scoped for a harder reason: it is the id a **charge** is created against.
 * A cached value that outlived the account that fetched it would be a gift bought for the wrong
 * person with no way for either of them to tell.
 */
export const giftRecipientKeys = {
    all: ['gift-premium', 'recipients'] as const,
    search: (q: string, accountId: string | null) =>
        [...giftRecipientKeys.all, 'search', q, accountId ?? 'anon'] as const,
    following: (q: string, accountId: string | null) =>
        [...giftRecipientKeys.all, 'following', q, accountId ?? 'anon'] as const,
    receiver: (slug: string, accountId: string | null) =>
        [...giftRecipientKeys.all, 'receiver', slug, accountId ?? 'anon'] as const,
}

export const giftRecipientApi = {
    /**
     * One page of spaces matching `q` — `GET search/v3/channel/`.
     *
     * `accountId` is threaded through rather than read from the session when the request is built:
     * an account switch mid-flight must not have page two answered as somebody else, and the key
     * this lands under already names an account.
     *
     * `q` is merged **after** the cursor, and the order is the point: page two's params come from
     * the `next` URL the backend built, which echoes the term back — where it is already there the
     * two agree, and where the cursor is our own `{ page, page_size }` fallback this is what carries
     * it. Losing it on page two silently widens the list mid-scroll.
     */
    async searchRecipients({
        cursor,
        q,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        /** Trimmed and debounced by the hook. Empty is never sent — the hook does not ask at all. */
        q: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<GiftRecipientPage> {
        const body = await searchService.get<Partial<PagedList<unknown>>>(
            'v3/channel/',
            { ...(cursor ?? GIFT_RECIPIENT_FIRST_PAGE), ...(q ? { q } : {}) },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeGiftRecipients(body?.results)
        const count = Number(body?.count)
        return {
            // `results.length` rather than `0` as the fallback: a payload with rows but no `count`
            // should say how many it has rather than claim to be empty above a full list.
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            results,
            next: body?.next,
        }
    },

    /**
     * The spaces this account follows that match `q` — `GET core/v3/channel/followed-channels/`.
     *
     * Returns a **bare array**, not a page, and that is the honest signature: the block asks for one
     * page and has no way to ask for a second, so handing back a `count` and a `next` nothing reads
     * would invite somebody to build pagination on a list meant to be seen whole.
     *
     * `ordering` is not sent. The server's default is the only sensible one here — "spaces you
     * follow that match what you typed" has no user-chosen sort, and picking one would be this
     * screen inventing a ranking for a list of people.
     */
    async getFollowedRecipients({
        q,
        accountId,
        signal,
    }: {
        q: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<GiftRecipient[]> {
        const body = await channelService.get<Partial<PagedList<unknown>>>(
            'v3/channel/followed-channels/',
            { page: 1, page_size: GIFT_FOLLOWING_SIZE, ...(q ? { q } : {}) },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeGiftRecipients(body?.results)
    },

    /**
     * The **user id** behind a space — `GET core/v3/channel/channels/{slug}/`, read for one field.
     *
     * ## Why a whole request for one string
     *
     * `checkout/v3/checkout/gift-premium/` is priced against `receiver_user_id`, which is a *user*
     * and not the channel the reader pressed. Neither list this screen draws from is contracted to
     * carry `owner_id` — `followedChannelSchema` says in writing that it does not, and the search
     * payload is a projection — so the id has to be asked for. Legacy makes the same call from
     * inside its checkout handler, one line before it charges.
     *
     * It is fetched **when the recipient is chosen** rather than at the press, which is the one
     * behavioural difference: by the time a package is confirmed the answer is in the query cache,
     * so the charge does not wait on a round trip that could have happened while the reader was
     * reading prices. `useGiftPremium.confirm` still goes through `fetchQuery`, so a cold cache is
     * correct rather than merely unlikely.
     *
     * `null` when the body carries no `owner_id`, and the caller refuses to charge on it. An empty
     * `receiver_user_id` would come back as a 4xx from `checkout/` and read to the reader as a
     * payment failure, three steps away from what actually went wrong.
     */
    async resolveReceiverId(
        slug: string,
        { accountId, signal }: { accountId?: string | null; signal?: AbortSignal } = {},
    ): Promise<string | null> {
        const body = await channelService.get<unknown>(
            `v3/channel/channels/${encodeURIComponent(slug)}/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return toReceiverUserId(body)
    },
}
