/**
 * Re-encode the CDN illustrations that are too heavy to serve as they are, and commit the result.
 *
 * ```
 * pnpm art:cdn                     # rebuild every entry in SOURCES
 * pnpm art:cdn grow-your-fans      # rebuild one, by name
 * rm -rf .next/dev/cache/images    # ⚠ or a running dev server keeps serving the old encode
 * ```
 *
 * ## Why this exists
 *
 * Brand exports art out of Figma, and a Figma *image layer* exported as SVG is a raster in an SVG
 * wrapper — one base64 PNG behind a `<pattern>`, at whatever resolution the artboard happened to be.
 * `next/image` cannot rescue that: it passes a **remote SVG through unchanged**. `dangerouslyAllowSVG`
 * buys permission to serve, not processing. So the whole file reaches the browser and `width`/`height`
 * on `<Image>` change nothing about the bytes.
 *
 * Measured off `static.tevi.dev`, gzipped, before this script existed:
 *
 * | asset | on the wire | what is inside | drawn at |
 * |---|---|---|---|
 * | `campaign/growth-your-fanbae/logo-gyf.svg` | **2.27 MB** | a 1800×2400 PNG | a 64px tile |
 * | `home/{coffee,pizza,book,rose}.svg` | 15.9 KB ×4 | a 96×97 PNG each | 16–32px |
 * | `identification/*.png` ×3 | 4.17 MB raw | 1093×728 / 1024×1024 ×2 | 300 wide |
 * | `home/donation-loudspeaker.png` | 186 KB | 848×584 | 212×146 |
 *
 * The three PNG groups are not the same problem as the SVGs — `next/image` *does* process a remote
 * raster, so the browser already gets a small AVIF. They are here for the other half of the cost: the
 * optimiser has to fetch and decode 1.4 MB on the first request for every size and format it has not
 * cached yet, on a screen where the person is waiting. Committing them turns a cold-cache render into
 * a local file read.
 *
 * The rule this encodes, so it does not have to be re-derived per asset:
 * **format decides, not hosting.** A remote raster is fine. A remote SVG is only fine if it is a real
 * vector *and* small — see `scripts/audit-cdn-art.mjs`, which is what checks that.
 *
 * ## What it does not do
 *
 * Nothing is redrawn, recoloured or substituted. Each output is Brand's own pixels, rasterised through
 * Chromium at the size the app actually draws them and encoded as WebP — the same technique, quality
 * and reasoning as `build-gift-code-art.mjs` and `build-star-transfer-art.mjs`. Output is
 * **generated but committed**, like the icon sprite: the input is a URL that can change under us, and
 * a reviewer should be able to see exactly what is being served.
 *
 * Adding an asset is one row in `SOURCES` plus the `illustrations.ts` line that points at it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The host `.env.local.example` ships. Both it and legacy's production CDN serve byte-identical
 * files (verified with `curl -sI` on every path below), so which one is pinned only matters for
 * reproducibility — and a script that reaches a *staging* host is the one that stays reachable.
 */
const CDN = 'https://static.tevi.dev'

/**
 * `box` is the CSS box the app draws the art in — the same numbers the feature's `illustrations.ts`
 * declares, so the encode width and the reserved layout can never drift apart. `scale` is the DPR
 * ceiling worth paying for: 2 for anything with a fixed box, 3 for the small square icons where a
 * phone at DPR 3 is the realistic worst case and 3× still lands under 5 KB.
 *
 * `mode: 'copy'` is for a genuine vector that only needs to stop being cross-origin — no re-encode,
 * byte-for-byte, because rasterising a scheme-logo strip would make it soft at exactly the DPR it is
 * read on.
 */
const SOURCES = [
    {
        name: 'grow-your-fans',
        out: 'campaign/grow-your-fans.webp',
        url: `${CDN}/web/web-app/campaign/growth-your-fanbae/logo-gyf.svg`,
        // 42×48 intrinsic, `object-contain` inside ProgramCard's 64px tile → 56×64 is the drawn box.
        box: { width: 56, height: 64 },
        scale: 2,
    },
    ...['coffee', 'pizza', 'book', 'rose'].map(name => ({
        name,
        out: `donation/${name}.webp`,
        url: `${CDN}/home/${name}.svg`,
        /**
         * Square, and deliberately: `DonationArt` passes `width={size} height={size}` for every one
         * of them, so the browser already squashes the 16×17 viewBox three of these have into a
         * square. Rasterising square reproduces what ships rather than quietly changing it.
         */
        box: { width: 32, height: 32 },
        // 3× a 32 slot is 96, which is exactly the embedded PNG's own resolution. Nothing upscales.
        scale: 3,
    })),
    {
        name: 'donation-success',
        out: 'donation/success.webp',
        url: `${CDN}/home/donation-loudspeaker.png`,
        box: { width: 212, height: 146 },
        scale: 2,
    },
    /*
     * The channel walls. Both are Figma **image** layers exported as SVG — 1.5 MB and 3 MB of
     * base64 raster in an SVG wrapper — which `next/image` would pass through untouched. Legacy
     * draws them at 224×140 and 240×140; rasterising at 2× those boxes is the same trade every
     * other row here makes.
     */
    {
        name: 'channel-suspended',
        out: 'channel/suspended.webp',
        // The `?v1` legacy appends is dropped: same bytes, and the query trips the decoder the
        // rasteriser loads this through.
        url: `${CDN}/web/web-app/channel/image-suspended.svg`,
        box: { width: 224, height: 140 },
        scale: 2,
    },
    {
        name: 'channel-unpublished',
        out: 'channel/unpublished.webp',
        url: `${CDN}/web/web-app/channel/img-unpublished.svg`,
        box: { width: 240, height: 140 },
        scale: 2,
    },
    /*
     * "No follow requests yet". Not an SVG-with-a-raster-inside like the two walls above — Brand
     * published this one as a real PNG, at **exactly 2× the 190×127 box legacy draws it in** (380×254,
     * 70 KB). So there is nothing to rescue and nothing to clamp; it is here for the other half of the
     * cost every raster row here is here for — the optimiser fetching and decoding a cross-origin file
     * on the first request for each size, on a screen somebody is waiting on.
     */
    {
        name: 'no-follow-requests',
        out: 'channel/no-follow-requests.webp',
        url: `${CDN}/web/web-app/follow-requests/no-follow-requests-yet.png`,
        box: { width: 190, height: 127 },
        scale: 2,
    },
    /*
     * The MCN-invitation hero, and the **first `cover` background** this script has had to encode —
     * which is why its `box` is not the box the app draws it in.
     *
     * Legacy paints it as a CSS `background-image` with `background-size: cover` in a band that is
     * `100%` wide (so at most 612) and **172px tall**. A CSS background is never optimised by
     * anything, so the browser fetches all **2.31 MB** of a 1536×1024 PNG to fill a 612×172 strip.
     *
     * `box: 612×408` is that width at the **source's own 3:2 aspect**, not `612×172`. Encoding the
     * drawn box would have to bake the crop in, and the crop is width-dependent: `cover` into
     * 612×172 keeps a 431px-tall band of the source, into 360×172 an 1100px-wide one. Bake the
     * desktop crop and every phone re-crops the already-cropped strip, losing a third of the picture
     * legacy shows. So the aspect is preserved here and `object-cover` does the crop at render time,
     * exactly as legacy's `background-size` does — the only thing that changes is the byte count.
     *
     * That also means the rasteriser's straight `drawImage` is a no-op distortion here: 612×408 *is*
     * 3:2, so nothing is squashed. Do not "correct" this row to the 172 the component declares.
     */
    {
        name: 'invitation-banner',
        out: 'channel/invitation-banner.webp',
        url: `${CDN}/web/web-app/images/bg-invitation.png`,
        box: { width: 612, height: 408 },
        scale: 2,
    },
    /*
     * "This invitation link has expired or is invalid" — legacy's `channel/not-found.svg`, drawn at
     * 227×225.
     *
     * The third Figma image-layer-as-SVG in this feature (1.71 MB of base64 PNG behind a
     * `<pattern>`), so the same trade as the two walls above: `next/image` passes a remote SVG
     * through untouched, and this one is 1.71 MB to say a link has expired.
     */
    {
        name: 'channel-not-found',
        out: 'channel/not-found.webp',
        url: `${CDN}/web/web-app/channel/not-found.svg`,
        box: { width: 227, height: 225 },
        scale: 2,
    },
    {
        name: 'identity-intro',
        out: 'identification/intro.webp',
        url: `${CDN}/web/web-app/identification/identification-center.png`,
        /**
         * 300×190 is legacy's declared box and the source is 1093×728 (300×200) — legacy squashes it
         * by five percent. Kept, for the same reason the donation icons are kept square: this script
         * changes the bytes, not the picture on the screen.
         */
        box: { width: 300, height: 190 },
        scale: 2,
    },
    {
        name: 'identity-pending',
        out: 'identification/pending.webp',
        url: `${CDN}/web/web-app/identification/identity-processed.png`,
        box: { width: 300, height: 300 },
        scale: 2,
    },
    {
        name: 'identity-verified',
        out: 'identification/verified.webp',
        url: `${CDN}/web/web-app/identification/identity-verified.png`,
        box: { width: 300, height: 300 },
        scale: 2,
    },
    {
        name: 'card-schemes',
        out: 'payment/card-schemes.svg',
        url: `${CDN}/web/web-app/card-management/icon-cards.svg`,
        mode: 'copy',
    },
    /*
     * The empty inbox — and the row that shows `mode: 'copy'` is a *rule* and not an exception made
     * for one file. It is a real 17.8 KB vector with no embedded raster, so there is nothing to
     * rescue: rasterising it would make it soft at the DPR it is read on, and re-encoding a vector
     * to WebP would be strictly worse than the bytes Brand shipped. It is here anyway because
     * `next/image` passes a **remote** SVG through unprocessed, so the cross-origin request on a
     * screen somebody is waiting on buys nothing — CLAUDE.md's rule is that a rendering screen
     * depends on no other host.
     */
    {
        name: 'no-inbox-messages',
        out: 'notification/theo-empty-inbox.svg',
        url: `${CDN}/web/web-app/images/theo-empty-inbox.svg`,
        mode: 'copy',
    },
    {
        name: 'no-cards',
        out: 'payment/no-cards.webp',
        url: `${CDN}/web/web-app/card-management/no-cards.png?v5`,
        // Legacy's box is 227×204 and the source is only 341 wide, so the clamp does the deciding.
        box: { width: 227, height: 204 },
        scale: 2,
    },
    {
        name: 'no-star-transactions',
        out: 'my-star/empty.webp',
        url: `${CDN}/web/web-app/my-wallet/no-tvs-transactions.png`,
        // The source is 226×256 — a 1× asset. `scale: 1` says so rather than letting the clamp
        // silently absorb a 2 that was never achievable.
        box: { width: 225, height: 256 },
        scale: 1,
    },
    {
        name: 'no-currency-transactions',
        out: 'my-wallet/empty.webp',
        url: `${CDN}/web/web-app/my-wallet/no-currency-transactions.png`,
        box: { width: 225, height: 256 },
        scale: 2,
    },
    {
        name: 'no-payouts-yet',
        out: 'payout/empty.webp',
        url: `${CDN}/web/web-app/my-wallet/no-payouts-yet.png`,
        /*
         * **190 wide, which is legacy's own** (`payoutTracking`'s `NoPayoutsYet` draws it at 190×150).
         * The height is 216 rather than 150 because the source is portrait — 380×432, a ratio of
         * 0.88 — and `ChannelEmptyState` renders `h-auto`, so a declared 150 would reserve a box the
         * image then overflows. Legacy's 190×150 squashes it; this keeps the ratio and matches the
         * width a reader sees.
         *
         * `scale: 2` lands exactly on the source's 380×432 with no clamping.
         */
        box: { width: 190, height: 216 },
        scale: 2,
    },
    /*
     * The two explainer panels on `/my-wallet/setup-payouts` — "Choose your location" and "When
     * you'll get your payout". Both are 1536×1024 PNGs (2 MB each) that legacy renders into a 264×176
     * and a 229×153 slot respectively, so the fetch is ~30× the bytes the pixels need. Legacy's boxes
     * are its desktop ones; the phone draws each at two thirds, which the same file covers.
     */
    {
        name: 'choose-your-location',
        out: 'payout/choose-location.webp',
        url: `${CDN}/web/web-app/my-wallet/choose-your-location.png`,
        // 264/176 is exactly the source's 3:2, so nothing is cropped or squashed.
        box: { width: 264, height: 176 },
        scale: 2,
    },
    {
        name: 'available-payout-methods',
        out: 'payout/methods-info.webp',
        url: `${CDN}/web/web-app/my-wallet/available-payout-methods.png`,
        box: { width: 229, height: 153 },
        scale: 2,
    },
    /*
     * The VAI Wallet promo inside the VAI payout form. A **banner**, so its box is a width the card
     * can actually be rather than a drawn size: legacy gives the card `height: 194` at full width, and
     * 540×194 is the source's own 2.78 ratio — `scale: 2` lands exactly on its 1080×388 with no
     * upscale and no clamp.
     */
    {
        name: 'banner-vai-wallet',
        out: 'payout/vai-wallet-banner.webp',
        url: `${CDN}/web/web-app/my-wallet/banner-vai-wallet.png`,
        box: { width: 540, height: 194 },
        scale: 2,
    },
    {
        name: 'lucky-wheel',
        out: 'campaign/lucky-wheel.webp',
        url: `${CDN}/web/web-app/campaign/lucky-wheel/img-lucky-wheel-banner.png`,
        /**
         * Square, like the donation icons and for the same reason: `PromoCard` renders the art with
         * `width={art.size} height={art.size}`, so the browser already squashes this 188×146 source
         * into a square. The re-encode reproduces what ships.
         */
        box: { width: 70, height: 70 },
        scale: 2,
    },
    {
        name: 'premium-banner',
        out: 'campaign/premium.webp',
        url: `${CDN}/web/web-app/campaign/premium/img-premium-banner.png`,
        box: { width: 90, height: 90 },
        scale: 2,
    },
    {
        name: 'login-banner',
        out: 'campaign/login.svg',
        url: `${CDN}/web/web-app/campaign/login/img-login-banner.svg`,
        mode: 'copy',
    },
    /*
     * The two QR sign-in steps: screenshots of the app's own Space, one showing which button to
     * press and one showing the menu item to pick. 260 KB + 184 KB of PNG at 814×661, drawn about
     * 184 wide each — so this is the ordinary raster case, and the optimiser would otherwise fetch
     * and decode 435 KB cross-origin on the sign-in screen itself.
     *
     * They are **instructions, not decoration**: without them the panel can only assert that a
     * "Scan QR code" item exists somewhere in the app. That is also why they are worth committing
     * rather than dropping — a broken CDN here does not degrade a screen, it removes the only
     * explanation of how to use it.
     */
    ...[1, 2].map(n => ({
        name: `scan-qr-step-${n}`,
        out: `auth/scan-qr-step-${n}.webp`,
        // `web-common`, not `web-app` — legacy's whole `auth` block hangs off the shared bucket.
        url: `${CDN}/web/web-common/auth/scan-qr-step-${n}.png`,
        /**
         * The widest column they are ever drawn in: `/login`'s 440 card, less its 32px padding and
         * the 8px gap, halved. The dialog is narrower and scales them down — which is why the box
         * is the *widest* case rather than an average, so neither placement upscales.
         *
         * Step 2's source is one pixel wider (815 against 814). Both are encoded to this box, so it
         * is squashed by a tenth of a percent; the alternative is two boxes and a grid whose columns
         * do not match.
         */
        box: { width: 184, height: 149 },
        scale: 2,
    })),
    {
        name: 'theo-membership',
        out: 'membership/theo.svg',
        url: `${CDN}/web/web-app/membership/theo-membership.svg`,
        mode: 'copy',
    },
    {
        name: 'membership-tier-bg',
        out: 'membership/tier-bg.webp',
        url: `${CDN}/home/bg-membership-checkout.png`,
        /**
         * A CSS `background-image`, so `next/image` never sees it — no optimisation, no AVIF, no
         * responsive widths. Encoded at the source's own 1098×273 rather than at a display box,
         * because `cover` on a card whose width is the dialog's has no fixed box to encode against.
         */
        box: { width: 1098, height: 273 },
        scale: 1,
    },
    {
        name: 'star-transfer-bg',
        out: 'star-transfer/balance-bg.webp',
        url: `${CDN}/web/web-app/star-transfer/bg.png`,
        /** A CSS `background-image` too — same reasoning, at its own 612×119. */
        box: { width: 612, height: 119 },
        scale: 1,
    },
    ...[
        // The two identity strips on the join dialog. Real vectors at 3.0 and 3.2 KB, so copies.
        ['important-chat', 'membership/live-chat.svg'],
        ['post-comments', 'membership/post-comments.svg'],
    ].map(([file, out]) => ({
        name: file,
        out,
        url: `${CDN}/web/web-app/membership/${file}.svg`,
        mode: 'copy',
    })),
    /*
     * The Premium mark and the backdrop behind it — `/premium`.
     *
     * The mark is the worst offender this script has met after `logo-gyf`: **2.53 MB** of SVG
     * wrapping a single 2126×2126 PNG, for a badge legacy draws at 100×100. The backdrop is the
     * same construction at 152 KB (a 1200×1238 raster behind a `<pattern>`), and it is a CSS
     * `background-image`, so `next/image` never sees it at all — no AVIF, no responsive width, the
     * browser downloads exactly those bytes.
     *
     * The mark's box is legacy's own 100×100 against a 113×123 source, i.e. legacy squashes it by
     * ten percent. Kept, like `identity-intro`'s five percent: this script changes bytes, not the
     * picture on the screen.
     */
    {
        name: 'premium-logo',
        out: 'premium/logo.webp',
        // `?v1` dropped: same bytes, and the query trips the decoder this is loaded through —
        // the same note `channel-suspended` above carries.
        url: `${CDN}/web/web-app/premium/logo-premium.svg`,
        box: { width: 100, height: 100 },
        // 3×, not 2: it is the screen's one hero mark and 300px still lands well under the source's
        // 2126 — the same call the 32px donation icons make, for the same DPR-3 phone.
        scale: 3,
    },
    {
        name: 'premium-backdrop',
        out: 'premium/backdrop.webp',
        url: `${CDN}/web/web-app/premium/bg-layer-premium.svg`,
        /**
         * At its own declared 628×576, `scale: 1` — a `background-image` with `contain` on a column
         * whose width is the viewport's has no fixed box to encode against, exactly as
         * `membership/tier-bg` and `star-transfer/balance-bg` document.
         */
        box: { width: 628, height: 576 },
        scale: 1,
    },
    /*
     * `/gift-premium`'s invitation — the picture over "Gift Premium, Share the Love", shown while
     * nothing has been typed into the recipient field.
     *
     * **1.05 MB** as published: a 1200×750 PNG for a block legacy draws at `width: '100%'` inside a
     * `maxWidth: 400px` column. Not an SVG-with-a-raster-inside like the two rows above it, so
     * `next/image` *would* have processed it — this is here for the other half of the cost every
     * raster row here is here for: the optimiser fetching and decoding a megabyte cross-origin on
     * the first request for each size and format, on the first screen of a purchase flow.
     */
    {
        name: 'gift-premium-invite',
        out: 'premium/gift-invite.webp',
        url: `${CDN}/web/web-app/gift-premium/img-no-result-found.png`,
        // 400 is the column's cap and 250 its 1200×750 aspect — the box the picker actually draws.
        box: { width: 400, height: 250 },
        scale: 2,
    },
    ...[1, 2, 3].map(n => ({
        name: `brand-logo-${n}`,
        out: `brand-assets/logo-${n}.svg`,
        url: `${CDN}/web/web-landing/brand-assets/logo-${n}.svg`,
        mode: 'copy',
    })),
]

/** The gift-code and star-transfer scripts' 0.85 — same kind of art, checked by eye at 2×. */
const QUALITY = 0.85

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`

/**
 * The widest the source can actually fill, so a `scale` bump can never invent pixels. Reads the PNG
 * IHDR — directly for a `.png`, or out of the single base64 payload when the "SVG" is a raster
 * wrapper. Returns `null` for a real vector, which has no ceiling.
 */
function rasterWidth(bytes) {
    const png = buffer => (buffer.subarray(0, 8).toString('binary') === '\x89PNG\r\n\x1a\n'
        ? buffer.readUInt32BE(16)
        : null)
    const direct = png(bytes)
    if (direct !== null) return direct

    const embedded = /base64,([A-Za-z0-9+/=]+)/.exec(bytes.toString('utf8'))
    return embedded ? png(Buffer.from(embedded[1], 'base64')) : null
}

function mimeOf(url, bytes) {
    if (url.endsWith('.svg')) return 'image/svg+xml'
    if (rasterWidth(bytes) !== null) return 'image/png'
    throw new Error(`${url}: cannot tell what this is — add a case here rather than guessing`)
}

async function main() {
    const only = process.argv.slice(2)
    const wanted = only.length ? SOURCES.filter(s => only.includes(s.name)) : SOURCES
    if (!wanted.length) {
        throw new Error(`no source named ${only.join(', ')} — have: ${SOURCES.map(s => s.name).join(', ')}`)
    }

    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto('about:blank')

    for (const source of wanted) {
        const file = join(ROOT, 'public/illustrations', source.out)
        await mkdir(dirname(file), { recursive: true })

        const response = await fetch(source.url)
        if (!response.ok) throw new Error(`${source.url} → ${response.status}`)
        const input = Buffer.from(await response.arrayBuffer())

        if (source.mode === 'copy') {
            await writeFile(file, input)
            console.log(`copied  ${source.out.padEnd(34)} ${kb(input.length)} (verbatim vector)`)
            continue
        }

        const ceiling = rasterWidth(input)
        const requested = source.box.width * source.scale
        const width = ceiling === null ? requested : Math.min(requested, ceiling)
        const height = Math.round((width * source.box.height) / source.box.width)
        if (width < requested) {
            console.log(`  ↳ ${source.name}: clamped ${requested} → ${width}px, the source's own resolution`)
        }

        const dataUrl = await page.evaluate(
            async ({ src, width, height, quality }) => {
                const img = new Image()
                img.width = width
                img.height = height
                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = () => reject(new Error('source failed to decode'))
                    // A data URI keeps the canvas untainted, so `toDataURL` may read it back.
                    img.src = src
                })
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                // No ground painted under it: every one of these is art on nothing, and a white
                // rectangle is exactly what would show up on the dark theme.
                canvas.getContext('2d').drawImage(img, 0, 0, width, height)
                return canvas.toDataURL('image/webp', quality)
            },
            {
                src: `data:${mimeOf(source.url, input)};base64,${input.toString('base64')}`,
                width,
                height,
                quality: QUALITY,
            },
        )

        if (!dataUrl.startsWith('data:image/webp')) {
            throw new Error(`${source.name}: Chromium did not encode WebP (got ${dataUrl.slice(0, 24)}…)`)
        }
        const output = Buffer.from(dataUrl.split(',')[1], 'base64')
        await writeFile(file, output)
        console.log(
            `wrote   ${source.out.padEnd(34)} ${width}×${height}, ${kb(output.length)} ` +
                `(source ${kb(input.length)}, ${(input.length / output.length).toFixed(0)}× smaller)`,
        )
    }

    await browser.close()

    // Read back, so a truncated write cannot pass silently.
    for (const source of wanted) {
        const data = await readFile(join(ROOT, 'public/illustrations', source.out))
        if (data.length < 512) {
            throw new Error(`${source.out} is ${data.length} bytes — that is not art`)
        }
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
