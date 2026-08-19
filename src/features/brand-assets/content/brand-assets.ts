import { env } from '@shared/config/env'

/**
 * The Tevi brand kit as data — ported from the legacy page
 * (`tevi-web-app/src/containers/brandAssets/`).
 *
 * Everything on `/brand-assets` is static: three lockup previews, nine button images, and
 * seven colours. None of it comes from the API, so it lives here rather than in a query,
 * and the copy that goes with it lives in `translation.json` under `brand_assets_*` keys —
 * only the *values* (hexes, file names, intrinsic sizes) are here. That split is what lets
 * the tables be translated without anyone editing a hex.
 *
 * ⚠ **The hexes are literals on purpose, and this is the one file where that is right.**
 * Everywhere else in the app a colour must be a semantic token (see `CLAUDE.md`), because
 * the Zinc and Primary ramps invert between light and dark. These are published brand
 * values: the whole point of the page is that `#501BC0` is the string a creator copies,
 * and a swatch that changed colour with the reader's theme would be documenting the theme
 * rather than the brand. Only Royal Indigo has a token twin (`--primary-500`, the one step
 * that does not invert); the marketing palette has none.
 */

/**
 * Preview artwork host — the same bucket path the legacy page used. The fallback is
 * legacy's production CDN so the previews still resolve when `NEXT_PUBLIC_STATIC_DOMAIN`
 * is unset (an `<Image>` with `undefined` in `src` throws at render time). Both hosts are
 * in `next.config.ts`'s `remotePatterns`, and the paths carry no query string —
 * `/_next/image` rejects one for these hosts.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

/** A downloadable archive served from `public/download/` — legacy's URLs, unchanged. */
export type BrandDownload = {
    /** Same-origin, so `<a download>` works without a proxy. */
    href: string
    /** File name the browser saves as, and the size shown next to the button. */
    file: string
    sizeKb: number
}

export const LOGO_PACK: BrandDownload = {
    href: '/download/logo_pack.zip',
    file: 'logo_pack.zip',
    sizeKb: 418,
}

export const BUTTON_PACK: BrandDownload = {
    href: '/download/buttons_support.zip',
    file: 'buttons_support.zip',
    sizeKb: 170,
}

/**
 * The three lockup sheets. Authored 634×440 with a **white background baked into the
 * artboard**, which is why the previews are framed on a pinned white tile rather than on
 * `--background-surface`: in dark mode the sheet would be a white rectangle floating on a
 * dark card either way, so the frame may as well admit it and stay consistent with the
 * button images, which are also drawn for light backgrounds.
 */
export type BrandLogoPreview = {
    id: string
    src: string
    width: number
    height: number
    /** `brand_assets_logo_*` — names the lockup, used as the caption and in the alt text. */
    labelKey: string
}

export const LOGO_PREVIEWS: BrandLogoPreview[] = [
    {
        id: 'vertical',
        src: `${STATIC_DOMAIN}/web/web-landing/brand-assets/logo-1.svg`,
        width: 634,
        height: 440,
        labelKey: 'brand_assets_logo_vertical',
    },
    {
        id: 'horizontal',
        src: `${STATIC_DOMAIN}/web/web-landing/brand-assets/logo-2.svg`,
        width: 634,
        height: 440,
        labelKey: 'brand_assets_logo_horizontal',
    },
    {
        id: 'symbol',
        src: `${STATIC_DOMAIN}/web/web-landing/brand-assets/logo-3.svg`,
        width: 634,
        height: 440,
        labelKey: 'brand_assets_logo_symbol',
    },
]

/** What is inside `logo_pack.zip`, as the legacy page describes it. */
export const LOGO_PACK_CONTENTS: { leadKey: string; textKey: string }[] = [
    {
        leadKey: 'brand_assets_logo_full_lockup',
        textKey: 'brand_assets_logo_full_lockup_desc',
    },
    {
        leadKey: 'brand_assets_logo_symbol_only',
        textKey: 'brand_assets_logo_symbol_only_desc',
    },
    { leadKey: 'brand_assets_logo_versions', textKey: 'brand_assets_logo_versions_desc' },
]

/**
 * The nine "Support me on Tevi" images, served from `public/brand-assets/buttons/` under
 * the names they carry **inside** `buttons_support.zip`, so the file a creator grabs one at
 * a time is byte-identical to the one in the pack.
 *
 * This is a deliberate departure from legacy, which drew nine approximations of these
 * images in the DOM — different geometry, no app mark, plain-text wordmark — so its
 * "Preview" showed something you could not actually download. These are the real files.
 *
 * `shape` is the aspect the file is drawn at (wide pill vs 3:2 badge), which is all the
 * grid needs to lay them out.
 */
export type BrandButtonAsset = {
    id: string
    file: string
    width: number
    height: number
    shape: 'button' | 'badge'
    /** `brand_assets_button_*` — the colour's name, shown as the caption. */
    labelKey: string
}

/**
 * ⚠ This is a `public/` directory whose first segment is also a route. Static files win over
 * routes in Next, so if `/brand-assets` ever grows a child route the segment `buttons` is
 * taken — `/brand-assets/button` (the tab) is fine, `/brand-assets/buttons` would be
 * shadowed by this folder and never reach the router.
 */
const BUTTON_DIR = '/brand-assets/buttons'

export const BUTTON_ASSETS: BrandButtonAsset[] = [
    {
        id: 'black',
        file: 'support_me_on_tevi_black.png',
        width: 1377,
        height: 347,
        shape: 'button',
        labelKey: 'brand_assets_button_black',
    },
    {
        id: 'white',
        file: 'support_me_on_tevi_white.png',
        width: 1377,
        height: 360,
        shape: 'button',
        labelKey: 'brand_assets_button_white',
    },
    {
        id: 'secure-blue',
        file: 'support_me_on_tevi_secure_blue.png',
        width: 1377,
        height: 347,
        shape: 'button',
        labelKey: 'brand_assets_color_secure_blue',
    },
    {
        id: 'live-coral',
        file: 'support_me_on_tevi_live_coral.png',
        width: 1377,
        height: 348,
        shape: 'button',
        labelKey: 'brand_assets_color_live_coral',
    },
    {
        id: 'paid-amber',
        file: 'support_me_on_tevi_paid_amber.png',
        width: 1377,
        height: 347,
        shape: 'button',
        labelKey: 'brand_assets_color_paid_amber',
    },
    {
        id: 'private-purple',
        file: 'support_me_on_tevi_private_purple.png',
        width: 1377,
        height: 347,
        shape: 'button',
        labelKey: 'brand_assets_color_private_purple',
    },
    {
        id: 'badge-purple',
        file: 'support_me_on_tevi_badge_purple.png',
        width: 735,
        height: 480,
        shape: 'badge',
        labelKey: 'brand_assets_button_badge_purple',
    },
    {
        id: 'badge-black',
        file: 'support_me_on_tevi_badge_black.png',
        width: 735,
        height: 479,
        shape: 'badge',
        labelKey: 'brand_assets_button_badge_black',
    },
    {
        id: 'badge-white',
        file: 'support_me_on_tevi_badge_white.png',
        width: 735,
        height: 480,
        shape: 'badge',
        labelKey: 'brand_assets_button_badge_white',
    },
]

export function buttonAssetUrl(asset: BrandButtonAsset): string {
    return `${BUTTON_DIR}/${asset.file}`
}

/** A published brand colour: swatch, the hex people copy, and the mood it carries. */
export type BrandColor = {
    id: string
    /** `brand_assets_color_*`. */
    nameKey: string
    /** `brand_assets_mood_*`. */
    moodKey: string
    /** Uppercase, six digits, `#`-prefixed — the exact string the copy button writes. */
    hex: string
}

/** The core palette. */
export const BRAND_COLORS: BrandColor[] = [
    {
        id: 'royal-indigo',
        nameKey: 'brand_assets_color_royal_indigo',
        moodKey: 'brand_assets_mood_royal_indigo',
        hex: '#501BC0',
    },
    {
        id: 'lavender-mist',
        nameKey: 'brand_assets_color_lavender_mist',
        moodKey: 'brand_assets_mood_lavender_mist',
        hex: '#FAF8FF',
    },
    {
        id: 'black',
        nameKey: 'brand_assets_color_black',
        moodKey: 'brand_assets_mood_black',
        hex: '#000000',
    },
]

/** The marketing palette — legacy's "Official Pairings". */
export const BRAND_PAIRINGS: BrandColor[] = [
    {
        id: 'secure-blue',
        nameKey: 'brand_assets_color_secure_blue',
        moodKey: 'brand_assets_mood_secure_blue',
        hex: '#70B7FF',
    },
    {
        id: 'live-coral',
        nameKey: 'brand_assets_color_live_coral',
        moodKey: 'brand_assets_mood_live_coral',
        hex: '#FF6868',
    },
    {
        id: 'paid-amber',
        nameKey: 'brand_assets_color_paid_amber',
        moodKey: 'brand_assets_mood_paid_amber',
        hex: '#FFC052',
    },
    {
        id: 'private-purple',
        nameKey: 'brand_assets_color_private_purple',
        moodKey: 'brand_assets_mood_private_purple',
        hex: '#8766E9',
    },
]
