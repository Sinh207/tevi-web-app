'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { LottieAnimation } from '@shared/components/lottie-animation'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount, formatExactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useState } from 'react'
import type { Reply } from '../api/reply-types'
import { replyHasBody } from '../api/reply-types'
import { useDeleteReply } from '../hooks/use-delete-reply'
import { useReplyReaction } from '../hooks/use-reply-reaction'
import { formatPostTimestamp } from '../lib/post-format'
import { replyMenuVisibility, replyReactionCost } from '../lib/reply-access'
import { COUNT_CLASS, REACTED_FRAME, REACTION_ART } from './post-actions'
import { PostImageGallery } from './post-image-gallery'
import { PostMediaLightbox } from './post-media-lightbox'

/**
 * One reply under a post.
 *
 * ## It replaced a `PostCard`, and that was not a density change
 *
 * The detail page used to draw each reply as a post card, on the documented belief that a reply
 * carries a post's DTO. `api/reply-types.ts` has the measured payload and the table of differences;
 * what the reader saw was a row with **no author, no avatar and no name** (a reply's author is
 * `owner_channel`, and a card reads `channel`), a share button for a thing with no `shareable_url`,
 * a bookmark button, and a *Block* row that could never work. Its react button pointed at
 * `v1/posts/{replyId}/reaction/` — a post endpoint, given a reply's id.
 *
 * So this is not a second card written for looks. It is the first one that draws the fields that
 * are actually there.
 *
 * ## What a reply has, and therefore what this draws
 *
 * Author (avatar, name, verified and Premium marks, handle), a *Member* mark when the author pays
 * for the space (`from_subscriber`), the time, the words, the pictures, and one action — the star.
 * There is no share, no bookmark, no quote and no audience glyph, because a reply carries none of
 * the fields those need.
 *
 * ## Density is legacy's, not the design system's
 *
 * Figma draws no comment row, so there is nothing to port 1:1 — the same position the mini-app
 * player is in, and the same resolution: geometry from legacy (40px avatar, 12px/24px gutters,
 * name at 14/700 over a 12px timestamp), everything expressible in tokens from the DS. When the
 * comps arrive this file is what changes; the endpoints and the gates below do not.
 *
 * ## The thread is `ReplyThread`'s, not this row's
 *
 * A reply has answers of its own (`reply_count`, served by
 * `v1/posts/replies/{id}/child-replies/`), and drawing them means a second list, a second composer
 * and a paging cursor. None of that belongs in a row: this component takes `onReply` and
 * `onToggleAnswers` as callbacks and stays a row. `ReplyThread` owns the state and renders both
 * levels with it.
 *
 * **Two levels, and no more.** A child row is given neither callback, so it offers no *Reply* and
 * its own count is plain text. Legacy is the same shape — `showReplyButton` reaches top-level
 * comments only — and the reason is that a third level has nowhere to be drawn.
 */
export function ReplyRow({
    reply,
    isPremiumReader = false,
    onReply,
    onToggleAnswers,
    answersOpen = false,
    onChanged,
    testId,
}: {
    reply: Reply
    /** Premium readers are exempt from paid interaction — the screen supplies it. */
    isPremiumReader?: boolean
    /**
     * Answer this reply. Absent on a **child** row, which is what keeps the thread two levels deep
     * — legacy passes `showReplyButton` only to top-level comments, and its own child rows get no
     * Reply control at all.
     */
    onReply?: () => void
    /** Open or close the answers under this reply. Absent when there are none, or on a child row. */
    onToggleAnswers?: () => void
    /** Whether they are open — the control says *Hide* rather than *View* while they are. */
    answersOpen?: boolean
    /** A write from this row landed; the owning list refetches. */
    onChanged?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const { currentUser } = useAuth()
    const userId = (currentUser?.id as string | number | undefined) ?? null

    const [lightbox, setLightbox] = useState<number | null>(null)

    const cost = replyReactionCost(reply, { userId, isPremiumReader })
    const author = reply.owner_channel
    const authorHref = author?.slug ? `/@${author.slug}` : null
    const name = author?.name ?? reply.owner?.display_name ?? ''

    /*
     * A tombstone, and it is the whole row. `deleteReply`'s effect on the row is unmeasured — the
     * payload has the flag, so the backend may well answer with the reply still present and
     * `deleted: true` — and a row that has been deleted has no author to credit and nothing to
     * react to. Legacy hides it entirely; this says what happened, which is the same choice
     * `postDisplay`'s tombstone makes for a post.
     */
    if (reply.deleted) {
        return (
            <div data-testid={testId} className="px-3 py-3 text-(--text-placeholder) md:px-6">
                <p className="type-dense-default">{t('reply_deleted')}</p>
            </div>
        )
    }

    return (
        <article data-testid={testId} className="flex min-w-0 flex-col gap-1 px-3 py-2 md:px-6">
            <ReplyHeader
                reply={reply}
                name={name}
                href={authorHref}
                userId={userId}
                onChanged={onChanged}
                testId={testId}
            />

            {/*
             * Indented to the avatar's width plus its gap — 40 + 8 — so the words line up under the
             * name rather than under the picture. Below `sm` the indent is dropped: at 360px a 48px
             * gutter costs a word per line, which legacy also declines to pay.
             */}
            <div className="flex min-w-0 flex-col gap-1 sm:ps-12">
                {reply.text ? (
                    <p
                        data-testid={subTestId(testId, 'description')}
                        className="type-body-default whitespace-pre-wrap break-words text-(--text-body)"
                    >
                        {reply.text}
                    </p>
                ) : null}

                {/*
                 * `html_text` with no `text` — a reply legacy wrote for a link. The markup is never
                 * rendered (`post-card.tsx` states the refusal), so the row says the words are not
                 * showable here rather than rendering an empty bubble.
                 */}
                {!reply.text && reply.html_text ? (
                    <p
                        data-testid={subTestId(testId, 'message')}
                        className="type-dense-default text-(--text-placeholder)"
                    >
                        {t('reply_unrenderable')}
                    </p>
                ) : null}

                {reply.images.length > 0 ? (
                    <PostImageGallery
                        images={reply.images}
                        onOpen={index => setLightbox(index)}
                        testId={subTestId(testId, 'slide')}
                    />
                ) : null}

                {/* A row with nothing in it is still a row — it has an author and a time. */}
                {!replyHasBody(reply) ? (
                    <p className="type-dense-default text-(--text-placeholder)">
                        {t('reply_empty')}
                    </p>
                ) : null}

                <ReplyActions
                    reply={reply}
                    cost={cost}
                    locale={currentLanguage}
                    onReply={onReply}
                    onToggleAnswers={onToggleAnswers}
                    answersOpen={answersOpen}
                    testId={testId}
                />
            </div>

            {lightbox !== null ? (
                <PostMediaLightbox
                    images={reply.images}
                    /* A reply carries no `playback` — pictures only. */
                    video={null}
                    startIndex={lightbox}
                    onClose={() => setLightbox(null)}
                    testId={subTestId(testId, 'overlay')}
                />
            ) : null}
        </article>
    )
}

/** Author, marks, time, and the one menu the row has. */
function ReplyHeader({
    reply,
    name,
    href,
    userId,
    onChanged,
    testId,
}: {
    reply: Reply
    name: string
    href: string | null
    userId: string | number | null
    onChanged?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const author = reply.owner_channel

    const identity = (
        <>
            <AnimatedAvatar
                size="medium"
                thumb={author?.images?.thumb ?? reply.owner?.avatar?.thumb ?? null}
                avatarVideo={author?.images?.avatar_video ?? null}
                isPremium={author?.is_premium ?? false}
                alt=""
                initials={name.trim() ? name.trim().slice(0, 2).toUpperCase() : undefined}
                className="flex-none"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-0.5">
                    <span className="type-dense-emphasis max-w-[120px] truncate text-(--text-title) md:max-w-[170px]">
                        {name}
                    </span>
                    <VerifiedBadge image={author?.verified_tick_badge?.image ?? null} size={16} />
                    {author?.is_premium ? <PremiumBadge size={18} className="flex-none" /> : null}
                    {/*
                     * Legacy's `BadgeMember`, drawn from `from_subscriber` — the author pays for the
                     * space this post is in. It is the one mark a reply has that a post card does
                     * not, and the reason it is worth keeping: in a thread under a paid post it is
                     * what separates members from passers-by.
                     */}
                    {reply.from_subscriber ? (
                        <Icon
                            name="crown"
                            size={16}
                            title={t('reply_badge_member')}
                            className="flex-none text-(--icon-secondary)"
                        />
                    ) : null}
                    {author?.slug ? (
                        <span className="type-caption-meta max-w-[70px] truncate text-(--text-placeholder) md:max-w-[100px]">
                            {`@${author.slug}`}
                        </span>
                    ) : null}
                </span>
                <span className="flex items-center gap-1 text-(--text-placeholder)">
                    {reply.created_at ? (
                        <time dateTime={reply.created_at} className="type-caption-meta">
                            {formatPostTimestamp(reply.created_at, currentLanguage)}
                        </time>
                    ) : null}
                    {reply.edited ? (
                        <span className="type-caption-meta">{t('post_edited')}</span>
                    ) : null}
                </span>
            </span>
        </>
    )

    return (
        <header className="flex min-w-0 items-center justify-between gap-2">
            {href ? (
                <Link
                    href={href}
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

            <ReplyMenu reply={reply} userId={userId} onChanged={onChanged} testId={testId} />
        </header>
    )
}

/**
 * The reply's overflow menu — one row today.
 *
 * Absent entirely when there is nothing in it, which is `PostMenu`'s own rule: a trigger that opens
 * an empty popup is worse than no trigger. For most readers on most replies, that is every reply.
 */
function ReplyMenu({
    reply,
    userId,
    onChanged,
    testId,
}: {
    reply: Reply
    userId: string | number | null
    onChanged?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const [confirming, setConfirming] = useState(false)
    const remove = useDeleteReply(reply, { onDeleted: onChanged })

    const shows = replyMenuVisibility(reply, { userId })
    if (!shows.delete) return null

    return (
        <>
            <ActionMenu>
                <ActionMenuTrigger
                    aria-label={t('post_menu_actions')}
                    data-testid={subTestId(testId, 'trigger')}
                >
                    <Icon name="more-horizontal" size={20} className="size-5" />
                </ActionMenuTrigger>
                <ActionMenuContent>
                    <ActionMenuItem
                        data-testid={subTestId(testId, 'remove')}
                        tone="destructive"
                        disabled={remove.isPending}
                        onClick={requireAuth(() => setConfirming(true))}
                    >
                        {t('reply_menu_delete')}
                        <Icon name="trash" size={20} className="flex-none" />
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t('reply_delete_title')}
                description={t('reply_delete_confirm')}
                confirmLabel={t('reply_menu_delete')}
                destructive
                pending={remove.isPending}
                onConfirm={() => {
                    remove.run()
                    setConfirming(false)
                }}
                testId={subTestId(testId, 'panel')}
            />
        </>
    )
}

/**
 * The star, its tally, and the count of answers this reply has.
 *
 * The star is `PostActions`' own — same artwork, same frame, same chip — imported rather than
 * redrawn, because two copies animating to different frames is exactly the drift a shared constant
 * prevents. What is missing beside it is the *Reply* button: writing into a thread is the child-reply
 * cut, and `ReplyRow`'s header says why the count stands alone until then.
 */
function ReplyActions({
    reply,
    cost,
    locale,
    onReply,
    onToggleAnswers,
    answersOpen,
    testId,
}: {
    reply: Reply
    cost: number | null
    locale: string
    onReply?: () => void
    onToggleAnswers?: () => void
    answersOpen?: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const { reacted, count, toggle, isPending } = useReplyReaction(reply, { cost })
    const [pressed, setPressed] = useState(false)

    return (
        <div className="flex items-center gap-3">
            <span className="flex items-center">
                <button
                    type="button"
                    onClick={() => {
                        setPressed(true)
                        toggle()
                    }}
                    aria-label={t('post_action_react')}
                    aria-pressed={reacted}
                    aria-busy={isPending || undefined}
                    title={t('post_action_react')}
                    data-testid={subTestId(testId, 'reveal')}
                    className="relative flex size-8 flex-none items-center justify-center rounded-full"
                >
                    <LottieAnimation
                        src={REACTION_ART}
                        frame={reacted ? REACTED_FRAME : 0}
                        animate={pressed}
                        className="size-8"
                    />
                </button>
                <span className={COUNT_CLASS} title={formatExactCount(count, locale)}>
                    {formatCompactCount(count, locale)}
                </span>
            </span>

            {onReply ? (
                <button
                    type="button"
                    onClick={onReply}
                    data-testid={subTestId(testId, 'next')}
                    className="type-caption-meta text-(--text-subtitle) hover:underline"
                >
                    {t('reply_action_reply')}
                </button>
            ) : null}

            {/*
             * The count is a **control** when there is a thread to open and plain text when the row
             * cannot open one — a child row has answers of its own on the wire but no level below
             * it to show them in, so making it pressable would promise a third level that does not
             * exist. A zero prints nothing at all, which is `PostActions`' rule for a tally.
             */}
            {reply.reply_count > 0 ? (
                onToggleAnswers ? (
                    <button
                        type="button"
                        onClick={onToggleAnswers}
                        aria-expanded={answersOpen}
                        data-testid={subTestId(testId, 'label-data')}
                        className="type-caption-meta text-(--text-subtitle) hover:underline"
                    >
                        {answersOpen
                            ? t('reply_hide_answers')
                            : t('reply_child_count', { count: reply.reply_count })}
                    </button>
                ) : (
                    <span
                        data-testid={subTestId(testId, 'label-data')}
                        className="type-caption-meta text-(--text-placeholder)"
                    >
                        {t('reply_child_count', { count: reply.reply_count })}
                    </span>
                )
            ) : null}
        </div>
    )
}
