'use client'

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
import { appLink, isExclusiveLive, isPlatformRestricted, liveAccess } from '../lib/live-access'
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
 ## Two marks about access, and they are not the same mark
 *
 * The chip above the title says **Free / Exclusive** — what the stream *is*. The badge over the
 * banner says **what it costs this reader to get in**, and is absent when there is nothing to
 * invite them to. So a paid stream the reader already owns keeps its "Exclusive" chip and loses the
 * price badge, which is right; and an open stream says "Free" in a place the badge could never say
 * it. The two predicates behind them (`isExclusiveLive`, `liveAccess`) are deliberately separate —
 * see the chip's own note, and `live-access.ts` for the trap.
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
            <div className="@container relative aspect-video w-[48%] flex-none overflow-hidden rounded-(--radius-lg) bg-(--background-segment)">
                {live.images.banner ? (
                    <Image
                        src={live.images.banner}
                        alt=""
                        fill
                        /* The tile is 40% of a column that caps at 612 — so ~245 at the widest, and
                           at most the viewport below `md`. */
                        sizes="(max-width: 900px) 48vw, 294px"
                        className="object-cover"
                    />
                ) : (
                    // No banner is ordinary — the creator has not uploaded art.
                    <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                        <Icon name="signal-stream" weight="filled" size={24} />
                    </div>
                )}
                {/* Top-leading, inset by 6 rather than the vertical card's 8: the tile here is
                    roughly 245 wide against that one's 612, so the same inset reads as a wider
                    margin on a smaller picture. */}
                {/*
                 * `w-14` (56px), against the flag's own default 80.
                 *
                 * That default is legacy's, and legacy puts this flag on an 80–120px **avatar**;
                 * here it sits on a tile that is 40% of a 612 column — ~245px on desktop and ~138 on
                 * a phone, where an 80px flag is well over half the width of the picture it is
                 * annotating. The badge is a mark on the art, not a caption for it.
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
                     * "the chip above already says Exclusive" does not cover it: the chip is in the
                     * text column and this is on the picture, read separately.
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

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                {/*
                 * Free / Exclusive — legacy's chip for this card, in legacy's position above the
                 * title.
                 *
                 * ## It is **not** the badge over the banner said twice
                 *
                 * They answer different questions, and both are worth answering. The banner badge is
                 * `liveAccess`: *should this reader be invited to unlock, and at what price* — so it
                 * is absent for somebody who already paid, and absent for an open stream. This chip
                 * is `isExclusiveLive`: *is the stream gated at all* — a property of the stream,
                 * identical for every viewer. Which is why the chip can say **Free**, a thing the
                 * badge structurally cannot: `liveAccess` returning `null` covers open streams and
                 * paid-up readers alike, so drawing "Free" from it would label a paid stream free for
                 * exactly the people who paid. That distinction is the whole reason
                 * `isExclusiveLive` is a second function; its own note has the long version.
                 *
                 * ## Glyph **and** label, both from legacy's own pair
                 *
                 * `badge-dollar` for Exclusive and `users` for Free — which is what legacy draws
                 * (`IMAGES_STATIC.icons.iconExclusive` and MUI's `GroupRoundedIcon`), and both exist
                 * in the sprite at `filled`, so nothing is being substituted for a missing glyph.
                 * That is the distinction from the row's kebab, where the marks went: there the
                 * shapes did not exist and the nearest ones would have meant something else. Here
                 * the design is specified and the art is present.
                 *
                 * `badge-dollar` rather than a `lock-simple`, and deliberately: the banner already
                 * carries a lock two centimetres away for the *price*. A second lock would read as
                 * the same statement twice; a money mark reads as the category.
                 *
                 * Both statuses are `default` — one grey pill, and the **icon plus the word** is the
                 * whole difference. Legacy does the same (its Chip takes no colour), and it is the
                 * right call here for a reason of its own: this card already carries a red Live flag
                 * and, when gated, a dark price badge. A third coloured pill would be the third
                 * thing on a 138px-wide tile competing to be looked at first.
                 *
                 * `size="large"` is the DS's 29px box at 14 / 21 with a 20px glyph — the step legacy's
                 * own chip sits at (26/14).
                 *
                 * `weight="strong"` is **not** a DS axis: `.tevi-badge` pins `font-weight: regular`
                 * for the whole component. It is here because the product asked for it on this card
                 * after that line was put in front of them, and `badge.tsx` carries the full note
                 * plus the reason the axis had to live in the component rather than in a class
                 * passed from here. This is the one call site that opts in.
                 */}
                <Badge size="large" status="default" weight="strong" className="w-fit flex-none">
                    {/*
                     * Rendered at **14**, not the 20 the DS table pairs with `large` and not the 16
                     * the attribute asks for. `IconSize` has no 14 — the union is 16/18/20/22/24/32
                     * — so the box comes from `size-3.5` and the attribute is only the floor that
                     * type-checks. That is the opt-out `Icon` is built to allow: the variant rule is
                     * `[&_svg:not([class*='size-'])]`, so a `size-*` class beats the width/height
                     * attributes. Same mechanism the row's pin mark uses, and `channel-menu.tsx`
                     * documents it in the other direction.
                     *
                     * A departure from the DS's icon column for this size, asked for on this card:
                     * at 20 the glyph read as heavy as the word beside it rather than as its mark.
                     */}
                    <Icon
                        name={exclusive ? 'badge-dollar' : 'users'}
                        weight="filled"
                        size={16}
                        className="size-3.5"
                        aria-hidden="true"
                    />
                    {t(exclusive ? 'following_live_exclusive' : 'following_live_free')}
                </Badge>
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
                    <VerifiedBadge image={channel.verified_tick_badge?.image} size={14} />
                    {/* Both text runs truncate rather than taking legacy's fixed 35% caps: with a
                        cap, a short name still surrenders two thirds of the line to nothing. */}
                    <span className="type-caption-meta min-w-0 truncate text-(--text-body)">
                        @{channel.slug}
                    </span>
                </div>
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
        </>
    )

    const row = 'flex min-w-0 items-stretch gap-3'

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
                    className={`${row} no-underline transition-opacity hover:opacity-90`}
                >
                    {body}
                </Link>
            ) : restrictedTo ? (
                // A button, not a link: it opens a dialog and navigates nowhere, so announcing it
                // as a link would promise a destination it does not have.
                <button
                    data-testid="channel-following-live-restricted"
                    type="button"
                    className={`${row} w-full text-start`}
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
