'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '../api/types'
import type { PostActions } from '../hooks/use-post-actions'
import { isGated, isPurchased, spaceTierBadge } from '../lib/post-access'
import { formatPostTimestamp } from '../lib/post-format'
import { PostMenu } from './post-menu'

/**
 * Who posted it, when, and to whom — legacy's `PostHeader`, ported.
 *
 * ## The subheader is a sentence made of five optional pieces
 *
 * Timestamp, an *Edited* mark, a separator dot, an audience icon and a *Purchased* mark. Legacy
 * draws the dot unconditionally, so a post with no timestamp opens with a floating bullet; here the
 * dot is drawn **between** pieces that exist, which is the one correction this header makes.
 *
 * The audience icon is the only piece that is always present: every post is either open to everyone
 * (a person glyph) or gated (a dollar glyph), and there is no third answer. It is the reader's only
 * hint, before scrolling, that a post has a price.
 *
 * ## Names truncate at a width, not at a character count
 *
 * `120px` below `md` and `170px` above — legacy's numbers. A display name is user-chosen and nine
 * locales wide, so counting characters truncates Korean three times too early and Vietnamese one
 * word too late. The badges that follow are `flex-none` so a long name never squeezes them out.
 */
export function PostHeader({
    post,
    actions,
    pinned,
    testId,
}: {
    post: Post
    /**
     * The four menu writes, owned by `PostCard` — see `PostMenu`'s prop doc for why.
     *
     * **Optional, and its absence makes the whole header a picture**: no kebab menu, and the
     * identity is a `span` rather than a `Link`. Same rule `PostLockPanel` states for `onPress` and
     * `PostImageGallery` for `onOpen` — a surface that cannot act on a post does not grow controls
     * that do nothing. The composer's *Preview* is the caller that needs it: a menu there would
     * offer to delete a post that does not exist, and a link to the author's space would throw the
     * draft away to go somewhere the author already is.
     */
    actions?: PostActions
    /**
     * The **optimistic** pin state, not `post.pinned`.
     *
     * A press on *Pin* has to move this marker immediately; reading the prop would leave the header
     * showing the old state until the list refetches, which on a feed is never. Defaults to the
     * post's own field, which is right for a header with no writes behind it.
     */
    pinned?: boolean
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const channel = post.channel
    const name = channel?.name ?? ''
    const channelHref = actions && channel?.slug ? `/@${channel.slug}` : null
    const isPinned = pinned ?? post.pinned
    const gated = isGated(post)
    const tierBadge = spaceTierBadge(channel)

    const identity = (
        <>
            <AnimatedAvatar
                size="medium"
                thumb={channel?.images?.thumb ?? null}
                avatarVideo={channel?.images?.avatar_video ?? null}
                isPremium={channel?.is_premium ?? false}
                alt=""
                initials={name.trim() ? name.trim().slice(0, 2).toUpperCase() : undefined}
                className="flex-none"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-0.5">
                    <span className="type-dense-emphasis max-w-[120px] truncate text-(--text-title) md:max-w-[170px]">
                        {name}
                    </span>
                    <VerifiedBadge image={channel?.verified_tick_badge?.image ?? null} size={16} />
                    {channel?.is_premium ? <PremiumBadge size={18} className="flex-none" /> : null}
                    {/*
                     * Height-constrained and `w-auto`: the tier marks are not square and legacy
                     * sizes them by height alone. Non-interactive here — legacy passes
                     * `showInfoModal={false}` in the post header, so the tier explainer belongs to
                     * the space page, not to every card in a feed.
                     */}
                    {tierBadge ? (
                        <Image
                            src={tierBadge}
                            alt={t('post_space_tier', { tier: channel?.space_tier ?? 0 })}
                            height={14}
                            width={14}
                            className="h-[14px] w-auto flex-none"
                        />
                    ) : null}
                    {channel?.slug ? (
                        <span className="type-caption-meta max-w-[70px] truncate text-(--text-placeholder) md:max-w-[100px]">
                            {`@${channel.slug}`}
                        </span>
                    ) : null}
                </span>

                <span className="flex items-center gap-1 text-(--text-placeholder)">
                    {post.created_at ? (
                        <time dateTime={post.created_at} className="type-caption-meta">
                            {formatPostTimestamp(post.created_at, currentLanguage)}
                        </time>
                    ) : null}
                    {post.edited ? (
                        <span className="type-caption-meta">{t('post_edited')}</span>
                    ) : null}
                    {post.created_at || post.edited ? <SeparatorDot /> : null}
                    {/*
                     * 16 rather than legacy's 14: the sprite is typed to the DS's six sizes and 14
                     * is not one of them. Two pixels on a meta glyph, against a type error.
                     */}
                    <Icon
                        name={gated ? 'badge-dollar' : 'user-simple-alt'}
                        size={16}
                        title={t(gated ? 'post_audience_paid' : 'post_audience_everyone')}
                    />
                    {isPurchased(post) ? (
                        <span className="type-caption-meta">{t('post_purchased')}</span>
                    ) : null}
                </span>
            </span>
        </>
    )

    return (
        <header className="flex min-w-0 items-center justify-between gap-2">
            {/*
             * A `Link` rather than a div with a handler — middle-clickable, announced as a link and
             * openable in a new tab. A channel with no slug has nowhere to go, so it is not a link
             * at all rather than one that navigates to `/@`.
             */}
            {channelHref ? (
                <Link
                    href={channelHref}
                    data-testid={subTestId(testId, 'header')}
                    className="flex min-w-0 items-center gap-2"
                >
                    {identity}
                </Link>
            ) : (
                <span
                    data-testid={subTestId(testId, 'header')}
                    className="flex min-w-0 items-center gap-2"
                >
                    {identity}
                </span>
            )}

            {/*
             * The pin marker and the menu share the trailing edge, in that order — legacy draws the
             * marker inline in the header row and the kebab outside it, which at 16 and 32 puts the
             * smaller mark nearer the text it qualifies.
             */}
            <span className="flex flex-none items-center gap-1">
                {isPinned ? (
                    <Icon
                        name="thumbtack"
                        size={16}
                        title={t('post_pinned')}
                        className="flex-none text-(--text-placeholder)"
                    />
                ) : null}
                {/*
                 * `data-no-navigate` on the wrapper rather than on the trigger: the menu's popup is
                 * portalled, so a press on a **row** is not a DOM descendant of this span — but the
                 * trigger is, and the popup is covered by `shouldNavigate`'s `[role="menuitem"]`
                 * clause. Both halves are needed and neither covers the other.
                 */}
                {actions ? (
                    <span data-no-navigate>
                        <PostMenu post={post} actions={actions} testId={testId} />
                    </span>
                ) : null}
            </span>
        </header>
    )
}

/** Legacy draws a 2px circle here rather than a bullet character, and it reads better at 12px. */
function SeparatorDot() {
    return <span aria-hidden="true" className="size-0.5 flex-none rounded-full bg-current" />
}
