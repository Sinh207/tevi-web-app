import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import { type DirectDonate, normalizeDirectDonate } from './types'

/**
 * Direct donation — **Billy**, the billing service, not `core`.
 *
 * The offer is content ("buy me a coffee, 100 Star") but it is priced, so it lives with the money
 * rather than with the space. That is also why the write below is a `POST` to the *same* path the
 * read uses: the endpoint is the offer, and posting to it is buying from it.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

export const donationKeys = {
    all: ['donation'] as const,
    /**
     * Account-scoped like every other read in this app, because the ETag store is: two accounts
     * sharing a key would let one replay the other's cached body. The offer itself is the same for
     * everybody, so the only cost is a refetch on account switch.
     */
    offer: (accountId: string | null, slug: string) =>
        [...donationKeys.all, 'offer', accountId ?? 'anon', slug] as const,
}

/**
 * Legacy strips `@` before building the path (`channel_slug.replaceAll('@', '')`) and so does this.
 *
 * Our `Channel.slug` never carries one — `parseChannelSlug` takes it off at the route — but the
 * deep link `/@ada/direct-donation` does, and a caller reaching for `params.slug` would pass it
 * straight through. Encoding is separate and not optional: the slug comes off a URL (DoD §8).
 */
const offerPath = (slug: string) =>
    `v1/gifting/direct-donate/${encodeURIComponent(slug.replaceAll('@', ''))}/`

export const donationApi = {
    /**
     * The creator's offer, or `null` when they take no donations.
     *
     * **A 404 is an answer, not a failure**, and swallowing it here rather than at the hook is what
     * makes the contract `DirectDonate | null` for every consumer — the query resolves `success`, so
     * it raises no toast, enters no error state, and `isPending` goes false. `channelApi.getMyChannel`
     * states the same thing at more length; this is the same shape for the same reason.
     *
     * Any other status is a real failure and is left to reject: a 500 means the offer's existence is
     * *unknown*, and answering `null` there would silently hide a Donate button the creator is paying
     * attention to.
     */
    async getOffer(slug: string, accountId?: string | null): Promise<DirectDonate | null> {
        try {
            const body = await api.get<unknown>(
                offerPath(slug),
                undefined,
                accountId ? { accountId } : undefined,
            )
            return normalizeDirectDonate(body)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /**
     * Spend Star on a creator's offer.
     *
     * `tvs_amount` is the **total** Star, not the quantity — the backend divides by the unit price
     * itself. Sending the quantity instead is a silent overcharge of exactly the unit price, which
     * is why the field is named for what it carries here rather than being derived at the call site.
     *
     * ⚠ **Not retried.** `apiClient` replays a POST only with `{ retry: true }` and only where the
     * backend deduplicates, and this one debits a balance — a 502 that arrives after the debit
     * landed would take the Star twice. See `shared/lib/api/client.ts`.
     */
    donateStars(
        slug: string,
        { amount, message }: { amount: number; message?: string },
        accountId?: string | null,
    ) {
        return api.post(
            offerPath(slug),
            { tvs_amount: amount, message: message?.trim() || undefined },
            accountId ? { accountId } : undefined,
        )
    },
}
