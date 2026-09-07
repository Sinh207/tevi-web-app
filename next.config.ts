import type { NextConfig } from 'next'
import { version } from './package.json'

const nextConfig: NextConfig = {
    output: 'standalone',

    /**
     * The drawer's "About version" row reads this. Inlined here from package.json
     * rather than declared in `shared/config/env.ts` because it is a build constant,
     * not deployment configuration — there is nothing for an operator to set.
     */
    env: { NEXT_PUBLIC_APP_VERSION: version },
    reactStrictMode: true,
    poweredByHeader: false,

    experimental: {
        /**
         * **Turbopack's persistent dev store, and the reason it needs a switch.**
         *
         * Next 16 defaults this to `true` (`config-shared.js`), which is why `next dev` writes
         * `.next/dev/cache/turbopack/v<version>/` — an append-only stream of ~250 MB `.sst`
         * segments. It buys a warm restart, and it is unbounded *within* a session: an edited
         * module appends rather than overwrites and nothing compacts, so one ~9-hour session
         * measured **6.9 GB across 638 files**. That is growth by keystroke, not by app size.
         *
         * Left as a default it has no lever, so it gets one. `NEXT_DEV_DISK_CACHE=0 pnpm dev`
         * keeps the whole graph in memory: nothing accumulates on disk, and every cold start
         * recompiles from scratch. Managing the store rather than giving it up is
         * `scripts/dev-cache.mjs` (`pnpm cache`, `pnpm cache:clean`), which `pnpm dev` runs as a
         * preflight and which will not delete a store a live dev server is holding — several
         * sessions share this working tree.
         *
         * Read at module scope on purpose: this file runs in Node, so it is a real env read, not
         * one of the `NEXT_PUBLIC_*` values `shared/config/env.ts` validates and Next inlines.
         */
        turbopackFileSystemCacheForDev: process.env.NEXT_DEV_DISK_CACHE !== '0',

        /**
         * A **target** for turbo-tasks' in-memory graph, in bytes — the RAM half of the same
         * problem (`next-server` was resident at 2.3 GB alongside the store above). Unset by
         * default because a limit below what a compile actually needs trades disk for thrashing;
         * set `NEXT_DEV_MEMORY_LIMIT_GB=3` when the machine, not the disk, is what is full.
         */
        ...(process.env.NEXT_DEV_MEMORY_LIMIT_GB
            ? {
                  turbopackMemoryLimit: Number(process.env.NEXT_DEV_MEMORY_LIMIT_GB) * 1024 ** 3,
              }
            : {}),
    },

    images: {
        /**
         * `75` is Next's default and the only one anything asks for — **plus `10`**, which
         * `ChannelCover` requests for a sensitive space's blurred cover.
         *
         * Next 16 requires every quality to be declared here; an undeclared one is silently served at
         * the default and logs a warning to the browser console. That default is exactly what must not
         * happen in that one case: the point of asking for 10 is that the withheld art reaches the
         * browser as a smudge, so a full-quality image under a CSS blur is one devtools toggle away
         * from being the content it is meant to withhold.
         */
        qualities: [10, 75],
        remotePatterns: [
            new URL('https://storage.googleapis.com/**'),
            new URL('https://static.tevi.dev/**'),
            new URL('https://static.tevi.app/**'),
            new URL('https://static.tevi.com/**'),
            /**
             * **Every subdomain of the CDN domain Tevi owns**, rather than a list of
             * the ones someone happened to hit — `static.`, `imge.`, `feed-stg.`,
             * `static.stg.`, and whatever the next environment is called.
             *
             * Enumerating them is what broke: a staging avatar from
             * `static.stg.tevicdn.com` threw in dev and 400s out of the optimizer in
             * production, because the list carried `static.` and `feed-stg.` but not
             * that one. The failure is invisible until a real profile picture exists,
             * which is why it survived to the first screen that rendered one.
             *
             * Not a loosening: `**` matches any number of labels *below* the domain
             * and nothing beside it — `evil-tevicdn.com` and `tevicdn.com.evil.io`
             * both fail the match (verified against the picomatch Next compiles in).
             */
            { protocol: 'https', hostname: '**.tevicdn.com', pathname: '/**' },
            /**
             * **The avatar CDN the backend actually serves user pictures from** — a real
             * `channel.images.thumb` is
             * `https://p16.topbuzzcdn.com/img/user-avatar-alisg/<id>~1200x0.image`.
             *
             * Wildcarded for the same reason `**.tevicdn.com` above is, only more so: this is a
             * sharded image CDN, so the host is `p1.` … `p26.` and the signed variants
             * (`p16-sign-sg.`) besides. Which shard answers for a given upload is not something
             * this client picks or can predict, so a list of the ones somebody happened to hit is
             * a list that breaks on the next avatar.
             *
             * ## Why it was missing, and why legacy is not evidence that it should be
             *
             * Legacy's `remotePatterns` does not carry it either — **and never had to**: that app
             * sets `images.unoptimized: true`, which bypasses the optimizer entirely, and Next does
             * not validate hostnames for an unoptimized image. So its list was never enforced and
             * is not a survey of what the backend serves; it is a survey of what somebody typed.
             * This app optimizes, so every host is checked, and an unchecked one **throws** rather
             * than degrading — one unexpected avatar host takes the whole screen down in dev and
             * 400s out of the optimizer in production. That is the shape of this bug: it stays
             * invisible until a screen renders a real profile picture, which `/following` was the
             * first to do.
             *
             * Not a loosening. `**` matches labels *below* the domain and nothing beside it, so
             * `eviltopbuzzcdn.com`, `evil-topbuzzcdn.com` and `topbuzzcdn.com.evil.io` all fail —
             * verified against the picomatch Next compiles in, and pinned in
             * `shared/config/image-hosts.test.ts` along with the shard shapes that must match. It
             * is also narrower than `storage.googleapis.com/**` two entries up, which is every
             * bucket Google hosts.
             */
            { protocol: 'https', hostname: '**.topbuzzcdn.com', pathname: '/**' },
            new URL('https://static.cdn.flowstreamx.com/**'),
            new URL('https://img.tevi.app/**'),
            new URL('https://img.tevi.dev/**'),
            new URL('https://imge.tevi.app/**'),
            new URL('https://imge.cdn.flowstreamx.com/**'),
            new URL('https://tevi.com/**'),
            new URL('https://tevi.so/**'),
            new URL('https://tevi.dev/**'),
            new URL('https://tevi-cdn.tevi.dev/**'),
            new URL('https://tevi-cdn.tevi.app/**'),
            new URL('https://lh3.googleusercontent.com/**'),
            new URL('https://platform-lookaside.fbsbx.com/**'),
            /**
             * **TEMPORARY: every https host.** The named entries above stay — they are the
             * observed inventory and the record of what actually broke — but the list kept
             * losing the race against the backend: `graph.facebook.com` (the Facebook sign-in
             * avatar, which is a *redirect* to `scontent-*.fbcdn.net`) was only the latest host
             * to surface the day a screen first rendered one. An unlisted host does not degrade,
             * it throws in dev and 400s in production, so each miss is a broken screen found by
             * a user rather than by a build.
             *
             * What this gives up, stated plainly so removing it later is an informed choice:
             *   - the optimizer becomes an **open image proxy** — anyone can make our origin
             *     fetch and re-serve any https URL, on our bandwidth and from our IP;
             *   - `dangerouslyAllowSVG` now applies to documents from *any* host. The three
             *     guards under it (`script-src 'none'`, `sandbox`, `Content-Disposition:
             *     attachment`) are what keep that from executing as us — they were already
             *     load-bearing next to `storage.googleapis.com/**`, and they are the only thing
             *     standing here. Do not drop one.
             *
             * `http` is still refused: the protocol is pinned, so the optimizer can never fetch
             * in clear text and re-serve it under our own HTTPS response.
             *
             * To take it back out: collect the hosts from real payloads (`channel.images.*`,
             * post media, provider avatars), add them as named entries with their observed URL in
             * `shared/config/image-hosts.test.ts`, then delete this entry — the refusal tests in
             * that file un-skip themselves once it is gone.
             */
            { protocol: 'https', hostname: '**', pathname: '/**' },
        ],
        minimumCacheTTL: 2678400, // 31 days

        /**
         * `next/image` refuses an SVG outright without this — **including one of our own**, and
         * most of what needs it now is ours: the committed vectors under `public/illustrations/`
         * (brand lockups, the card-scheme strip, the membership tiles). The flag does not make
         * them smaller; it passes them through. That is the whole reason `docs/STATIC_ASSETS.md`
         * treats a *remote* SVG as a download rather than an optimisation.
         *
         * The remaining third-party case is `socialMarkUrl()` in `features/channel`, whose platform
         * list is server-driven and therefore cannot be committed.
         *
         * The two guards under this are not ceremony. An SVG is a document: it can carry `<script>`
         * and `<foreignObject>`, and served inline from our own origin it would run **as us**.
         * `remotePatterns` below is wide enough that this matters — `storage.googleapis.com/**` is
         * every bucket Google hosts, not just ours.
         */
        dangerouslyAllowSVG: true,
        /** Neuters any script inside a passed-through SVG. */
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
        /** Downloaded rather than rendered in place, so it can never execute same-origin. */
        contentDispositionType: 'attachment',
        formats: ['image/avif', 'image/webp'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    },

    async redirects() {
        return [{ source: '/home', destination: '/', permanent: false }]
    },

    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
                ],
            },
            {
                /**
                 * The committed artwork (`public/illustrations/`, built by `scripts/build-cdn-art.mjs`
                 * and its siblings). Without this it inherits `public/`'s default
                 * `Cache-Control: public, max-age=0` and costs a revalidation round-trip **every
                 * navigation** — verified with `curl -sI`, not assumed.
                 *
                 * Which files that actually bites is worth being precise about, because most of this
                 * folder is invisible to it: anything drawn with `<Image>` is fetched by the
                 * *optimizer*, server-side, and the browser gets `/_next/image` output under
                 * `minimumCacheTTL` instead. The ones the browser fetches by this path are the CSS
                 * backdrops (`membership/tier-bg.webp`, `star-transfer/balance-bg.webp`,
                 * `create-space-bg.webp`) and the `unoptimized` checkout animations — the largest
                 * files here, on the screen where the network is already busy taking money.
                 *
                 * **A day, not a year, and no `immutable`** — unlike the sprite below, these names
                 * carry no content hash, so a rebuild republishes the same path with new bytes.
                 * `immutable` would strand a stale illustration in every browser that had seen it.
                 * `stale-while-revalidate` keeps the repeat visit instant without that: the stale
                 * copy paints while the fresh one is fetched in the background.
                 */
                source: '/illustrations/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=86400, stale-while-revalidate=604800',
                    },
                ],
            },
            {
                // The icon sprite is content-hashed by scripts/build-icon-sprite.mjs,
                // so a change ships under a new name. Without this it inherits
                // `public/`'s default `max-age=0` and costs a revalidation
                // round-trip on every navigation — a visible delay on mobile,
                // since no icon paints until the sprite arrives.
                source: '/tevi-icons.:hash([a-f0-9]+).svg',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
        ]
    },
}

export default nextConfig
