'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useEffect, useId, useRef, useState } from 'react'
import { useCreatePost } from '../hooks/use-create-post'
import {
    emptyPostDraft,
    POST_IMAGE_MAX,
    type PostDraft,
    type PostDraftImage,
    postDraftProblem,
} from '../lib/post-draft'
import type { ReplyComposerAuthor } from '../lib/reply-author'

/**
 * **New post** — legacy's `PostForm`, as far as words and pictures go.
 *
 * ## The shape is legacy's: a dialog that is really a screen
 *
 * Close on the **leading** edge, a centred title, and the action bar along the **bottom** rather
 * than in the header. `DESIGN_SYSTEM.md` §7 names that arrangement and `DialogScreenHeader` draws
 * it; what is left to this file is the bar, which legacy splits — audience and reply settings on
 * the leading side, *Preview* and *Post* on the trailing one. The leading half arrives with the
 * settings; the bar is already two-sided so that nothing moves when it does.
 *
 * ## What it does not carry yet
 *
 * Video, the audience and paywall controls, who-can-reply, the collection picker and the preview.
 * Each is its own cut and each is listed at the point it plugs in, so the gap is visible in the code
 * rather than only in a plan. The **draft** already models all of them (`lib/post-draft.ts`), so
 * they arrive as controls over fields that exist rather than as a reshaping of this component.
 *
 * ## The reader is a prop, again
 *
 * Same boundary as the reply composer: the avatar and name come from `useMyChannel`, in
 * `features/channel`, which imports this feature. Whoever mounts the dialog reads the provider and
 * hands the five fields down.
 */
export function PostComposerDialog({
    open,
    onOpenChange,
    author = null,
    onPublished,
    testId = 'post-composer',
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    author?: ReplyComposerAuthor | null
    /** The post landed. The shell closes the dialog and may send the author to it. */
    onPublished?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const inputId = useId()
    const fileRef = useRef<HTMLInputElement>(null)

    const [draft, setDraft] = useState<PostDraft>(emptyPostDraft)

    const limit = useWebConfig().post.createPost.characterLimit
    const problem = postDraftProblem(draft, {
        characterLimit: limit,
        /*
         * No ceiling yet, because nothing can attach a clip yet.
         *
         * ⚠ It is **not** in remote config, which is where it looks like it should be:
         * `post.create_post.video.resolution_max` is a *resolution*. Legacy reads the duration from
         * a **Premium entitlement** — `enhancedStorageUploadPremium`'s `video-length` row, whose
         * metadata carries `free` and `prem` in **minutes** and is multiplied by 60. That lives in
         * `features/premium`, so wiring it is part of the video cut rather than a line here.
         */
        videoDurationMax: null,
    })

    const create = useCreatePost({
        onCreated: () => {
            reset()
            onOpenChange(false)
            onPublished?.()
        },
    })

    /**
     * The object URLs the draft is holding, released on unmount.
     *
     * Through a ref with an empty dependency list, for the reason `ReplyComposer` writes down: a
     * cleanup keyed on the array runs on every attach with the **previous** one and blanks a preview
     * that is still on screen.
     */
    const draftRef = useRef(draft)
    draftRef.current = draft
    useEffect(
        () => () => {
            for (const image of draftRef.current.images) URL.revokeObjectURL(image.previewUrl)
        },
        [],
    )

    function reset() {
        setDraft(current => {
            for (const image of current.images) URL.revokeObjectURL(image.previewUrl)
            return emptyPostDraft()
        })
    }

    async function attach(files: FileList | null) {
        if (!files || files.length === 0) return
        const room = POST_IMAGE_MAX - draft.images.length
        if (room <= 0) return
        const accepted = Array.from(files)
            .filter(file => file.type.startsWith('image/'))
            .slice(0, room)
        const measured = await Promise.all(accepted.map(measureImage))
        setDraft(current => ({ ...current, images: [...current.images, ...measured] }))
    }

    function removeImage(id: string) {
        setDraft(current => {
            const going = current.images.find(image => image.id === id)
            if (going) URL.revokeObjectURL(going.previewUrl)
            return { ...current, images: current.images.filter(image => image.id !== id) }
        })
    }

    const remaining = limit - draft.text.length
    const message =
        problem === 'too-long'
            ? t('post_create_too_long')
            : problem === 'too-many-images'
              ? t('post_create_image_limit', { count: POST_IMAGE_MAX })
              : null

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                /*
                 * A publish in flight is uploads in flight. Closing would unmount the draft the
                 * uploads are reading from and leave a half-written post with no way back to it, so
                 * the dialog refuses — the same reason `DialogScreenHeader` takes `disabled`.
                 */
                if (create.isPending) return
                if (!next) reset()
                onOpenChange(next)
            }}
        >
            <DialogContent
                className="flex max-h-[90dvh] w-full max-w-[612px] flex-col gap-0 p-0"
                data-testid={testId}
            >
                <DialogScreenHeader
                    title={t('post_create_title')}
                    disabled={create.isPending}
                    testId={subTestId(testId, 'header')}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                    <div className="flex min-w-0 items-start gap-2">
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

                        <div className="flex min-w-0 flex-1 flex-col">
                            <label className="sr-only" htmlFor={inputId}>
                                {t('post_create_placeholder')}
                            </label>
                            <textarea
                                id={inputId}
                                data-testid={subTestId(testId, 'input')}
                                value={draft.text}
                                maxLength={limit}
                                rows={3}
                                placeholder={t('post_create_placeholder')}
                                aria-invalid={message ? true : undefined}
                                disabled={create.isPending}
                                onChange={event =>
                                    setDraft(current => ({
                                        ...current,
                                        text: event.target.value.slice(0, limit),
                                    }))
                                }
                                className="type-body-default max-h-64 min-h-24 w-full resize-none bg-transparent py-1 text-(--text-title) outline-none placeholder:text-(--text-placeholder) disabled:opacity-60"
                            />
                        </div>
                    </div>

                    {draft.images.length > 0 ? (
                        <ul
                            data-testid={subTestId(testId, 'list')}
                            className="flex snap-x gap-2 overflow-x-auto"
                        >
                            {draft.images.map(image => (
                                <li
                                    key={image.id}
                                    data-testid={subTestId(testId, 'item')}
                                    className="relative size-24 flex-none snap-start overflow-hidden rounded-[8px] bg-(--background-segment)"
                                >
                                    {/* biome-ignore lint/performance/noImgElement: a blob: URL has nothing for next/image to optimise and no loader that accepts it. */}
                                    <img
                                        src={image.previewUrl}
                                        alt=""
                                        className="size-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        data-testid={subTestId(testId, 'remove')}
                                        aria-label={t('post_create_remove_image')}
                                        disabled={create.isPending}
                                        onClick={() => removeImage(image.id)}
                                        className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-(--background-overlay) text-(--text-on)"
                                    >
                                        <Icon name="xmark" size={16} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {message ? (
                        <p
                            data-testid={subTestId(testId, 'error')}
                            className="type-dense-default text-(--text-error)"
                        >
                            {message}
                        </p>
                    ) : null}
                </div>

                {/*
                 * Legacy's action bar: two sides, the leading one for the settings that decide who
                 * the post is **for** and the trailing one for what happens to it. Only the picture
                 * button and *Post* exist so far; the audience, reply-setting and preview controls
                 * land beside them without the bar changing shape.
                 */}
                <div className="flex items-center justify-between gap-2 border-(--separator-default) border-t px-4 py-3">
                    <div className="flex items-center gap-1">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            data-testid={subTestId(testId, 'field')}
                            onChange={event => {
                                void attach(event.target.files)
                                // Cleared, so picking the same file twice still fires `change`.
                                event.target.value = ''
                            }}
                        />
                        <button
                            type="button"
                            data-testid={subTestId(testId, 'trigger')}
                            aria-label={t('post_create_add_image')}
                            disabled={
                                draft.images.length >= POST_IMAGE_MAX ||
                                create.isPending ||
                                draft.video !== null
                            }
                            onClick={() => fileRef.current?.click()}
                            className="flex size-9 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                        >
                            <Icon name="image" size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/*
                         * The remaining count appears only as it runs out — legacy prints it from
                         * the start, which puts a number beside an empty box. 50 is far enough out
                         * to be a warning and near enough not to be furniture.
                         */}
                        {remaining <= 50 ? (
                            <span
                                data-testid={subTestId(testId, 'label-data')}
                                className={
                                    remaining < 0
                                        ? 'type-caption-meta text-(--text-error)'
                                        : 'type-caption-meta text-(--text-placeholder)'
                                }
                            >
                                {remaining}
                            </span>
                        ) : null}
                        <Button
                            variant="primary"
                            size="medium"
                            disabled={Boolean(problem) || create.isPending}
                            onClick={() => create.publish(draft)}
                            data-testid={subTestId(testId, 'submit')}
                        >
                            {create.isPending ? t('post_create_posting') : t('post_create_submit')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Read a picture's natural size for the `w`/`h` the post carries.
 *
 * Resolves with `null` dimensions rather than rejecting when the browser will not decode the file:
 * the picture may still upload and render, and all that is lost is the gallery's ability to reserve
 * its box. `ReplyComposer` does the same and for the same reason.
 */
async function measureImage(file: File): Promise<PostDraftImage> {
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
