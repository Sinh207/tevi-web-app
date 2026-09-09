/**
 * This feature's empty-state artwork.
 *
 * ## Why this one is a local file and `IDENTITY_ART` is a CDN URL
 *
 * Legacy points at `${STATIC_DOMAIN}/web/web-app/blocked-accounts/no-blocked-accounts.svg`,
 * and that file is still there — but it is **not vector art**. It is a 190×127 `<svg>` whose
 * whole body is one `<pattern>` filled with a base64 PNG: the shape Figma produces when an
 * *image* layer is exported as SVG. Measured, not assumed:
 *
 * | | on the wire | pixels | shown at |
 * |---|---|---|---|
 * | CDN `.svg` | **2.18 MB** gzipped | 1536×1024 embedded PNG | 190×127 |
 * | this file | 39 KB | 380×253 | 190×127 |
 *
 * The size is only half of it. `next/image` **cannot optimise a remote SVG** — it passes one
 * through unchanged. `next.config.ts` does set `dangerouslyAllowSVG`, but that is permission to
 * *serve* an SVG (which is why the sandbox CSP sits under it — an SVG can carry script), not
 * permission to process one, and `width`/`height` on `<Image>` change nothing about the bytes. So
 * every visitor who has blocked nobody would download 2.18 MB to be told so.
 * A remote `.png` is the case that works: Next fetches the original **once, server-side**, and
 * serves the browser a small AVIF. Format, not hosting, is what decides — the rule and its
 * budgets are in [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * So this is the same picture, extracted from the SVG's own payload, downscaled to 2× its
 * display box and committed. Nothing is redrawn or substituted — it is Brand's asset, byte for
 * byte, at a sane resolution. It is also flipped horizontally, because the CDN SVG applies
 * `transform="matrix(-1 0 0 1 190 0)"` to the pattern: the file as stored faces the other way,
 * and legacy's rendered orientation is the one people know.
 *
 * **This should go back to being a CDN URL.** The moment Brand publishes
 * `blocked-accounts/no-blocked-accounts.png` — the same treatment `follow-requests` and
 * `identification` already get in that very tree — this becomes a one-line change to a
 * `${STATIC_DOMAIN}/…` string and the local file is deleted. Tracked as a design dependency,
 * not left as a silent fork.
 */

export const BLOCKED_ACCOUNTS_ART = {
    /**
     * Legacy's intrinsic size (`width`/`height` on its `next/image`), kept so the box is
     * reserved at the right shape and nothing reflows when the art decodes.
     */
    empty: { src: '/illustrations/no-blocked-accounts.png', width: 190, height: 127 },
} as const

/**
 * The follow-requests queue's empty state — and the case that shows the rule is about **format,
 * not hosting**.
 *
 * Brand published this one as a real PNG at exactly 2× its display box (380×254 for a 190×127
 * frame, 69 KB), so there was nothing to rescue: `next/image` optimises a remote raster
 * perfectly well. It is committed anyway, for the second half of the cost in
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md) — the optimiser has to fetch and
 * decode a cross-origin file on the first request for every size and format it has not cached,
 * on a screen somebody is waiting on. The row in `scripts/build-cdn-art.mjs` re-encodes it to
 * WebP (21 KB) at the same pixel dimensions; nothing is redrawn, recoloured or resized.
 *
 * Contrast `BLOCKED_ACCOUNTS_ART` above, whose CDN file is 2.18 MB **because** it is an SVG with
 * a 1536×1024 PNG inside it. Same screen family, same 190×127 box, two completely different
 * problems — which is why the rule is written as "format decides" and not as a byte budget.
 */
export const FOLLOW_REQUESTS_ART = {
    /** Legacy's intrinsic size (`width`/`height` on its `next/image`), which is also the box the
     *  encode is built against — see the `no-follow-requests` row in `build-cdn-art.mjs`. */
    empty: { src: '/illustrations/channel/no-follow-requests.webp', width: 190, height: 127 },
} as const

/**
 * The Live tab's empty state.
 *
 * Legacy's `IMAGES_STATIC.event.noData` is a 154×183 SVG that turns out to be a 1536×1024 PNG
 * embedded as a cropping pattern — **3 MB** fetched to say "no events yet". Rendered at the size it
 * is actually drawn and saved as a 2× raster instead (102 KB), which is the same trade
 * `no-blocked-accounts.png` already makes.
 */
export const LIVE_EVENTS_ART = {
    empty: { src: '/illustrations/no-live-events.png', width: 154, height: 183 },
} as const

/**
 * The five walls' artwork — legacy's own, and the reason it is four files rather than five.
 *
 * ## Two kinds of art, treated differently because they *are* different
 *
 * **`suspended` and `unpublished`** are Figma *image* layers exported as SVG: 1.5 MB and 3 MB of
 * base64 PNG in an SVG wrapper, which `next/image` passes through untouched. Rasterised at 2× the
 * box legacy draws them in (224×140 and 240×140) they are 28 KB and 33 KB — 55× and 89× smaller,
 * the same trade `no-blocked-accounts.png` and `no-live-events.png` already make. Rows in
 * `scripts/build-cdn-art.mjs`, so `pnpm art` reproduces them.
 *
 * **`protected` and `blocked`** are real vector art — legacy inlines them as ~25 `<path>` elements
 * each, no raster anywhere — so they are committed as `.svg` and served as-is. Nothing is redrawn:
 * these are the same paths, lifted out of the JSX and turned back into files.
 *
 * `blocked` serves **both** block walls. Legacy's `blockedChannel` and `blockedUser` inline
 * byte-identical SVGs (verified: the two strings compare equal), so a second copy would be a second
 * thing to keep in step for no gain — the walls differ in their words, not their picture.
 *
 * Sizes are legacy's rendered ones (`width`/`height` on its `<svg>`), not the viewBox: the block art
 * is drawn at 142×177 out of a 342×377 canvas.
 */
export const CHANNEL_WALL_ART = {
    suspended: { src: '/illustrations/channel/suspended.webp', width: 224, height: 140 },
    unpublished: { src: '/illustrations/channel/unpublished.webp', width: 240, height: 140 },
    protected: { src: '/illustrations/channel/protected.svg', width: 67, height: 105 },
    blocked: { src: '/illustrations/channel/blocked.svg', width: 142, height: 177 },
} as const

/**
 * "Uh-oh! This Space isn't available!" — the wall behind `/@{slug}`'s `not-found.tsx`.
 *
 * Legacy's `IMAGES_STATIC.channel.notFound` (`channel/not-found.svg`), drawn at **227×225** in
 * `containers/channel/.../viewer/components/noData`. This screen is where that picture comes from;
 * `MCN_INVITATION_ART.invalid` below is legacy *reusing* it for the expired-invitation wall, so the
 * two states share **one** file and the row in `build-cdn-art.mjs` (`channel-not-found`) is the
 * same one — 1.71 MB of base64 PNG behind an SVG `<pattern>` upstream, 56 KB rasterised at 2× the
 * box it is drawn in.
 *
 * Two constants over one shared name on purpose: they are two product states, and the day Brand
 * draws a dedicated picture for either, only that line moves.
 */
export const CHANNEL_NOT_FOUND_ART = {
    space: { src: '/illustrations/channel/not-found.webp', width: 227, height: 225 },
} as const

/**
 * "Thanks for reporting" — the confirmation after a report is filed.
 *
 * Real vector art (6.7 KB of paths, no raster anywhere), so it is committed as `.svg` and served
 * as-is, like the `protected` and `blocked` walls. Legacy fetches the same file from
 * `${STATIC_DOMAIN}/web/web-app/icons/icon-report.svg` and draws it at 86×104 — the file's own box is
 * 88×104, and the two-pixel squash is legacy's; the intrinsic size is used here instead.
 */
export const REPORT_ART = {
    submitted: { src: '/illustrations/channel/report-submitted.svg', width: 88, height: 104 },
} as const

/**
 * `/following`'s empty state — **legacy's own art**, shared rather than copied.
 *
 * Legacy draws `IMAGES_STATIC.images.theoSearch` here, which is the same file `features/earnings`,
 * `features/membership` and `features/star-transfer` already point at: real vector art (9 KB of
 * paths, no raster anywhere), committed at `public/illustrations/theo-search.svg`. So this is one
 * more reference to one file, not a fifth copy of it.
 *
 * ⚠ **94×118, not legacy's 120×120.** Legacy sets both dimensions to 120 on a 94×118 vector, so it
 * ships a 6% horizontal stretch. The intrinsic size is used instead, for the reason
 * `ChannelEmptyState` records at length: art is drawn at the size it is meant to be seen, and a
 * caller that overrides that is deciding something Brand already decided.
 *
 * A path literal rather than an import from the other three features' `illustrations.ts`: a feature
 * may not reach into another feature's internals (CLAUDE.md), and a nine-character string is not
 * worth widening a barrel for. `illustrations.test.ts` pins it with `committedArt()`, which is what
 * catches the path going stale.
 */
export const FOLLOWING_ART = {
    empty: { src: '/illustrations/theo-search.svg', width: 94, height: 118 },
} as const

/**
 * `/invitation/verify`'s two pictures — the hero band and the expired-link wall.
 *
 * ## The hero is the first `cover` **background** in this repo, and that changes the numbers
 *
 * Legacy paints it as a CSS `background-image` with `background-size: cover` in a band 172px tall,
 * which is the worst case for this rule twice over: a CSS background is never optimised by anything
 * (not `next/image`, not the loader), and the file is a **2.31 MB** 1536×1024 PNG. So every creator
 * opening an invitation downloads 2.31 MB to fill a 612×172 strip.
 *
 * `width`/`height` here are the **asset's**, not the box's — 612×408, the drawn width at the source's
 * own 3:2 aspect. Everywhere else in this file the two are the same thing, and it is worth saying why
 * they are not here: the crop `cover` performs depends on the box's width, so baking the 612×172 crop
 * into the file would leave a phone re-cropping an already-cropped strip and losing a third of the
 * picture legacy shows. The aspect is preserved in the file and `object-cover` does the crop at
 * render time, exactly as `background-size` did. The declared box is therefore the reservation for
 * the *image*, and the 172 the band is actually tall lives at the call site with the crop.
 *
 * ## The wall is the third image-layer-as-SVG in this feature
 *
 * `channel/not-found.svg`, **1.71 MB** of base64 PNG behind a `<pattern>` — the same shape as the
 * `suspended` and `unpublished` walls above, and the same trade: rasterised at 2× the 227×225 box
 * legacy draws it in, it is 56 KB. Legacy reuses its space-not-found art for this state rather than
 * commissioning one, and so does this — it is the *same file* `CHANNEL_NOT_FOUND_ART` above points
 * at, and that is where the picture belongs.
 *
 * Both rows are in `scripts/build-cdn-art.mjs`, so `pnpm art` reproduces them.
 */
export const MCN_INVITATION_ART = {
    hero: { src: '/illustrations/channel/invitation-banner.webp', width: 612, height: 408 },
    invalid: { src: '/illustrations/channel/not-found.webp', width: 227, height: 225 },
} as const

/**
 * The phone mock-up on the "add this space to your home screen" screen — a home screen with one
 * **empty slot**, which `AddHomeScreenGuide` fills with the creator's own avatar.
 *
 * Legacy's `IMAGES_STATIC.addToHomeScreen.addToHomeScreenBanner`, and the one piece of art in this
 * feature whose source is a **JPEG** rather than a raster-in-an-SVG (17.6 KB, 1143×1280) — so it is
 * committed for the second reason `docs/STATIC_ASSETS.md` gives rather than the first: there is
 * nothing to rescue, but a screen whose only content is a picture and two sentences should not wait
 * on the optimiser fetching another host.
 *
 * ⚠ **329 tall, where legacy declares 323.** That is the source's own aspect at 294 wide, and here
 * it is load-bearing rather than pedantic: the avatar is positioned as a percentage of this box, so
 * a box whose ratio is not the picture's slides it off the slot. The `build-cdn-art.mjs` row says
 * the same thing from the encoder's side.
 *
 * The picture's ground is **white and it has no alpha** — it is a photograph of a home screen, not
 * a cut-out — which is why the component draws it on a `--white` tile in both themes instead of on
 * the page. Recolouring it is not on the table: this script changes bytes, not pictures.
 */
export const ADD_HOME_SCREEN_ART = {
    phone: { src: '/illustrations/channel/add-home-screen.webp', width: 294, height: 329 },
} as const
