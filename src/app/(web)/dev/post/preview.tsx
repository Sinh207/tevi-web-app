'use client'

import {
    emptyPostDraft,
    makePostFixture,
    POST_AFFILIATE,
    POST_DECORATED,
    POST_DELETED,
    POST_FIXTURE_CHANNEL,
    POST_FOUR_THREE,
    POST_HTML_TEXT_ONLY,
    POST_IMAGE_NO_DIMENSIONS,
    POST_INSIGHTS,
    POST_LEGACY_DIMENSIONS,
    POST_LINKED,
    POST_LOCKED_BOTH,
    POST_LOCKED_MEMBERS,
    POST_LOCKED_NO_COVER,
    POST_LOCKED_PORTRAIT,
    POST_LOCKED_PURCHASE,
    POST_LOCKED_ZERO_PRICE,
    POST_LONG_NAME,
    POST_LONG_TEXT,
    POST_MANY_IMAGES,
    POST_MINI_APP,
    POST_MINI_APP_INCOMPLETE,
    POST_MIXED_RATIOS,
    POST_NO_LINK,
    POST_NO_OWNER_ID,
    POST_NO_SLUG,
    POST_NO_TEXT,
    POST_NO_TIMESTAMP,
    POST_NSFW,
    POST_NSFW_MARKED,
    POST_NSFW_OWN,
    POST_ONE_IMAGE,
    POST_OTHER_MENU,
    POST_OWN,
    POST_OWN_MENU,
    POST_PAID_INTERACTION,
    POST_PAID_INTERACTION_ONE,
    POST_PAID_REPLIES,
    POST_PAID_REPLIES_LOCKED,
    POST_PURCHASED,
    POST_REPLIES_CLOSED,
    POST_REPLIES_FOLLOWED,
    POST_REPLIES_FOLLOWERS,
    POST_REPLIES_FOLLOWINGS,
    POST_REPLIES_MENTIONED,
    POST_REPLIES_NONE,
    POST_REPLIES_OWN_CLOSED,
    POST_REPLIES_UNEXPLAINED,
    POST_REPLIES_VERIFIED,
    POST_REPLY_LINKS_OK,
    POST_REPLY_NO_LINKS,
    POST_TEXT,
    POST_THUMB_ONLY_IMAGE,
    POST_VIDEO,
    POST_VIDEO_AND_IMAGES,
    POST_VIDEO_BARE,
    type Post,
    PostCard,
    PostComposerDialog,
    type PostDraft,
    PostMediaTile,
    REPLY_DELETED,
    REPLY_EMPTY,
    REPLY_HTML_ONLY,
    REPLY_IMAGES,
    REPLY_LONG,
    REPLY_MEMBER,
    REPLY_OWN,
    REPLY_PAID,
    REPLY_REACTED,
    REPLY_TEXT,
    REPLY_WITH_CHILDREN,
    type Reply,
    ReplyComposer,
    ReplyRow,
} from '@features/post/dev'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * Every card state, grouped by what it is a state *of*, each labelled with what makes it hard to
 * reach for real.
 *
 * The column is 612 wide — the app's `sm` breakpoint and the width the feed actually renders at —
 * because a card reviewed at desktop width hides exactly the truncation and wrapping bugs it is
 * most likely to have.
 */

/**
 * The real marks, at the URLs the backend serves them from.
 *
 * Remote URLs, and they live **here** rather than in `features/post/dev.ts` on purpose:
 * `verified_tick_badge.image` and `space_tier_image` are backend-decided content, so committing
 * local copies would make the fixture less faithful than the row it stands in for — but
 * `pnpm art:audit` fails on a remote image anywhere under `src/features/**`, and only
 * `src/app/(web)/dev/**` is exempt. `dev/payout/fixtures.ts` sets the same precedent for
 * `payout_method.logo_url`.
 */
const VERIFIED_TICK = 'https://static.tevicdn.com/Images/Channel/VerifiedTick/verified.png'

/** The same exemption, for the affiliate card's remote app icon. */
const AFFILIATE_ICON = 'https://static.tevicdn.com/Images/Channel/VerifiedTick/verified.png'

/**
 * The space-tier marks the backend serves, keyed by the `space_tier` value that selects them.
 *
 * Two things this table makes visible that a single sample would not:
 *
 * - **There is a `tier-0.png`.** The backend serves an image for the tier that must draw no badge,
 *   which is exactly why `spaceTierBadge` gates on the number and not on the image. Anyone reading
 *   "it sends an image, so draw it" has this row as the counterexample.
 * - **The ladder is not contiguous** — 0, 1, 2, 5, 10. So a tier is a *number the backend chooses*,
 *   not an index into an array and not a count of steps, and nothing here may interpolate between
 *   two of them or assume the next one is `n + 1`.
 */
const TIER_MARKS: Record<number, string> = {
    0: 'https://static.stg.tevicdn.com/space-tier/tier-0.png',
    1: 'https://static.stg.tevicdn.com/space-tier/tier-1.png',
    2: 'https://static.stg.tevicdn.com/space-tier/tier-2.png',
    5: 'https://static.stg.tevicdn.com/space-tier/tier-5.png',
    10: 'https://static.stg.tevicdn.com/space-tier/tier-10.png',
}

/**
 * Verified, premium and a real space tier — the three marks that sit between the name and the slug.
 *
 * Two of them were unreadable until this case existed: `verified_tick_badge` is an **object** with
 * an `image` and `space_tier` is a **number**, and both had been declared as text, which parses to
 * `null` without failing. A fixture with `null` badges could never have shown that.
 */
const POST_BADGES = makePostFixture({
    id: 'badges',
    text: 'Verified tick, premium mark and a space tier, all at once.',
    created_at: 1760000000000,
    channel: {
        ...POST_FIXTURE_CHANNEL,
        verified_tick_badge: { image: VERIFIED_TICK },
        space_tier: 5,
        space_tier_image: TIER_MARKS[5],
    },
    reaction_count: 4200,
    reply_count: 63,
})

/** The affiliate card with its real remote icon — the decorated half of `POST_AFFILIATE`. */
const POST_AFFILIATE_DECORATED = makePostFixture({
    id: 'affiliate-icon',
    text: 'Sponsored, with the icon the backend serves.',
    channel: {
        ...POST_FIXTURE_CHANNEL,
        promote: {
            referral_url: 'https://example.invalid/ref?id=1',
            app_name: 'Example App',
            app_icon_url: AFFILIATE_ICON,
        },
    },
})

/**
 * One card per rung of the ladder, tier 0 included.
 *
 * The tier-0 card is the assertion: it carries a real `space_tier_image` and must still draw
 * nothing between the name and the slug.
 */
const TIER_LADDER = Object.entries(TIER_MARKS).map(([tier, image]) =>
    makePostFixture({
        id: `tier-${tier}`,
        text: `space_tier ${tier}, with the mark the backend serves for it.`,
        created_at: 1760000000000,
        channel: {
            ...POST_FIXTURE_CHANNEL,
            verified_tick_badge: { image: VERIFIED_TICK },
            space_tier: Number(tier),
            space_tier_image: image,
        },
    }),
)

interface Case {
    title: string
    note: string
    post: Post
    /** Rendered without the attachment blocks, as a slider or DM embed would be. */
    bare?: boolean
    /** A "See more" footer, as a teaser surface shows. */
    seeMore?: boolean
    /** Rendered as a Premium reader — exempt from paid interaction. */
    premium?: boolean
}

interface Group {
    heading: string
    blurb: string
    cases: Case[]
}

/**
 * The full list, grouped.
 *
 * The grouping is the point of the rewrite: this page is the only place most of these states can be
 * seen at all, so a flat list of thirty sections made it impossible to tell whether a *category* was
 * covered. Each heading below is one thing the card decides, and the cases under it are the answers
 * that decision can produce.
 */
const GROUPS: Group[] = [
    {
        heading: 'Identity',
        blurb: 'What the header can be handed, including the shapes that parse to null if mis-declared.',
        cases: [
            {
                title: 'Verified, premium and space tier',
                note: 'Real backend-served marks. verified_tick_badge is an object; space_tier is a number.',
                post: POST_BADGES,
            },
            {
                title: 'Channel with no slug',
                note: 'The header must be a span, not a link to /@.',
                post: POST_NO_SLUG,
            },
            {
                title: 'Very long name and slug',
                note: 'Truncates at 120/170px and 70/100px. The badges after the name are flex-none so a long name cannot squeeze them out.',
                post: POST_LONG_NAME,
            },
            {
                title: 'No created_at',
                note: 'The separator dot is drawn between pieces that exist — legacy draws it unconditionally and opens with a floating bullet.',
                post: POST_NO_TIMESTAMP,
            },
            {
                title: 'Pinned, edited, reacted',
                note: 'The three header and stat decorations at once.',
                post: POST_DECORATED,
            },
        ],
    },
    {
        heading: 'Body',
        blurb: 'Text and the media shapes, including the payloads that decide whether the card guesses.',
        cases: [
            {
                title: 'Text only',
                note: 'The majority of real posts. No media branch at all.',
                post: POST_TEXT,
            },
            {
                title: 'No text at all',
                note: 'Media-only, and very common. The card must render no paragraph rather than an empty one.',
                post: POST_NO_TEXT,
            },
            {
                title: 'html_text only, no text',
                note: 'The one place this port refuses legacy outright — creator-authored markup is never rendered, so the caption is absent.',
                post: POST_HTML_TEXT_ONLY,
            },
            {
                title: 'Long text',
                note: 'No clamp — a feed shows whole posts, which is legacy’s behaviour.',
                post: POST_LONG_TEXT,
            },
            {
                title: 'One image, dimensions known',
                note: 'Keeps its own aspect ratio, so the box is right before the image loads.',
                post: POST_ONE_IMAGE,
            },
            {
                title: 'One image, no dimensions',
                note: 'Legacy guesses 16/9 here rather than reserving nothing — detectAspectRatio, ported.',
                post: POST_IMAGE_NO_DIMENSIONS,
            },
            {
                title: 'A 4:3 image',
                note: 'The one bucket of detectAspectRatio’s five that nothing else reaches.',
                post: POST_FOUR_THREE,
            },
            {
                title: 'Dimensions as w/h',
                note: 'The older wire spelling. imageAspectRatio is the one place that decides; 15 of legacy’s call sites guess wrong.',
                post: POST_LEGACY_DIMENSIONS,
            },
            {
                title: 'Image with only a thumb',
                note: 'The uri ?? thumb fallback. A blank tile here is indistinguishable from one still loading.',
                post: POST_THUMB_ONLY_IMAGE,
            },
            {
                title: 'Eleven images',
                note: 'A scrolling row at one height. Arrows appear on desktop only when there is somewhere to go.',
                post: POST_MANY_IMAGES,
            },
            {
                title: 'Mixed ratios in a row',
                note: 'The case the fixed row height exists for — any single box shape letterboxes two of these three.',
                post: POST_MIXED_RATIOS,
            },
            {
                title: 'Video',
                note: 'Poster and duration in the feed; press it for the lightbox. A feed that mounts a <video> per card runs out of decoders.',
                post: POST_VIDEO,
            },
            {
                title: 'Video and images together',
                note: 'The payload permits both. Shows the order the two blocks stack in.',
                post: POST_VIDEO_AND_IMAGES,
            },
            {
                title: 'Video with no poster or duration',
                note: 'Falls back thumbnail → cover_image → nothing, and withholds the badge rather than printing 0:00.',
                post: POST_VIDEO_BARE,
            },
        ],
    },
    {
        heading: 'Paywall',
        blurb: 'Four gates, and the two payload shapes that decide whether a price can be named at all. Pressing one opens the real flow.',
        cases: [
            {
                title: 'Locked — members only',
                note: 'Unreachable for a developer: you are always the owner of your own space. Press → the space’s membership page.',
                post: POST_LOCKED_MEMBERS,
            },
            {
                title: 'Locked — purchasable',
                note: 'The media is not in the payload; unlock_detail is all the card can honestly say. Press → the confirm dialog.',
                post: POST_LOCKED_PURCHASE,
            },
            {
                title: 'Locked — either route',
                note: 'The third sentence postGate can produce. Press → the two-route dialog.',
                post: POST_LOCKED_BOTH,
            },
            {
                title: 'Locked — no cover',
                note: 'The paywall IS the cover image. With none, legacy degrades to a 1/1 grey box.',
                post: POST_LOCKED_NO_COVER,
            },
            {
                title: 'Locked — portrait cover, no video',
                note: 'lockCoverAspectRatio’s 3/4 branch. The purchasable case above has a video, which shadows it.',
                post: POST_LOCKED_PORTRAIT,
            },
            {
                title: 'Locked — price is zero',
                note: 'postUnlockPrice answers null, so the dialog refuses rather than offering to "unlock for 0".',
                post: POST_LOCKED_ZERO_PRICE,
            },
            {
                title: 'Gated but purchased',
                note: 'need_unlock_package is still true. Read it without `viewer` and a paying member sees the lock.',
                post: POST_PURCHASED,
            },
        ],
    },
    {
        heading: 'Sensitive content',
        blurb: 'Two covers, not one — which you get depends on the account setting, and an author never gets the settings one.',
        cases: [
            {
                title: 'Flagged by the classifier',
                note: 'detected_nsfw. Media covered, caption readable. With filtering on you get the settings offer.',
                post: POST_NSFW,
            },
            {
                title: 'Marked by the creator',
                note: 'marked_nsfw — a separate field, and either one is enough.',
                post: POST_NSFW_MARKED,
            },
            {
                title: 'Sensitive, and the reader’s own',
                note: 'An author always gets the reveal-once cover — you cannot be asked to change a filter to see your own upload.',
                post: POST_NSFW_OWN,
            },
        ],
    },
    {
        heading: 'Interaction',
        blurb: 'What the action row offers, and what it costs. Reacting on a paid space takes Star before the reaction lands.',
        cases: [
            {
                title: 'Paid interaction',
                note: 'The Star chip on react and comment. Needs a creator who charges, and a cost above 1.',
                post: POST_PAID_INTERACTION,
            },
            {
                title: 'Paid interaction, cost of 1',
                note: 'The threshold: legacy draws no chip at 1, on the grounds that it costs more attention than it conveys.',
                post: POST_PAID_INTERACTION_ONE,
            },
            {
                title: 'Paid interaction, Premium reader',
                note: 'Premium is exempt — no chip, no charge. A prop from features/premium, not a field on the post.',
                post: POST_PAID_INTERACTION,
                premium: true,
            },
            {
                title: 'Replies closed',
                note: 'No comment button at all — legacy returns null on reply_allowed. React still shows.',
                post: POST_REPLIES_CLOSED,
            },
            {
                title: 'Replies for paying members only',
                note: 'postIntent’s fourth branch: the post is open, the replies are sold. Comment → the membership page.',
                post: POST_PAID_REPLIES,
            },
            {
                title: 'The reader’s own post',
                note: 'Bookmark and send-message are absent. Quote is off unless remote config turns it on.',
                post: POST_OWN,
            },
        ],
    },
    {
        heading: 'Overflow menu',
        blurb: 'Two entirely different menus, and neither can be seen from the other’s account.',
        cases: [
            {
                title: 'Owner — four rows',
                note: 'Replies, pin/unpin, delete. Edit is absent until the composer exists.',
                post: POST_OWN_MENU,
            },
            {
                title: 'Stranger — report and block',
                note: 'Report is behind a console kill switch; block needs channel.owner_id.',
                post: POST_OTHER_MENU,
            },
            {
                title: 'Stranger, no owner_id',
                note: 'Block is withheld — a confirmation with nothing to send. Report stays.',
                post: POST_NO_OWNER_ID,
            },
        ],
    },
    {
        heading: 'Attachments',
        blurb: 'The three blocks under the body. All three are gated on the surface, which is the `attachments` prop.',
        cases: [
            {
                title: 'The space is a mini app',
                note: 'has_mini_app + mini_app_url + mini_app_id, all three required. Opening is the caller’s callback.',
                post: POST_MINI_APP,
            },
            {
                title: 'Mini app, flag only',
                note: 'has_mini_app without the URL or id — the banner must be absent, not a button that opens nothing.',
                post: POST_MINI_APP_INCOMPLETE,
            },
            {
                title: 'Affiliate program, no icon',
                note: 'channel.promote. referral_url is the only field it cannot render without.',
                post: POST_AFFILIATE,
            },
            {
                title: 'Affiliate program, with icon',
                note: 'The backend-served app icon, which only a /dev page may reference.',
                post: POST_AFFILIATE_DECORATED,
            },
            {
                title: 'Author’s earnings strip',
                note: '_insights.post_total_revenue, in the reader’s currency. Hidden at zero, and on anyone else’s post.',
                post: POST_INSIGHTS,
            },
            {
                title: 'Same post, attachments off',
                note: 'What a slider or DM embed renders — legacy gates all three on typePost.',
                post: POST_MINI_APP,
                bare: true,
            },
        ],
    },
    {
        heading: 'Navigation and lifecycle',
        blurb: 'Whether the card is a link at all, and what it becomes once the post is gone.',
        cases: [
            {
                title: 'Navigates',
                note: 'shareable_url is present. Press anywhere that is not a control.',
                post: POST_LINKED,
            },
            {
                title: 'No shareable_url',
                note: 'Not a link at all — no cursor, no anchor. Ordinary for the seconds after posting.',
                post: POST_NO_LINK,
            },
            {
                title: 'With a See more footer',
                note: 'legacy’s showSeeMore, for a surface showing the post as a teaser.',
                post: POST_LINKED,
                seeMore: true,
            },
            {
                title: 'Deleted',
                note: 'A tombstone for a row the backend still has. No actions, no menu, no navigation.',
                post: POST_DELETED,
            },
        ],
    },
]

/**
 * The reply box, in the four states the post decides.
 *
 * Every one of them is somebody else's setting: a channel that charges, a post whose creator banned
 * links, a post with replies closed. A developer's own post is none of those, which is the same
 * reason the card needs a harness.
 *
 * What is **not** reachable here is the sign-in gate — the harness runs inside the session stack, so
 * a signed-in developer never sees it. Press *Reply* while signed out to reach it.
 */
const COMPOSER_CASES: { title: string; note: string; post: Post }[] = [
    {
        title: 'Free',
        note: 'The ordinary case. Button says Reply and carries no price.',
        post: POST_REPLY_LINKS_OK,
    },
    {
        title: 'Priced',
        note: 'The channel charges 5 Star to interact, so the price is on the button — and the charge runs before the write.',
        post: POST_PAID_INTERACTION,
    },
    {
        title: 'Links banned',
        note: 'reply_allowed_link is false. Type a URL: the button disables and the reason appears under the box.',
        post: POST_REPLY_NO_LINKS,
    },
    {
        title: 'Followers only',
        note: 'Barred, and the panel takes the box’s place. The link goes to the space, where the real Follow control is.',
        post: POST_REPLIES_FOLLOWERS,
    },
    {
        title: 'Followers only, already following',
        note: 'can_reply is still false — the stale body just after a follow. The box should appear, not the panel.',
        post: POST_REPLIES_FOLLOWED,
    },
    {
        title: 'Members only, post still locked',
        note: 'Offers to unlock — iOS’s label for a post the reader cannot read yet.',
        post: POST_PAID_REPLIES_LOCKED,
    },
    {
        title: 'Members only, post readable',
        note: 'Offers membership instead — the second label legacy web does not have. Saying "unlock" here would sell a post they already own.',
        post: POST_PAID_REPLIES,
    },
    {
        title: 'Creator’s followings',
        note: 'A statement of fact: no control, because nothing the reader presses would fix it.',
        post: POST_REPLIES_FOLLOWINGS,
    },
    {
        title: 'Verified spaces only',
        note: 'Same shape, different sentence.',
        post: POST_REPLIES_VERIFIED,
    },
    {
        title: 'Mentioned spaces only',
        note: 'Same shape, different sentence.',
        post: POST_REPLIES_MENTIONED,
    },
    {
        title: 'Replies off',
        note: 'NONE and reply_allowed: false together, as legacy writes them.',
        post: POST_REPLIES_NONE,
    },
    {
        title: 'Own post, replies closed',
        note: 'The author set the rule, so no panel. Nothing should appear below.',
        post: POST_REPLIES_OWN_CLOSED,
    },
    {
        title: 'Barred, no reason given',
        note: 'can_reply is false with no audience named. Nothing should appear below — an empty panel says less than none.',
        post: POST_REPLIES_UNEXPLAINED,
    },
    {
        title: 'Replies closed (switch only)',
        note: 'reply_allowed false with no audience field — still reads as “replies are off”.',
        post: POST_REPLIES_CLOSED,
    },
]

/**
 * The reply row, in the states the payload decides.
 *
 * *Delete* shows only on `REPLY_OWN`, and only when the signed-in account's id is `3544332405` —
 * the fixture's `owner.id`. On any other account that row is correctly absent, which is the thing
 * to check rather than a bug to report.
 */
const REPLY_CASES: { title: string; note: string; reply: Reply }[] = [
    { title: 'Text', note: 'The ordinary row.', reply: REPLY_TEXT },
    {
        title: 'Long text',
        note: 'Wraps several times. The indent under the name has to survive it, and is dropped below sm.',
        reply: REPLY_LONG,
    },
    {
        title: 'Member',
        note: 'from_subscriber — the author pays for this space. The one mark a reply has that a post card does not.',
        reply: REPLY_MEMBER,
    },
    {
        title: 'Already reacted',
        note: 'Opens on the star’s end frame rather than animating into it.',
        reply: REPLY_REACTED,
    },
    {
        title: 'Has answers',
        note: 'reply_count is its own child replies. The figure is drawn; opening the thread is the next cut.',
        reply: REPLY_WITH_CHILDREN,
    },
    {
        title: 'Images only',
        note: 'No words. A reply the old post-card row would not treat as a reply at all.',
        reply: REPLY_IMAGES,
    },
    {
        title: 'html_text only',
        note: 'Legacy writes one for any reply with a link. No markup is rendered, so the row says so.',
        reply: REPLY_HTML_ONLY,
    },
    {
        title: 'Own reply',
        note: 'owner.id is the reader’s, so the kebab carries Delete. Absent unless you are signed in as 3544332405.',
        reply: REPLY_OWN,
    },
    {
        title: 'Paid interaction',
        note: 'The space charges 5 Star to react, so the star wears a price chip and the charge runs first.',
        reply: REPLY_PAID,
    },
    {
        title: 'Deleted',
        note: 'The tombstone — visible for the moment between a delete and a refetch.',
        reply: REPLY_DELETED,
    },
    {
        title: 'Empty',
        note: 'No words, no pictures, no markup. The payload allows it.',
        reply: REPLY_EMPTY,
    },
]

/** The reader, as the route would supply them. */
/** One of each state the Media grid can draw, in the order the tab would plausibly list them. */
const MEDIA_GRID: Post[] = [
    POST_ONE_IMAGE,
    POST_MANY_IMAGES,
    POST_VIDEO,
    POST_VIDEO_AND_IMAGES,
    POST_LOCKED_PURCHASE,
    POST_LOCKED_BOTH,
    POST_LOCKED_MEMBERS,
    POST_LOCKED_NO_COVER,
    POST_PURCHASED,
    POST_NSFW,
    POST_IMAGE_NO_DIMENSIONS,
    POST_TEXT,
]

const HARNESS_AUTHOR = {
    name: 'Alice Nguyen',
    slug: 'alice',
    thumb: null,
    avatarVideo: null,
    isPremium: false,
    verifiedBadge: null,
}

export function PostPreview() {
    const [composerOpen, setComposerOpen] = useState(false)
    const [_harnessDraft, _setHarnessDraft] = useState<PostDraft>(emptyPostDraft)
    const [_harnessCollections, _setHarnessCollections] = useState<string[]>([])

    return (
        <div className="flex flex-col gap-12">
            <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 border-(--separator-default) border-b pb-2">
                    <h2 className="type-title-t2-semibold text-(--text-title)">Post composer</h2>
                    <p className="type-dense-default text-(--text-subtitle)">
                        The dialog the rail’s <code>+</code> and the tab bar’s FAB both open. Words
                        and pictures only so far — video, audience, paywall and the reply settings
                        are later cuts. Pressing Post hits the real endpoint.
                    </p>
                </div>
                <div>
                    <Button variant="primary" size="medium" onClick={() => setComposerOpen(true)}>
                        Open the composer
                    </Button>
                </div>
                <PostComposerDialog
                    open={composerOpen}
                    onOpenChange={setComposerOpen}
                    author={HARNESS_AUTHOR}
                />

                {/*
                 * No standalone copies of the body or the picker here any more.
                 *
                 * They were added to review geometry without a portal in the way, and they carried
                 * the **same testid scope** as the real dialog — so `post-composer-trigger` matched
                 * three elements and a browser probe could not tell the chip from the upload
                 * button. The dialog above opens from the button, which is the thing to review
                 * anyway; a second copy of a surface is a second set of names for it.
                 */}
            </section>

            <section className="flex flex-col gap-6">
                <div className="flex flex-col gap-1 border-(--separator-default) border-b pb-2">
                    <h2 className="type-title-t2-semibold text-(--text-title)">Reply row</h2>
                    <p className="type-dense-default text-(--text-subtitle)">
                        Built from the measured reply payload, which is not a post’s. Pressing the
                        star hits the real endpoint — these fixtures have no server-side reply, so
                        it will fail and roll back.
                    </p>
                </div>

                <div className="flex max-w-[612px] flex-col gap-px">
                    {REPLY_CASES.map(item => (
                        <div key={item.title} className="flex flex-col gap-1">
                            <div className="flex flex-col gap-0.5">
                                <h3 className="type-title-t3-semibold text-(--text-title)">
                                    {item.title}
                                </h3>
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    {item.note}
                                </p>
                            </div>
                            <div className="bg-(--background-surface)">
                                <ReplyRow
                                    reply={item.reply}
                                    testId={`post-detail-${item.reply.id}-row`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-6">
                <div className="flex flex-col gap-1 border-(--separator-default) border-b pb-2">
                    <h2 className="type-title-t2-semibold text-(--text-title)">Reply composer</h2>
                    <p className="type-dense-default text-(--text-subtitle)">
                        The box under a post on its own page, and the <em>Who can reply?</em> panel
                        that takes its place when the reader is barred. Attaching a picture and
                        pressing Reply both hit the real endpoints — these fixtures have no
                        server-side post, so a send will fail.
                    </p>
                </div>

                {COMPOSER_CASES.map(item => (
                    <div key={item.title} className="flex flex-col gap-2">
                        <div className="flex flex-col gap-0.5">
                            <h3 className="type-title-t3-semibold text-(--text-title)">
                                {item.title}
                            </h3>
                            <p className="type-caption-meta text-(--text-placeholder)">
                                {item.note}
                            </p>
                        </div>
                        <div className="max-w-[612px]">
                            <ReplyComposer
                                post={item.post}
                                /*
                                 * The real one comes from `useMyChannel` via the route; the harness
                                 * stands in for that caller, the way it does for `onOpenMiniApp`.
                                 */
                                author={HARNESS_AUTHOR}
                                testId={`post-detail-${item.post.id}-panel`}
                            />
                        </div>
                    </div>
                ))}
            </section>

            <section className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                    <h2 className="type-title-t2-semibold text-(--text-title)">Media grid</h2>
                    <p className="type-caption-meta text-(--text-placeholder)">
                        A space&rsquo;s Media tab. An open tile opens the lightbox, a locked one the
                        unlock flow, a sensitive one the post page. The Star badge marks any gated
                        post, bought or not.
                    </p>
                </div>
                <div className="grid max-w-[612px] grid-cols-3 gap-1">
                    {MEDIA_GRID.map(post => (
                        <PostMediaTile key={post.id} post={post} />
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                    <h2 className="type-title-t2-semibold text-(--text-title)">
                        Space tier ladder
                    </h2>
                    <p className="type-caption-meta text-(--text-placeholder)">
                        0, 1, 2, 5, 10 — the backend's own rungs, not consecutive. Tier 0 ships a
                        mark and must still draw no badge.
                    </p>
                </div>
                <div className="flex max-w-[612px] flex-col bg-(--background-surface)">
                    {TIER_LADDER.map(post => (
                        <PostCard key={post.id} post={post} testId={`post-card-${post.id}`} />
                    ))}
                </div>
            </section>

            {GROUPS.map(group => (
                <section key={group.heading} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1 border-(--separator-default) border-b pb-2">
                        <h2 className="type-title-t2-semibold text-(--text-title)">
                            {group.heading}
                        </h2>
                        <p className="type-dense-default text-(--text-subtitle)">{group.blurb}</p>
                    </div>

                    {group.cases.map(item => (
                        <div key={item.title} className="flex flex-col gap-2">
                            <div className="flex flex-col gap-0.5">
                                <h3 className="type-title-t3-semibold text-(--text-title)">
                                    {item.title}
                                </h3>
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    {item.note}
                                </p>
                            </div>
                            {/*
                             * The card is a full-bleed band with no frame of its own — legacy's Card
                             * has `borderRadius: 0` and no border — so the harness supplies the
                             * surface and the 612 column around it, exactly as a feed would.
                             */}
                            <div className="max-w-[612px] bg-(--background-surface)">
                                <PostCard
                                    post={item.post}
                                    attachments={item.bare ? false : undefined}
                                    isPremiumReader={item.premium}
                                    onSeeMore={item.seeMore ? () => {} : undefined}
                                    /*
                                     * Supplied so the banner renders at all. The real opener is
                                     * `useMiniApp().open` in whichever surface mounts the feed;
                                     * this feature cannot import it (`post-attachments.tsx` says
                                     * why), so the harness stands in for that caller.
                                     */
                                    onOpenMiniApp={app => window.alert(`open mini app: ${app.id}`)}
                                    onShare={() => window.alert('share')}
                                    testId={`post-card-${item.post.id}`}
                                />
                            </div>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    )
}
