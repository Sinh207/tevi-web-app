import { normalizeReply, type Reply } from './api/reply-types'
import { normalizePost, type Post } from './api/types'

export type { Reply } from './api/reply-types'
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
export { PostCollectionPicker } from './components/post-collection-picker'
export { PostComposerBody } from './components/post-composer-body'
export { PostComposerDialog } from './components/post-composer-dialog'
export { PostImageGallery } from './components/post-image-gallery'
export { PostLockPanel } from './components/post-lock-panel'
export { PostMediaLightbox } from './components/post-media-lightbox'
export { PostNsfwGuard } from './components/post-nsfw-guard'
export { ReplyAudienceNotice } from './components/reply-audience-notice'
export { ReplyComposer } from './components/reply-composer'
export { ReplyRow } from './components/reply-row'
export { ReplyThread } from './components/reply-thread'
export { emptyPostDraft, type PostDraft } from './lib/post-draft'
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
 * Members-only replies on a post that is **also** behind its paywall.
 *
 * The pair with `POST_PAID_REPLIES`, which is readable. That one is the *Become a member* label and
 * this one is *Unlock post to reply* — iOS splits them on `need_unlock_package`, and legacy web
 * says "unlock" for both, which offers to sell somebody a post they already have.
 *
 * Every field of the lock is needed for `isLocked` to answer `true`: a `product_id` or a
 * `required_packages` row makes it gated, and `viewer` plus `need_unlock_package` is what says
 * **this reader** is outside. The first version of this fixture carried only the reply audience and
 * so was not locked at all — it rendered the same label as its pair, which is how the harness
 * caught it.
 */
export const POST_PAID_REPLIES_LOCKED = makePostFixture({
    id: 'paid-replies-locked',
    text: 'Locked, and only members may reply — so the offer is to unlock it.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'PAID_USERS',
    product_id: 'prod-1',
    price: 20,
    viewer: 'STARGAZERS',
    need_unlock_package: true,
    reply_count: 3,
})

/**
 * The reader's **own** restricted post — no panel at all.
 *
 * `can_reply` is false for the author too once they close replies, so without the owner guard every
 * creator is lectured about a rule they set themselves.
 */
export const POST_REPLIES_OWN_CLOSED = makePostFixture({
    id: 'replies-own-closed',
    text: 'My own post with replies closed. No Who-can-reply panel should appear under this one.',
    is_owner: true,
    reply_allowed: false,
    can_reply: false,
    reply_allowed_user: 'NONE',
})

/**
 * Followers-only, and the reader **already follows** — so the box appears, not the panel.
 *
 * `can_reply` is still `false` here on purpose: that is the stale body a reader is holding in the
 * seconds after following, and the case iOS settles from `channel.isFollowed` rather than waiting
 * for a refetch. Without the followers branch in `mayReply` this fixture shows a follower a panel
 * telling them to follow.
 */
export const POST_REPLIES_FOLLOWED = makePostFixture({
    id: 'replies-followed',
    text: 'You already follow this space, so the composer should appear even though can_reply is still false.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'FOLLOWERS',
    channel: { ...POST_FIXTURE_CHANNEL, is_followed: true },
})

/**
 * The four *Who can reply?* audiences this client had never read.
 *
 * `POST_PAID_REPLIES` above is the fifth (`PAID_USERS`), and the only one the app already handled.
 * Each of these needs a creator to have set it and a reader who is not in the allowed group, which
 * is two accounts and a setting away from anything a developer can reach.
 */
export const POST_REPLIES_FOLLOWERS = makePostFixture({
    id: 'replies-followers',
    text: 'Only followers may reply — the audience legacy makes most common, and the one whose Comment button did nothing.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'FOLLOWERS',
    reply_count: 4,
})

export const POST_REPLIES_FOLLOWINGS = makePostFixture({
    id: 'replies-followings',
    text: 'Only spaces the creator follows may reply. A statement of fact — there is no control that fixes it.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'FOLLOWINGS',
})

export const POST_REPLIES_VERIFIED = makePostFixture({
    id: 'replies-verified',
    text: 'Only verified spaces may reply.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'VERIFIED_SPACES',
})

export const POST_REPLIES_MENTIONED = makePostFixture({
    id: 'replies-mentioned',
    text: 'Only spaces mentioned in this post may reply.',
    reply_allowed: true,
    can_reply: false,
    reply_allowed_user: 'MENTIONED_SPACES',
})

/**
 * `NONE` **and** `reply_allowed: false` — legacy sets both, and either alone means replies are off.
 */
export const POST_REPLIES_NONE = makePostFixture({
    id: 'replies-none',
    text: 'Replies are turned off for this post.',
    reply_allowed: false,
    can_reply: false,
    reply_allowed_user: 'NONE',
})

/**
 * Barred, with **no reason named** — the backend says `can_reply: false` and nothing else.
 *
 * The panel must stay away: an empty one says less than none. The case is easy to miss because it
 * looks identical to an ordinary post until you try to reply.
 */
export const POST_REPLIES_UNEXPLAINED = makePostFixture({
    id: 'replies-unexplained',
    text: 'The backend refuses replies and does not say why. No panel should appear under this one.',
    reply_allowed: true,
    can_reply: false,
})

/**
 * Links are **off** in this post's replies — the composer's one inline refusal.
 *
 * `reply_allowed_link` is the creator's switch, and the only way to see the message it produces is
 * to type a URL into a post that has it off. No developer's own post has it off by default.
 */
export const POST_REPLY_NO_LINKS = makePostFixture({
    id: 'reply-no-links',
    text: 'Replies to this post may not contain links. Try typing one below.',
    reply_allowed_link: false,
    reply_count: 6,
})

/**
 * Links **on**, stated rather than left absent.
 *
 * The pair matters: absence is read as *allowed*, so a fixture that simply omits the field would
 * look identical to this one while testing a different branch.
 */
export const POST_REPLY_LINKS_OK = makePostFixture({
    id: 'reply-links-ok',
    text: 'Replies here may contain links.',
    reply_allowed_link: true,
    reply_count: 2,
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

/**
 * Replies, and every one of them is a state a developer cannot reach from their own account.
 *
 * Built through `normalizeReply` from the **measured** payload (`api/reply-types.ts`), so a fixture
 * cannot claim a field the wire does not send — which is the exact mistake the reply list shipped
 * with, and the reason the harness has these at all.
 *
 * The ids are the real thing's: `owner` (the user) is what decides ownership, and `post_channel`
 * carries both `owner_id` and the interaction price. Reading the harness, the numbers to know are
 * **`3544332405`** (the author, and the post's owner) and **`999`** (a stranger).
 */
const REPLY_AUTHOR = {
    id: 'ch-author',
    slug: 'alice',
    name: 'Alice Nguyen',
    images: { thumb: null, uri: null, avatar_video: null },
    verified_tick_badge: null,
    is_premium: false,
}

const REPLY_POST_CHANNEL = {
    id: 'ch-post',
    slug: 'alice',
    name: 'Alice Nguyen',
    owner_id: 3544332405,
    paid_interaction_enabled: false,
    paid_interaction_cost: null,
}

function makeReplyFixture(overrides: Record<string, unknown>): Reply {
    const parsed = normalizeReply({
        id: '1',
        post_id: 'post-1',
        parent_id: null,
        created_at: 1760000000000,
        owner: { id: '999', display_name: 'Stranger' },
        owner_channel: REPLY_AUTHOR,
        post_channel: REPLY_POST_CHANNEL,
        ...overrides,
    })
    if (!parsed) throw new Error('dev reply fixture did not parse')
    return parsed
}

/** The ordinary row: words, a time, a star nobody has pressed. */
export const REPLY_TEXT = makeReplyFixture({
    id: 'reply-text',
    text: 'This is exactly what I needed today. Thanks for writing it up.',
    reaction_count: 12,
})

/** Long enough to wrap several times — the case the indent under the name has to survive. */
export const REPLY_LONG = makeReplyFixture({
    id: 'reply-long',
    text: Array.from(
        { length: 4 },
        () => 'A reply can be as long as anybody wants it to be, and nothing clamps it.',
    ).join(' '),
    reaction_count: 3,
})

/**
 * The author pays for the space — legacy's `BadgeMember`, and the one mark a reply has that a post
 * card does not.
 */
export const REPLY_MEMBER = makeReplyFixture({
    id: 'reply-member',
    text: 'Member of this space, and the badge says so.',
    from_subscriber: true,
    reaction_count: 7,
})

/** Already reacted to, so the star opens on its end frame rather than animating into it. */
export const REPLY_REACTED = makeReplyFixture({
    id: 'reply-reacted',
    text: 'You have already starred this one.',
    user_reaction: { type: 'LIKE' },
    reaction_count: 41,
})

/** Answers hang off it. The figure is drawn; opening the thread is the next cut. */
export const REPLY_WITH_CHILDREN = makeReplyFixture({
    id: 'reply-children',
    text: 'This one started a thread.',
    reply_count: 6,
    reaction_count: 2,
})

/** Pictures with no words — a reply the old post-card row refused to treat as a reply at all. */
export const REPLY_IMAGES = makeReplyFixture({
    id: 'reply-images',
    text: null,
    /*
     * Committed art, not a placeholder service. A remote URL here would be an unoptimisable host
     * (`next.config.ts`'s `remotePatterns` lists the ones Tevi owns) and a remote image inside
     * `src/`, which `pnpm art:audit` exists to keep out. `w`/`h` are the pair a reply really sends.
     */
    images: [
        { uri: '/illustrations/monetization/donation.webp', w: 1600, h: 900 },
        { uri: '/illustrations/monetization/membership-overview.webp', w: 1600, h: 900 },
    ],
})

/**
 * `html_text` with no `text` — legacy writes one for any reply containing a link.
 *
 * This client renders no markup (`post-card.tsx` states the refusal), so the row has to say the
 * words are not showable rather than draw an empty bubble. Unreachable without a legacy-authored
 * reply, which is why it is a fixture.
 */
export const REPLY_HTML_ONLY = makeReplyFixture({
    id: 'reply-html',
    text: null,
    html_text: '<p>See <a href="https://example.invalid">this</a>.</p>',
})

/** The reader's own, so the menu offers *Delete*. `owner.id` is what decides it. */
export const REPLY_OWN = makeReplyFixture({
    id: 'reply-own',
    text: 'My own reply — the kebab has a Delete row.',
    owner: { id: '3544332405', display_name: 'Me' },
})

/** A charging space: reacting costs 5 Star, so the star wears a price chip. */
export const REPLY_PAID = makeReplyFixture({
    id: 'reply-paid',
    text: 'Reacting to this costs Star, because the space charges for interaction.',
    post_channel: {
        ...REPLY_POST_CHANNEL,
        owner_id: '111',
        paid_interaction_enabled: true,
        paid_interaction_cost: 5,
    },
})

/** Deleted — the tombstone, visible for the moment between a delete and a refetch. */
export const REPLY_DELETED = makeReplyFixture({
    id: 'reply-deleted',
    text: 'gone',
    deleted: true,
})

/** Nothing at all: no words, no pictures, no markup. The payload allows it; the row has to cope. */
export const REPLY_EMPTY = makeReplyFixture({ id: 'reply-empty', text: null })
