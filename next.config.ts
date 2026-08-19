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

    images: {
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
        ],
        minimumCacheTTL: 2678400, // 31 days

        /**
         * The brand-asset lockups are authored as SVG on the CDN
         * (`features/brand-assets/content/brand-assets.ts`), so the optimizer has to pass
         * them through — hence the flag, and hence the two guards under it.
         *
         * An SVG is a document: it can carry `<script>` and `<foreignObject>`, and served
         * inline from our own origin it would run **as us**. `remotePatterns` below is
         * wide enough that this matters — `storage.googleapis.com/**` is every bucket
         * Google hosts, not just ours.
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
