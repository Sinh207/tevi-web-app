'use client'

import { useAuth } from '@features/auth'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useId, useRef, useState } from 'react'
import { isOwnReply, type Reply } from '../api/reply-types'
import type { Post } from '../api/types'
import { type ReplyDestination, useCreateReply } from '../hooks/use-create-reply'
import { replyCost } from '../lib/post-access'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import {
    allowsReplyLinks,
    isAttachableImage,
    REPLY_IMAGE_MAX,
    REPLY_IMAGE_TYPES,
    type ReplyDraft,
    type ReplyDraftImage,
    replyDraftProblem,
} from '../lib/reply-draft'
import { mayReply, showsReplyAudienceNotice } from '../lib/who-can-reply'
import { PostImageGallery } from './post-image-gallery'
import { ReplyAudienceNotice } from './reply-audience-notice'

/**
 * The box under a post — legacy's `CommentPostDetail`, which is the inline bar rather than the
 * modal its feed uses.
 *
 * ## It is rendered for a guest, and the press is what asks them to sign in
 *
 * Legacy returns `null` for anybody signed out, so a visitor arriving on a shared link sees a page
 * that looks as though replies were closed. `CLAUDE.md`'s rule is the other one — gate the
 * **action**, never the surface — and `useCreateReply`'s `submit` is already wrapped in
 * `useRequireAuth`, so pressing *Reply* raises the sign-in dialog with the words still in the box.
 *
 * What replaces the box when the **post** does not take replies is the *Who can reply?* panel, not
 * nothing. `mayReply` decides — the backend's `can_reply`, plus the followers case iOS settles
 * locally so a reader who has just followed is not told to follow. Until now a `false` drew `null`,
 * so a reader barred from replying saw a page that looked as though the post simply had no
 * composer. Legacy's condition is the same `!canReply`, and what it renders there is the sentence
 * naming the rule — `lib/who-can-reply.ts` has the six of them.
 *
 * A post whose restriction has no sentence — `'everyone'`, or an audience this build has not been
 * taught — still draws nothing at all, which is right: an empty panel says less than no panel.
 *
 * ## The box grows, and that is legacy's layout rather than a flourish
 *
 * Idle it is one row — avatar, a one-line input, and *Reply* on the trailing edge. As soon as the
 * reader focuses it or puts anything in it, the identity line and the picture button appear and
 * *Reply* moves **down** to sit beside the picture button. Legacy renders `BtnReply` from two
 * places for exactly this (`comment-post-detail-reply-btn-inline` when there is content,
 * `…-standalone` when there is not), and the reason is the resting state: a composer nobody has
 * touched should be one line, not a form.
 *
 * ## The reader's own avatar arrives as a prop
 *
 * It comes from `useMyChannel`, which lives in `features/channel` — and that feature imports this
 * one, so reading it here would close a barrel cycle. `PostDetailScreen` (in `app/`) reads it and
 * hands it down, the same route `isPremiumReader` takes. Absent, the slot is simply not drawn.
 *
 * ## The three refusals a draft can carry, and only two of them are printed
 *
 * `replyDraftProblem` decides (`lib/reply-draft.ts`). `empty` is every composer's resting state and
 * says nothing; `link` and `too-many-images` are printed under the box. All three disable the
 * button — a button that submits and then explains is a round trip spent on a rule already known.
 */
export function ReplyComposer({
    post,
    replyTo = null,
    author = null,
    isPremiumReader = false,
    layout = 'inline',
    autoFocus = false,
    onReplied,
    testId,
}: {
    /**
     * The post being replied **to or under** — always the parent post, even when answering a reply.
     *
     * Every rule the box obeys is the post's: whether this reader may reply at all, whether links
     * are allowed, what the charge is. Legacy passes exactly these three down to each comment row
     * (`canReply`, `replyAllowedUser`, `replyAllowedLink` from `postInfo`), because a reply carries
     * none of them.
     */
    post: Post
    /**
     * Answering **this reply** rather than the post.
     *
     * Only the destination changes — `v1/posts/replies/{id}/child-replies/` instead of the post's
     * own — plus one exemption: answering your own comment is free, which is legacy's `isMyComment`
     * term in the paid-interaction condition.
     */
    replyTo?: Reply | null
    /** The reader's own space, for the avatar and the identity line. `null` draws neither. */
    author?: ReplyComposerAuthor | null
    /** Premium readers are exempt from paid interaction — `features/premium`'s fact, not the post's. */
    isPremiumReader?: boolean
    /** Opened on purpose — an answer box the reader has just asked for should already be focused. */
    /**
     * Which of legacy's two composers this is.
     *
     * - `inline` — the bar under a post on its own page (`CommentPostDetail`). It carries its own
     *   surface, the screen's `mt-px` hairline and the page gutter, and it stays one row until it
     *   is touched.
     * - `modal` — the body of the reply **popup** (`commentForm`), which is a different
     *   arrangement and not a restyle: one flat sheet with the dialog supplying the padding, the
     *   reader's identity always on show, and a thread line running from the quoted post down the
     *   left of the box.
     *
     * The header of this file has always said the two exist ("the inline bar rather than the modal
     * its feed uses"); this is the modal arriving, sharing every rule — the sign-in gate, the
     * *Who can reply?* panel, the Star price, the image limits — rather than a second copy of them.
     */
    layout?: 'inline' | 'modal'
    autoFocus?: boolean
    /** The reply landed; the screen refetches the list and the count. */
    onReplied?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const { currentUser } = useAuth()
    const userId = (currentUser?.id as string | number | undefined) ?? null
    const inputId = useId()
    const fileRef = useRef<HTMLInputElement>(null)
    const textRef = useRef<HTMLTextAreaElement>(null)

    const [draft, setDraft] = useState<ReplyDraft>({ text: '', images: [] })
    /**
     * Has the reader engaged with the box?
     *
     * Legacy's `showBtnUploadMedia` is `isInputFocused || text || images.length || isHover`. The
     * hover term is dropped: it exists to reveal the picture button to a mouse before the box is
     * focused, which no touch device can use, and the button is one tab away either way. Everything
     * else is kept, including that the identity line and the picture button appear together —
     * legacy gates both on the same flag.
     */
    const [focused, setFocused] = useState(false)

    /**
     * The reply's character ceiling.
     *
     * The console's `post.create_post.character_limit` — 500 where Firebase is unreachable, which is
     * the number legacy hard-codes into this very bar. Legacy's *modal* composer caps at 10,000
     * instead, so the two disagree about the same write; this takes the smaller, since it is the one
     * the detail page has always enforced and the one an operator can move.
     */
    const limit = useWebConfig().post.createPost.characterLimit

    /*
     * Answering your own comment is free. Legacy's paid-interaction condition carries the term
     * (`!isMyComment`) alongside the ones `replyCost` already covers, and it is not a nicety: a
     * creator working through the answers under their own comment would otherwise pay per reply.
     */
    const ownComment = replyTo ? isOwnReply(replyTo, userId) : false
    const cost = ownComment ? null : replyCost(post, { isPremiumReader })
    const linksAllowed = allowsReplyLinks(post)
    const problem = replyDraftProblem(draft, { linksAllowed })

    const destination: ReplyDestination = replyTo
        ? { kind: 'reply', reply: replyTo }
        : { kind: 'post', post }

    const reply = useCreateReply(destination, {
        cost,
        onCreated: () => {
            setDraft(current => {
                // Revoke on the way out — an object URL outliving its `<img>` is a leak the browser
                // cannot collect on its own.
                for (const image of current.images) URL.revokeObjectURL(image.previewUrl)
                return { text: '', images: [] }
            })
            // The box grew with the words; it has to shrink back with them.
            if (textRef.current) shrink(textRef.current)
            onReplied?.()
        },
    })

    /**
     * The previews still held when the screen goes — the reader navigated away from a reply they
     * never sent.
     *
     * Through a **ref**, and the effect's dependency list is empty on purpose. Depending on
     * `draft.images` would run the cleanup on every attach and removal, with the *previous* array:
     * attaching a second picture would revoke the first one's URL while its `<img>` is still on
     * screen, and the thumbnail would go blank. This is the one shape where the mount/unmount-only
     * effect is not a shortcut.
     */
    const imagesRef = useRef(draft.images)
    imagesRef.current = draft.images
    useEffect(
        () => () => {
            for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl)
        },
        [],
    )

    /*
     * The panel takes the box's place and its `mt-px` with it, so the screen's hairline between
     * blocks survives either branch. It carries its own padding because the tinted block is inset
     * from the page gutter — legacy insets it the same way.
     */
    const modal = layout === 'modal'

    if (!mayReply(post)) {
        if (!showsReplyAudienceNotice(post)) return null
        return (
            <div
                className={cn(
                    modal ? 'py-2' : 'mt-px bg-(--background-surface) px-3 py-3 md:px-6 md:py-4',
                )}
            >
                <ReplyAudienceNotice post={post} testId={testId} />
            </div>
        )
    }

    function setText(value: string) {
        setDraft(current => ({ ...current, text: value.slice(0, limit) }))
    }

    async function attach(files: FileList | null) {
        if (!files || files.length === 0) return
        const room = REPLY_IMAGE_MAX - draft.images.length
        if (room <= 0) return

        const accepted = Array.from(files).filter(isAttachableImage).slice(0, room)
        const measured = await Promise.all(accepted.map(measureImage))
        setDraft(current => ({ ...current, images: [...current.images, ...measured] }))
    }

    function remove(id: string) {
        setDraft(current => {
            const going = current.images.find(image => image.id === id)
            if (going) URL.revokeObjectURL(going.previewUrl)
            return { ...current, images: current.images.filter(image => image.id !== id) }
        })
    }

    function send() {
        if (problem || reply.isPending) return
        reply.submit(draft)
    }

    const full = draft.images.length >= REPLY_IMAGE_MAX
    const message =
        problem === 'link'
            ? t('post_reply_no_links')
            : problem === 'too-many-images'
              ? t('post_reply_image_limit', { count: REPLY_IMAGE_MAX })
              : null

    /*
     * In the popup the box is the whole point of the screen, so it opens already open: legacy's
     * modal draws the identity row and the picture button unconditionally, where its inline bar
     * gates both on being touched. `expanded` is therefore true from the first paint there.
     */
    const expanded = modal || focused || draft.text.trim().length > 0 || draft.images.length > 0

    const submitButton = (
        <Button
            variant="primary"
            size="small"
            className="flex-none"
            disabled={Boolean(problem) || reply.isPending}
            onClick={send}
            data-testid={subTestId(testId, 'submit')}
        >
            {/*
             * The price rides on the button, which is where the action row puts it too: the moment a
             * reader needs to know a reply costs Star is the moment they are about to spend it.
             * `> 1` is legacy's own threshold — a 1-Star charge is not worth a number.
             */}
            {reply.cost === null || reply.cost <= 1
                ? t('post_reply_submit')
                : t('post_reply_submit_priced', {
                      amount: formatStarAmount(reply.cost, currentLanguage),
                  })}
        </Button>
    )

    return (
        <section
            data-testid={testId}
            /*
             * `mt-px` for the same reason every block on this screen carries one: below `md` the
             * surface is full-bleed, so the hairline between blocks *is* the separation. The screen
             * cannot add it from outside — this component renders nothing when replies are closed,
             * and a wrapper would leave a 1px strip behind.
             */
            className={cn(
                'flex min-w-0 flex-col',
                /*
                 * ⚠ The popup is **one sheet**, so the box brings no surface of its own. With it,
                 * the quoted post sat on the dialog's fill and the box on `--background-surface`,
                 * and the two read as two stacked panels — legacy's modal is flat white from the
                 * title band to the footer. The gutter is the dialog's there too.
                 */
                modal ? 'py-1' : 'mt-px bg-(--background-surface) px-3 py-3 md:px-6',
            )}
        >
            {/* `items-start`, so the avatar stays level with the first line as the box grows. */}
            <div className="flex min-w-0 items-start gap-2">
                {/*
                 * The avatar column, and in the popup it carries legacy's **thread line**: a
                 * hairline running the height of the box under the avatar, which is what joins the
                 * quoted post above to the reply being written. `commentForm` draws it in a 1.5/12
                 * grid column with a three-dot glyph at the foot; this is the same line at the
                 * width the avatar already occupies, so the two blocks align without a grid.
                 */}
                <div
                    className={cn('flex flex-none flex-col items-center', modal && 'self-stretch')}
                >
                    {author ? (
                        <AnimatedAvatar
                            size="medium"
                            thumb={author.thumb}
                            avatarVideo={author.avatarVideo}
                            isPremium={author.isPremium}
                            alt=""
                            initials={
                                author.name?.trim()
                                    ? author.name.trim().slice(0, 2).toUpperCase()
                                    : undefined
                            }
                            className="flex-none"
                        />
                    ) : null}
                    {modal ? (
                        <>
                            <span
                                aria-hidden="true"
                                className="mt-1 w-px flex-1 bg-(--separator-default)"
                            />
                            {/*
                             * ⚠ The three dots at the **foot** of the line, which legacy draws in both
                             * of its thread columns (`PostComment` and the form beside it): a 24px
                             * vertical ellipsis in the same `#E0E0E0` as the rule above it. They are
                             * what makes the line read as *the thread carries on* rather than as a
                             * bracket that stops. Without them it ends in mid-air.
                             */}
                            <Icon
                                name="more-vertical"
                                size={24}
                                className="flex-none text-(--separator-default)"
                            />
                        </>
                    ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    {/*
                     * The identity line, and it appears only once the box is in use — legacy gates
                     * it on the same flag as the picture button. At rest it would be the reader's
                     * own name printed above an empty field, which tells them nothing they do not
                     * know.
                     */}
                    {expanded && author ? (
                        <span className="flex min-w-0 items-center gap-0.5">
                            <span className="type-dense-emphasis max-w-[200px] truncate text-(--text-title)">
                                {author.name}
                            </span>
                            <VerifiedBadge image={author.verifiedBadge} size={16} />
                            {author.isPremium ? (
                                <PremiumBadge size={16} className="flex-none" />
                            ) : null}
                            {author.slug ? (
                                <span className="type-caption-meta max-w-[140px] truncate text-(--text-placeholder)">
                                    {`@${author.slug}`}
                                </span>
                            ) : null}
                        </span>
                    ) : null}

                    <div className="flex min-w-0 items-center gap-2">
                        <label className="sr-only" htmlFor={inputId}>
                            {t('post_reply_placeholder')}
                        </label>
                        <textarea
                            ref={textRef}
                            id={inputId}
                            data-testid={subTestId(testId, 'input')}
                            value={draft.text}
                            maxLength={limit}
                            rows={1}
                            // biome-ignore lint/a11y/noAutofocus: the box is mounted by a press on Reply, so focus is the point of the press.
                            autoFocus={autoFocus}
                            placeholder={t('post_reply_placeholder')}
                            aria-invalid={message ? true : undefined}
                            aria-describedby={message ? `${inputId}-message` : undefined}
                            disabled={reply.isPending}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onChange={event => {
                                setText(event.target.value)
                                grow(event.currentTarget)
                            }}
                            onKeyDown={event => {
                                /*
                                 * Enter sends, Shift+Enter breaks the line — legacy's binding, and
                                 * the one every chat box in the product uses. `isComposing` is the
                                 * half legacy misses: an IME candidate list is confirmed with
                                 * Enter, so without it a Japanese or Vietnamese reader sends their
                                 * reply mid-word.
                                 */
                                if (
                                    event.key !== 'Enter' ||
                                    event.shiftKey ||
                                    event.nativeEvent.isComposing
                                )
                                    return
                                event.preventDefault()
                                send()
                            }}
                            /*
                             * 14, where legacy's `ContentInput` is 16. A ramp to 16 from `md` is
                             * what this wanted and `md:type-*` does not work — see the note in
                             * `reply-dialog.tsx`. 14 is the size that matches the quote above it.
                             */
                            className="type-dense-default max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-(--text-title) outline-none placeholder:text-(--text-placeholder) disabled:opacity-60"
                        />
                        {/* At rest the button sits **here**, on the input's own line. */}
                        {expanded ? null : submitButton}
                    </div>

                    {/*
                     * ⚠ The **same gallery the post composer draws**, not a row of 64px squares.
                     *
                     * A reply carries up to ten pictures and the composer is the one place the
                     * reader finds out what they will look like — which is the question a composer
                     * exists to answer. Square crops answered a different one: every picture became
                     * a thumbnail of itself, and a portrait shot gave no clue it was portrait.
                     * `post-composer-body.tsx` reached this conclusion first; this is the reply box
                     * catching up, so the two agree about the same draft.
                     *
                     * `previewUrl` becomes `uri` and the measured size becomes `w`/`h` — the whole
                     * adaptation, and the same one the post composer performs, because
                     * `ReplyDraftImage` and the post draft's image are the same five fields.
                     */}
                    {draft.images.length > 0 ? (
                        <PostImageGallery
                            images={draft.images.map(image => ({
                                uri: image.previewUrl,
                                thumb: null,
                                blur: null,
                                w: image.width,
                                h: image.height,
                                width: null,
                                height: null,
                            }))}
                            size="tight"
                            /*
                             * The gallery counts positions and the draft keys by id, so the index
                             * is resolved here rather than the gallery being taught about ids — a
                             * removal that missed would take the wrong picture off.
                             */
                            onRemove={index => {
                                const going = draft.images[index]
                                if (going && !reply.isPending) remove(going.id)
                            }}
                            testId={subTestId(testId, 'list')}
                        />
                    ) : null}

                    {/*
                     * The action row, drawn only once the box is in use. It carries the picture
                     * button and — from here on — *Reply*, which is where legacy moves it the
                     * moment there is anything to send.
                     */}
                    {expanded ? (
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                data-testid={subTestId(testId, 'trigger')}
                                aria-label={t('post_reply_add_image')}
                                disabled={full || reply.isPending}
                                /*
                                 * `onMouseDown` with the default prevented, not `onClick`: the
                                 * button is only rendered while the box is focused, and a plain
                                 * click blurs the textarea first — which unmounts this button
                                 * before its own handler runs, so the picker never opens.
                                 */
                                onMouseDown={event => {
                                    event.preventDefault()
                                    fileRef.current?.click()
                                }}
                                className="flex size-9 flex-none items-center justify-center rounded-full text-(--icon-default) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                            >
                                {/*
                                 * `images`, not `image` — the correction `post-composer-body.tsx`
                                 * already made and wrote down: legacy's `upload-media.svg` is
                                 * **two stacked frames**, rendered from the real asset to identify
                                 * it. The single frame was the first guess here too, at 20 and in
                                 * the secondary tint, so the two composers disagreed about the same
                                 * control.
                                 */}
                                <Icon name="images" size={24} />
                            </button>
                            {submitButton}
                        </div>
                    ) : null}

                    <input
                        ref={fileRef}
                        type="file"
                        accept={REPLY_IMAGE_TYPES.join(',')}
                        multiple
                        hidden
                        data-testid={subTestId(testId, 'field')}
                        onChange={event => {
                            void attach(event.target.files)
                            // Cleared so picking the same file twice in a row still fires `change`.
                            event.target.value = ''
                        }}
                    />
                </div>
            </div>

            {message ? (
                <p
                    id={`${inputId}-message`}
                    data-testid={subTestId(testId, 'error')}
                    className="type-dense-default text-(--text-error)"
                >
                    {message}
                </p>
            ) : null}
        </section>
    )
}

/**
 * Grow the box with its content, up to the `max-h` the class sets.
 *
 * Done on the element rather than by measuring text: a textarea's `scrollHeight` is the only figure
 * that accounts for wrapping, the font actually loaded and the reader's own zoom. Reset to `auto`
 * first, or it can only ever get taller.
 */
function grow(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
}

/** Back to the one-line height the class sets, once the draft is gone. */
function shrink(element: HTMLTextAreaElement) {
    element.style.height = ''
}

/**
 * Read a picture's natural size, for the `w`/`h` the reply carries.
 *
 * Resolves with `null` dimensions rather than rejecting when the browser will not decode the file:
 * the picture may still upload and render fine, and the only thing lost is the gallery's ability to
 * reserve its box before the bytes arrive. Refusing the attachment over that would be the larger
 * failure.
 */
async function measureImage(file: File): Promise<ReplyDraftImage> {
    const previewUrl = URL.createObjectURL(file)
    const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`

    const size = await new Promise<{ width: number | null; height: number | null }>(resolve => {
        const probe = new Image()
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight })
        probe.onerror = () => resolve({ width: null, height: null })
        probe.src = previewUrl
    })

    return { id, file, previewUrl, ...size }
}
