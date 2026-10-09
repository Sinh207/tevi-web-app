import type { FollowedChannel, FollowedLive } from '@features/channel'

/**
 * Fixtures for `/dev/following`, chosen for the payload shapes the rows have to **survive** rather
 * than for four nice names — same rule as `/dev/follow-requests`.
 *
 * Cast rather than constructed field-by-field: both types come from a `looseObject`, so the real
 * rows carry keys this app does not model and a fully-spelled literal would be a claim about the
 * payload that this file is not the place to make. The tier pair is spelled on **every** row, `null`
 * where there is none: one row carrying it and the rest omitting it is enough for `tsc` to call the
 * whole cast a mistake.
 */
export const FOLLOWED: FollowedChannel[] = [
    {
        // Pinned **and** verified: the DS row's pin mark over the avatar, the repainted background,
        // and a badge image beside the name. The one row that exercises all three at once.
        //
        // Flagged sensitive as well, so the 18+ mark sits on the name line beside a pinned avatar.
        id: 'c1',
        slug: 'ada',
        name: 'Ada Lovelace',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: { image: null },
        is_premium: false,
        space_tier: null,
        space_tier_image: null,
        is_nsfw: true,
        last_activity_at: '2026-08-23T09:00:00Z',
        pin: true,
        notification_settings: { notification: true },
    },
    {
        // Premium: the name takes the brand gradient, and the avatar is the one place on this screen
        // that plays a clip. Muted as well, so the bell-slash disc takes the avatar's bottom-end
        // corner. Verified, Premium, tier 2 — whose mark is the widest of the five — and sensitive,
        // so this is the row where all four name marks stand side by side and can be judged against
        // each other. The tick is the real CDN art: `/dev/*` is exempt from `art:audit`.
        id: 'c2',
        slug: 'grace',
        name: 'Grace Hopper',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: {
            image: 'https://static.tevicdn.com/Images/Channel/VerifiedTick/verified.png',
        },
        is_premium: true,
        space_tier: 2,
        space_tier_image: 'https://static.stg.tevicdn.com/space-tier/tier-2.png',
        is_nsfw: true,
        last_activity_at: '2026-07-20T09:00:00Z',
        pin: false,
        notification_settings: { notification: false },
    },
    {
        // No `notification_settings` at all — the tri-state legacy reads backwards. This row must
        // show **no** mute glyph; if it does, `isFollowedChannelMuted` has been inlined somewhere.
        // Sensitive with a long name, so the 18+ mark is seen holding its place while the name
        // truncates.
        id: 'c3',
        slug: 'katherine',
        name: 'Katherine Johnson',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        // Tier 0 *with* an image — what the backend sends for most spaces. No mark may draw here;
        // one that does means `spaceTierBadge` was bypassed for an image check.
        space_tier: 0,
        space_tier_image: 'https://static.stg.tevicdn.com/space-tier/tier-0.png',
        is_nsfw: true,
        last_activity_at: '2026-08-24T11:30:00Z',
        pin: false,
        notification_settings: null,
    },
    {
        // No activity ever: the row drops its third line and centres the two it has left, which is
        // the case the DS comp does not draw.
        id: 'c4',
        slug: 'radia',
        name: 'Radia Perlman',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        space_tier: null,
        space_tier_image: null,
        is_nsfw: false,
        last_activity_at: null,
        pin: false,
        notification_settings: { notification: true },
    },
    {
        // **A space that leads with its mini app** — the row draws an Open button beside the kebab.
        // `has_mini_app` alone is not enough (`miniAppFromChannel` requires the URL too), so both
        // are here; the row below it has the flag and *no* URL, which must render no button.
        id: 'c6',
        slug: 'lin',
        name: 'Lin Chen',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        space_tier: null,
        space_tier_image: null,
        is_nsfw: false,
        last_activity_at: '2026-08-24T06:00:00Z',
        pin: false,
        notification_settings: { notification: true },
        has_mini_app: true,
        mini_app_url: 'https://example.com/app',
        mini_app_id: 'app-1',
        shareable_url: 'https://tevi.com/@lin',
    },
    {
        // The flag with nothing behind it — a real payload shape, and it must draw **no** button.
        //
        // And a picture that does not load: the URL is real-shaped and 404s, so the avatar must
        // show the placeholder disc and glyph — not the initials, and not a broken-image icon.
        id: 'c7',
        slug: 'mei',
        name: 'Mei Tanaka',
        images: {
            thumb: 'https://static.tevicdn.com/Images/Channel/missing-avatar-404.jpg',
            cover: null,
            avatar_video: null,
        },
        verified_tick_badge: null,
        is_premium: false,
        space_tier: null,
        space_tier_image: null,
        is_nsfw: false,
        last_activity_at: '2026-08-20T06:00:00Z',
        pin: false,
        notification_settings: { notification: true },
        has_mini_app: true,
        mini_app_url: null,
    },
    {
        // The truncation case, and the one with no `name` at all — the row falls back to `@slug`.
        // This is what decides whether the kebab still fits beside a long name on a 390px phone.
        id: 'c5',
        slug: 'a-handle-that-is-also-rather-long-indeed',
        name: 'A display name long enough that it has to truncate well before the kebab does',
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        space_tier: null,
        space_tier_image: null,
        is_nsfw: false,
        last_activity_at: '2025-11-02T09:00:00Z',
        pin: false,
        notification_settings: { notification: true },
    },
] as FollowedChannel[]

/**
 * The Live now strip. Four rows, one per state the badge over the banner can be in — which is the
 * part of this card that is easiest to get wrong, because `liveAccess` returning `null` (an open
 * stream) and returning a zero price look identical in a screenshot and only one of them is right.
 */
export const LIVES: FollowedLive[] = [
    {
        // Open: no badge at all. Legacy prints "Unlock for 0 ⭐" here.
        code: 'open1',
        title: 'Morning coffee and code review',
        start_at: '2026-08-24T10:00:00Z',
        started_at: '2026-08-24T10:12:00Z',
        price: null,
        required_packages: [],
        need_unlock_package: false,
        purchased: false,
        restricted_platforms: [],
        shareable_url: null,
        public_url: null,
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'ada',
            name: 'Ada Lovelace',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: { image: null },
            is_premium: false,
        },
    },
    {
        // Priced: "Unlock for N ⭐", with the Star mark riding the figure.
        code: 'paid1',
        title: 'Deep dive: the analytical engine',
        start_at: '2026-08-24T09:00:00Z',
        started_at: null,
        price: '250',
        required_packages: [],
        need_unlock_package: false,
        purchased: false,
        restricted_platforms: [],
        shareable_url: null,
        public_url: null,
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'grace',
            name: 'Grace Hopper',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: true,
        },
    },
    {
        // Members-only: no figure, so the badge must not render an empty Star.
        code: 'mem1',
        title: 'Members lounge',
        start_at: '2026-08-24T08:30:00Z',
        started_at: '2026-08-24T08:35:00Z',
        price: null,
        required_packages: ['pkg-1'],
        need_unlock_package: true,
        purchased: false,
        restricted_platforms: [],
        shareable_url: null,
        public_url: null,
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'katherine',
            name: 'Katherine Johnson',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
    {
        // Both routes at once — `liveAccess`'s third label, "Become members or N ★", which is the
        // longest string the badge can be given and the one that decides whether it fits.
        code: 'both1',
        title: 'Members or pay-per-view',
        start_at: '2026-08-24T08:00:00Z',
        started_at: '2026-08-24T08:05:00Z',
        price: '250',
        required_packages: ['pkg-1'],
        need_unlock_package: true,
        purchased: false,
        restricted_platforms: [],
        shareable_url: null,
        public_url: null,
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'grace',
            name: 'Grace Hopper',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: true,
        },
    },
    {
        // **A member's — or the creator's — view of a members-only stream**: `need_unlock_package`
        // is false, so there is nothing to invite them to unlock. The badge must still say
        // "Members only". Reported from a real card where it said nothing at all.
        code: 'held1',
        title: 'Members lounge, as a member sees it',
        start_at: '2026-08-24T07:30:00Z',
        started_at: '2026-08-24T07:31:00Z',
        price: null,
        // Objects, not ids — the shape that used to parse to `[]` and read as an *open* stream.
        required_packages: [{ id: 'pkg-1' }],
        need_unlock_package: false,
        // …and `purchased`, which used to short-circuit the badge away before the membership was
        // ever looked at. A creator's own broadcast comes back like this.
        purchased: true,
        restricted_platforms: [],
        shareable_url: null,
        public_url: null,
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'katherine',
            name: 'Katherine Johnson',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
    {
        // Barred from the website: **no link**, a dialog instead. Press it to check that.
        code: 'restricted1',
        title: 'App-only broadcast',
        start_at: '2026-08-24T07:00:00Z',
        started_at: '2026-08-24T07:02:00Z',
        price: null,
        required_packages: [],
        need_unlock_package: false,
        purchased: false,
        restricted_platforms: ['Website'],
        shareable_url: 'https://tevi.com/@radia/event/restricted1/',
        public_url: 'https://tevi.com/e/restricted1/',
        status: 'LIVE',
        images: { banner: null },
        channel: {
            slug: 'radia',
            name: 'Radia Perlman',
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    },
] as FollowedLive[]
