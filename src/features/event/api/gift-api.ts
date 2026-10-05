import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type GiftPackage, normalizeGiftPackages } from './gift-types'

/**
 * **Gifting** — `billy/v1/gifting/`, the third model this feature talks to.
 *
 * ```
 * GET  v1/gifting/product-packages/   the catalogue the tray and the panel draw
 * POST v1/gifting/send/               spend Star on one package, for one recipient
 * ```
 *
 * Its own file rather than a pair of methods on `unlock-api.ts`, and the line is the one that file
 * already draws: `v1/ecom/purchase/` is *this reader buying access to a thing* — a ticket, a
 * message, an interval of the sustained fee — and it is priced by a `product_id`. A gift is not
 * that. It has a **recipient**, it is announced to the whole room, and it is priced by a package.
 * Folding the two would give the unlock call four fields it never sends and the gift call a
 * `product_id` it does not have.
 *
 * ## It is billy, and the same service the donation feature uses
 *
 * `features/donation` posts to `v1/gifting/direct-donate/{slug}/` — the same namespace. They are
 * deliberately two features rather than one: a donation is a **space's** standing offer, readable
 * with no broadcast anywhere, and a gift only exists inside a live room. `features/event` may not
 * import `features/donation`'s internals and does not need to; the two share a service prefix and
 * nothing else.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

export const giftKeys = {
    all: ['event', 'gift'] as const,
    /**
     * Account-scoped like every other read here, and for the ETag store's sake rather than the
     * payload's — see `donationKeys.offer`. `includeExclusive` is in the key because it changes
     * the answer.
     */
    packages: (accountId: string | null, channelId: string | null, includeExclusive: boolean) =>
        [
            ...giftKeys.all,
            'packages',
            accountId ?? 'anon',
            channelId ?? 'none',
            includeExclusive ? 'all' : 'public',
        ] as const,
}

/**
 * How many rows one page asks for. Legacy's own `page_size: 100`, which is its way of saying "the
 * whole catalogue" — a creator's gift list is tens of items, not thousands, and the tray is a
 * single horizontal strip with no paging affordance of any kind.
 *
 * If a catalogue ever outgrows this the symptom is a **silently short** tray, so it is a constant
 * with a name rather than a literal in the call.
 */
export const GIFT_PAGE_SIZE = 100

export const giftApi = {
    /**
     * The catalogue for one space.
     *
     * ⚠ **Two of the three params are undocumented.** billy's OpenAPI declares only `page` and
     * `page_size` on this path; `channel_id` and `include_exclusive` are what legacy has always
     * sent and what a per-space catalogue evidently needs. Sent as legacy spells them — an
     * undocumented param the service ignores costs nothing, while dropping one that it reads would
     * quietly serve every space the same gifts. **B119** asks.
     *
     * `include_exclusive` is `true`, also legacy's value, and it is what makes the *Exclusive* tab
     * possible at all: the flag asks the service to include member-only products, and the client
     * then splits them (`splitGiftPackages`). Asking for the public list and filtering it would
     * leave the tab permanently empty.
     *
     * A failure is **not** an empty catalogue, so this rejects rather than answering `[]` — the
     * tray has to be able to tell "this creator offers no gifts" from "we could not ask".
     */
    async getPackages({
        channelId,
        includeExclusive = true,
        accountId,
        signal,
    }: {
        channelId: string
        includeExclusive?: boolean
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<GiftPackage[]> {
        const body = await api.get<unknown>(
            'v1/gifting/product-packages/',
            {
                channel_id: channelId,
                include_exclusive: includeExclusive,
                page: 1,
                page_size: GIFT_PAGE_SIZE,
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeGiftPackages(body)
    },

    /**
     * **Send one package**, to one person, in one broadcast.
     *
     * The body is rebuilt field by field from the schema rather than spread from a tile, which is
     * the same rule `features/mini-app` states for a framed app's options: the price the client
     * holds is never sent — **billy prices the package** — and a tile that grew a field would
     * otherwise start posting it.
     *
     * `quantity` is deliberately **not sent**. The schema has it (`minimum: 1, default: 1`) and
     * legacy has never sent it; one press is one package, and the `x10` a reader sees is the
     * *package's* own `quantity`, not a multiplier. Sending it would be inventing a control the
     * design does not have.
     *
     * ⚠ **Not retried.** `apiClient` replays a POST only with `{ retry: true }`, which this does
     * not pass: this debits Star, and a 502 arriving after the debit landed would charge twice for
     * one press. Same rule as `donationApi.donateStars` and `unlockApi.purchase`.
     *
     * The response is the reader's **balances** (`ResponseUserBalanceResponseList`) and is
     * deliberately discarded: `features/balance` owns that figure, and writing a figure from a
     * write's response into its cache is the thing this repo's socket rule forbids for the same
     * reason. `useSendGift` invalidates instead.
     *
     * **`422 EC0001` is "not enough Star"** — billy's own code, and the one refusal with a
     * meaning. `useSendGift` reads it; the model stays a model.
     */
    async send({
        packageId,
        recipientId,
        eventCode,
        channelId,
        accountId,
    }: {
        packageId: number
        recipientId: string
        eventCode: string
        channelId: string | null
        accountId?: string | null
    }): Promise<void> {
        await api.post<unknown>(
            'v1/gifting/send/',
            {
                product_package_id: packageId,
                recipient_id: recipientId,
                event_code: eventCode,
                ...(channelId ? { channel_id: channelId } : {}),
            },
            accountId ? { accountId } : undefined,
        )
    },
}

/** billy's code for "this account cannot afford it". See `send`. */
export const GIFT_INSUFFICIENT_BALANCE_CODE = 'EC0001'
