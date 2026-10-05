import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'

/**
 * **Buying access to one live event with Star** — `POST billy/v1/ecom/purchase/`.
 *
 * A second model on a second service, in its own file for the reason `features/payment` gives about
 * `/billy` versus `/core`: reading an event and paying for one are two different systems, and a
 * model is the surface one feature needs rather than a wrapper around a service.
 *
 * ## It is `ecom`, not `payment`
 *
 * `features/payment` owns *taking money* — an intent, a card, a settle, four `action` branches. This
 * is none of that: the reader already holds Star, and this endpoint moves it. There is no
 * `clientSecret`, no gateway and no redirect to come back from. The `features/payment` seam it does
 * touch is the one before it — `useRequireStars` diverts to the top-up sheet when the balance is
 * short — and that is a hook, not an endpoint.
 *
 * ## `product_id` is the whole request, and legacy sends it undefined
 *
 * Legacy's confirm handler calls `handlePurchase(event?.product_id)` on a payload that does not
 * always carry one, which posts `{ product_id: undefined }` — a request that cannot succeed, from a
 * button that looked like it would. `eventDetailSchema` parses the field to `null` and
 * `useUnlockEvent` refuses to render the control without it; this model then takes a plain `string`,
 * so the impossible call is a type error rather than a 400.
 *
 * ## Not retried, and it must not be
 *
 * `apiClient` replays a POST only with an explicit `{ retry: true }`, which this deliberately does
 * not pass: a 502 can arrive *after* the charge landed, and a replay would be a second debit for one
 * press. The reader's recourse is the refetch that follows, which reads `purchased` back from the
 * server rather than assuming anything.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

export const unlockApi = {
    /**
     * Spend Star on one product. Answers whatever the service answers — the caller does not read
     * it: **`purchased` is established by refetching the event**, never by trusting this response.
     * A body that says "ok" is not the same claim as the event's own record of entitlement, and
     * only one of them decides whether the reader gets in.
     */
    async purchase({
        productId,
        accountId,
    }: {
        productId: string
        accountId?: string | null
    }): Promise<void> {
        await api.post<unknown>(
            'v1/ecom/purchase/',
            { product_id: productId },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * **Pay for one message in a paid chat** — 1 Star, to the creator.
     *
     * A second method rather than a wider `purchase`, because this body is a different shape: it
     * carries a `price_id`, the `event_code` it is being consumed against, and the channel the
     * Star goes to. Folding the two would give the unlock call four optional fields it never
     * sends.
     *
     * The ids are **constants**, copied from legacy's `constants/productType.js`. They are not
     * configuration and there is no endpoint that answers them — `permission/v3/remote-config/
     * ACTION_FEE/` looks like it should and is dead code legacy never reads (`CLAUDE.md` says so).
     * The fee is likewise a literal `1` there.
     *
     * ⚠ **This is billed by the client, after the fact, and that is legacy's design rather than
     * ours.** `post_message` succeeds first and the charge follows — so the message is already in
     * front of the room before anybody is asked to pay for it, and a client that simply never
     * calls this posts for free. Legacy also fires it without awaiting or checking the result, so
     * a *failed* charge is invisible on both sides. This at least returns the promise, which is
     * what lets `useLiveChat` tell the reader their balance did not move. Whether the server
     * should be charging instead is **B118**.
     */
    /** One interval of the sustained fee. See `LIVE_SUSTAINED_FEE_PRODUCT` for the `quality` trap. */
    async purchaseSustainedFee({
        eventCode,
        channelId,
        fee,
        accountId,
    }: {
        eventCode: string
        channelId: string | null
        fee: number
        accountId?: string | null
    }): Promise<void> {
        await api.post<unknown>(
            'v1/ecom/purchase/',
            {
                product_id: LIVE_SUSTAINED_FEE_PRODUCT.productId,
                price_id: LIVE_SUSTAINED_FEE_PRODUCT.priceId,
                quality: fee,
                consumption_data: { event_code: eventCode },
                ...(channelId ? { metadata: { beneficial_channel_id: channelId } } : {}),
            },
            accountId ? { accountId } : undefined,
        )
    },

    async purchaseChatMessage({
        eventCode,
        channelId,
        accountId,
    }: {
        eventCode: string
        channelId: string | null
        accountId?: string | null
    }): Promise<void> {
        await api.post<unknown>(
            'v1/ecom/purchase/',
            {
                product_id: LIVE_CHAT_PRODUCT.productId,
                price_id: LIVE_CHAT_PRODUCT.priceId,
                consumption_data: { event_code: eventCode },
                ...(channelId ? { metadata: { beneficial_channel_id: channelId } } : {}),
            },
            accountId ? { accountId } : undefined,
        )
    },
}

/**
 * **Charge one interval of the sustained fee** — Star to keep watching, going to the streamer.
 *
 * ⚠ **`quality`, not `quantity`.** That is what legacy sends and it is almost certainly a typo
 * nobody has noticed: if the service reads `quantity`, then every sustained-fee charge ever made
 * has billed whatever the default is rather than the configured `fee`, and a console set to 2
 * Star has been taking 1. Sent as legacy spells it, because a payload this client "corrects"
 * against a service that really does read `quality` would start billing double. **B118** asks.
 */
export const LIVE_SUSTAINED_FEE_PRODUCT = {
    productId: '397970d1-2940-47b1-8674-d13cf711f191',
    priceId: '7c9b7ab2-210e-489f-b911-a30f5055d19c',
} as const

/** Legacy's `PRODUCT_TYPE.LIVE_CHAT`, verbatim. See `purchaseChatMessage`. */
export const LIVE_CHAT_PRODUCT = {
    productId: '71cc131b-72f6-4799-9096-0e1c0ebea14b',
    priceId: '304320ca-c70e-46a2-8ce6-9a5f7aa17638',
} as const

/** What one message costs in a paid chat. Legacy's hardcoded `ACTION_FEE = 1`. */
export const LIVE_CHAT_FEE = 1
