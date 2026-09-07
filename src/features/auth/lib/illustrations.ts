/**
 * The two screenshots that show where "Scan QR code" lives in the app — Brand's art, re-encoded and
 * committed by `pnpm art:cdn`.
 *
 * ## These are instructions, not decoration
 *
 * Which is the whole reason they are here. Without them the panel can only *assert* that a "Scan QR
 * code" item exists somewhere in the app; with them it points at the button (step 1) and at the menu
 * row (step 2), and the numbered badges are drawn into the art itself. Every other illustration in
 * this repo can go missing and leave a screen that still works — if these go missing, the QR step
 * keeps its code and loses its explanation.
 *
 * That also settles the CDN question, which for the ordinary raster is a matter of bytes: 435 KB of
 * PNG at 814×661 for something drawn 184 wide, fetched and decoded cross-origin by the optimiser on
 * the **sign-in screen itself**. Re-encoded at 2× the declared box the pair is 25 KB and the cold
 * render is a local file read.
 *
 * ## The box is the widest placement, not an average
 *
 * 184 is `/login`'s 440 card less its 32px padding and the 8px gap, halved. `LoginDialog` is
 * narrower and scales them down with `w-full h-auto`; sizing for the narrower one instead would
 * upscale them on the page. The height keeps the source's own 814×661 ratio, so nothing is stretched.
 *
 * Raster art, so not themeable: the same picture shows in both modes, as it does in the mobile app
 * and in legacy. See [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 */

export const QR_SIGN_IN_STEPS = [
    { src: '/illustrations/auth/scan-qr-step-1.webp', width: 184, height: 149 },
    { src: '/illustrations/auth/scan-qr-step-2.webp', width: 184, height: 149 },
] as const

/**
 * The lock-and-shield mark on `/settings/two-step-verification`'s two centred screens — *Set Up
 * Two-Step Verification* and *Two-Step Verification Enabled*.
 *
 * ## Provenance, because this one did not come off the CDN
 *
 * Every other illustration in this repo is a row in `scripts/build-cdn-art.mjs`'s `SOURCES`, pulled
 * from `static.tevi.dev` and re-encoded. This one has never been published there: it exists only as
 * an **image layer inside the design file** — Figma `Tevi Web - Version 2.0`, page
 * `Two-step verification`, node **`1077:80750`**, a 1536×1024 raster the comps draw at 190×127.
 *
 * So it was rendered through Figma's own image endpoint at the box's 2× (380×254) and encoded WebP at
 * `build-cdn-art.mjs`'s own `QUALITY` (0.85), which is the same treatment its `SOURCES` rows get. It
 * is **not** in that script, deliberately: the script fetches URLs, and a Figma render URL expires in
 * 30 days, so a row there would be a build that breaks on a timer. The node id above is the traceable
 * source instead — re-render it from that if Brand ever revises the art.
 *
 * If Brand does publish it to the CDN, this becomes an ordinary `SOURCES` row and this note goes.
 *
 * ## The box is the comps' own
 *
 * 190×127, measured off the frame that holds it (`Image Container` gives it 12px of clear space below
 * and the two lines of copy follow). Declared so `next/image` reserves the space and nothing jumps
 * when the art lands — and so the encode width stays pinned to 2× it.
 *
 * Raster art, so not themeable: the same picture shows in both modes, as it does in the mobile app.
 * See [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 */
export const TWO_FA_ART = {
    src: '/illustrations/auth/two-fa.webp',
    width: 190,
    height: 127,
} as const
