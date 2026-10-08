# Static art — the rule, the pipeline, and the runbook

> **Rule: `src/` must not point a static image at another host.** Every illustration, banner,
> backdrop and brand mark is committed under `public/illustrations/`, built by
> `scripts/build-cdn-art.mjs`. Before opening a PR that touches art: `pnpm art:audit`
> (exits 1 while any URL is left).

## 1. The rule, and why it is "banned outright" rather than "measured against a budget"

This started life as a byte budget: remote SVG ≤ 20 KB, remote raster ≤ 300 KB at origin. It caught
the elephants (a **2.27 MB** `.svg` drawing a 64px tile), but **three kinds slipped through**, and
all three slipped for the same reason — size is not the only question:

1. **`next/image` does not process a remote SVG.** It passes it through. `dangerouslyAllowSVG` in
   `next.config.ts` is permission *to serve* (which is why the `script-src 'none'; sandbox` CSP sits
   below it — an SVG is a document, and it can run script), **not** permission to optimise.
   `width`/`height` on `<Image>` do not change a single byte.
2. **A CSS `background-image` is never seen by the optimiser.** No AVIF, no responsive width — the
   browser downloads exactly that file. Two assets sat untouched for months on precisely the
   reasoning "19 KB, already the right size".
3. **Small is not local.** The last two CDN references in `features/membership` were 3.0 KB and
   3.2 KB: measured, under budget, reported "ok". They were still a third party standing between a
   rendering screen and its image — one that can change the file's contents between review and
   deploy, with nobody seeing it in the diff.

So the rule is binary now, and it answers all three: **a rendering screen depends on no other
host.** An asset in the repo has the commit that landed it as its version — reviewable, revertable,
no cache-buster needed (`?v5` disappears along with the URL).

The trade: the repo grows by ~640 KB, and updating art is a commit rather than an upload. That is
the price, and it is worth it.

**The one exception — images composed at runtime.** Not artwork but *content*: the URL is the
backend's decision, the set is open-ended, and it cannot be committed. There is exactly one today:
`socialMarkUrl()` in `features/channel` (the platform list comes from the server). Avatars, covers
and post/space thumbnails are the same kind — they go through `remotePatterns` and are not what this
doc is about.

## 2. Choosing how to handle an asset

```
asset to bring into public/
├─ .svg with `base64,` inside?  → raster in vector clothing → RE-ENCODE to WebP
├─ genuine vector .svg?         → COPY verbatim (rasterising blurs it at the DPR people read it at)
└─ raster (.png/.jpg)           → RE-ENCODE to WebP at 2× the CSS box actually drawn
   └─ used as a CSS background? → RE-ENCODE at the source resolution
                                  (a cover has no fixed box to key off)
```

The script **clamps** down to the source resolution, so `box × scale` never upscales. If the source
is 1× to begin with (e.g. `no-tvs-transactions.png`, 226×256 for a 225×256 box), declare `scale: 1`
explicitly rather than letting the clamp silently swallow a 2 that was never achievable.

⚠ **Never redraw.** Every output is Brand's exact pixels, rasterised through Chromium. No colour
change, no substitute shape, no near-enough sprite glyph — [`CLAUDE.md`](../CLAUDE.md) forbids it,
and the reason is that an "almost right" picture is still read as information.

⚠ **Keep legacy's distortions too.** `identification/intro` declares a 300×190 box while the source
is 1093×728 (i.e. 300×200) — legacy squashes it by 5%. Four donation icons are forced square by
`width={size} height={size}` even though the viewBox is 16×17. The re-encode keeps both: this
pipeline changes **bytes**, not what people see.

## 3. Runbook

### Adding a new asset

```bash
curl -sI 'https://static.tevi.dev/<path>'    # does it still exist, how many bytes
```

1. Add a row to `SOURCES` in [`scripts/build-cdn-art.mjs`](../scripts/build-cdn-art.mjs):
   ```js
   {
       name: 'identity-intro',                              // name for building it alone
       out: 'identification/intro.webp',                    // → public/illustrations/…
       url: `${CDN}/web/web-app/identification/identification-center.png`,
       box: { width: 300, height: 190 },                    // the CSS box the app really draws
       scale: 2,                                            // the DPR ceiling worth paying for
   }
   ```
   For a genuine vector, replace `box`/`scale` with `mode: 'copy'`.
2. `pnpm art:cdn <name>`.
3. Point the feature's `illustrations.ts` at `/illustrations/<out>`, keeping the declared
   `width`/`height`.
4. Add an assertion to the feature's `illustrations.test.ts` with `committedArt()`
   ([`src/shared/lib/committed-art.ts`](../src/shared/lib/committed-art.ts)) — it checks magic bytes,
   so it catches both a file committed in the wrong format and a truncated one.
5. `pnpm art:audit` must be clean.
6. **Commit the file in `public/` as well.** Generated-but-committed, like the icon sprite: the input
   is a URL that can change under your feet, and a reviewer has to see exactly what is being served.

### Cache headers

`public/` defaults to `Cache-Control: public, max-age=0`, so every navigation costs a revalidation
round-trip. `next.config.ts` gives `/illustrations/:path*`:

```
public, max-age=86400, stale-while-revalidate=604800
```

**A day, and no `immutable`** — unlike the icon sprite, whose name carries a content hash and can
therefore be cached for a year, these names do not, so a rebuild republishes **the same path with
different bytes**. `immutable` would strand a stale illustration in every browser that had seen it.

Which files this actually helps is narrower than it looks, and worth stating: anything drawn with
`<Image>` is fetched by the **optimizer**, server-side, and the browser gets `/_next/image` output
under its own `minimumCacheTTL`. The ones the browser fetches by this path are the CSS backdrops
(`membership/tier-bg.webp`, `star-transfer/balance-bg.webp`, `create-space-bg.webp`) and the
`unoptimized` checkout animations — the largest files here, on the screen where the network is
already busy taking money.

### The commands

| command | what it does |
|---|---|
| `pnpm art:audit` | scans `src/`, fails on any remote image URL. Needs no network when clean |
| `pnpm art:audit --all` | also lists the URLs composed at runtime (the kind that cannot be committed) |
| `pnpm art:cdn [name…]` | rebuild `public/illustrations/` from `SOURCES` |
| `pnpm art:gift-code` / `art:star-transfer` | the two pre-existing per-feature scripts |
| `pnpm art:payment` | GIF → shippable asset. **Needs `ffmpeg`**, so it is not part of `pnpm art` |
| `pnpm art` | runs `art:cdn` + `art:gift-code` + `art:star-transfer` |

> ⚠ After rebuilding art, `rm -rf .next/dev/cache/images`. `minimumCacheTTL` is 31 days and the
> optimiser caches by URL + width + quality, **not by mtime** — a running dev server keeps serving
> the old encode and says nothing, so it looks as if the script did nothing.

### Reading the audit output

```
FAIL   https://static.tevi.dev/home/bg-membership-checkout.png
       13.6 KB at origin — static art must be committed, not fetched
       src/features/membership/lib/illustrations.ts
```

Fix it with `build-cdn-art.mjs`, not by loosening the rule. `WARN` is a URL the script could not
resolve (composed at runtime) — it does not fail the build, but it **needs a decision, not a shrug**:
either it really is backend-decided content, or it is artwork written in a roundabout way.

### What the audit does not scan

Two exemptions, both narrow, both written in `audit-cdn-art.mjs` beside the code:

- **`*.test.tsx` / `*.spec.tsx`** — an `illustrations.test.ts` names the CDN paths it *replaced*, so
  scanning it reports art nothing renders.
- **`src/app/(web)/dev/**`** — the harnesses. The rule is about a third party standing between *a
  rendering screen* and its picture, and a `/dev/*` page is not one: it `notFound()`s in production
  (so on staging too) and `proxy.ts` blocks the namespace. `check-testids.mjs` skips the same tree for
  the same reason.

  The two references this unblocked are also the two where committing a file would be *wrong* rather
  than merely unnecessary. `dev/payout/fixtures.ts` stands in for `payout_method.logo_url`, a
  backend-decided URL and the sanctioned exception to this whole rule — a local copy would make the
  fixture less faithful than the remote one, since the real row does load a remote mark.
  `dev/get-star/preview.tsx` previews a card-brand glyph the sprite does not have, where the real row
  prints `Visa ···· 4242` as text (`docs/PAYMENT.md` §8); committing brand art for a row that renders
  none would put a Visa logo in the repo on nobody's behalf.

  ⚠ **Not a loophole for a real screen.** A path copied out of a fixture into `src/features/**` is
  still caught there — verified by planting one. If a `/dev/*` page ever becomes reachable in
  production, this exemption goes with it.

`UNUSED` is the other direction — a file in `public/illustrations/` that no source names. Moving art
into the repo turns a stale CDN path into a stale **file**, and a dead file is invisible in a way a
broken URL is not: it costs a clone and a deploy forever and no screen ever misses it. It does not
fail the build either — a screen still being built has a legitimate reason to have its art land
first. Matched on the file *name*, not the full path, because several features compose the path from
a base (`checkout-status-dialog.tsx` has `const ART_BASE = '/illustrations/payment'`); a full-path
match reports five false orphans on that feature alone.

## 4. Current state

`src/` **no longer references any static image on `static.tevi.dev` /
`static.cdn.flowstreamx.com`.** In total **~21.6 MB → ~1.0 MB** committed into the repo. The table
below is the figures at conversion time; for the current ones run
`du -sh public/illustrations` (the checkout art is being changed on another branch).

| feature | asset | before | after | how |
|---|---|---|---|---|
| auth | `scan-qr-step-{1,2}.webp` | 435 KB (2 png) | 25 KB | re-encode (the only art here that is **instructions** — see below) |
| campaign | `grow-your-fans.webp` | 2.27 MB (svg) | 4.7 KB | re-encode |
| campaign | `lucky-wheel.webp` | 32 KB | 4.9 KB | re-encode |
| campaign | `premium.webp` | 25 KB | 6.2 KB | re-encode |
| campaign | `login.svg` | 5.8 KB | 5.8 KB | copy |
| donation | `coffee/pizza/book/rose.webp` | 87 KB (4 svg) | 14 KB | re-encode |
| donation | `success.webp` | 186 KB | 29 KB | re-encode |
| identification | `intro/pending/verified.webp` | 4.17 MB (3 png) | 155 KB | re-encode |
| membership | `theo.svg`, `live-chat.svg`, `post-comments.svg` | 14 KB (3 svg) | 14 KB | copy |
| membership | `tier-bg.webp` | 13.6 KB (CSS bg) | 3.0 KB | re-encode |
| my-star | `empty.webp` | 26 KB | 10 KB | re-encode (1×, that is all the source has) |
| my-wallet | `empty.webp` | 119 KB | 26 KB | re-encode |
| payment | `no-cards.webp` | 70 KB | 25 KB | re-encode (clamped to the source's 341px) |
| payment | `card-schemes.svg` | 45 KB | 45 KB | copy |
| star-transfer | `balance-bg.webp` | 20 KB (CSS bg) | 3.1 KB | re-encode |
| star-transfer | `access-denied/success.webp` | 4.15 MB (2 svg) | 42 KB | re-encode |
| brand-assets | `logo-{1,2,3}.svg` | 8.5 KB | 8.5 KB | copy |
| gift-code | `banner` + 2 `result.webp` | 3.9 MB (3 svg) | 71 KB | re-encode |
| channel | `no-blocked-accounts.png`, `no-live-events.png` | 5.2 MB (2 svg) | 141 KB | re-encode |
| post | `collection/empty.webp` | 2.5 MB (svg) | 23.6 KB | re-encode (the collections list's empty state) |
| post | `collection/no-posts.svg` | 9.1 KB | 9.1 KB | copy (an empty collection) |
| channel | `no-follow-requests.webp` | 69 KB (png) | 21 KB | re-encode (a real 2× png — committed for the cold-cache cost, not to rescue a format) |
| channel | `add-home-screen.webp` | 17.6 KB (jpeg) | 2.3 KB | re-encode (**the only jpeg source** — `mimeOf` used to throw on one; box keeps the source's aspect because an overlay is positioned as a percentage of it) |
| earnings / membership / star-transfer | `theo-search.svg` (one shared file) | 9 KB | 9 KB | copy |
| payment | checkout status art | 1.45 MB (3 gif) | ~144 KB | `art:payment` (white background keyed → alpha) |
| SEO | `brand/og-default.jpg` | 431 KB (png) | 19 KB | re-encode to **JPEG**, cropped 1.91:1 — the default `og:image`, read by unfurlers rather than browsers, so the one output that is not WebP (`shared/config/seo.ts`) |

⚠ **The two auth rows are the one case where "committed" is not just about bytes.** Every other
asset here can 404 and leave a screen that is plainer but still works. `scan-qr-step-{1,2}` are the
only place the app says *where* the scanner lives in the mobile app — lose them and the QR sign-in
panel keeps its code and loses its explanation. `features/auth/lib/illustrations.ts` says the same
thing next to the art, and `illustrations.test.ts` is what fails if either file goes missing.

Dev pages (`/dev/*`, `notFound()` in production) use `/campaign/affiliate-logo.png` as a placeholder
avatar — it was a CDN URL before, and keeping it purely to create an audit exception was not worth it.

## 5. Fonts

Not illustrations, but the same shape of problem and the same answer, so it belongs here rather than
being rediscovered later.

`next/font/local` **self-hosts whatever file it is handed and does not convert** — the format in
`shared/config/fonts.ts` is the format every visitor downloads, exactly as `next/image` passing an
SVG through means the SVG's bytes are the bytes on the wire. `font-brand` renders on the splash
screen, so "every visitor" is literal.

| | bytes |
|---|---|
| `Chella-Bold.ttf`, raw | 374 KB |
| the same, gzipped by the server | 123 KB |
| **`Chella-Bold.woff2`** | **70 KB** |

Plus 711 KB removed: Brand ships ExtraBold (800) and Black (900), and the DS type scale is
400/500/600/700 — no `.type-*` utility sets either, and `CLAUDE.md` forbids setting `font-weight` by
hand, so no conforming markup could ever request them.

`pnpm fonts` rebuilds from `design-system/fonts/` (not served, like the sprite's source);
`src/shared/config/fonts.test.ts` fails if a `.ttf` is committed back into `public/fonts/` or a
weight reappears without the DS growing one.

## 6. Traps already stepped in

- **File extensions lie.** `theo-search.svg` at 9 KB is a genuine vector; `logo-gyf.svg` at 3 MB is
  an 1800×2400 PNG. Both live in the same directory tree. Only `curl` tells them apart.
- **`dangerouslyAllowSVG` sounds like an optimisation switch.** It is not.
- **A byte budget gives a false sense of safety.** See §1 — three kinds slipped through.
- **The dev server caches the encoded image**, and warns about nothing.
  `rm -rf .next/dev/cache/images`.
- **Small assets get reported "ok" and then hidden from the output.** That is exactly how the two
  membership files survived the first pass. `--all` now lists everything, and the rule no longer
  depends on size.
