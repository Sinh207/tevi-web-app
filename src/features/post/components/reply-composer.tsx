'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useId, useRef, useState } from 'react'
import type { Post } from '../api/types'
import { useCreateReply } from '../hooks/use-create-reply'
import { replyCost } from '../lib/post-access'
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
 * ## No avatar beside it, and that is a boundary rather than an omission
 *
 * Legacy draws the reader's own avatar on the left. It comes from `useMyChannel`, which lives in
 * `features/channel` — and that feature imports this one, so reading it here would close a barrel
 * cycle. The row is laid out so the slot can be filled by a prop the day something above this
 * component can supply one; nothing else changes.
 *
 * ## The three refusals a draft can carry, and only two of them are printed
 *
 * `replyDraftProblem` decides (`lib/reply-draft.ts`). `empty` is every composer's resting state and
 * says nothing; `link` and `too-many-images` are printed under the box. All three disable the
 * button — a button that submits and then explains is a round trip spent on a rule already known.
 */
export function ReplyComposer({
    post,
    isPremiumReader = false,
    onReplied,
    testId,
}: {
    post: Post
    /** Premium readers are exempt from paid interaction — `features/premium`'s fact, not the post's. */
    isPremiumReader?: boolean
    /** The reply landed; the screen refetches the list and the count. */
    onReplied?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const inputId = useId()
    const fileRef = useRef<HTMLInputElement>(null)
    const textRef = useRef<HTMLTextAreaElement>(null)

    const [draft, setDraft] = useState<ReplyDraft>({ text: '', images: [] })

    /**
     * The reply's character ceiling.
     *
     * The console's `post.create_post.character_limit` — 500 where Firebase is unreachable, which is
     * the number legacy hard-codes into this very bar. Legacy's *modal* composer caps at 10,000
     * instead, so the two disagree about the same write; this takes the smaller, since it is the one
     * the detail page has always enforced and the one an operator can move.
     */
    const limit = useWebConfig().post.createPost.characterLimit

    const cost = replyCost(post, { isPremiumReader })
    const linksAllowed = allowsReplyLinks(post)
    const problem = replyDraftProblem(draft, { linksAllowed })

    const reply = useCreateReply(post, {
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
    if (!mayReply(post)) {
        if (!showsReplyAudienceNotice(post)) return null
        return (
            <div className="mt-px bg-(--background-surface) px-3 py-3 md:px-6 md:py-4">
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

    return (
        <section
            data-testid={testId}
            /*
             * `mt-px` for the same reason every block on this screen carries one: below `md` the
             * surface is full-bleed, so the hairline between blocks *is* the separation. The screen
             * cannot add it from outside — this component renders nothing when replies are closed,
             * and a wrapper would leave a 1px strip behind.
             */
            className="mt-px flex min-w-0 flex-col gap-2 bg-(--background-surface) px-3 py-3 md:px-6 md:py-4"
        >
            <div className="flex min-w-0 items-end gap-2">
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
                    placeholder={t('post_reply_placeholder')}
                    aria-invalid={message ? true : undefined}
                    aria-describedby={message ? `${inputId}-message` : undefined}
                    disabled={reply.isPending}
                    onChange={event => {
                        setText(event.target.value)
                        grow(event.currentTarget)
                    }}
                    onKeyDown={event => {
                        /*
                         * Enter sends, Shift+Enter breaks the line — legacy's binding, and the one
                         * every chat box in the product uses. `isComposing` is the half legacy
                         * misses: an IME candidate list is confirmed with Enter, so without it a
                         * Japanese or Vietnamese reader sends their reply mid-word.
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
                    className="type-body-default max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-(--text-title) outline-none placeholder:text-(--text-placeholder) disabled:opacity-60"
                />

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
                <button
                    type="button"
                    data-testid={subTestId(testId, 'trigger')}
                    aria-label={t('post_reply_add_image')}
                    disabled={full || reply.isPending}
                    onClick={() => fileRef.current?.click()}
                    className="flex size-9 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                >
                    <Icon name="image" size={20} />
                </button>

                <Button
                    variant="primary"
                    size="small"
                    className="flex-none"
                    disabled={Boolean(problem) || reply.isPending}
                    onClick={send}
                    data-testid={subTestId(testId, 'submit')}
                >
                    {/*
                     * The price is on the button rather than beside the box, which is where the
                     * action row puts it too: the one moment a reader needs to know a reply costs
                     * Star is the moment they are about to spend it.
                     */}
                    {reply.cost === null
                        ? t('post_reply_submit')
                        : t('post_reply_submit_priced', {
                              amount: formatStarAmount(reply.cost, currentLanguage),
                          })}
                </Button>
            </div>

            {draft.images.length > 0 ? (
                <ul
                    data-testid={subTestId(testId, 'list')}
                    /*
                     * A scrolling row, not a carousel: these are thumbnails the reader scrubs
                     * sideways, with no slide semantics at all (`DESIGN_SYSTEM.md` §10).
                     */
                    className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 md:-mx-6 md:px-6"
                >
                    {draft.images.map(image => (
                        <li
                            key={image.id}
                            data-testid={subTestId(testId, 'item')}
                            className="relative size-16 flex-none snap-start overflow-hidden rounded-[8px] bg-(--background-segment)"
                        >
                            {/*
                             * A local `blob:` URL that exists for as long as this draft does, so
                             * `next/image` has nothing to optimise and no loader that would accept
                             * it. The plain tag is correct here rather than a concession.
                             */}
                            {/* biome-ignore lint/performance/noImgElement: a blob: URL has nothing for next/image to optimise and no loader that accepts it. */}
                            <img src={image.previewUrl} alt="" className="size-full object-cover" />
                            <button
                                type="button"
                                data-testid={subTestId(testId, 'remove')}
                                aria-label={t('post_reply_remove_image')}
                                onClick={() => remove(image.id)}
                                className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-(--background-overlay) text-(--text-on)"
                            >
                                {/* 16 is the smallest the sprite ships — `IconSize` is a union, so a
                                    hand-picked 12 is a type error rather than a blurry glyph. */}
                                <Icon name="xmark" size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

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
