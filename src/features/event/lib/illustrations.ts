/**
 * The event feature's artwork — committed under `public/illustrations/`, never fetched from a CDN.
 *
 * The rule and its escape hatches are in `docs/STATIC_ASSETS.md`; the short version is that
 * `next/image` passes a remote SVG through unprocessed, a CSS `background-image` is never optimised
 * at all, and *small is not local* — the last two offenders that slipped the byte budget were 3 KB
 * each. Guarded by `illustrations.test.ts` beside this file.
 *
 * Built by `scripts/build-cdn-art.mjs` from legacy's `images/no-data.png`.
 */
export const EVENT_ART = {
    /**
     * **No data** — the report's empty state, in all four places it appears: the revenue summary,
     * the maintenance-fee card, the live-analytics card, and each of the three order lists.
     *
     * ## The declared box is legacy's *drawn* size, not the file's pixels
     *
     * The source is 228×241. Legacy renders it `width={120} height={30}` with
     * `style={{ width: '120px', height: 'auto' }}` — so its declared height is meaningless (nothing
     * about this image is 8:1) and `auto` is what actually governs. 127 is 120 at the source's own
     * 0.946 ratio, which is what a reader sees.
     *
     * Declaring the file's 228 instead would render it at nearly twice the size Brand drew it, which
     * is the trap `PAYOUT_ART.empty` records from the other direction.
     */
    noData: { src: '/illustrations/event/no-data.webp', width: 120, height: 127 },
    /**
     * **An empty gift leaderboard** — the Live studio's chat column before anybody has given
     * anything, which is every broadcast's first minutes.
     *
     * 134×74 is legacy's own drawn box (`NoData`), and the only one: the chat column is a fixed
     * 390 wide, so there is no responsive case to size for.
     */
    leaderboardEmpty: {
        src: '/illustrations/event/leaderboard-empty.webp',
        width: 134,
        height: 74,
    },
    /**
     * **404 – Live Not Found** — the wall behind a dead event link, on both the route boundary and
     * the client path.
     *
     * 153×200 is legacy's draw (`containers/event/components/noData`). The file is 306×400, a 2×
     * asset; declaring the file's width would render it at twice the size Brand drew it, which is
     * the trap `PAYOUT_ART.empty` records.
     *
     * Built from a **190 KB** SVG whose contents are one base64 PNG — `next/image` passes a remote
     * SVG through unprocessed, so this is a fifth of a megabyte saved on a wall nobody wants to see.
     */
    notFound: { src: '/illustrations/event/not-found.webp', width: 153, height: 200 },
    /**
     * **The crown on the studio's Membership tile**, beside the gift tray. 40×40 is legacy's draw;
     * the file is 120×120 for a DPR-3 phone.
     *
     * Built from a **1.6 MB** `live/icon-king.svg` — one base64 PNG inside a 40px `<rect>`.
     */
    membershipKing: { src: '/illustrations/event/membership-king.webp', width: 40, height: 40 },
    /**
     * The two marks on the channel plate's *Get Membership* / *Get Premium* button, each drawn
     * 16×16 and each a **2 MB+** image-layer SVG upstream. 48×48 files for a DPR-3 phone.
     */
    getMembership: { src: '/illustrations/event/get-membership.webp', width: 16, height: 16 },
    getPremium: { src: '/illustrations/event/get-premium.webp', width: 16, height: 16 },
    /**
     * The Premium mark on the studio's Premium card, drawn 52×52.
     *
     * **The same committed file `/premium` uses** (`premium-logo` in `build-cdn-art.mjs`, legacy's
     * `premium/logo-premium.svg`), referenced by its public path rather than encoded twice: a 300px
     * master already covers a 52px box at DPR 3, and `features/premium`'s art is not in its barrel.
     */
    premiumLogo: { src: '/illustrations/premium/logo.webp', width: 52, height: 52 },
} as const
