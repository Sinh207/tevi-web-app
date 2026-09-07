'use client'

import { toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import Link from 'next/link'
import { type SearchChannel, searchChannelName } from '../api/types'

/**
 * One global-search result: avatar, name with its marks, handle.
 *
 * The DS `List/User Item` (2089:2965) with **no `__cta` slot** — this row has one action, which
 * is "go there", so the row *is* the control. That is the one structural difference from
 * `BlockedAccountRow`, and it is what lets the whole 80px band be a single anchor rather than an
 * anchor around the name with a button beside it.
 *
 * ## The link wraps the row, not the name
 *
 * Legacy makes the row a `div` with an `onClick` that pushes `/@{slug}` — not focusable, not
 * middle-clickable, no status-bar preview, and invisible to a screen reader as a destination.
 * Here it is one `<a>` with the whole row inside it. Nothing else in the row is interactive, so
 * there is no nested-control problem: the reason `BlockedAccountRow` scopes its anchor to the
 * identity block is that it has an Unblock button, and this row does not.
 *
 * `normalizeSearchChannels` guarantees a slug, so there is no "row without a link" branch to
 * write — a row that could not be reached was dropped at the boundary.
 *
 * ## Two lines, so the row centres them
 *
 * Both `ListUserItemAvatar` and `ListUserItemPreview` are drawn `items-start` for the DS's
 * three-line conversation row. A result has a name and a handle and nothing else — no date, no
 * preview — so top alignment leaves 21px of air underneath and the avatar sitting visibly above
 * the name it belongs to. `items-center` on both, the same override `BlockedAccountRow` applies
 * for its own two-line case.
 *
 * ## The avatar animates here, unlike on the blocked list
 *
 * `isPremium` is passed through rather than pinned to `false`. That is the opposite call to
 * `BlockedAccountRow`, and the difference is what the screen is for: a list of people you have
 * blocked should not spend a battery on their clips, while a list of creators you are choosing
 * between is exactly where a Premium creator's avatar is meant to be seen. `AnimatedAvatar` still
 * gates playback on visibility, reduced motion and `saveData`, so the cost is bounded by what is
 * actually on screen.
 */
export function SearchChannelRow({
    channel,
    rule,
    onOpen,
    /**
     * Milliseconds of entrance delay. The list staggers its first screen and hands later rows
     * `0` — see `SearchView`.
     */
    enterDelay = 0,
    testId,
    channelSlug,
}: {
    channel: SearchChannel
    /** Draw a hairline above this row. Every row but the first. */
    rule: boolean
    /** Called on press, so the term can be recorded as a recent. Navigation is the link's. */
    onOpen: () => void
    enterDelay?: number
    /**
     * The row's own `data-testid`, plus the identity of the thing it shows in a companion
     * attribute. Passed rather than spread because this component has a closed prop list — a
     * `data-testid` handed to it would otherwise be dropped silently, which is a whole class of
     * "the id is there but nothing can find it". See docs/TEST_IDS.md.
     */
    testId?: string
    channelSlug?: string
}) {
    const { t } = useTranslation()

    const name = searchChannelName(channel)
    const label = name || `@${channel.slug}`
    const verifiedImage = channel.verified_tick_badge?.image ?? null

    return (
        <li
            data-testid={testId}
            data-channel-slug={channelSlug}
            className="animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none"
            style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            <Link
                data-testid="search-result-link"
                href={toChannelPath(channel.slug)}
                onClick={onOpen}
                /*
                 * **No prefetch**, and on this screen that is not a micro-optimisation.
                 *
                 * `Link` prefetches on viewport entry by default, so a results list paginating to
                 * a hundred rows sends a hundred RSC requests for `/@{slug}` — a route that is
                 * dynamic and server-fetches the channel — to open exactly one of them. That is
                 * the opposite trade from a nav rail, where there are five destinations and one is
                 * certain to be used.
                 *
                 * The cost is a slower first paint on the space that *is* pressed. It is the right
                 * side of the trade for a list built to be scanned, and it is the standard call
                 * for long lists of links.
                 */
                prefetch={false}
                /*
                 * `focus-visible` on the anchor rather than on anything inside it: the anchor is
                 * the row, so the ring belongs around the row. `-outline-offset-2` (inward) and
                 * not the usual positive offset — a ring drawn *outside* an 80px row that is
                 * flush against the panel's edge is clipped by the panel's `overflow-hidden`,
                 * which is how a focus ring goes missing on exactly the rows at the top and
                 * bottom of a card.
                 */
                className="block no-underline outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                {/*
                 * Surface, not Listing, and the hover is Segment — the two token overrides
                 * `blocked-account-row.tsx` documents in full. Short version: `ListUserItem`
                 * paints `--background-listing`, which is `--black` in Dark and identical to
                 * `--background`, so an un-overridden row repaints the page colour over the card
                 * it sits in; and `--background-subtle` is the same `#18181b` as
                 * `--background-surface` in Dark, so a subtle hover would do nothing at all.
                 */}
                <ListUserItem className="bg-(--background-surface) transition-colors hover:bg-(--background-segment)">
                    <ListUserItemAvatar className="items-center">
                        <AnimatedAvatar
                            size="large"
                            thumb={channel.images.thumb}
                            avatarVideo={channel.images.avatar_video}
                            isPremium={channel.is_premium}
                            /*
                             * Decorative: the anchor's own text already names this space, and the
                             * avatar is inside the anchor — an `alt` here would have a screen
                             * reader read the name twice for one link.
                             */
                            alt=""
                            initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                        />
                    </ListUserItemAvatar>

                    <ListUserItemContent>
                        {rule && <ListRowRule />}
                        <ListUserItemPreview className="items-center">
                            <ListUserItemInfo>
                                <ListUserItemNameRow className="w-full">
                                    <ListUserItemName premium={channel.is_premium}>
                                        {label}
                                    </ListUserItemName>
                                    {/* The badge *image* is the fact, and the gate lives in
                                        `VerifiedBadge`: the payload object is present (`{}`) on
                                        an ordinary unverified account, so there is nothing to
                                        draw without art — no sprite fallback. */}
                                    <VerifiedBadge image={verifiedImage} size={24} />
                                    {/*
                                     * Legacy overlays a hand-drawn pink diamond on the avatar for
                                     * this. Two reasons it is a labelled sprite glyph beside the
                                     * name instead: the DS ships the `nsfw` glyph (the channel's
                                     * own bio row already uses it), so there is nothing to draw
                                     * by hand — and a mark *in the name row* is read out with
                                     * the name, where a decorative overlay on an avatar is read
                                     * out as nothing at all.
                                     *
                                     * `title` rather than `aria-hidden`, because this one is
                                     * information and not decoration: it is the only thing on
                                     * the row that says the space is sensitive.
                                     *
                                     * **`--accents-nsfw`, not `--icon-secondary`.** The DS ships
                                     * one token for this fact (`#f43fca` Light, `#ff5ed9` Dark),
                                     * which is also legacy's pink, and `FollowingChannelRow`'s
                                     * note already says what grey costs: it "reads as one more
                                     * secondary icon; the point of the mark is that it is not".
                                     * Pink **ink** here rather than the pink disc the tile and
                                     * `/following` use, because there is no avatar corner to sit
                                     * on — the same call `NsfwInfoDialog` makes for its inline
                                     * glyph. Measured on the row's Surface: 3.28:1 Light and
                                     * 6.62:1 Dark, both over WCAG's 3:1 for a graphic.
                                     */}
                                    {channel.is_nsfw && (
                                        <Icon
                                            name="nsfw"
                                            weight="filled"
                                            size={18}
                                            title={t('channel_nsfw')}
                                            className="flex-none text-(--accents-nsfw)"
                                        />
                                    )}
                                </ListUserItemNameRow>
                                <ListUserItemHandle>@{channel.slug}</ListUserItemHandle>
                            </ListUserItemInfo>
                        </ListUserItemPreview>
                    </ListUserItemContent>
                </ListUserItem>
            </Link>
        </li>
    )
}
