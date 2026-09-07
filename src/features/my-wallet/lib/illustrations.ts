/**
 * `/my-wallet`'s empty-state artwork. See `features/my-star/lib/illustrations.ts` for why this is a
 * committed file rather than a `${STATIC_DOMAIN}/…` string — the reasoning is identical and is
 * written out there.
 *
 * Unlike that one the source has the pixels to spare (451×512), so it is encoded at the full 2× the
 * declared box: 119 KB → 26 KB.
 *
 * A separate file rather than a shared one: the two screens use different art, and a feature may not
 * reach into another feature's `lib/`.
 */

export const MY_WALLET_ART = {
    empty: { src: '/illustrations/my-wallet/empty.webp', width: 225, height: 256 },
} as const
