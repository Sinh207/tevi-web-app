'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Post } from '../api/types'
import { usePostUnlock } from '../hooks/use-post-unlock'
import { isGated, postDisplay } from '../lib/post-access'
import { postHref } from '../lib/post-link'
import { mediaTileSummary } from '../lib/post-media'
import { LockMediaIcon } from './lock-media-icon'
import { PostMediaLightbox } from './post-media-lightbox'
import { PostUnlockDialogs } from './post-unlock-dialogs'

/**
 * One cell of a space's **Media** grid — legacy's `PostMedia`, with the press it was missing here.
 *
 * ## What a press does, in legacy's order
 *
 * | the post | the press |
 * |---|---|
 * | locked for this reader | the unlock flow — `usePostUnlock`, the same one the card's paywall runs |
 * | sensitive | the **post page**, where `PostNsfwGuard` applies the reader's own setting |
 * | anything else | the lightbox over this post's media |
 *
 * All three are behind sign-in, which is legacy's `RequireAuth` around the whole tile. The unlock
 * press is gated inside `usePostUnlock` already (`requireStars` composes it), so only the other two
 * are wrapped here.
 *
 * The **sensitive** row is the one divergence. Legacy blurs the tile and then opens its slide
 * viewer on a press, sharp — so a reader who filters sensitive content in Settings is shown it by
 * one tap on a blurred square. The guard's two-cover rule is the only place that setting is
 * honoured, and it lives on the post, so the tile sends the reader there instead of reimplementing
 * it in a 120px cell.
 *
 * ## An anchor, not a button
 *
 * Legacy wraps the tile in `SeoLink` to the post and `preventDefault`s the click. Kept: the grid is
 * a space's whole media history, and an anchor is what makes each item crawlable, middle-clickable
 * and openable in a new tab. A plain press is intercepted and does the table above; a modified one
 * (⌘/Ctrl/Shift/middle) is left to the browser, which is the reason to be an anchor at all.
 *
 * ## Three across, square
 *
 * `21` items per page is why the grid is three-wide — seven complete rows, so the last one is never
 * a ragged tile or two (see `CHANNEL_FIRST_PAGE`). The pills are legacy's: a photo count at the top
 * end when there is more than one, the duration at the bottom start, and the Star badge at the bottom
 * end on any gated post — gated, not *locked*, because a post the reader has already bought is still
 * one the creator charges for.
 */
export function PostMediaTile({
    post,
    onOpenMedia,
    onChanged,
    className,
    testId = 'post-media-tile',
}: {
    post: Post
    /**
     * A press on open media, handed **up** to whoever owns the grid — `PostCard`'s prop of the same
     * name, for the same reason: the list mounts one viewer, which is what lets it page between
     * posts (`usePostSlider`). Legacy's grid opens `ViewMediaSlide` with `mediaTypeAll`, which pages
     * the same way. Absent, the tile keeps its own lightbox over its own media.
     */
    onOpenMedia?: (target: number | 'video') => void
    /** The owning list's invalidation, called once an unlock lands. */
    onChanged?: () => void
    className?: string
    testId?: string
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const requireAuth = useRequireAuth()
    const unlock = usePostUnlock(post, { onUnlocked: onChanged })
    /** Which image the lightbox opened on, or `null` when it is closed. `'video'` opens the clip. */
    const [opened, setOpened] = useState<number | 'video' | null>(null)

    const display = postDisplay(post)
    const href = postHref(post)
    const summary = mediaTileSummary(post)

    const openMedia = requireAuth(() => {
        const show = onOpenMedia ?? setOpened
        if (summary.images > 0) show(0)
        else if (summary.hasVideo) show('video')
        // A row with neither — the grid still draws it — has nothing to show full size.
        else if (href) router.push(href)
    })
    const openPost = requireAuth(() => {
        if (href) router.push(href)
    })

    const press = display === 'locked' ? unlock.press : display === 'nsfw' ? openPost : openMedia

    function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
        // A modified press is the browser's — a new tab, a new window, a download.
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
        ) {
            return
        }
        event.preventDefault()
        press()
    }

    const label =
        display === 'locked'
            ? t('post_unlock_title')
            : display === 'nsfw'
              ? t('post_nsfw_title')
              : t('post_media_open')

    const tile = (
        <>
            {summary.src ? (
                <Image
                    src={summary.src}
                    alt=""
                    fill
                    /* Three across inside a 612 column, so a tile is never wider than ~204px on
                       desktop and a third of the viewport below it. */
                    sizes="(max-width: 612px) 33vw, 204px"
                    className="object-cover"
                    style={{ filter: summary.blurCover ? 'blur(10px)' : undefined }}
                />
            ) : (
                <span className="absolute inset-0 flex items-center justify-center text-(--icon-secondary)">
                    <Icon name="image-gallery" size={24} />
                </span>
            )}

            {display === 'nsfw' ? (
                /*
                 * `backdrop-filter` over the image rather than a `filter` on it, so the pills below
                 * stay sharp — they say what is there without showing it, which is the point.
                 */
                <span
                    data-testid={subTestId(testId, 'panel')}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 text-white backdrop-blur-[10px]"
                >
                    <Icon name="eye-slash" size={32} />
                </span>
            ) : null}

            <span className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2">
                <span className="flex justify-end">
                    {summary.images > 1 ? (
                        <TilePill testId={subTestId(testId, 'count')}>
                            <LockMediaIcon kind="images" size={12} />
                            <span className="type-caption-meta">
                                {t('post_media_photos', { count: summary.images })}
                            </span>
                        </TilePill>
                    ) : null}
                </span>
                <span className="flex items-end justify-between gap-1">
                    {summary.duration ? (
                        <TilePill testId={subTestId(testId, 'label')}>
                            <LockMediaIcon kind="video" size={16} />
                            <span className="type-caption-label-strong">{summary.duration}</span>
                        </TilePill>
                    ) : (
                        <span />
                    )}
                    {isGated(post) ? (
                        <TilePill testId={subTestId(testId, 'suffix')} round>
                            <Icon name="badge-dollar" size={16} weight="filled" />
                        </TilePill>
                    ) : null}
                </span>
            </span>
        </>
    )

    const frame = cn(
        'relative flex aspect-square overflow-hidden bg-(--background-segment)',
        className,
    )

    return (
        <>
            {href ? (
                <Link
                    href={href}
                    onClick={onClick}
                    aria-label={label}
                    data-testid={testId}
                    data-card-id={post.id}
                    className={cn(frame, 'cursor-pointer')}
                >
                    {tile}
                </Link>
            ) : (
                /*
                 * No destination — a post without a shareable URL. Still pressable for the lightbox
                 * and the paywall, which need no URL, so it becomes a button rather than dead art.
                 */
                <button
                    type="button"
                    onClick={press}
                    aria-label={label}
                    data-testid={testId}
                    data-card-id={post.id}
                    className={frame}
                >
                    {tile}
                </button>
            )}

            {/* Only when nobody above wants the press — see `onOpenMedia`. */}
            {!onOpenMedia && opened !== null ? (
                <PostMediaLightbox
                    images={post.images ?? []}
                    video={opened === 'video' ? (post.video ?? null) : null}
                    startIndex={opened === 'video' ? 0 : opened}
                    onClose={() => setOpened(null)}
                    testId={subTestId(testId, 'slide')}
                />
            ) : null}

            <PostUnlockDialogs flow={unlock} testId={subTestId(testId, 'overlay')} />
        </>
    )
}

/**
 * The tile's pill — legacy's `rgba(0,0,0,0.5)` with a 4px backdrop blur and a 40px radius.
 *
 * Fixed black for the reason `PostLockPanel`'s pill gives: it sits on an arbitrary photograph, and a
 * theme-aware surface would go light in light mode and vanish on a bright one.
 */
function TilePill({
    children,
    round = false,
    testId,
}: {
    children: React.ReactNode
    /**
     * The Star badge is a bare glyph, so it gets an even inset rather than a pill's. Legacy draws a
     * 12px glyph in a 4px inset; the sprite's smallest size is 16, so the inset is 2 and the disc
     * lands on the same 20px.
     */
    round?: boolean
    testId?: string
}) {
    return (
        <span
            data-testid={testId}
            className={cn(
                'flex w-max items-center gap-1 rounded-[40px] bg-black/50 text-white backdrop-blur-[4px]',
                round ? 'p-0.5' : 'px-1 py-0.5',
            )}
        >
            {children}
        </span>
    )
}
