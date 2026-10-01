'use client'

import { useAuth } from '@features/auth'
import { type Channel, toChannelPath, useChannel, useChannelStats } from '@features/channel'
import { hasMiniApp, miniAppFromChannel, useMiniApp } from '@features/mini-app'
import { CollectionCard, isLocked, postApi, postHref, postKeys, postSnippet } from '@features/post'
import { collectionHref } from '@features/post/routes'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { MESSAGE_ART } from '../lib/illustrations'
import { type MessageEmbed as Embed, giftPlanLabel } from '../lib/message-link'

/**
 * The card under a message's text — legacy's `itemMessage` embeds (`giftPremium`, `space`,
 * `miniApp`, `post`), on the same frame as a reply's quote: tinted by the side it sits on, a 2px
 * rule at the start edge, the kind named in the side's colour.
 *
 * ## Nothing is fetched until the card is near the screen
 *
 * A space or post card needs a request of its own, and a thread can carry twenty links. Legacy
 * resolves every one of them as the page loads; here the body mounts once it is within
 * `useInView`'s margin of the thread's viewport, and it reads the **same query keys** as the space
 * page and the post page — a card for a post the reader has just seen costs nothing, and opening the
 * post after seeing its card is instant.
 */
export function MessageEmbed({
    embed,
    own,
    senderSlug,
    root,
}: {
    embed: Embed
    own: boolean
    /** The sender's handle, for the gift's "@ada sent you …" line. */
    senderSlug: string | null
    /** The thread's scroller — what "near the screen" is measured against. */
    root?: Element | null
}) {
    if (embed.kind === 'gift') {
        return <GiftEmbed own={own} productName={embed.productName} senderSlug={senderSlug} />
    }
    return (
        <Deferred root={root} own={own}>
            {embed.kind === 'space' ? (
                <SpaceEmbed slug={embed.slug} own={own} />
            ) : embed.kind === 'post' ? (
                <PostEmbed postId={embed.postId} own={own} />
            ) : (
                <CollectionEmbed slug={embed.slug} collectionId={embed.collectionId} own={own} />
            )}
        </Deferred>
    )
}

/** Mounts `children` once it has come within the margin — and keeps them mounted after. */
function Deferred({
    root,
    own,
    children,
}: {
    root?: Element | null
    own: boolean
    children: ReactNode
}) {
    const [ref, inView] = useInView({ root: root ?? null, once: true, rootMargin: '400px' })
    return (
        <div ref={ref}>
            {inView ? (
                children
            ) : (
                <EmbedFrame own={own}>
                    <Skeleton className="h-12 w-full rounded-(--radius-md)" />
                </EmbedFrame>
            )}
        </div>
    )
}

/** Legacy's card: 260 wide at least, 8px in, 12px corners, the side's tint and start rule. */
function EmbedFrame({
    own,
    label,
    children,
    className,
}: {
    own: boolean
    label?: string
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                /* Legacy's 260px floor, and never wider than the bubble less its margins — on a phone
                   the bubble's 80% is narrower than the gift's 290. */
                'mx-2 mt-2 flex min-w-[min(260px,calc(100%-1rem))] max-w-[calc(100%-1rem)] flex-col gap-2 rounded-(--radius-lg) border-s-2 border-solid p-2',
                own
                    ? 'border-(--text-success) bg-(--background-bubble-quote-own)'
                    : 'border-(--text-link) bg-(--background-bubble-quote-other)',
                className,
            )}
        >
            {label && (
                <span
                    className={cn(
                        'type-dense-strong',
                        own ? 'text-(--text-success)' : 'text-(--text-link)',
                    )}
                >
                    {label}
                </span>
            )}
            {children}
        </div>
    )
}

/* Stand-ins the translation is rendered with, then swapped for the real values as nodes. */
const MARK_PLAN = '\u0001plan\u0001'
const MARK_NAME = '\u0001name\u0001'

/**
 * A sentence with some of its values in bold — legacy's gift line, where the handle and the plan
 * stand out. The values go in as **text nodes**: `Trans` would parse the interpolated string for
 * tags, and a handle is the sender's to choose.
 */
function Emphasised({ text, values }: { text: string; values: Record<string, string> }) {
    const marks = Object.keys(values)
    // The marks are control characters and letters — nothing in them needs escaping.
    const pattern = new RegExp(`(${marks.join('|')})`)
    return (
        <>
            {text.split(pattern).map((part, index) =>
                marks.includes(part) ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one sentence never reorder.
                    <strong key={index} className="type-dense-strong text-(--text-title)">
                        {values[part]}
                    </strong>
                ) : (
                    part
                ),
            )}
        </>
    )
}

/**
 * A Premium gift — legacy's `giftPremium`: the Premium mark at 72px, the plan in a blue pill, and
 * who gave it to whom. The plan is read as a duration where it names one (iOS's localised map), and
 * shown as sent otherwise. Not a link: neither app does anything when it is pressed.
 */
function GiftEmbed({
    own,
    productName,
    senderSlug,
}: {
    own: boolean
    productName: string | null
    senderSlug: string | null
}) {
    const { t } = useTranslation()
    const plan = giftPlanLabel(productName, t)

    return (
        <EmbedFrame own={own} label={t('message_gift_title')} className="w-[290px] items-center">
            <Image
                src={MESSAGE_ART.premiumLogo.src}
                width={72}
                height={72}
                alt=""
                className="size-[72px]"
            />
            <span className="rounded-(--radius-fill) bg-(--text-link) px-2 py-1 type-caption-label text-(--text-on-accent)">
                {plan}
            </span>
            <p className="text-center type-dense-default text-(--text-body)">
                <Emphasised
                    text={t(own ? 'message_gift_sent_by_me' : 'message_gift_sent_to_me', {
                        plan: MARK_PLAN,
                        name: MARK_NAME,
                    })}
                    values={{
                        [MARK_PLAN]: plan,
                        [MARK_NAME]: senderSlug ? `@${senderSlug}` : t('message_inactive_user'),
                    }}
                />
            </p>
        </EmbedFrame>
    )
}

/**
 * A space — legacy's `space`, or its `miniApp` when the space is one. A space card is a link to the
 * space; a mini-app card **opens the app**, as iOS's does (legacy's goes to the space page, where the
 * app then opens itself — one page load to reach the same place).
 */
function SpaceEmbed({ slug, own }: { slug: string; own: boolean }) {
    const { t, currentLanguage } = useTranslation()
    const { channel, isLoading } = useChannel(slug)
    const { open } = useMiniApp()
    // Legacy's counts; the space page reads the same key, so a visited space costs nothing.
    const { stats } = useChannelStats(slug, {
        enabled: !!channel && !channel.is_suspended && !hasMiniApp(channel),
    })

    if (isLoading) {
        return (
            <EmbedFrame own={own}>
                <Skeleton className="h-12 w-full rounded-(--radius-md)" />
            </EmbedFrame>
        )
    }
    if (!channel || channel.is_suspended) return null

    const app = hasMiniApp(channel) ? miniAppFromChannel(channel, t('miniapp_fallback_name')) : null
    if (app) {
        return (
            <EmbedFrame own={own} label={t('message_embed_mini_app')}>
                <button
                    type="button"
                    data-testid="message-embed-mini-app"
                    onClick={() => open(app)}
                    className="flex items-center gap-2 rounded-(--radius-md) bg-(--background-surface) p-2 text-start outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                >
                    {channel.images.thumb ? (
                        <Image
                            src={channel.images.thumb}
                            width={64}
                            height={64}
                            alt=""
                            className="size-16 flex-none rounded-(--radius-md) object-cover"
                        />
                    ) : (
                        <span className="flex size-16 flex-none items-center justify-center rounded-(--radius-md) bg-(--background-subtle) text-(--icon-secondary)">
                            <Icon name="grid-square" size={24} />
                        </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="max-w-[150px] truncate type-body-strong text-(--text-title)">
                            {channel.name}
                        </span>
                        {channel.description && (
                            <span className="line-clamp-2 type-caption-meta text-(--text-body)">
                                {channel.description}
                            </span>
                        )}
                    </span>
                </button>
            </EmbedFrame>
        )
    }

    return (
        <EmbedFrame own={own} label={t('message_embed_space')}>
            <Link
                data-testid="message-embed-space"
                href={toChannelPath(channel.slug)}
                className="flex flex-col gap-2 no-underline outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
            >
                <ChannelRow channel={channel} />
                {stats && (
                    <span className="flex gap-4 type-caption-meta text-(--text-body)">
                        <span>
                            {t('message_embed_followers', {
                                count: stats.follower_count,
                                value: formatCompactCount(stats.follower_count, currentLanguage),
                            })}
                        </span>
                        <span>
                            {t('message_embed_members', {
                                count: stats.member_count,
                                value: formatCompactCount(stats.member_count, currentLanguage),
                            })}
                        </span>
                    </span>
                )}
            </Link>
        </EmbedFrame>
    )
}

/** Legacy's author line: a 36px avatar, the name and tick, the handle under it. */
function ChannelRow({
    channel,
}: {
    channel: Pick<Channel, 'slug' | 'name' | 'is_premium' | 'verified_tick_badge'> & {
        images: Pick<Channel['images'], 'thumb' | 'avatar_video'> | null
    }
}) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <AnimatedAvatar
                size="small"
                thumb={channel.images?.thumb ?? null}
                avatarVideo={channel.images?.avatar_video ?? null}
                isPremium={channel.is_premium ?? false}
                alt=""
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1">
                    <span className="max-w-[200px] truncate type-dense-strong text-(--text-title)">
                        {channel.name}
                    </span>
                    <VerifiedBadge image={channel.verified_tick_badge?.image ?? null} size={14} />
                </span>
                <bdi className="truncate type-caption-meta text-(--text-body)">@{channel.slug}</bdi>
            </span>
        </span>
    )
}

/**
 * A post — legacy's `post`, reduced to what fits a bubble: whose it is, its first lines, and its
 * first picture unless the post is locked (a locked post's media is not in the payload at all, and
 * the card says so rather than inventing a cover). The whole card is a link to the post.
 */
function PostEmbed({ postId, own }: { postId: string; own: boolean }) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const { data: post, isLoading } = useQuery({
        queryKey: postKeys.detail(postId, activeId),
        queryFn: () => postApi.getPost(postId, activeId),
    })

    if (isLoading) {
        return (
            <EmbedFrame own={own}>
                <Skeleton className="h-16 w-full rounded-(--radius-md)" />
            </EmbedFrame>
        )
    }
    const href = post ? postHref(post) : null
    if (!post || !href) return null

    const locked = isLocked(post)
    const snippet = locked ? null : postSnippet(post.text, 160)
    const picture = locked ? null : (post.images?.[0]?.thumb ?? post.images?.[0]?.uri ?? null)

    return (
        <EmbedFrame own={own} label={t('message_embed_post')}>
            <Link
                data-testid="message-embed-post"
                href={href}
                className="flex flex-col gap-2 no-underline outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
            >
                {post.channel?.slug && (
                    <ChannelRow
                        channel={{
                            slug: post.channel.slug,
                            name: post.channel.name,
                            is_premium: false,
                            verified_tick_badge: post.channel.verified_tick_badge,
                            images: {
                                thumb: post.channel.images?.thumb ?? null,
                                avatar_video: null,
                            },
                        }}
                    />
                )}
                {snippet && (
                    <p className="line-clamp-3 type-dense-default text-(--text-title)">{snippet}</p>
                )}
                {locked && (
                    <p className="flex items-center gap-1 type-dense-default text-(--text-body)">
                        {t('message_embed_post_locked')}
                    </p>
                )}
                {picture && (
                    <span className="relative block aspect-video w-full overflow-hidden rounded-(--radius-md)">
                        <Image src={picture} alt="" fill sizes="260px" className="object-cover" />
                    </span>
                )}
            </Link>
        </EmbedFrame>
    )
}

/**
 * A collection — legacy's `itemMessage/collection`: whose it is, then the collection's own row (the
 * tile with its count, the name, the date and how many posts), drawn by `features/post`'s
 * `CollectionCard` so the two screens cannot disagree. The viewer read is the same one the space's
 * collection page makes, under the same key.
 */
function CollectionEmbed({
    slug,
    collectionId,
    own,
}: {
    slug: string
    collectionId: string
    own: boolean
}) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const { channel } = useChannel(slug)
    const { data: collection, isLoading } = useQuery({
        queryKey: postKeys.spaceCollection(slug, collectionId, activeId),
        queryFn: ({ signal }) => postApi.getSpaceCollection(slug, collectionId, activeId, signal),
    })

    if (isLoading) {
        return (
            <EmbedFrame own={own}>
                <Skeleton className="h-16 w-full rounded-(--radius-md)" />
            </EmbedFrame>
        )
    }
    if (!collection) return null

    return (
        <EmbedFrame own={own} label={t('message_embed_collection')}>
            {channel && !channel.is_suspended && <ChannelRow channel={channel} />}
            <div className="overflow-hidden rounded-(--radius-lg)">
                <CollectionCard
                    testId="message-embed-collection"
                    collection={collection}
                    href={collectionHref(slug, collectionId)}
                />
            </div>
        </EmbedFrame>
    )
}
