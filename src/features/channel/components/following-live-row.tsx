'use client'

import { appLink, isExclusiveLive, isPlatformRestricted, liveAccess } from '@features/event/access'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import type { FollowedLive } from '../api/types'
import { formatRelativeTime } from '../lib/channel-format'
import { toChannelPath } from '../lib/channel-slug'
import { ChannelLiveBadge } from './channel-live-badge'
import { ChannelLiveRestrictedDialog } from './channel-live-restricted-dialog'

/**
 * One stream in `/following`'s Live now strip — legacy's horizontal card.
 *
 * ## Why this is not `ChannelLiveNow`
 *
 * That component draws the **vertical** card at the top of a space's Posts tab: a full-width 16/9
 * banner with the channel row above it and the title below. This is the *strip* card — banner on the
 * leading side at ~40% of the row, everything else stacked beside it — because there are up to ten of
 * them above the list the screen is actually about, and ten full-width banners is a page of banners
 * with a follow list somewhere underneath. Legacy draws the two shapes separately for the same
 * reason (`containers/home/.../liveItem` against `containers/following/.../liveNow/item`).
 *
 * What *is* shared is every rule that decides meaning rather than layout: `liveAccess` for the gating
 * badge, `isPlatformRestricted` + `appLink` for a stream the website may not play, and
 * `ChannelLiveBadge` for the LIVE flag. Those live in `lib/` precisely so two cards cannot disagree
 * about whether something is free.
 *
 * ## Two marks about access, and they are not the same mark
 *
 * The chip on the metadata line says **Free / Exclusive** — what the stream *is*. The badge over
 * the banner says **what it costs this reader to get in**, and is absent when there is nothing to
 * invite them to. So a paid stream the reader already owns keeps its "Exclusive" chip and loses the
 * price badge, which is right; and an open stream says "Free" in a place the badge could never say
 * it. The two predicates behind them (`isExclusiveLive`, `liveAccess`) are deliberately separate —
 * see the chip's own note, and `@features/event/access` for the trap.
 *
 * ## One destination, unlike the Posts-tab card
 *
 * The whole row goes to the stream. `ChannelLiveNow` splits its card in two (header → the space,
 * banner → the stream) because it already sits *on* that space's page, where a link back to it is
 * useless. Here the reader is on their own follow list, and the row's subject is the stream — the
 * space is reachable from the list below.
 *
 * A stream the website may not play gets **no link at all**: it gets the dialog, at the press rather
 * than one page later. Same call `ChannelLiveNow` makes, and the same reason B74 is open.
 *
 * ## Three deliberate divergences from legacy's card, all of them layout
 *
 * Legacy is the spec for this screen and every value here came off it, so the places this card no
 * longer matches it are stated rather than drifted into. Each has its reasoning at the line it
 * changes; together they are what turns a row that *contained* the right facts into one that ranks
 * them.
 *
 * | what | legacy / before | here | why, in one line |
 * |---|---|---|---|
 * | reading order | chip → title → channel → time | title → channel → chip + time | the stream's name is what the strip is for |
 * | the chip | `large`, 29px, above the title | `small`, 20px, on the metadata line | it outweighed the title it sat over |
 * | the tile | 48% of the column, uncapped | 48% capped at 240px | 48% of a desktop column is a 330px-tall row |
 *
 * Two additions rather than divergences, because legacy draws neither: the hover moved off
 * `opacity` and onto a background plate plus a 3% push on the art, and the row finally has a
 * **focus ring**.
 */
export function FollowingLiveRow({
    live,
    locale,
    testId,
    channelSlug,
}: {
    live: FollowedLive
    locale: string
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
    const [restrictedOpen, setRestrictedOpen] = useState(false)

    /*
     * `normalizeFollowedLives` guarantees both, which is why there is no fallback here: a row
     * without a code or a channel slug never reaches this component.
     */
    const channel = live.channel
    if (!channel) return null

    const restrictedTo = isPlatformRestricted(live) ? appLink(live) : null
    const href =
        restrictedTo === null && live.code
            ? `${toChannelPath(channel.slug)}/event/${encodeURIComponent(live.code)}`
            : null
    const access = liveAccess(live)
    const exclusive = isExclusiveLive(live)
    /**
     * The price as a localised figure, and the sentence that wraps it. Both derived here rather
     * than inline because the badge renders the sentence, the figure *and* an `sr-only` copy, and
     * three call sites formatting the same number is three chances to format it differently.
     */
    const accessPrice =
        access?.price == null ? null : new Intl.NumberFormat(locale).format(access.price)
    const accessLabel = access ? t(access.key, { price: accessPrice ?? '' }) : ''
    /**
     * What the badge says when the tile is too narrow for the full sentence.
     *
     * **The same sentence for two of the three cases** — "Members only" and "Unlock for N" both fit
     * a phone-width tile, so shortening them would be throwing away words there is room for. Only
     * `members_or` does not fit, and it gets a real short form ("Members or N") rather than being
     * reduced to a bare figure: the fact that a *membership* also opens the stream is half of what
     * that label exists to say, and a lone price hides it entirely.
     *
     * It is a **separate key**, not the long one with a word sliced off. "Become" is not a
     * detachable prefix in most of the nine locales — Korean and Chinese put the verb elsewhere or
     * drop it — so a `.replace()` would produce grammar in English and rubble everywhere else.
     */
    const compactLabel =
        access?.key === 'channel_live_members_or'
            ? t('channel_live_members_or_short', { price: accessPrice ?? '' })
            : accessLabel
    const name = channel.name || `@${channel.slug}`
    /*
     * `started_at` — when it actually went on air — with the scheduled time behind it, as
     * `ChannelLiveNow` does: a stream that starts twenty minutes late otherwise advertises a time
     * that has passed. Relative rather than absolute, because in a strip of things happening *now*
     * the recency is the information — see `formatRelativeTime`.
     */
    const shownAt = live.started_at ?? live.start_at
    const since = formatRelativeTime(shownAt, locale)

    const body = (
        <>
            {/*
             * 45%, not 40. The tile has to hold the access badge along its bottom edge, and at 40%
             * of a 390px phone that box is ~131px of usable width — enough for "Members only" and
             * not for "Unlock for 250 ★", so the figure (the one part of it that is information)
             * was the first thing clipped. 45% buys the ~20px that case needs and balances a card
             * whose text column was otherwise twice the height of its picture.
             *
             * ⚠ The longest label — "Become members or N ★", both routes at once — still truncates
             * on a phone, and no share of 358px fits it: the string alone is ~150px before the lock
             * and the Star. It degrades in the right order (the sentence clips, the lock and the
             * figure stay whole) and the chip above the title still says *Exclusive*, so nothing is
             * lost that is not repeated. On desktop all three fit outright.
             */}
            {/*
             * `max-w-[240px]` is the cap this tile did not have, and its absence is what the row
             * actually looked wrong for on a desktop: 48% of a wide column is a ~580px picture with
             * three short lines of 12–14px text floating in the space beside it, and the 16:9 tile
             * then sets a ~330px row height for a card whose content is ~100px tall. The percentage
             * still governs the phone (48% of a 358px column is 172, well under the cap, so every
             * measured number in the badge ladder below is untouched); the cap only stops the
             * picture from becoming the row. 240 is a 135px-tall tile against ~98px of text —
             * enough that the art still leads, close enough that neither side is padding.
             *
             * The hairline is `ChannelEventCard`'s, and load-bearing for the same reason: banner art
             * is frequently light-edged, and without an edge a pale thumbnail dissolves into the
             * surface.
             */}
            <div className="@container relative aspect-video w-[48%] max-w-[240px] flex-none overflow-hidden rounded-(--radius-lg) border border-(--separator-default) bg-(--background-segment)">
                {live.images.banner ? (
                    <Image
                        src={live.images.banner}
                        alt=""
                        fill
                        /* 240 flat above `md` — the tile's own cap, not a share of the column
                           any more — and the viewport's 48% below it. */
                        sizes="(max-width: 900px) 48vw, 240px"
                        /*
                         * A 3% push on hover, from inside the tile's `overflow-hidden` — the whole
                         * row's feedback used to be `opacity-90`, which dims the title and the
                         * channel name to say that the picture is pressable. This says it on the
                         * picture. `transition-transform` is the right property name in Tailwind v4
                         * (it covers `scale`, which is now its own property rather than part of
                         * `transform`) — which is also why reduced motion is answered with
                         * `scale-100` and not `transform-none`: v4 writes the `scale` property, and
                         * resetting `transform` would leave it exactly where it was. The row still
                         * has its background feedback, so nothing is lost by dropping the push.
                         */
                        className="object-cover transition-transform duration-300 ease-out group-hover/live:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/live:scale-100"
                    />
                ) : (
                    // No banner is ordinary — the creator has not uploaded art.
                    <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                        <Icon name="signal-stream" weight="filled" size={24} />
                    </div>
                )}
                {/* Top-leading, inset by 6 rather than the vertical card's 8: the tile here is
                    at most 240 wide against that one's 612, so the same inset reads as a wider
                    margin on a smaller picture. */}
                {/*
                 * `w-14` (56px), against the flag's own default 80.
                 *
                 * That default is legacy's, and legacy puts this flag on an 80–120px **avatar**;
                 * here it sits on a tile that is 48% of the column capped at 240 — so 240 on desktop
                 * and ~172 on a phone, where an 80px flag is a third to a half of the width of the
                 * picture it is annotating. The badge is a mark on the art, not a caption for it.
                 */}
                <div className="absolute start-1.5 top-1.5">
                    <ChannelLiveBadge className="w-14" />
                </div>
                {access && (
                    /*
                     * The DS `Badge/Overlay` paint, identical to `ChannelLiveNow`'s — the tokens are
                     * what keep it legible over both a bright banner and a dark one.
                     *
                     * ## The padlock stays, and taking it out was the wrong economy
                     *
                     * It came out for a turn to buy 20px (the glyph plus its gap) so the longer
                     * labels would fit. That was wrong, and the members-only case is what showed it:
                     * that label has **no price and no Star**, so with the lock gone the badge was a
                     * bare run of text on a translucent plate — it stopped reading as a badge at all.
                     * The mark is what makes the plate a *thing*, not decoration on top of one, and
                     * "the chip already says Exclusive" does not cover it: the chip is in the text
                     * column and this is on the picture, read separately.
                     *
                     * The width it costs is paid for below instead, by a threshold that is measured
                     * rather than by deleting the mark.
                     *
                     * ## A three-rung ladder, and every rung is a measured number
                     *
                     * `@container` on the tile — a **container** query, not a viewport one, because
                     * what constrains this badge is the tile, and the tile is a percentage of a
                     * column that is itself capped at 612. A `md:` breakpoint would be guessing at
                     * that relationship rather than reading it.
                     *
                     * | tile | shows |
                     * |---|---|
                     * | ≥ 213 | the full sentence — the width it measured at, with the lock |
                     * | ≥ 160 | `compactLabel`, a real short translation (see it) |
                     * | below | the figure and the Star, or the label where there is no figure |
                     *
                     * 160 sits between two **measured** tiles: a 375px phone gives 164.6 (where the
                     * short form fits) and a 360px one gives 157.4 (where it does not) — and 360 is
                     * a live Android width, not a hypothetical. Picking 165 off the arithmetic
                     * instead of the ruler put 375 on the wrong rung by four tenths of a pixel. The point of the bottom rung is that it degrades by
                     * **choosing a shorter string**, not by clipping one: these numbers are measured
                     * against English, and a longer translation simply drops a rung earlier instead
                     * of losing characters off the end. `truncate` stays as the last resort under
                     * that, never as the plan.
                     *
                     * The full sentence is `sr-only` and unconditional, so nothing is ever lost to a
                     * screen reader; the two visible spans are `aria-hidden` so it is not read twice.
                     */
                    <div className="absolute end-1.5 bottom-1.5 inline-flex h-6 max-w-[calc(100%-12px)] items-center gap-1 rounded-(--radius-fill) bg-(--opacity-labels-55) px-2 text-(--text-on-accent) shadow-[inset_0_0_0_1px_var(--opacity-white-25)]">
                        <Icon name="lock-simple" size={16} className="flex-none" />
                        <span className="sr-only">{accessLabel}</span>
                        <span
                            aria-hidden="true"
                            className="type-caption-label hidden min-w-0 truncate @min-[213px]:inline"
                        >
                            {accessLabel}
                        </span>
                        <span
                            aria-hidden="true"
                            className="type-caption-label hidden min-w-0 truncate @min-[160px]:inline @min-[213px]:hidden"
                        >
                            {compactLabel}
                        </span>
                        <span
                            aria-hidden="true"
                            className="type-caption-label min-w-0 truncate @min-[160px]:hidden"
                        >
                            {accessPrice ?? compactLabel}
                        </span>
                        {/* The Star mark rides with the figure, as it does everywhere a price is
                            named in this app — never a bare number, and never the sprite's flat
                            `star` glyph, which is a different mark (`shared/components/star-mark`). */}
                        {access.price !== null && <StarMark size={16} />}
                    </div>
                )}
            </div>

            {/*
             * The text column — **title, then who, then what it costs and when**.
             *
             * ## The reading order is not legacy's, and the chip is why
             *
             * Legacy leads the column with the *Free / Exclusive* chip at its largest step, and
             * ported 1:1 that made the loudest thing in the row a grey pill reading "Free" — a fact
             * that is true of most streams in the strip — while the stream's own name sat under it
             * at 14px. A strip whose only job is "pick one of these to watch" has to lead with the
             * name, so the order here is the one every video row converges on: **title → channel →
             * metadata**, and the chip is metadata.
             *
             * `gap-1.5` rather than `gap-1`: at 4px all four rows were equally spaced, so the column
             * read as one block of text rather than three facts. 6px is still tighter than the row
             * gap above it, which is what keeps the group looking like a group.
             */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                {live.title && (
                    // Two lines then ellipsis — a stream title is not a headline.
                    <p className="type-dense-strong line-clamp-2 min-w-0 text-(--text-title)">
                        {live.title}
                    </p>
                )}
                <div className="flex min-w-0 items-center gap-1">
                    <AnimatedAvatar
                        size="xs"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        /*
                         * Still, not animated, and this is the one place in the screen where that
                         * is a *layout* decision rather than a taste one: the avatar is 24px here,
                         * which is below the size an animated clip resolves at, and up to ten of
                         * them play above a list that also has avatars.
                         */
                        isPremium={false}
                        alt=""
                        initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                    <span className="type-caption-label min-w-0 truncate text-(--text-title)">
                        {name}
                    </span>
                    <VerifiedBadge image={channel.verified_tick_badge?.image} size="caption" />
                    {/* Both text runs truncate rather than taking legacy's fixed 35% caps: with a
                        cap, a short name still surrenders two thirds of the line to nothing. */}
                    <span className="type-caption-meta min-w-0 truncate text-(--text-body)">
                        @{channel.slug}
                    </span>
                </div>

                {/*
                 * The metadata line: what the stream *is*, and when it started.
                 *
                 * `flex-wrap` because the two together are the widest thing in this column on a
                 * phone — "Exclusive" plus "20 minutes ago" is ~190px against a ~186px column — and
                 * the graceful failure is a second line, not a clipped time. `gap-x-2 gap-y-1`, so
                 * the wrapped state still reads as one group.
                 */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    {/*
                     * Free / Exclusive — legacy's chip for this card.
                     *
                     * ## It is **not** the badge over the banner said twice
                     *
                     * They answer different questions, and both are worth answering. The banner badge
                     * is `liveAccess`: *should this reader be invited to unlock, and at what price* —
                     * so it is absent for somebody who already paid, and absent for an open stream.
                     * This chip is `isExclusiveLive`: *is the stream gated at all* — a property of
                     * the stream, identical for every viewer. Which is why the chip can say **Free**,
                     * a thing the badge structurally cannot: `liveAccess` returning `null` covers
                     * open streams and paid-up readers alike, so drawing "Free" from it would label a
                     * paid stream free for exactly the people who paid. That distinction is the whole
                     * reason `isExclusiveLive` is a second function; its own note has the long
                     * version.
                     *
                     * ## Glyph **and** label, both from legacy's own pair
                     *
                     * `badge-dollar` for Exclusive and `users` for Free — which is what legacy draws
                     * (`IMAGES_STATIC.icons.iconExclusive` and MUI's `GroupRoundedIcon`), and both
                     * exist in the sprite at `filled`, so nothing is being substituted for a missing
                     * glyph. `badge-dollar` rather than a second `lock-simple`, deliberately: the
                     * banner already carries a lock two centimetres away for the *price*, and a
                     * second lock would read as the same statement twice where a money mark reads as
                     * the category.
                     *
                     * Both statuses are `default` — one grey pill, and the **icon plus the word** is
                     * the whole difference. Legacy does the same (its Chip takes no colour), and it
                     * is the right call here for a reason of its own: this card already carries a red
                     * Live flag and, when gated, a dark price badge. A third coloured pill would be
                     * the third thing on a 138px-wide tile competing to be looked at first.
                     *
                     * ⚠ `size="small"` (20px box, 12/18) against legacy's — and this file's previous
                     * — `large` (29px, 14/21). Only the *size* is being taken back: `weight="strong"`
                     * stays, because a heavier label on this card is the product's own call and
                     * `badge.tsx` records it. At `large` the chip outweighed the title beside it; at
                     * `small` it sits level with the timestamp it now shares a line with, which is
                     * the altitude a fact about a stream's category belongs at.
                     */}
                    <Badge size="small" status="default" weight="strong" className="flex-none">
                        {/*
                         * 12, which is the DS's own icon column for `small` — the `size-3` class
                         * wins over the width/height attributes because the variant rule is
                         * `[&_svg:not([class*='size-'])]`, and `IconSize` has no 12 for the
                         * attribute to carry. The previous `large` chip rendered its glyph at 14
                         * against a paired 20 for exactly this reason: at the DS's number the mark
                         * read as heavy as the word beside it. One step down, the pairing is the
                         * design system's again and the override is only what the type union cannot
                         * express.
                         */}
                        <Icon
                            name={exclusive ? 'badge-dollar' : 'users'}
                            weight="filled"
                            size={16}
                            className="size-3"
                            aria-hidden="true"
                        />
                        {t(exclusive ? 'following_live_exclusive' : 'following_live_free')}
                    </Badge>
                    {/*
                     * The bare relative time, with **no "Started …" prefix**. A prefix has to claim a
                     * tense, and this card cannot: `started_at` is in the past for a stream that is on
                     * air, but the fallback `start_at` is a *scheduled* time and can be in the future,
                     * which would print "Started in 20 minutes". `Intl` already puts the tense in the
                     * value ("20 minutes ago", "in 20 minutes"), so the prefix could only contradict it.
                     */}
                    {since && (
                        <time
                            dateTime={shownAt ?? undefined}
                            className="type-caption-meta min-w-0 truncate text-(--text-placeholder)"
                        >
                            {since}
                        </time>
                    )}
                </div>
            </div>
        </>
    )

    /*
     * The row's own box. `-mx-2 p-2` pulls the plate 8px into the list's 16px padding so the hover
     * fill reads as *this row* rather than as a rectangle floating inside it, while the tiles stay
     * on the list's own left edge.
     */
    const row = '-mx-2 flex min-w-0 items-stretch gap-3 rounded-(--radius-lg) p-2'
    /*
     * What the two pressable renderings add. `hover:bg-(--background-subtle)` is the same feedback
     * `ChannelEventCard` uses, and it replaces `hover:opacity-90` — which faded the text and the
     * picture together to signal that the row was pressable, i.e. answered a pointer by making the
     * thing under it harder to read. The focus ring is the app's own
     * (`focus-visible:outline-(--focus-ring)`), and it was simply missing: a keyboard reader
     * tabbing the strip had nothing at all to look at.
     *
     * `group/live` is **named**, and only on these two: the banner's zoom hangs off it, and an
     * unnamed `group` here would also be claimed by anything a future row nests inside it.
     */
    const interactive =
        'group/live transition-colors hover:bg-(--background-subtle) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)'

    /*
     * **No entrance of its own.** The strip animates as one block (`FollowingView` puts `RISE` on
     * the section), so a per-row rise here would be a second animation inside one that is already
     * running — and it is also what made "Show more" asymmetric, since the rows it revealed rose in
     * and then vanished on the way back. The section is what arrives; these are its contents.
     */
    return (
        <li data-testid={testId} data-channel-slug={channelSlug}>
            {href ? (
                <Link
                    data-testid="channel-following-live-link"
                    href={href}
                    className={`${row} ${interactive} no-underline`}
                >
                    {body}
                </Link>
            ) : restrictedTo ? (
                // A button, not a link: it opens a dialog and navigates nowhere, so announcing it
                // as a link would promise a destination it does not have.
                <button
                    data-testid="channel-following-live-restricted"
                    type="button"
                    className={`${row} ${interactive} w-full text-start`}
                    onClick={() => setRestrictedOpen(true)}
                >
                    {body}
                </button>
            ) : (
                <div className={row}>{body}</div>
            )}

            {restrictedTo && (
                <ChannelLiveRestrictedDialog
                    open={restrictedOpen}
                    onOpenChange={setRestrictedOpen}
                    url={restrictedTo}
                />
            )}
        </li>
    )
}
