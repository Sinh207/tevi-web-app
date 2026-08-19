/**
 * iOS home-screen launch images.
 *
 * Android reads `background_color` out of the manifest and paints the splash itself
 * (`app/manifest.ts`). iOS does not: a standalone web app either declares a bitmap that matches
 * the device's exact pixel dimensions, or it launches to a white rectangle — including on a
 * device in dark mode. So this is a table of images rather than a colour, and the table has to
 * name every screen size it wants to cover, because iOS matches on the media query and falls
 * back to nothing.
 *
 * Two consequences worth knowing before adding to it:
 *
 * - **A missing size is silent.** An unmatched device just gets the white default, which is
 *   indistinguishable from not having shipped this at all. `startup-images.test.ts` asserts the
 *   files exist; nothing can assert the device list is complete.
 * - **It only applies to "Add to Home Screen".** In Safari proper these tags do nothing. This is
 *   a small audience, which is why the list is current iPhones and not every device since 2016 —
 *   an iPad or an older phone lands on the white default, and that is an accepted trade rather
 *   than an oversight.
 *
 * The images themselves come from `scripts/generate-brand-assets.mjs` and are committed. Keep the
 * device table there in step with this one — the test is what catches it if they drift.
 */

/** CSS pixel dimensions and scale factor of one iOS screen size class. */
export interface StartupDevice {
    width: number
    height: number
    ratio: number
    /** Which phones share the size class. Documentation only. */
    devices: string
}

export const STARTUP_DEVICES: StartupDevice[] = [
    { width: 375, height: 667, ratio: 2, devices: 'iPhone SE (2nd–3rd), 8' },
    { width: 390, height: 844, ratio: 3, devices: 'iPhone 12, 12 Pro, 13, 13 Pro, 14' },
    { width: 393, height: 852, ratio: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16' },
    { width: 402, height: 874, ratio: 3, devices: 'iPhone 16 Pro' },
    { width: 428, height: 926, ratio: 3, devices: 'iPhone 12–14 Pro Max / Plus' },
    { width: 430, height: 932, ratio: 3, devices: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
    { width: 440, height: 956, ratio: 3, devices: 'iPhone 16 Pro Max' },
]

export const STARTUP_SCHEMES = ['light', 'dark'] as const
export type StartupScheme = (typeof STARTUP_SCHEMES)[number]

/** Path under `public/`. The generator writes to exactly this name. */
export function startupImagePath(d: StartupDevice, scheme: StartupScheme): string {
    return `/icons/startup/${scheme}-${d.width}x${d.height}@${d.ratio}x.png`
}

/**
 * `<link rel="apple-touch-startup-image">` descriptors, in the shape Next's
 * `metadata.appleWebApp.startupImage` takes.
 *
 * The dark entry carries `prefers-color-scheme: dark` and the light one carries `light`
 * explicitly rather than being the bare fallback: iOS evaluates these in document order and
 * takes the last match, so an unqualified light entry after the dark one would win on every
 * device regardless of scheme.
 */
export const STARTUP_IMAGES = STARTUP_DEVICES.flatMap(d =>
    STARTUP_SCHEMES.map(scheme => ({
        url: startupImagePath(d, scheme),
        media: [
            `(device-width: ${d.width}px)`,
            `(device-height: ${d.height}px)`,
            `(-webkit-device-pixel-ratio: ${d.ratio})`,
            `(prefers-color-scheme: ${scheme})`,
        ].join(' and '),
    })),
)
