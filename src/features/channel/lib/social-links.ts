import { env } from '@shared/config/env'
import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * Where a social platform's mark comes from.
 *
 * ## The design system ships no brand logos for an arbitrary platform
 *
 * Worth stating plainly, because the instinct is to look for one. The sprite carries **thirteen**
 * brand marks and no more; the platform list, by contrast, is **server-driven** — legacy fetches
 * `my-channel/social-links/supported-platforms/` to populate its editor, so the set can grow
 * without a front-end release. Twitch, Threads, Reddit, WhatsApp, Kick and Patreon are already
 * outside the sprite.
 *
 * So the CDN image is the source of truth and the sprite is a fast path for the brands it happens
 * to cover: no network request, correct weight, flips with the theme. A platform not in the table
 * falls through to the CDN, and a platform the CDN has never heard of falls through to
 * `next/image`'s own failure — which is why the mark is decorative there and the accessible name
 * lives on the surrounding link.
 */

/**
 * Sprite names for the thirteen brands the DS draws, keyed by the platform slug the API uses.
 *
 * ⚠ These are written as **literals**, not assembled as `` `${platform}-icon` ``. The sprite build
 * subsets the SVG by scanning source for icon names, and a name that only exists at runtime is
 * invisible to both of its passes — so a computed key would produce an empty square in production
 * and nowhere else. See `scripts/build-icon-sprite.mjs`.
 */
export const SOCIAL_ICON: Record<string, TeviIconName | undefined> = {
    discord: 'discord-icon',
    facebook: 'facebook-icon',
    github: 'github-icon',
    instagram: 'instagram-icon',
    linkedin: 'linkedin-icon',
    skype: 'skype-icon',
    snapchat: 'snapchat-icon',
    spotify: 'spotify-icon',
    telegram: 'telegram-icon',
    tiktok: 'tiktok-icon',
    x: 'x-icon',
    twitter: 'x-icon',
    youtube: 'youtube-icon',
}

/**
 * The two platforms that are not brands — a creator's own named link, and a plain website.
 *
 * ## They used to map to `globe-icon`, and that was the odd mark out three times over
 *
 * `globe-icon` belongs to the sprite's `*-icon` family, the thirteen **brand** marks, and it is the
 * only outlined one among them: in a socials row next to a solid Facebook mark it reads as a
 * different kind of thing. Meanwhile the header's own custom-link row drew `globe--filled`, so the
 * same `custom_link` appeared as a solid globe in the header and an outlined one in the About tab's
 * chips — and a `website` link sat beside the custom link in the header as an outline next to a
 * solid. One concept, two drawings, three placements.
 *
 * So they come out of the brand table entirely. They are not brands, and legacy agrees: it pulls
 * `custom_link` out of `social_links` before rendering the row and gives it its own solid
 * `icon-globe`. Every caller now asks this instead, and gets `globe` filled — which is both what
 * legacy draws and the weight the brand marks around it are drawn at.
 *
 * ⚠ The glyph is written as a literal at each call site rather than returned from here, because the
 * sprite build subsets by scanning source for literal `name` / `weight` pairs and would not see one
 * assembled in a helper. This function decides *whether*, the call site says *what*.
 */
export function isWebLink(platform: string | null | undefined): boolean {
    return platform === 'custom_link' || platform === 'website'
}

/**
 * The two nominal sizes a socials row needs, because it mixes two families of artwork that do not
 * fill their box to the same extent.
 *
 * Measured off the shipped sprite, all within `viewBox="0 0 24 24"`:
 *
 *   brand marks (`*-icon--regular`)   ink spans 2.4 → 21.6   = 80% of the box
 *   UI glyphs (`globe--filled`, …)    ink spans 0.2 → 23.8   = 98% of the box
 *
 * Nine of the sprite's twelve brand marks sit on exactly 2.4 → 21.6 — a deliberate 10% safe area,
 * which is what a logo is supposed to have — and the other three are within 0.6 of it. So this is
 * the sprite's convention, not a bad glyph: it only becomes a problem where the two families sit
 * **side by side at the same size**, which is a row the DS itself never draws (`__socials` in
 * `preview/space.html` is four globes) and therefore says nothing about.
 *
 * At one shared size the brand marks read visibly smaller. `brand / ui` is `23.5 / 19.2`, so these
 * two land within 2% of each other in actual ink:
 *
 *   globe at 20 → 19.6px          facebook at 24 → 19.2px
 *
 * ⚠ **They are a pair.** Flattening them to one number is the bug this exists to prevent, in either
 * direction. The CDN fallback takes `brand` too — those assets are platform logos and follow the
 * same convention.
 */
export const SOCIAL_MARK_SIZE = { brand: 24, ui: 20 } as const

/**
 * Legacy's CDN path for a platform mark, which is still the canonical source.
 *
 * `next.config.ts` already allow-lists both `STATIC_DOMAIN` values (`static.tevi.dev` and
 * `static.cdn.flowstreamx.com`), and `dangerouslyAllowSVG` is already on with `script-src 'none';
 * sandbox` — these assets are SVG, so both were needed before this feature and neither is being
 * loosened for it.
 */
export function socialMarkUrl(platform: string): string {
    const base = env.NEXT_PUBLIC_STATIC_DOMAIN ?? ''
    return `${base}/Images/ChannelSocialLink/svg/${encodeURIComponent(platform)}.svg`
}

/**
 * Hostnames that identify a platform, for the paste path.
 *
 * ## Why a table here and not a rule
 *
 * The platform *list* is server-driven (`supported-platforms/`), so this cannot be exhaustive and
 * is not trying to be: it recognises the hosts people actually paste and lets everything else fall
 * through to the generic link. A slug this map produces is only ever used when the server also
 * offers it — `detectPlatform` filters against the fetched list — so an entry for a platform the
 * backend has retired is inert rather than wrong.
 *
 * Keys are matched as the host **or a suffix of it** after `www.` is stripped, which is what makes
 * one entry cover `open.spotify.com` and `m.youtube.com` without listing either.
 */
const PLATFORM_HOSTS: Record<string, string> = {
    'discord.com': 'discord',
    'discord.gg': 'discord',
    'facebook.com': 'facebook',
    'fb.com': 'facebook',
    'github.com': 'github',
    'instagram.com': 'instagram',
    'kick.com': 'kick',
    'linkedin.com': 'linkedin',
    'patreon.com': 'patreon',
    'reddit.com': 'reddit',
    'skype.com': 'skype',
    'snapchat.com': 'snapchat',
    'spotify.com': 'spotify',
    't.me': 'telegram',
    'telegram.me': 'telegram',
    'telegram.org': 'telegram',
    'threads.com': 'threads',
    'threads.net': 'threads',
    'tiktok.com': 'tiktok',
    'twitch.tv': 'twitch',
    'twitter.com': 'x',
    'x.com': 'x',
    'wa.me': 'whatsapp',
    'whatsapp.com': 'whatsapp',
    'youtu.be': 'youtube',
    'youtube.com': 'youtube',
}

/**
 * The platform a URL points at, or `null` — used to re-tag a row when a link is pasted into it.
 *
 * People paste first and read the icon second: a row created as "X" that is handed a TikTok URL
 * will otherwise be saved as an X link with a TikTok address, and the space renders the wrong mark
 * to everyone. Detecting on paste is the difference between the form correcting itself and the
 * person having to notice.
 *
 * `available` is the fetched platform list. A detection that is not in it returns `null` rather
 * than a value the `<select>` cannot show — that would silently blank the picker.
 */
export function detectPlatform(url: string, available: string[]): string | null {
    let host: string
    try {
        host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
        return null
    }
    if (!host) return null

    for (const [pattern, platform] of Object.entries(PLATFORM_HOSTS)) {
        if (host === pattern || host.endsWith(`.${pattern}`)) {
            return available.includes(platform) ? platform : null
        }
    }
    return null
}

/**
 * Whether a platform may appear on more than one row.
 *
 * Two X links are a mistake in every case — the second one silently replaces the first in most
 * readers' minds and the profile shows the same mark twice. A **website** or a **custom link** is
 * the opposite: they are the generic slots, and having three of them (a shop, a newsletter, a
 * portfolio) is the normal way to use them.
 */
export function isRepeatablePlatform(platform: string): boolean {
    return isWebLink(platform)
}
