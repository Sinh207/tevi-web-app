'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Post } from '../api/types'
import { usePostActions } from '../hooks/use-post-actions'
import { usePostUnlock } from '../hooks/use-post-unlock'
import { isNsfw, postDisplay } from '../lib/post-access'
import { postHref } from '../lib/post-link'
import {
    detectVideoAspectRatio,
    formatDuration,
    POST_COLUMN_SIZES,
    videoSrc,
} from '../lib/post-media'
import { openReplyDialog } from '../store/reply-store'
import { PostActions } from './post-actions'
import {
    PostAffiliateCard,
    PostInsights,
    type PostMiniAppApp,
    PostMiniAppBanner,
} from './post-attachments'
import { PostHeader } from './post-header'
import { PostImageGallery } from './post-image-gallery'
import { PostLockPanel } from './post-lock-panel'
import { PostMediaLightbox } from './post-media-lightbox'
import { PostNsfwGuard } from './post-nsfw-guard'
import { PostUnlockDialogs } from './post-unlock-dialogs'

/**
 * One post, as every feed draws it — a 1:1 port of legacy's `PostMain`.
 *
 * ## The card is a row, not a card
 *
 * `borderRadius: 0`, no border, no shadow, and vertical padding only — legacy's `Card` is a
 * full-bleed band and the horizontal inset lives on the **content** (`0 12px` below `md`, `0 24px`
 * above) rather than on the frame. That is what lets media reach closer to the edge than the text
 * does, and it is why this component has two padding scales instead of one `p-4`.
 *
 * The one substitution is colour: legacy paints `background: white` and `#1A1A1A` text, which has
 * no dark mode at all. Tokens here, per `CLAUDE.md` — the geometry is legacy's, the palette is the
 * design system's.
 *
 * ## Four states, one union
 *
 * `postDisplay` returns `'deleted' | 'locked' | 'nsfw' | 'body'` and the order it checks them in is
 * load-bearing — `lib/post-access.ts` writes down why locked comes before nsfw. Branching on the
 * union rather than on three booleans is what makes a fifth state a type error here instead of an
 * `else` that renders the open body.
 *
 * ## The whole card navigates, and three kinds of press are exempt
 *
 * Legacy puts `onClick={handleOpenPostDetail}` on the `Card` and then spends two `useCallback`s
 * undoing it — `handleBodyClick` stops a nested `<a>` from being swallowed, `handleBodyClickCapture`
 * `preventDefault`s presses on anything whose id starts `post-main-image` or `post-video`. Those two
 * handlers are a denylist of the elements that had broken by the time somebody noticed.
 *
 * `shouldNavigate` below is the same idea as an **allowlist of things that are already
 * interactive**: a press that lands on an anchor, a button, a form control, a video, a menu item or
 * anything marked `data-no-navigate` is that element's, and everything else is the card's. Adding a
 * control to the card therefore needs no edit here, which is exactly what legacy's version cannot
 * promise.
 *
 * A real `<Link>` wraps the **text** as well, which legacy's `SeoLink` also does and for the same
 * reason: it is what makes the destination crawlable, middle-clickable and openable in a new tab.
 * It cannot wrap the whole card — the card contains buttons, and a button inside an anchor is
 * markup browsers resolve by breaking one of the two.
 *
 * ## `html_text` is deliberately not rendered
 *
 * Legacy's `Content` does `dangerouslySetInnerHTML={{ __html: postInfo?.html_text }}`, falling back
 * to plain `text`. This is the one place the port refuses legacy outright: the field is
 * **creator-authored markup**, there is no sanitiser in this repo, and every post in the product
 * flows through this component. `text` carries the same words without the injection. Making links
 * live is a parser over `text` when someone builds it — never this.
 *
 * Otherwise the text is legacy's: **no clamp**, `whitespace-pre-wrap`, `break-words`. A feed shows
 * whole posts.
 */
export function PostCard({
    post,
    isPremiumReader = false,
    onShare,
    onOpenMiniApp,
    onChanged,
    onAuthorBlocked,
    onSeeMore,
    onOpenMedia,
    attachments = true,
    disableDetail = false,
    className,
    testId = 'post-card',
}: {
    post: Post
    /** Premium readers are exempt from paid interaction — `features/premium`'s fact, not the post's. */
    isPremiumReader?: boolean
    onShare?: () => void
    /**
     * Opening a mini app, supplied by the surface above.
     *
     * Not an import: `features/mini-app` imports `features/channel`, which will import this feature
     * — `post → mini-app → channel → post` is a barrel cycle. `post-attachments.tsx` carries the
     * full note. Without the callback the banner is simply not drawn.
     */
    onOpenMiniApp?: (app: PostMiniAppApp) => void
    /** The owning list's invalidation, called after any write from this card lands. */
    onChanged?: () => void
    /**
     * The author was blocked — the space's id, so a feed can drop its rows at once.
     *
     * Not foldable into `onChanged`: that fires for a pin and a delete as well, and a list acting on
     * it would hide a space because somebody pinned a post. `usePostActions` carries the rest.
     */
    onAuthorBlocked?: (channelId: string) => void
    /**
     * Legacy's `showSeeMore` — a "See more" footer under the card, used where a surface shows a
     * post as a **teaser**. Absent unless the caller supplies the handler, which is the same rule
     * every other optional control on this card follows.
     */
    onSeeMore?: () => void
    /**
     * A press on the media, handed **up** to whoever owns the list.
     *
     * With it, the card opens no viewer of its own: the surface above mounts one, which is what
     * lets that viewer page between *posts* — a card knows nothing about the list it is in, and a
     * card that mounted its own pager would need to. Same arrangement as `onShare`, and the same
     * reason: one instance per list rather than one per row.
     *
     * Absent, the card keeps its own lightbox over its own media, which is what a card standing on
     * its own — a harness, an embed — needs.
     */
    onOpenMedia?: (target: number | 'video') => void
    /**
     * The mini-app banner, affiliate card and earnings strip. Legacy gates all three on
     * `typePost ∈ {POST_HOME, POST_DETAIL}`; this is that flag, defaulting to the feed's answer.
     */
    attachments?: boolean
    /** Already on the post's own page, or rendering it somewhere a navigation would be wrong. */
    disableDetail?: boolean
    className?: string
    testId?: string
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const display = postDisplay(post)
    const href = postHref(post, { disabled: disableDetail })

    /*
     * Owned here and not in the menu: pin's optimistic flag drives a marker in the header *and* a
     * label in the menu, so the hook has to sit above both. `PostMenu`'s prop doc says the rest.
     */
    const actions = usePostActions(post, { onChanged, onAuthorBlocked })
    const unlock = usePostUnlock(post, { onUnlocked: onChanged })

    function onCardClick(event: React.MouseEvent<HTMLElement>) {
        if (!href || !shouldNavigate(event)) return
        router.push(href)
    }

    return (
        /*
         * biome-ignore lint/a11y/useKeyWithClickEvents: the card's click is a **pointer
         * convenience** duplicating a real `<Link>` that wraps the post's text — that anchor is the
         * keyboard and screen-reader path, and it is focusable, announced and middle-clickable.
         * Adding `onKeyDown` here would put a second, unlabelled tab stop on every card in a feed,
         * landing on the same destination the link beside it already offers.
         */
        <article
            data-testid={testId}
            data-card-id={post.id}
            onClick={onCardClick}
            className={cn(
                'flex w-full min-w-0 flex-col gap-2 py-3 md:py-5',
                href && 'cursor-pointer',
                className,
            )}
        >
            <div className="px-3 md:px-6">
                <PostHeader post={post} actions={actions} pinned={actions.pinned} testId={testId} />
            </div>

            <div className="flex min-w-0 flex-col gap-1 px-3 md:px-6">
                {display === 'deleted' ? (
                    <p
                        data-testid={subTestId(testId, 'message')}
                        className="type-dense-default text-(--text-placeholder)"
                    >
                        {t('post_deleted')}
                    </p>
                ) : (
                    <>
                        {post.text ? (
                            /*
                             * The crawlable link, around the words only. `onClick` lets the card's
                             * own handler do the navigation so both paths agree — without it a press
                             * on the text would push through Next's router *and* bubble to
                             * `onCardClick`, which is two navigations to the same place.
                             */
                            href ? (
                                <Link
                                    href={href}
                                    onClick={event => event.preventDefault()}
                                    data-testid={subTestId(testId, 'description')}
                                    className="type-dense-default whitespace-pre-wrap break-words text-(--text-title)"
                                >
                                    {post.text}
                                </Link>
                            ) : (
                                <p
                                    data-testid={subTestId(testId, 'description')}
                                    className="type-dense-default whitespace-pre-wrap break-words text-(--text-title)"
                                >
                                    {post.text}
                                </p>
                            )
                        ) : null}

                        {display === 'locked' ? (
                            <PostLockPanel
                                post={post}
                                onPress={unlock.press}
                                testId={subTestId(testId, 'panel')}
                            />
                        ) : (
                            <PostMediaBlock post={post} onOpenMedia={onOpenMedia} testId={testId} />
                        )}

                        {attachments && (
                            <>
                                <PostMiniAppBanner
                                    post={post}
                                    onOpen={onOpenMiniApp}
                                    testId={subTestId(testId, 'group')}
                                />
                                <PostAffiliateCard post={post} testId={subTestId(testId, 'row')} />
                            </>
                        )}
                    </>
                )}
            </div>

            {display !== 'deleted' ? (
                <div className="px-3 md:px-4">
                    <PostActions
                        post={post}
                        isPremiumReader={isPremiumReader}
                        onShare={onShare}
                        /*
                         * ⚠ *Comment* **opens the reply popup**; it does not navigate.
                         *
                         * All three clients do this — legacy's `handleOpenComment` raises
                         * `CommentForm`, Android calls `DialogManager.showReplyPostDialog`, iOS
                         * runs `prepareReply`. Sending the reader to the post's page instead loses
                         * their place in a feed to do something the feed can do in place.
                         *
                         * `disableDetail` is the exception and it is the same flag legacy splits
                         * on: on the post's **own page** the inline `ReplyComposer` is already on
                         * screen, and a popup over it would be the same box twice.
                         *
                         * ⚠ Gated on that flag and **not on `href`**, which is what it read while
                         * the press was a navigation. `postHref` is `null` for a post the backend
                         * sent no `shareable_url` for, and such a post can still be replied to — on
                         * the `/dev/post` harness, where no fixture carries one, every *Comment*
                         * button was disabled. A deleted post needs no clause here: the whole
                         * action row is withheld for one, a few lines up.
                         */
                        onComment={disableDetail ? undefined : () => openReplyDialog(post)}
                        onUnlockReplies={unlock.press}
                        testId={testId}
                    />
                </div>
            ) : null}

            {attachments && display !== 'deleted' ? (
                <div className="px-3 md:px-4">
                    <PostInsights post={post} testId={subTestId(testId, 'footer')} />
                </div>
            ) : null}

            {onSeeMore ? (
                <div className="flex justify-center px-3 md:px-4">
                    <Button
                        variant="ghost"
                        size="small"
                        data-no-navigate
                        data-testid={subTestId(testId, 'next')}
                        onClick={onSeeMore}
                    >
                        {t('post_see_more')}
                    </Button>
                </div>
            ) : null}

            <PostUnlockDialogs flow={unlock} testId={subTestId(testId, 'overlay')} />
        </article>
    )
}

/**
 * Whether a press on the card should navigate to the post.
 *
 * An **allowlist of things that are already interactive**, rather than legacy's two denylists of
 * the elements that had broken by the time somebody noticed. The last two entries carry the most
 * weight:
 *
 * - `[role="menuitem"]`, `[role="dialog"]` — a menu or dialog rendered through a **portal** is not
 *   a DOM descendant of this card, but React's synthetic events still bubble through the *React*
 *   tree, so a press on a menu row arrives here. Without this, choosing "Delete" would also
 *   navigate to the post being deleted.
 * - `[data-no-navigate]` — the escape hatch for anything that is interactive without being one of
 *   the tags above, marked at the element rather than listed here.
 *
 * A **text selection** is also not a press: dragging across a caption and releasing would otherwise
 * navigate and throw the selection away, which is one of the more irritating things a feed can do.
 */
function shouldNavigate(event: React.MouseEvent<HTMLElement>): boolean {
    const target = event.target as HTMLElement | null
    if (!target) return false
    if (
        target.closest(
            'a, button, input, select, textarea, video, label, [role="menuitem"], [role="dialog"], [data-no-navigate]',
        )
    ) {
        return false
    }
    const selection = window.getSelection()
    return !selection || selection.isCollapsed
}

/**
 * The media, behind the sensitive-content guard when one is needed, and openable full size.
 *
 * Legacy wraps **each media block** in `NsfwGuard` rather than the post, and that is the detail
 * worth keeping: the caption stays readable and only the imagery is covered. A cover over the whole
 * post tells the reader nothing about why it is there. `PostNsfwGuard` carries the two-cover rule
 * and the account setting it reads.
 */
/**
 * A post's pictures or its clip. **Exported** for the reply popup, which quotes the post being
 * replied to and has to draw what it was: legacy's `commentForm` renders the gallery and the player
 * inside its quote, and a photo post quoted as a name and a date is a reply to nothing visible.
 */
export function PostMediaBlock({
    post,
    onOpenMedia,
    interactive = true,
    testId,
}: {
    post: Post
    onOpenMedia?: (target: number | 'video') => void
    /**
     * `false` ⇒ the media is a **picture of itself**: nothing to press, and no viewer of its own.
     *
     * ⚠ The reply popup needs this and the reason is a measured bug. `PostMediaLightbox` is a
     * `z-50` full-screen layer, and so is the dialog — so opening the clip from inside the popup
     * put the scrim *over* the popup while the player drew *inside* it, clipped by the dialog's
     * `overflow-hidden`: a dimmed sheet with a half-visible video in the middle of it and two close
     * buttons. Two modals at the same z index do not stack, they interleave.
     *
     * A quote in a composer is a reference, not a gallery, so the repair is to withhold the press
     * rather than to renumber a layer. Same rule `PostHeader` states for its `actions` and
     * `PostImageGallery` for its `onOpen`: a surface that cannot act on a post does not grow
     * controls that do nothing.
     *
     * Legacy's `commentForm` does better than a still — its quote plays the clip **inline**
     * (`VideoMedia`), with no viewer involved. That is the follow-up; this is the half that stops
     * the popup being broken.
     */
    interactive?: boolean
    testId: string
}) {
    /** Which image the lightbox opened on, or `null` when it is closed. `'video'` opens the clip. */
    const [opened, setOpened] = useState<number | 'video' | null>(null)

    const images = post.images ?? []
    const video = post.video
    // `videoSrc`, not `video.playback` — the latter is an object and is therefore always truthy,
    // including on a post whose video carries no playable source at all.
    const hasMedia = images.length > 0 || Boolean(videoSrc(video))
    if (!hasMedia) return null

    const media = (
        <>
            {images.length > 0 ? (
                <PostImageGallery
                    images={images}
                    onOpen={
                        interactive
                            ? index => (onOpenMedia ? onOpenMedia(index) : setOpened(index))
                            : undefined
                    }
                    testId={subTestId(testId, 'item')}
                />
            ) : null}
            {videoSrc(video) ? (
                <PostVideoTile
                    post={post}
                    onOpen={
                        interactive
                            ? () => (onOpenMedia ? onOpenMedia('video') : setOpened('video'))
                            : undefined
                    }
                    testId={subTestId(testId, 'slide')}
                />
            ) : null}
        </>
    )

    return (
        <>
            {isNsfw(post) ? (
                <PostNsfwGuard isOwn={post.is_owner} testId={subTestId(testId, 'overlay')}>
                    {media}
                </PostNsfwGuard>
            ) : (
                <div className="min-w-0">{media}</div>
            )}

            {/* Only when nobody above wants the press — see `onOpenMedia` and `interactive`. */}
            {interactive && !onOpenMedia && opened !== null ? (
                <PostMediaLightbox
                    images={images}
                    video={opened === 'video' ? (video ?? null) : null}
                    startIndex={opened === 'video' ? 0 : opened}
                    onClose={() => setOpened(null)}
                />
            ) : null}
        </>
    )
}

/**
 * The video — a poster and a duration in the feed, the real clip in the lightbox.
 *
 * A feed that mounts one `<video>` per card pays a decode and a connection for each, and past the
 * third or fourth a phone browser simply refuses, so some cards silently show nothing. Legacy
 * dynamic-imports **video.js** and then guards it with `react-intersection-observer` to keep only
 * the visible one alive; the cheaper answer with the same result is to mount none and play in the
 * overlay, which is where a reader wants a video full width anyway.
 *
 * ## The box follows the clip, and 16/9 was a bug
 *
 * This reserved `16 / 9` unconditionally, so a **9:16 portrait clip was drawn landscape** — the
 * poster letterboxed into a wide box with bars down both sides. The comment here used to claim that
 * was legacy's behaviour; it is not. Legacy branches (`width / height > 1 ? '16/9' : '9/16'`), and
 * Android carries the full ten-bucket table this now uses. `detectVideoAspectRatio` has the rule and
 * why it is Android's rather than legacy's two buckets.
 */
function PostVideoTile({
    post,
    onOpen,
    testId,
}: {
    post: Post
    /**
     * Absent ⇒ the tile is a **picture**, not a control: a `<div>` with no press and no play
     * affordance. `PostMediaBlock`'s `interactive` is the caller that needs it, and its doc has the
     * measured reason. A button that looks pressable and is not is the one thing worse than a
     * still.
     */
    onOpen?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const poster = post.video?.thumbnail ?? post.cover_image?.uri ?? null
    const duration = formatDuration(post.video?.duration_seconds ?? null)
    const Tag = onOpen ? 'button' : 'div'

    return (
        <Tag
            type={onOpen ? 'button' : undefined}
            onClick={onOpen}
            aria-label={onOpen ? t('post_video_play') : undefined}
            data-testid={testId}
            className="relative w-full overflow-hidden rounded-[8px] bg-(--background-segment)"
            style={{ aspectRatio: detectVideoAspectRatio(post.video) }}
        >
            {poster ? (
                <Image
                    src={poster}
                    alt=""
                    fill
                    sizes={POST_COLUMN_SIZES}
                    className="object-cover"
                />
            ) : null}
            {onOpen ? (
                <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-black/50 text-white">
                        <Icon name="play" size={24} weight="filled" />
                    </span>
                </span>
            ) : null}
            {duration ? (
                <span className="type-caption-meta absolute bottom-2 end-2 rounded-[4px] bg-black/60 px-1.5 py-0.5 text-white">
                    {duration}
                </span>
            ) : null}
        </Tag>
    )
}
