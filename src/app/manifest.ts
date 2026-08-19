import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Tevi',
        short_name: 'Tevi',
        description: 'A monetization platform for content creators.',
        start_url: '/',
        display: 'standalone',
        // The installed app's splash: the platform paints this behind `icons[512]` before the
        // document exists, so it is the one splash colour no CSS can reach. `--zinc-100`, i.e.
        // `--background` at `:root` — the same fill `shared/components/splash.tsx` uses, so the
        // OS splash hands over to the web one without a step.
        //
        // A manifest has exactly one value and cannot follow `prefers-color-scheme`, so this is
        // a choice between the two modes rather than a token: light is the `:root` branch and
        // the majority. A dark-mode install therefore gets one light frame — which is still
        // better than the inverse, where every light install flashed black. It did until now.
        background_color: '#f4f4f5',
        theme_color: '#501BC0',
        // Generated from design-system/tevi-logo.svg by
        // scripts/generate-brand-assets.mjs. The `maskable` entry is a separate
        // full-bleed render, not a resize — Android crops the outer 20%.
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
                src: '/icons/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    }
}
