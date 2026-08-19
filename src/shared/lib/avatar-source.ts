/**
 * What to render inside an avatar: a still, and — for Premium accounts only — a clip.
 *
 * This is a pure resolver rather than logic inside `<AnimatedAvatar>` because the rule it
 * encodes is a **business** rule, not a rendering detail, and legacy proves what happens
 * when it lives at the call site: `avatar_video` is read in more than twenty components
 * (post cards, four comment variants, quote posts, the nav bar's own avatar, membership,
 * the share sheet, conversation lists…), and every one of them has to remember that a
 * non-Premium account's clip must not play. One of them eventually won't.
 *
 * The input is **structural** on purpose. `shared/` may not import from `features/`, so
 * this cannot take a `Channel` or an `AccountUser`; it takes the three fields it needs and
 * lets each feature narrow its own DTO down to them.
 */

/** `images.avatar_video` as the API returns it. Every field is optional in practice. */
export interface AvatarVideoInput {
    playback?: { url?: string | null } | null
    thumbnail?: string | null
    /** Present in the payload, unused here — the element sizes to the avatar's box. */
    duration_seconds?: number | null
}

export interface AvatarSourceInput {
    /** The ordinary avatar image, e.g. `images.thumb` or `avatar.thumb`. */
    thumb?: string | null
    avatarVideo?: AvatarVideoInput | null
    /** Animated avatars are Premium-only. See `videoSrc` below. */
    isPremium?: boolean
}

export interface AvatarSource {
    /**
     * The still to render — server-side, and as the `<video>`'s poster. `null` hands over
     * to the DS Avatar's own `initials` / `placeholder` types.
     */
    poster: string | null
    /** `null` means never render a `<video>` at all — not "render a paused one". */
    videoSrc: string | null
}

/** A non-blank string, or nothing. Matches `features/auth/lib/account-profile.ts`. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * Three rules, all of them legacy's (`../tevi-web-app/src/components/avatar/index.js`):
 *
 * 1. **The clip plays only for Premium.** `shouldRenderVideo = isPremium && playback.url`.
 *    A non-Premium account can *have* an `avatar_video` — from a lapsed subscription, or
 *    uploaded through another surface — and it stays a still.
 * 2. **When Premium, the still prefers `avatar_video.thumbnail`** over `thumb`, so the
 *    poster is a frame of the clip rather than a different picture. Getting this backwards
 *    makes the avatar visibly jump the moment playback starts.
 * 3. Otherwise the still is `thumb`, and if there is none, nothing — the caller's Avatar
 *    falls through to initials, then to the placeholder glyph.
 */
export function resolveAvatarSource({
    thumb,
    avatarVideo,
    isPremium = false,
}: AvatarSourceInput): AvatarSource {
    const videoSrc = isPremium ? text(avatarVideo?.playback?.url) : null
    const poster = videoSrc ? (text(avatarVideo?.thumbnail) ?? text(thumb)) : text(thumb)
    return { poster, videoSrc }
}
