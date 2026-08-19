import { env } from '@shared/config/env'

/**
 * `/my-wallet`'s empty-state artwork. See `features/my-star/lib/illustrations.ts` for why these are
 * remote `.png` files with a hard-coded fallback host and declared intrinsic sizes — the reasoning is
 * identical and is written out there.
 *
 * A separate file rather than a shared one: the two screens use different art, and a feature may not
 * reach into another feature's `lib/`.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

export const MY_WALLET_ART = {
    empty: {
        src: `${STATIC_DOMAIN}/web/web-app/my-wallet/no-currency-transactions.png`,
        width: 225,
        height: 256,
    },
} as const
