import type { MetadataRoute } from 'next'

/**
 * The parts of a web app manifest that are the **platform's**, not one app's.
 *
 * This app serves more than one manifest: `app/manifest.ts` is the site's, and every creator's
 * space serves its own at `/@{slug}/manifest.webmanifest` so that installing a space gives you
 * *that* space's name and picture on your home screen. What differs between them is identity —
 * name, description, start URL, icons. What must never differ is everything below, and a second
 * literal is how it eventually would.
 */

/**
 * Display mode and the two colours the OS paints before any CSS of ours can run.
 *
 * `background_color` is the installed app's splash: the platform paints it behind `icons[512]`
 * before the document exists, so it is the one splash colour no CSS can reach. `--zinc-100`,
 * i.e. `--background` at `:root` — the same fill `shared/components/splash.tsx` uses, so the OS
 * splash hands over to the web one without a step.
 *
 * A manifest has exactly one value for it and cannot follow `prefers-color-scheme`, so this is a
 * choice between the two modes rather than a token: light is the `:root` branch and the
 * majority. A dark-mode install therefore gets one light frame — which is still better than the
 * inverse, where every light install flashed black. It did until this was set.
 *
 * `theme_color` is `--primary-500`, the one ramp step that does not invert between modes, and it
 * matches the `themeColor` in `app/layout.tsx`'s viewport.
 */
export const WEB_MANIFEST_SHELL = {
    display: 'standalone',
    background_color: '#f4f4f5',
    theme_color: '#501BC0',
} as const

/**
 * Tevi's own icons — generated from `design-system/tevi-logo.svg` by
 * `scripts/generate-brand-assets.mjs` and committed. The `maskable` entry is a separate
 * full-bleed render, not a resize: Android crops the outer 20%.
 *
 * A function rather than a constant because `MetadataRoute.Manifest['icons']` is a mutable array
 * type, and handing the same array object to two manifests would let one of them mutate the
 * other's. `app/manifest.test.ts` asserts every `src` exists on disk.
 */
export function brandManifestIcons(): NonNullable<MetadataRoute.Manifest['icons']> {
    return [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
        },
    ]
}
