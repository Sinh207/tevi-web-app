'use client'

import { OpenMiniAppButton } from '@features/mini-app'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import {
    VERIFIED_BADGE_CROWN,
    VERIFIED_BADGE_SIZE,
    VERIFIED_BADGE_TIER,
} from '@shared/components/verified-badge-size'
import { useTranslation } from '@shared/i18n/use-translation'
import { spaceTierBadge } from '@shared/lib/space-tier'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemMeta,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPin,
    ListUserItemPreview,
} from '@shared/ui/list'
import Image from 'next/image'
import Link from 'next/link'
import { type FollowedChannel, isFollowedChannelMuted } from '../api/types'
import { formatRelativeTime } from '../lib/channel-format'
import { toChannelPath } from '../lib/channel-slug'
import { FollowingRowActions, FollowingRowMenu } from './following-row-menu'

/**
 * The 18+ glyph's box: the tick's visible height (¾ of its box) over the glyph's own ~92% fill, so
 * the two draw the same height of ink. From the tick, not `VERIFIED_BADGE_TIER` — the tier mark is
 * sized up to make up for its pointed silhouette, and a solid diamond needs no such help.
 */
const NSFW_MARK_BOX = Math.round((VERIFIED_BADGE_SIZE.body * 0.75) / 0.92)

/**
 * One followed space.
 *
 * ## This is the row the DS component was drawn for
 *
 * `List/User Item` (Figma 2089:2965) ships two axes nothing had used yet — `Pinned` and `Muted` —
 * plus a third text line whose example string in Figma is literally *"Last activity 1 month ago"*.
 * `BlockedAccountRow` and `FollowRequestRow` are the same component with those switched off; this is
 * the one that turns them on, so `ListUserItemPin` and `ListUserItemMute` have their first call site
 * here and there is no geometry left for this file to decide.
 *
 * The pinned state does **not** repaint the row, which is a departure from the DS — see the note on
 * `ListUserItem` below for what carries it instead and why the tint came back out.
 *
 * ## The whole row is the link, and the kebab is not inside it
 *
 * Unlike the other two rows in this feature, where the anchor wraps only the name: those rows' CTAs
 * are the point (Unblock, Accept / Decline) and the name is secondary. Here the row *is* a
 * navigation target — legacy wraps everything but the kebab in a `<Link>` — so the link covers the
 * avatar and all three text lines, and the menu button is its sibling. A `<button>` inside an `<a>`
 * is invalid HTML the browser silently "fixes" by hoisting it out, so this is not a stylistic
 * choice; `ChannelLiveNow` records the same constraint.
 *
 * ## Muted and pinned are marks, not text
 *
 * Both are `aria-hidden` glyphs with an `sr-only` word behind them, rather than `aria-label`s on a
 * `<span>`: a decorative-by-default element with a label is announced inconsistently across screen
 * readers, and both facts belong to the *space*, so they read best as part of its name — "Ada,
 * pinned, muted".
 *
 * The exit is presentation only. What it hides is a row whose unfollow is still cancellable, so
 * unlike the blocked list this animation is not followed by a cache write — see
 * `useFollowedChannels`.
 */
export function FollowingChannelRow({
    channel,
    rule,
    /** This row's write is in flight — the kebab spins nothing, but nothing else may be pressed. */
    pending = false,
    /** *Some* row's write is in flight. The list is single-flight; see `useFollowedChannels`. */
    busy = false,
    exiting,
    onTogglePin,
    onToggleMute,
    onUnfollow,
    /** Milliseconds of entrance delay — the list staggers its first screen. */
    enterDelay = 0,
    locale,
    testId,
    channelSlug,
}: {
    channel: FollowedChannel
    rule: boolean
    pending?: boolean
    busy?: boolean
    exiting: boolean
    onTogglePin: () => void
    onToggleMute: () => void
    onUnfollow: () => void
    enterDelay?: number
    /**
     * The row's own `data-testid`, plus the identity of the thing it shows in a companion
     * attribute. Passed rather than spread because this component has a closed prop list — a
     * `data-testid` handed to it would otherwise be dropped silently, which is a whole class of
     * "the id is there but nothing can find it". See docs/TEST_IDS.md.
     */
    testId?: string
    channelSlug?: string
    locale: string
}) {
    const { t } = useTranslation()

    const name = channel.name || `@${channel.slug}`
    const muted = isFollowedChannelMuted(channel)
    const verifiedImage = channel.verified_tick_badge?.image ?? null
    const tierBadge = spaceTierBadge(channel)
    const lastActivity = formatRelativeTime(channel.last_activity_at, locale)

    return (
        /*
         * The animated box is the `<li>` and the row inside it keeps its 80px, so the content is
         * *clipped* as the gap closes rather than squashed — which is what makes `overflow-hidden`
         * load-bearing here rather than tidy. Same construction as `FollowRequestRow`.
         */
        <li
            data-testid={testId}
            data-channel-slug={channelSlug}
            aria-hidden={exiting || undefined}
            className={cn(
                'overflow-hidden',
                exiting
                    ? 'pointer-events-none animate-[tevi-row-collapse_320ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:hidden motion-reduce:animate-none'
                    : 'animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none',
            )}
            style={!exiting && enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            {/*
             * Surface over the DS's Listing paint, and Segment for hover — both forced by dark mode,
             * both explained at length on `blocked-account-row.tsx`. `pinned` is still handed to the
             * component for its `data-pinned` attribute; its paint is overridden here.
             *
             * ## A pinned row keeps the ordinary background, and the mark carries the state
             *
             * `ListUserItem`'s `pinned` paints `--background-subtle`, which does nothing in Dark
             * (subtle and surface are both `--zinc-100` there). This carried a `--primary-50` tint
             * for a turn — the one `NotificationRow` uses for unread, which does work in both modes
             * — and it came back out: the product's call, and a defensible one. That tint means
             * "there is something here for you" on a notification, and pinning is the reader's own
             * shelf-ordering, not news. Three tinted rows at the top of a follow list read as three
             * alerts.
             *
             * So the state is carried by the mark over the avatar (`ListUserItemPin`, a filled indigo
             * disc) plus the `sr-only` word, and the row paints like any other. If a tint is ever
             * wanted back, `--primary-50` / `--primary-100` is the pair that survives both themes and
             * `notification-row.tsx` is written up about why.
             */}
            <ListUserItem
                pinned={channel.pin}
                muted={muted}
                className="group/row bg-(--background-surface) transition-colors hover:bg-(--background-segment)"
            >
                {/* `items-center`, always. The DS slot is `items-start`, drawn for the three-line
                    stack this row no longer has — with two lines the avatar hangs visibly high. */}
                <ListUserItemAvatar className="items-center">
                    <AnimatedAvatar
                        size="large"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        /*
                         * A Premium creator's clip **does** play here, unlike on the blocked list
                         * and the request queue: this is a list of spaces the reader chose to
                         * follow, which is exactly the audience the animated avatar is a perk for.
                         * `AnimatedAvatar` only plays what is on screen (`useInView`), so a long
                         * list is not a long list of playing videos.
                         */
                        isPremium={channel.is_premium}
                        alt=""
                        initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                    {channel.pin && (
                        /*
                         * `top-3`, overriding the DS slot's `top-1` — and it is **this row's own
                         * doing**, not a correction to the port.
                         *
                         * `ListUserItemPin` is positioned against the *avatar column*, not the
                         * avatar (Figma: x 48 / y 4 from the column's edge — its own note says so).
                         * That lands correctly while the column is `items-start`, where the 48px
                         * avatar begins 8px down and the mark straddles its top edge by 4. This row
                         * centres the avatar instead — it is two lines now, not the comp's three —
                         * so the avatar starts at (80 − 48) / 2 = 16 and a mark still pinned at 4
                         * floats a clear 12px above it, detached. 16 − 4 = 12 keeps the DS's own
                         * relationship to the avatar's corner, which is the thing that was
                         * specified; the 4 was only ever a way of expressing it.
                         *
                         * Change the column's alignment and this number moves with it. It is
                         * derived, not tuned by eye.
                         *
                         * The **ring** is overridden for a different reason: it is a *cut-out*, so it
                         * has to be the colour of the row behind it — `--background-surface`, what
                         * this row paints, not the DS slot's `--background`, which is the *page*.
                         * Those are two different colours in Light, so the DS default draws a grey
                         * hairline halo on a white row. `NotificationRow` sets the same override on
                         * its unread dot for the same reason.
                         */
                        <ListUserItemPin className="top-3 border-(--background-surface)">
                            {/*
                             * `thumbtack-slanted`, the angled pin — the same glyph the row's menu
                             * would use for Unpin, and the one this mark means: it says the row *is*
                             * pinned. Both are `(filled only)` in the sprite, so the weight is not a
                             * choice either.
                             *
                             * Rendered at **12**, not the 16 the attribute asks for. `IconSize`
                             * starts at 16 and a 16px glyph inside an 18px inner circle (20 less the
                             * 1px ring either side) is a glyph wearing the disc rather than sitting
                             * in it. `size-3` is the opt-out `Icon` is built to allow — the variant
                             * rule is `[&_svg:not([class*='size-'])]`, so a `size-*` class beats the
                             * width/height attributes, which is the same mechanism `channel-menu.tsx`
                             * documents in the other direction.
                             */}
                            <Icon
                                name="thumbtack-slanted"
                                weight="filled"
                                size={16}
                                className="size-3"
                            />
                        </ListUserItemPin>
                    )}
                    {muted && (
                        /*
                         * Muted — on the avatar's **bottom-end** corner, mirroring the pin on the
                         * top-end one. It used to ride the name line, after the handle, and that
                         * line now carries name · tick · crown · tier · 18+ · handle: a sixth
                         * thing there comes straight out of the name. Both pin and mute are this
                         * reader's own preferences on the follow, so the avatar's two corners are
                         * where those live, and the name line is left to facts about the space.
                         *
                         * Bottom rather than top because the **pin already owns the top-end
                         * corner**, and a mark that moves when an unrelated preference changes is
                         * worse than one that is always in the same place.
                         *
                         * Same 20px disc, 1px cut-out border and 12px glyph as `ListUserItemPin`,
                         * and `bottom-3` is its `top-3` mirrored, so the two straddle the avatar
                         * by the same 4px. Reproduced rather than reused: that slot is the DS's
                         * *pin*, indigo, and a `data-slot="list-user-item-pin"` on a mute mark
                         * would be a lie in the DOM.
                         *
                         * ## Neutral, and inverted
                         *
                         * Muting is a quiet state, so the disc carries no accent: it is
                         * `--icon-secondary` with the glyph cut out in `--background-surface`.
                         * That pair is the one already measured for this glyph against this row —
                         * **6.91:1** in Dark and **4.83:1** in Light — past WCAG 1.4.11's 3:1 for a
                         * graphic that carries meaning, which `--text-placeholder` (the DS mute
                         * slot's ink) is not in either theme. Both tokens flip with the theme, so
                         * the disc reads as grey-on-row in both.
                         *
                         * Decorative: the word is announced from the `sr-only` block after the
                         * link, with "pinned".
                         */
                        <span
                            aria-hidden="true"
                            className="absolute bottom-3 start-[48px] flex size-[20px] items-center justify-center rounded-(--radius-fill) border border-(--background-surface) bg-(--icon-secondary) text-(--background-surface)"
                        >
                            {/* Filled: the outline's line weight disappears at 12px. `size-3` is
                                the opt-out `Icon` allows — see the pin's glyph above. */}
                            <Icon name="bell-slash" weight="filled" size={16} className="size-3" />
                        </span>
                    )}
                </ListUserItemAvatar>

                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    {/* Same: two lines at most now, which is the case the DS's own note says to
                        pass `items-center` for rather than leaving 19px of air under the text. */}
                    <ListUserItemPreview className="items-center">
                        <ListUserItemInfo>
                            {/*
                             * The link wraps the text stack; the avatar column sits outside it and
                             * the kebab is a sibling. `min-w-0` at every level or a long display
                             * name pushes the menu off the row.
                             */}
                            <Link
                                data-testid="channel-following-row-link"
                                data-channel-slug={channel.slug}
                                href={toChannelPath(channel.slug)}
                                className="flex w-full min-w-0 flex-col items-start rounded-(--radius-sm) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                            >
                                <ListUserItemNameRow className="w-full">
                                    <ListUserItemName premium={channel.is_premium}>
                                        {name}
                                    </ListUserItemName>
                                    {/* The badge *image* is the fact — the payload object is
                                        present and empty on an ordinary account, so there is
                                        nothing to draw without art. Mirror of
                                        `ChannelVerifiedMark`. */}
                                    <VerifiedBadge
                                        image={verifiedImage}
                                        size="body"
                                        /* The tick's PNG carries 12.5% clear air on each side
                                           (3px here), so at the row's 4px gap it stood ~7px off its
                                           neighbours while the other marks sit ~5px apart. Pulling
                                           its box in by 2px evens the *visible* gaps. */
                                        className="-mx-0.5"
                                    />
                                    {/*
                                     * Legacy's `BadgePremium`, in its place after the tick. The
                                     * plain badge, not the `href` one: the whole row is already a
                                     * `<Link>` to the space, and an `<a>` inside an `<a>` is invalid
                                     * — the browser hoists it out. Sparkle stays on (the default):
                                     * the burst lives inside the badge's own art box and each loop
                                     * is opacity/transform only.
                                     */}
                                    {channel.is_premium && (
                                        <PremiumBadge
                                            /* The size that reads level with the tick
                                               beside it, not the one that measures level —
                                               see `VERIFIED_BADGE_CROWN`. */
                                            size={VERIFIED_BADGE_CROWN.body}
                                            label={t('channel_premium')}
                                            /* Half a pixel down: the other three marks' ink is
                                               centred 0.5px below the box centre the crown sits
                                               on, and the crown read as riding high beside them. */
                                            className="flex-none translate-y-[0.5px]"
                                        />
                                    )}
                                    {/*
                                     * Legacy's `BadgeSpaceTier`, after the crown, with
                                     * `showInfoModal={false}` — the explainer belongs to the space
                                     * page, and this row is already one `<Link>`.
                                     *
                                     * Sized by the name's tier like the tick and the crown
                                     * (`VERIFIED_BADGE_TIER`), not at legacy's fixed 14px, which
                                     * drew it a third shorter than the tick beside it. The marks
                                     * are not square (`tier-2` 547×480, `tier-5` 195×160), so the
                                     * style owns the height, the width follows the art, and the
                                     * declared box is only the 2× resolution hint.
                                     */}
                                    {tierBadge && (
                                        <Image
                                            src={tierBadge}
                                            alt={t('channel_space_tier', {
                                                tier: channel.space_tier ?? 0,
                                            })}
                                            height={VERIFIED_BADGE_TIER.body * 2}
                                            width={VERIFIED_BADGE_TIER.body * 2}
                                            style={{ height: VERIFIED_BADGE_TIER.body }}
                                            className="w-auto flex-none"
                                        />
                                    )}
                                    {channel.is_nsfw && (
                                        /*
                                         * Sensitive space — after the tier mark, as
                                         * `SearchChannelRow` draws it: the DS's own `nsfw` glyph in
                                         * `--accents-nsfw`, the hue the DS gives this one fact. It
                                         * was a disc on the avatar's corner; that corner is the
                                         * mute mark's now, because the avatar's two corners carry
                                         * the reader's preferences (pin, mute) and this line
                                         * carries facts about the space.
                                         *
                                         * Drawn at the tick's visible height **of ink**, so the
                                         * marks stand level. The box is larger than that on
                                         * purpose: the glyph fills ~92% of it (measured 16.5px of
                                         * ink in an 18px box) — see `NSFW_MARK_BOX`.
                                         *
                                         * `title`, not `aria-hidden`: unlike pinned and muted, this
                                         * is a fact about the *space*, so it belongs to the link's
                                         * accessible name.
                                         */
                                        <Icon
                                            name="nsfw"
                                            weight="filled"
                                            size={16}
                                            title={t('channel_nsfw')}
                                            style={{
                                                width: NSFW_MARK_BOX,
                                                height: NSFW_MARK_BOX,
                                            }}
                                            className="flex-none text-(--accents-nsfw)"
                                        />
                                    )}
                                    {/*
                                     * The handle rides the **name line**, after the badges — which
                                     * is legacy's arrangement for this row (`channelItem` puts
                                     * name · badges · `@slug` · pin · mute in one `Stack`; pin and
                                     * mute have since moved to the avatar's corners) and the
                                     * reason this row is two lines rather than the DS comp's three.
                                     *
                                     * `w-auto` overrides `ListUserItemHandle`'s `w-full`: that class
                                     * is for the DS's second *line*, and inside a flex row it would
                                     * take the whole of it and push the marks off the end. The
                                     * component still supplies the type and the ink, so the width is
                                     * the only thing deviating from the port.
                                     *
                                     * Both text runs are `min-w-0 truncate` and neither is capped —
                                     * `ChannelLiveNow` records why legacy's fixed 35% is wrong: with
                                     * a cap, a short name still surrenders two thirds of the line to
                                     * nothing. Flex shrinks whichever one is actually long.
                                     */}
                                    <ListUserItemHandle className="w-auto">
                                        @{channel.slug}
                                    </ListUserItemHandle>
                                </ListUserItemNameRow>
                                {lastActivity && (
                                    <ListUserItemMeta>
                                        {t('following_last_activity', { when: lastActivity })}
                                    </ListUserItemMeta>
                                )}
                            </Link>

                            {/*
                             * Pinned and muted, in words, **outside the link.**
                             *
                             * They are facts about the *row* — this account's own preferences on
                             * this follow — not about where the link goes, and a link whose
                             * accessible name is "Ada Lovelace @ada Muted Pinned Last activity
                             * yesterday" describes the destination wrongly: nothing about that
                             * space is muted for anybody but this reader. Keeping the glyph in the
                             * name row (where the DS draws it) and the word out here is what lets
                             * the visual and the announcement disagree about placement while
                             * agreeing about meaning.
                             *
                             * One node for both, rather than two: a screen reader reading "pinned,
                             * muted" as one phrase after the row is what a person would say.
                             */}
                            {(channel.pin || muted) && (
                                <span className="sr-only">
                                    {[
                                        channel.pin ? t('following_pinned_mark') : null,
                                        muted ? t('following_muted_mark') : null,
                                    ]
                                        .filter(Boolean)
                                        .join(', ')}
                                </span>
                            )}
                        </ListUserItemInfo>

                        <ListUserItemCta className="relative gap-1 self-center">
                            {/* Desktop with a mouse: the three actions on hover, and no kebab.
                                Everywhere else: the kebab. See `FollowingRowActions`. */}
                            <FollowingRowActions
                                channel={channel}
                                disabled={busy || pending}
                                onTogglePin={onTogglePin}
                                onToggleMute={onToggleMute}
                                onUnfollow={onUnfollow}
                            />
                            {/*
                             * **Open**, for a space that leads with its mini app — rendered by
                             * `features/mini-app`, not decided here.
                             *
                             * The button returns `null` for the ordinary space, and the condition is
                             * `miniAppFromChannel` rather than `has_mini_app`: that flag has been
                             * seen true with an empty `mini_app_url`, and a flag with nothing behind
                             * it would open a blank frame. Letting the component answer is what keeps
                             * this row from becoming a second place that decides whether a space has
                             * an app — the player and the button have to agree, or one of them is
                             * wrong.
                             *
                             * `small`, so the 80px row keeps its proportions; the space's own action
                             * row draws the same button at `large`. `gap-1` on the slot rather than a
                             * margin here, so the pair spaces itself whether or not the button is
                             * there.
                             */}
                            <OpenMiniAppButton channel={channel} size="small" />
                            <FollowingRowMenu
                                channel={channel}
                                /*
                                 * Two kinds of unavailable collapse into one here, and that is
                                 * correct for a *menu*: unlike `FollowRequestRow`'s two buttons,
                                 * this trigger is not the element that was pressed — the menu item
                                 * inside it was, and that item is already gone. So there is no
                                 * focused control to preserve and `disabled` is the honest
                                 * attribute for both cases.
                                 */
                                disabled={busy || pending}
                                onTogglePin={onTogglePin}
                                onToggleMute={onToggleMute}
                                onUnfollow={onUnfollow}
                            />
                        </ListUserItemCta>
                    </ListUserItemPreview>
                </ListUserItemContent>
            </ListUserItem>
        </li>
    )
}
