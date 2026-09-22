import { normalizePost, type Post } from './api/types'

export type { Post } from './api/types'

/**
 * Fixtures and pieces for the `/dev/post` harness, and for nothing else.
 *
 * Kept out of `index.ts` so production never imports a fixture.
 *
 * ## Why a post needs a harness more than most surfaces
 *
 * Every state below is a property of **somebody else's** data, and four of them cannot be reached
 * by a developer at all:
 *
 * - **locked.** Needs a creator who sells posts and a reader who has not bought one. A developer
 *   looking at their own space is always the owner, and the owner is never locked out.
 * - **purchased.** The same, from the other side — and it is the state the `viewer`/
 *   `need_unlock_package` bug hid, where a paying member still saw the lock screen.
 * - **nsfw.** Needs the classifier to have flagged something, or a creator to mark a post.
 * - **deleted.** A tombstone renders for a post the backend still has with `deleted: true` — visible
 *   only in the seconds between a delete and a refetch.
 *
 * The rest are ordinary but awkward: a post with eleven images to see the `+n` tile, a post with no
 * dimensions at all to prove the card does not guess an aspect ratio, and a channel with no slug —
 * which is what makes the header a `span` instead of a `Link`.
 *
 * ## Every fixture goes through `normalizePost`
 *
 * Not hand-typed objects. A fixture that bypasses the parser can assert a shape the parser would
 * never produce, which is how a harness ends up showing a state the real payload cannot reach — and
 * the parser is exactly what this feature's correctness rests on.
 */

export { PostCard } from './components/post-card'
export { PostImageGallery } from './components/post-image-gallery'
export { PostLockPanel } from './components/post-lock-panel'
export { PostMediaLightbox } from './components/post-media-lightbox'
export { PostNsfwGuard } from './components/post-nsfw-guard'
export { postIntent } from './lib/post-intent'
export { postHref } from './lib/post-link'

/** The base channel every fixture shares. Exported so the harness can extend it with real marks. */
export const POST_FIXTURE_CHANNEL = {
    id: '1',
    slug: 'alice',
    name: 'Alice Nguyen',
    is_premium: true,
    /**
     * No badge on the base channel. The verified and tier marks are **backend-served URLs**, and a
     * remote URL may not appear in `src/features/**` — `pnpm art:audit` fails on one, and the
     * `/dev/**` exemption it does grant does not reach this file (`src/app/app/dev-checkout`
     * imports a feature `dev.ts`, so these are not provably out of production).
     *
     * So the fixture that carries them is built in `app/(web)/dev/post/preview.tsx` through
     * `makePostFixture`, where the exemption applies and where `dev/payout/fixtures.ts` already
     * sets the precedent for standing in for a backend-decided URL.
     */
    verified_tick_badge: null,
    images: { thumb: null, uri: null, avatar_video: null },
}

/**
 * Build a fixture through the parser.
 *
 * Exported because the harness page needs it: a case whose point is a **backend-served image URL**
 * cannot be written here (see `POST_FIXTURE_CHANNEL` above), so the preview builds that one itself.
 */
export function makePostFixture(overrides: Record<string, unknown>): Post {
    const parsed = normalizePost({
        id: '1',
        created_at: 1760000000000,
        channel: POST_FIXTURE_CHANNEL,
        /*
         * Replies open by default, because that is the ordinary post — and because every
         * viewer-relative flag in the schema is `boolish`, which catches to `false`. Leaving them
         * out makes every fixture a replies-closed post, which is how the comment button silently
         * disappeared from the whole harness.
         */
        reply_allowed: true,
        can_reply: true,
        ...overrides,
    })
    if (!parsed) throw new Error('dev fixture did not parse')
    return parsed
}

/** Text only — the majority of real posts, and the one shape with no media branch at all. */
export const POST_TEXT = makePostFixture({
    id: 'text',
    text: 'Shipping the new space page today. Three months of work and it finally feels like the thing we drew.',
    reaction_count: 1249,
    reply_count: 38,
})

/** Long enough to clamp, so the `more` control is visible without resizing the window. */
export const POST_LONG_TEXT = makePostFixture({
    id: 'long',
    text: Array.from(
        { length: 6 },
        (_, i) =>
            `Paragraph ${i + 1}: the clamp is measured rather than counted, so this only offers "more" when it is genuinely overflowing.`,
    ).join('\n'),
    reaction_count: 12,
    reply_count: 0,
})

/** One image, with dimensions — so the card reserves the right box before it loads. */
export const POST_ONE_IMAGE = makePostFixture({
    id: 'one-image',
    text: 'Golden hour on the roof.',
    images: [{ uri: '/illustrations/monetization/donation.webp', width: 1600, height: 900 }],
    reaction_count: 8200,
    reply_count: 156,
})

/**
 * One image with **no dimensions**, which is the case the card must not guess at.
 *
 * If this one ever starts reserving a 1:1 box before the image lands, `imageAspectRatio` has been
 * given a default and the feed will jump.
 */
export const POST_IMAGE_NO_DIMENSIONS = makePostFixture({
    id: 'no-dims',
    text: 'No width or height on the wire.',
    images: [{ uri: '/illustrations/monetization/crown.webp' }],
})

/** Eleven images — four tiles and a `+7`. */
export const POST_MANY_IMAGES = makePostFixture({
    id: 'many-images',
    text: 'Eleven shots from the trip.',
    images: Array.from({ length: 11 }, () => ({
        uri: '/illustrations/monetization/membership-overview.webp',
        width: 800,
        height: 800,
    })),
    reaction_count: 340,
    reply_count: 12,
})

/** A video — poster and duration, never a mounted `<video>` in a feed. */
export const POST_VIDEO = makePostFixture({
    id: 'video',
    text: 'Behind the scenes.',
    video: {
        id: 'v1',
        // The wire shape, not a bare string — see `playbackSchema`. A harness whose fixtures are
        // friendlier than the payload is how the object form went unnoticed in the first place.
        playback: { hls: 'https://example.invalid/v.m3u8' },
        thumbnail: '/illustrations/monetization/paid-interactions.webp',
        duration_seconds: 5400,
        width: 1920,
        height: 1080,
    },
})

/** Members-only, and the reader is not one. */
export const POST_LOCKED_MEMBERS = makePostFixture({
    id: 'locked-members',
    text: 'For members.',
    required_packages: [{ id: 'tier-1' }],
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    cover_image: {
        uri: '/illustrations/monetization/membership-banner.webp',
        width: 1200,
        height: 600,
    },
    unlock_detail: { images_count: 4, video_duration_seconds: 132, text_length: 280 },
})

/** Buyable with Star, membership is not a way in. */
export const POST_LOCKED_PURCHASE = makePostFixture({
    id: 'locked-purchase',
    text: 'Unlock this one.',
    product_id: 'prod-1',
    price: 500,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    /** `blur: true` is the backend's instruction, and the only thing that turns the blur on. */
    cover_image: {
        uri: '/illustrations/monetization/donation.webp',
        blur: 'true',
        width: 900,
        height: 1200,
    },
    unlock_detail: { images_count: 0, video_duration_seconds: 75, text_length: 0 },
})

/** Both routes in — the third sentence `postGate` can produce. */
export const POST_LOCKED_BOTH = makePostFixture({
    id: 'locked-both',
    text: 'Join, or unlock just this.',
    product_id: 'prod-2',
    required_packages: [{ id: 'tier-1' }],
    price: 300,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    cover_image: { uri: '/illustrations/monetization/crown.webp', width: 800, height: 800 },
    unlock_detail: { images_count: 2, video_duration_seconds: null, text_length: 90 },
})

/**
 * Gated, paid for, and therefore **open** — `need_unlock_package` is still true.
 *
 * This is the fixture that catches the regression: read the flag without `viewer` and this card
 * shows the lock screen to a reader who has paid.
 */
export const POST_PURCHASED = makePostFixture({
    id: 'purchased',
    text: 'You bought this one, so you can read it.',
    product_id: 'prod-3',
    price: 500,
    viewer: 'MEMBER',
    need_unlock_package: true,
    images: [{ uri: '/illustrations/monetization/banner.webp', width: 1200, height: 600 }],
})

/** Flagged by the classifier — media blurred, words left readable. */
export const POST_NSFW = makePostFixture({
    id: 'nsfw',
    text: 'The caption stays readable; only the imagery is covered.',
    detected_nsfw: true,
    images: [{ uri: '/illustrations/monetization/no-members.webp', width: 1200, height: 800 }],
})

/** The tombstone. Everything below the header is meaningless, including the stats row. */
export const POST_DELETED = makePostFixture({ id: 'deleted', text: 'gone', deleted: true })

/** Pinned, edited, and already reacted to — the three header/stat decorations at once. */
export const POST_DECORATED = makePostFixture({
    id: 'decorated',
    text: 'Pinned and edited.',
    pinned: true,
    edited: true,
    user_reaction: { type: 'LIKE' },
    reaction_count: 3,
    reply_count: 1,
})

/** No slug on the channel — the header must be a `span`, not a link to `/@`. */
export const POST_NO_SLUG = makePostFixture({
    id: 'no-slug',
    text: 'This channel has no slug, so the header is not a link.',
    channel: { id: '2', name: 'Ghost Space' },
})

/**
 * A locked post with **no cover at all** — the shape that decides whether the paywall degrades or
 * collapses. Legacy falls back to a `1/1` grey box, so there is still something to press.
 */
export const POST_LOCKED_NO_COVER = makePostFixture({
    id: 'locked-no-cover',
    text: 'Locked, and the creator set no cover.',
    product_id: 'prod-4',
    price: 120,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    unlock_detail: { images_count: 0, video_duration_seconds: 0, text_length: 400 },
})

/**
 * A channel that charges Star to interact — the blue cost chip on the react and comment glyphs.
 *
 * Only reachable against a creator who has switched paid interaction on, and only above a cost of
 * 1, which is legacy's own threshold.
 */
export const POST_PAID_INTERACTION = makePostFixture({
    id: 'paid-interaction',
    text: 'Reacting and commenting on this space costs Star.',
    channel: { ...POST_FIXTURE_CHANNEL, paid_interaction_enabled: true, paid_interaction_cost: 5 },
    reaction_count: 92,
    reply_count: 14,
})

/**
 * Mixed-ratio images in the scrolling row — the case the fixed row height exists for.
 *
 * A portrait, a landscape and a square at one height, each as wide as its own ratio makes it. Any
 * layout that picks a single box shape letterboxes two of these three.
 */
export const POST_MIXED_RATIOS = makePostFixture({
    id: 'mixed-ratios',
    text: 'Portrait, landscape and square in one row.',
    images: [
        { uri: '/illustrations/monetization/donation.webp', width: 900, height: 1600 },
        { uri: '/illustrations/monetization/banner.webp', width: 1600, height: 900 },
        { uri: '/illustrations/monetization/crown.webp', width: 900, height: 900 },
    ],
})

/**
 * Replies turned off by the creator — the comment button is **absent**, not disabled.
 *
 * The reaction stays: a post nobody may reply to can still be reacted to, which is why the row has
 * four guards and not one.
 */
export const POST_REPLIES_CLOSED = makePostFixture({
    id: 'replies-closed',
    text: 'The creator turned replies off. No comment button at all.',
    reply_allowed: false,
    reaction_count: 88,
    reply_count: 12,
})

/**
 * The reader's **own** post: no bookmark, no send-message.
 *
 * Saving a list of things you wrote and messaging yourself a link to them are both noise — legacy's
 * `{!isMyPost && …}`, twice.
 */
export const POST_OWN = makePostFixture({
    id: 'own',
    text: 'Your own post — bookmark and send-message are gone, comment and react stay.',
    is_owner: true,
    reaction_count: 5,
    reply_count: 2,
})

/**
 * Replies restricted to paying members, on a post that is otherwise **open**.
 *
 * `postIntent`'s fourth branch and the one a reimplementation drops: the body is readable, the
 * comment button is there, and pressing it offers the membership rather than a reply box. Only
 * reachable against a creator who has set *who can reply* to paid users.
 */
export const POST_PAID_REPLIES = makePostFixture({
    id: 'paid-replies',
    text: 'Anyone can read this. Only members can reply.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'PAID_USERS',
    reaction_count: 54,
    reply_count: 9,
})

/**
 * The space **is** a mini app — the banner under the body.
 *
 * All three fields are required together (`has_mini_app`, `mini_app_url`, `mini_app_id`); the
 * harness is the only place the trio can be seen at once, because a developer's own space is not a
 * mini app and somebody else's cannot be edited.
 */
export const POST_MINI_APP = makePostFixture({
    id: 'mini-app',
    text: 'This space is a game.',
    channel: {
        ...POST_FIXTURE_CHANNEL,
        description: 'Play and earn',
        has_mini_app: true,
        mini_app_url: 'https://example.invalid/game',
        mini_app_id: 'app-1',
        shareable_url: 'https://tevi.com/@alice',
    },
})

/**
 * An affiliate program the space is promoting — `channel.promote`.
 *
 * The icon is deliberately absent here so the fallback disc is what renders: a real `app_icon_url`
 * is a backend-served remote URL, which `pnpm art:audit` bars anywhere under `src/features/**`. The
 * preview page builds the decorated variant, where the `/dev/**` exemption applies.
 */
export const POST_AFFILIATE = makePostFixture({
    id: 'affiliate',
    text: 'Sponsored by a program I am in.',
    channel: {
        ...POST_FIXTURE_CHANNEL,
        promote: { referral_url: 'https://example.invalid/ref?id=1', app_name: 'Example App' },
    },
})

/**
 * The author's own earnings strip — `_insights.post_total_revenue`, and **only** on their own post.
 *
 * Two conditions, and the second is the one to watch: legacy hides the strip at a revenue of `0`,
 * so a creator scrolling their own feed does not see "Earnings: $0.00" under everything they have
 * ever written. `POST_OWN` above is the zero-revenue counterpart.
 */
export const POST_INSIGHTS = makePostFixture({
    id: 'insights',
    text: 'One of mine, and it has earned something.',
    is_owner: true,
    _insights: { post_total_revenue: 128.4 },
    reaction_count: 410,
    reply_count: 22,
})

/**
 * Replies already open, so the menu offers *Turn off replies* — the inverse of `POST_REPLIES_CLOSED`
 * as the **owner** sees it.
 *
 * Owner and stranger get two entirely different menus (`postMenuVisibility`), and neither can be
 * seen from the other's account, so both need a fixture.
 */
export const POST_OWN_MENU = makePostFixture({
    id: 'own-menu',
    text: 'My own post — pin, replies and delete in the menu.',
    is_owner: true,
    pinned: true,
    reaction_count: 12,
    reply_count: 3,
})

/**
 * Somebody else's post, with an `owner_id` — so the menu can offer **Block**.
 *
 * Without `owner_id` the row is withheld: blocks are keyed by user id, not channel id, so the
 * confirmation would have nothing to send. `POST_NO_OWNER_ID` is that case.
 */
export const POST_OTHER_MENU = makePostFixture({
    id: 'other-menu',
    text: "Somebody else's post — report and block in the menu.",
    channel: { ...POST_FIXTURE_CHANNEL, owner_id: 'user-1' },
})

/** A channel payload with no `owner_id` — Block must be absent while Report stays. */
export const POST_NO_OWNER_ID = makePostFixture({
    id: 'no-owner-id',
    text: 'No owner_id on the channel, so Block cannot be offered.',
    channel: { id: '3', slug: 'ghosty', name: 'No Owner' },
})

/**
 * A post with **no `shareable_url`** — the card must not be a link at all.
 *
 * Ordinary in the real app for the seconds after the composer posts and before the row comes back
 * confirmed. `postHref` answers `null`, so there is no cursor, no anchor and no navigation.
 */
export const POST_NO_LINK = makePostFixture({
    id: 'no-link',
    text: 'No shareable_url, so this card does not navigate anywhere.',
})

/** Everything above with a real path, so the card navigates. */
export const POST_LINKED = makePostFixture({
    id: 'linked',
    text: 'This card navigates — press anywhere that is not a control.',
    shareable_url: 'https://tevi.com/@alice/post/linked',
    reaction_count: 31,
    reply_count: 4,
})

/**
 * A video **and** images on one post.
 *
 * The payload permits both and `postMediaKind` says video wins; the card draws both blocks, so this
 * is the case that shows the order they stack in.
 */
export const POST_VIDEO_AND_IMAGES = makePostFixture({
    id: 'video-and-images',
    text: 'Both a clip and stills.',
    images: [
        { uri: '/illustrations/monetization/banner.webp', width: 1600, height: 900 },
        { uri: '/illustrations/monetization/crown.webp', width: 900, height: 900 },
    ],
    video: {
        id: 'v2',
        // mp4 only — the branch that plays in every browser with no media engine, and what
        // `videoSrc` selects when a post carries no manifest.
        playback: { url: 'https://example.invalid/v.mp4' },
        thumbnail: '/illustrations/monetization/paid-interactions.webp',
        duration_seconds: 42,
        width: 1080,
        height: 1920,
    },
})

/**
 * Sensitive **and** the reader's own post.
 *
 * `PostNsfwGuard` gives an author the reveal-once cover rather than the settings one — you cannot be
 * asked to change a filter to look at something you uploaded.
 */
export const POST_NSFW_OWN = makePostFixture({
    id: 'nsfw-own',
    text: 'My own sensitive post — reveal, never the settings offer.',
    is_owner: true,
    detected_nsfw: true,
    images: [{ uri: '/illustrations/monetization/no-members.webp', width: 1200, height: 800 }],
})

/**
 * `marked_nsfw` rather than `detected_nsfw` — the creator's own flag, not the classifier's.
 *
 * Either is enough and the card must treat them identically; they are separate fields because they
 * disagree often (`features/nsfw` is where an appeal against the classifier lives).
 */
export const POST_NSFW_MARKED = makePostFixture({
    id: 'nsfw-marked',
    text: 'Marked by the creator rather than flagged by the classifier.',
    marked_nsfw: true,
    images: [
        { uri: '/illustrations/monetization/membership-banner.webp', width: 1200, height: 600 },
    ],
})

/**
 * A gated post whose price is **zero** — the payload this client cannot act on honestly.
 *
 * `postUnlockPrice` answers `null`, so the confirmation refuses to render rather than offering to
 * "unlock for 0". Legacy shows a button with a blank where the price should be.
 */
export const POST_LOCKED_ZERO_PRICE = makePostFixture({
    id: 'locked-zero-price',
    text: 'Gated, with no usable price on the wire.',
    product_id: 'prod-5',
    price: 0,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    cover_image: { uri: '/illustrations/monetization/banner.webp', width: 1200, height: 600 },
})

/*
 * ── The gaps a branch-by-branch audit found ───────────────────────────────────────────────────
 *
 * Everything above covers a state somebody thought of while building. The block below covers the
 * ones only a sweep of the *code* turns up: each one is a branch that exists in a component or a
 * formatter and had no fixture reaching it. They are duller than the states above and that is the
 * point — a branch nobody has looked at is exactly where a silent failure lives.
 */

/**
 * **A post with no text at all.** One of the most common shapes in the product, and nothing above
 * had it: every fixture carried a caption.
 *
 * The card must render no paragraph element rather than an empty one — an empty `<p>` with
 * `whitespace-pre-wrap` still takes a line box, so the media would sit a row lower than on a
 * text-only post and a feed of mixed posts would look unevenly spaced.
 */
export const POST_NO_TEXT = makePostFixture({
    id: 'no-text',
    images: [{ uri: '/illustrations/monetization/banner.webp', width: 1600, height: 900 }],
    reaction_count: 77,
    reply_count: 5,
})

/**
 * **`html_text` present, `text` absent** — the payload shape behind this card's one outright refusal
 * of legacy.
 *
 * `PostCard` never renders `html_text` (creator-authored markup, no sanitiser in this repo), so a
 * post whose words exist *only* in that field renders **no caption**. That is a real consequence of
 * a deliberate decision and it had no fixture, which meant nobody could see what it costs.
 *
 * If this ever needs to show the words, the answer is a parser over `text` — never this field.
 */
export const POST_HTML_TEXT_ONLY = makePostFixture({
    id: 'html-text-only',
    html_text: '<p>These words live only in <a href="https://example.invalid">html_text</a>.</p>',
    images: [{ uri: '/illustrations/monetization/crown.webp', width: 900, height: 900 }],
})

/**
 * **No `created_at`.**
 *
 * `PostHeader`'s own note claims a correction over legacy here — legacy draws the separator dot
 * unconditionally, so a post with no timestamp opens with a floating bullet, while this header draws
 * the dot only *between* pieces that exist. That claim had nothing demonstrating it.
 */
export const POST_NO_TIMESTAMP = makePostFixture({
    id: 'no-timestamp',
    created_at: null,
    text: 'No created_at — the subheader must not open with a floating dot.',
})

/**
 * **A very long display name and a very long slug**, at the two widths the header truncates at
 * (120px below `md`, 170 above; 70/100 for the slug).
 *
 * The badges after the name are `flex-none` precisely so a long name cannot squeeze them out — a
 * claim with no case behind it until now. Nine locales make this worse than it looks: a name is
 * user-chosen and truncating by character count breaks Korean and Vietnamese differently.
 */
export const POST_LONG_NAME = makePostFixture({
    id: 'long-name',
    text: 'The name and the slug both have to truncate without pushing the badges off.',
    channel: {
        ...POST_FIXTURE_CHANNEL,
        name: 'Alexandra Konstantinopolitanopoulos-Wetherby',
        slug: 'alexandra-konstantinopolitanopoulos',
    },
})

/**
 * **Images carrying `w`/`h` instead of `width`/`height`.**
 *
 * `api/types.ts` models both spellings and says 15 of legacy's call sites guess wrong on one of
 * them, which is why a post's images occasionally render at the wrong ratio until they load.
 * `imageAspectRatio` is the one place that decides — and nothing exercised the older spelling.
 *
 * A portrait and a landscape, so a row that silently fell back to `1/1` would be obvious.
 */
export const POST_LEGACY_DIMENSIONS = makePostFixture({
    id: 'legacy-dims',
    text: 'Dimensions on the wire as w/h rather than width/height.',
    images: [
        { uri: '/illustrations/monetization/donation.webp', w: 900, h: 1600 },
        { uri: '/illustrations/monetization/banner.webp', w: 1600, h: 900 },
    ],
})

/**
 * **An image with only a `thumb`.**
 *
 * The gallery reads `uri ?? thumb`, and that fallback had no case. A row that rendered an empty grey
 * tile here would look identical to one still loading.
 */
export const POST_THUMB_ONLY_IMAGE = makePostFixture({
    id: 'thumb-only',
    text: 'No uri on the image row — only a thumb.',
    images: [
        { thumb: '/illustrations/monetization/membership-overview.webp', width: 800, height: 800 },
    ],
})

/**
 * **A 4:3 image** — the one bucket of `detectAspectRatio`'s five that nothing reached.
 *
 * The buckets exist so a column of posts is not a column of slightly different rectangles; a bucket
 * with no case is a bucket whose tolerance nobody has looked at.
 */
export const POST_FOUR_THREE = makePostFixture({
    id: 'four-three',
    text: 'A 4:3 image — the bucket between square and widescreen.',
    images: [{ uri: '/illustrations/monetization/banner.webp', width: 1200, height: 900 }],
})

/**
 * **A video with neither poster nor duration.**
 *
 * The tile falls back `video.thumbnail → cover_image.uri → nothing`, and the duration badge is
 * withheld rather than printed as `0:00`. Both were unreachable.
 */
export const POST_VIDEO_BARE = makePostFixture({
    id: 'video-bare',
    text: 'A clip with no poster and no duration on the wire.',
    // Keeps the **bare-string** form deliberately: a locally-composed preview produces one before
    // the upload is transcoded, so the parser has to go on accepting it.
    video: { id: 'v3', playback: 'https://example.invalid/bare.m3u8' },
})

/**
 * **A locked post with a portrait cover and no video** — `lockCoverAspectRatio`'s `3/4` branch.
 *
 * The purchasable fixture above has a portrait cover *and* a video, and video wins, so the portrait
 * branch was shadowed. The paywall is a picture, so the shape it reserves is the whole surface.
 */
export const POST_LOCKED_PORTRAIT = makePostFixture({
    id: 'locked-portrait',
    text: 'Locked, portrait cover, no video behind it.',
    product_id: 'prod-6',
    price: 250,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    cover_image: { uri: '/illustrations/monetization/donation.webp', width: 900, height: 1400 },
    unlock_detail: { images_count: 3, video_duration_seconds: null, text_length: 0 },
})

/**
 * **`has_mini_app` set, but the URL and id are not** — the counterexample to "all three required".
 *
 * Legacy's gate is a conjunction and the banner must be **absent**, not a button that opens nothing.
 * A fixture that only ever showed the happy path could not tell the two apart.
 */
export const POST_MINI_APP_INCOMPLETE = makePostFixture({
    id: 'mini-app-incomplete',
    text: 'has_mini_app is true and the other two fields are missing — no banner at all.',
    channel: { ...POST_FIXTURE_CHANNEL, has_mini_app: true },
})

/**
 * **Paid interaction at a cost of exactly 1** — the threshold the chip is withheld at.
 *
 * Legacy renders the price only above 1, on the reasoning that a one-Star chip costs more attention
 * than it conveys. The boundary is the only part of a threshold worth a fixture.
 */
export const POST_PAID_INTERACTION_ONE = makePostFixture({
    id: 'paid-interaction-one',
    text: 'Interaction costs exactly 1 Star, so no chip is drawn.',
    channel: { ...POST_FIXTURE_CHANNEL, paid_interaction_enabled: true, paid_interaction_cost: 1 },
    reaction_count: 6,
})
