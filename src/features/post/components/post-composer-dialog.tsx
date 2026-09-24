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
    isAttachableVideo,
    NO_UPLOAD_LIMITS,
    POST_IMAGE_MAX,
    type PostDraft,
    type PostDraftImage,
    type PostDraftVideo,
    type PostUploadLimits,
    postDraftProblem,
    VIDEO_TYPES,
} from '../lib/post-draft'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { captureVideoPoster, probeVideo, readVideoCodec } from '../lib/video-file'

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
    limits = NO_UPLOAD_LIMITS,
    onPublished,
    testId = 'post-composer',
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    author?: ReplyComposerAuthor | null
    /**
     * What this account may upload.
     *
     * A prop for the same reason `author` is: two of the three ceilings come from a **Premium
     * entitlement** (`features/premium`, which reaches this feature through `features/channel`), so
     * the host reads them. Omitted, nothing is refused client-side and the backend decides — which
     * is also what legacy does when the entitlement is missing.
     */
    limits?: PostUploadLimits
    /** The post landed. The shell closes the dialog and may send the author to it. */
    onPublished?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const inputId = useId()
    const fileRef = useRef<HTMLInputElement>(null)
    const videoRef = useRef<HTMLInputElement>(null)

    const [draft, setDraft] = useState<PostDraft>(emptyPostDraft)
    /** A file the browser would not decode. Not a draft problem — the clip never got in. */
    const [videoError, setVideoError] = useState<string | null>(null)

    const config = useWebConfig().post.createPost
    const limit = config.characterLimit

    /**
     * The one ceiling this component can read for itself.
     *
     * `video.resolution_max` is remote config, so it is known for every reader; the duration and
     * size ceilings are Premium entitlements and arrive as props. Merged here rather than in the
     * host so a caller cannot forget the half that needs no permission.
     */
    const effectiveLimits: PostUploadLimits = {
        ...limits,
        videoResolutionMax: limits.videoResolutionMax ?? config.video.resolutionMax,
    }

    const problem = postDraftProblem(draft, { characterLimit: limit, limits: effectiveLimits })

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
            if (draftRef.current.video) URL.revokeObjectURL(draftRef.current.video.previewUrl)
        },
        [],
    )

    function reset() {
        setVideoError(null)
        setDraft(current => {
            for (const image of current.images) URL.revokeObjectURL(image.previewUrl)
            if (current.video) URL.revokeObjectURL(current.video.previewUrl)
            return emptyPostDraft()
        })
    }

    /** Reading a clip takes two decodes and a byte scan, so the picker reports while it works. */
    const [readingVideo, setReadingVideo] = useState(false)

    async function attachVideo(files: FileList | null) {
        const file = files?.[0]
        if (!file || !isAttachableVideo(file)) return

        setReadingVideo(true)
        try {
            const probe = await probeVideo(file)
            /*
             * No measurement, no attachment. `duration_seconds`, `width` and `height` are required
             * by `video/upload-url/`, and a clip this browser cannot decode is one it cannot
             * describe — sending zeroes would put nonsense on the object.
             */
            if (!probe) {
                setVideoError(t('post_create_video_unreadable'))
                return
            }

            /*
             * The poster and the codec are both **allowed to fail**: the endpoint takes a null
             * codec, and a missing poster costs a black first frame until the transcode produces
             * one. Neither is worth refusing the clip over, so they run after the measurement that
             * is not optional.
             */
            const [poster, codec] = await Promise.all([
                captureVideoPoster(file),
                readVideoCodec(file),
            ])

            const video: PostDraftVideo = {
                file,
                durationSeconds: probe.durationSeconds,
                width: probe.width,
                height: probe.height,
                codec,
                poster,
                previewUrl: URL.createObjectURL(file),
            }
            setVideoError(null)
            setDraft(current => {
                if (current.video) URL.revokeObjectURL(current.video.previewUrl)
                // A post is words plus **one kind** of media — legacy allows no mixing either.
                for (const image of current.images) URL.revokeObjectURL(image.previewUrl)
                return { ...current, video, images: [] }
            })
        } finally {
            setReadingVideo(false)
        }
    }

    function removeVideo() {
        setVideoError(null)
        setDraft(current => {
            if (current.video) URL.revokeObjectURL(current.video.previewUrl)
            return { ...current, video: null }
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
        videoError ??
        (problem === 'too-long'
            ? t('post_create_too_long')
            : problem === 'too-many-images'
              ? t('post_create_image_limit', { count: POST_IMAGE_MAX })
              : problem === 'video-too-long'
                ? t('post_create_video_too_long', {
                      minutes: Math.floor((effectiveLimits.videoDurationMax ?? 0) / 60),
                  })
                : problem === 'video-too-large'
                  ? t('post_create_video_too_large', { size: effectiveLimits.videoSizeMaxMb ?? 0 })
                  : problem === 'video-too-big-resolution'
                    ? t('post_create_video_too_big', {
                          pixels: effectiveLimits.videoResolutionMax ?? 0,
                      })
                    : null)

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

                    {draft.video ? (
                        <div
                            data-testid={subTestId(testId, 'slide')}
                            className="relative overflow-hidden rounded-[8px] bg-(--background-segment)"
                        >
                            {/*
                             * `controls`, and no autoplay. The author is checking they attached the
                             * right clip, which is a thing they scrub; a card in a feed is a
                             * different question and `PostCard` answers it its own way.
                             */}
                            {/* biome-ignore lint/a11y/useMediaCaption: a clip the author is about to publish has no track to caption it with. */}
                            <video
                                src={draft.video.previewUrl}
                                controls
                                playsInline
                                preload="metadata"
                                className="max-h-64 w-full"
                            />
                            <button
                                type="button"
                                data-testid={subTestId(testId, 'clear')}
                                aria-label={t('post_create_remove_video')}
                                disabled={create.isPending}
                                onClick={removeVideo}
                                className="absolute end-1 top-1 flex size-8 items-center justify-center rounded-full bg-(--background-overlay) text-(--text-on)"
                            >
                                <Icon name="xmark" size={16} />
                            </button>
                            <span className="absolute bottom-1 end-1 rounded-full bg-(--background-overlay) px-2 py-0.5 type-micro-overline text-(--text-on)">
                                {formatClipLength(draft.video.durationSeconds)}
                            </span>
                        </div>
                    ) : null}

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

                        <input
                            ref={videoRef}
                            type="file"
                            accept={VIDEO_TYPES.join(',')}
                            hidden
                            data-testid={subTestId(testId, 'affix')}
                            onChange={event => {
                                void attachVideo(event.target.files)
                                event.target.value = ''
                            }}
                        />
                        {/*
                         * One clip per post, and never beside pictures — legacy's own rule
                         * (`TOO_MANY_VIDEOS`, and a media picker that clears the other kind).
                         * Attaching a clip drops the pictures rather than refusing, because that is
                         * the action the reader just asked for; the button is what says no.
                         */}
                        <button
                            type="button"
                            data-testid={subTestId(testId, 'prefix')}
                            aria-label={t('post_create_add_video')}
                            aria-busy={readingVideo || undefined}
                            disabled={
                                draft.video !== null ||
                                draft.images.length > 0 ||
                                readingVideo ||
                                create.isPending
                            }
                            onClick={() => videoRef.current?.click()}
                            className="flex size-9 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                        >
                            <Icon name="video" size={20} />
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

/** `m:ss`, the badge legacy draws on a clip. Not `formatDuration` — that is `lib/post-media.ts`'s
 *  and takes a post's video, which a local file is not yet. */
function formatClipLength(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(whole / 60)
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`
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
