/**
 * The payout screens' artwork — committed under `public/illustrations/`, never fetched from a CDN.
 *
 * The rule and its three escape hatches are in `docs/STATIC_ASSETS.md`; the short version is that
 * `next/image` passes a remote SVG through unprocessed, a CSS `background-image` is never optimised at
 * all, and *small is not local*. Guarded by `illustrations.test.ts` in this folder.
 *
 * Built by `scripts/build-cdn-art.mjs` from legacy's `my-wallet/no-payouts-yet.png`.
 */
export const PAYOUT_ART = {
    /*
     * 190×216 is the **drawn** box, not the file's pixels (380×432 — a 2× asset).
     * `ChannelEmptyState` caps the art at `art.width`, so declaring the file's width would render it
     * at 380 across, twice the size Brand drew it and twice legacy's 190. That component's own note
     * spells out the trap: a piece narrower than the cap gets upscaled by the `w-full` beside it.
     */
    empty: { src: '/illustrations/payout/empty.webp', width: 190, height: 216 },
    /**
     * "Which location do you choose?" — the explainer behind the billing country's *More info*.
     *
     * 264×176 is legacy's **desktop** draw (`matchUpMd ? 264 : 176`); the phone renders the same file
     * at 176×117, which a 528-wide 2× asset covers at any DPR either breakpoint reaches.
     */
    chooseLocation: {
        src: '/illustrations/payout/choose-location.webp',
        width: 264,
        height: 176,
    },
    /** "When you'll get your payout?" — behind the method list's *Learn more*. Legacy's 229×153. */
    methodsInfo: { src: '/illustrations/payout/methods-info.webp', width: 229, height: 153 },
    /**
     * The VAI Wallet promo inside the VAI payout form.
     *
     * A **banner**, so this is a width the card can be rather than a drawn size — the card is
     * `w-full` and the art is `object-cover` at a fixed 194 height, exactly as legacy's `CardMedia`
     * does it. 540 is the source's own ratio at that height, so declaring it keeps `next/image` from
     * reserving a box with a different shape than the one it paints.
     */
    vaiWalletBanner: {
        src: '/illustrations/payout/vai-wallet-banner.webp',
        width: 540,
        height: 194,
    },
} as const
