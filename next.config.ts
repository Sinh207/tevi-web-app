import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    poweredByHeader: false,

    images: {
        remotePatterns: [
            new URL('https://storage.googleapis.com/**'),
            new URL('https://static.tevi.dev/**'),
            new URL('https://static.tevi.app/**'),
            new URL('https://static.tevi.com/**'),
            new URL('https://static.tevicdn.com/**'),
            new URL('https://static.cdn.flowstreamx.com/**'),
            new URL('https://img.tevi.app/**'),
            new URL('https://img.tevi.dev/**'),
            new URL('https://imge.tevi.app/**'),
            new URL('https://imge.tevicdn.com/**'),
            new URL('https://imge.cdn.flowstreamx.com/**'),
            new URL('https://tevi.com/**'),
            new URL('https://tevi.so/**'),
            new URL('https://tevi.dev/**'),
            new URL('https://tevi-cdn.tevi.dev/**'),
            new URL('https://tevi-cdn.tevi.app/**'),
            new URL('https://feed-stg.tevicdn.com/**'),
            new URL('https://lh3.googleusercontent.com/**'),
            new URL('https://platform-lookaside.fbsbx.com/**'),
        ],
        minimumCacheTTL: 2678400, // 31 days
        dangerouslyAllowSVG: true,
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
        ]
    },
}

// PWA (Serwist) uses a webpack config, which conflicts with Turbopack (Next 16
// default). Only wrap for production builds (run with `next build --webpack`);
// dev stays on Turbopack with no webpack config injected.
export default isDev
    ? nextConfig
    : withSerwistInit({
          swSrc: 'src/app/sw.ts',
          swDest: 'public/sw.js',
      })(nextConfig)
