'use client'

import { rawGrantNumber, usePermission } from '@features/permission'
import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
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
    STAR_PRICE_MAX,
    STAR_PRICE_MIN_DEFAULT,
} from '../lib/post-draft'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { isAttachableImage } from '../lib/reply-draft'
import { captureVideoPoster, probeVideo, readVideoCodec } from '../lib/video-file'
import { PostComposerBody } from './post-composer-body'
import { PostSettingsPanel } from './post-settings-panel'

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
/** The composer's own screens — see the note at `screen`. */
type ComposerScreen = 'compose' | 'settings'

export function PostComposerDialog({
    open,
    onOpenChange,
    author = null,
    limits = NO_UPLOAD_LIMITS,
    tiers = [],
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
    /**
     * The creator's membership tiers, for the members-only route.
     *
     * A prop for the third time and the same reason: they live in `features/membership`, which
     * reaches this feature through `features/channel`. Empty — the default — means the route is not
     * offered at all, which is right for a creator who has no membership set up.
     */
    tiers?: { id: string; name: string }[]
    /** The post landed. The shell closes the dialog and may send the author to it. */
    onPublished?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const _inputId = useId()
    const _fileRef = useRef<HTMLInputElement>(null)
    const _videoRef = useRef<HTMLInputElement>(null)

    /**
     * Which screen the dialog is showing.
     *
     * Legacy opens *Select your audience*, *Reply settings*, *Post settings* and the collection
     * picker as **separate modals over the composer**, which is itself a modal. This app's dialog
     * draws one layer, so they are screens inside the same frame instead — the header's control
     * turns into a back arrow, which is exactly what `DialogScreenHeader`'s `onBack` is for and
     * what `TwoStepVerificationDialog` already does with its five steps.
     *
     * The grouping and the order are legacy's, so a creator finds the same switch in the same
     * place; only the layer it sits on differs.
     */
    const [screen, setScreen] = useState<ComposerScreen>('compose')

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

    /**
     * The floor under a paid post, from this account's own grant.
     *
     * `post.meta.minimum_price_tvs` — legacy reads the same field with a `|| 1` fallback. A
     * backoffice that has set a higher floor for an account is saying its posts may not be sold
     * below it, and a composer that ignored that would offer a price the write then refuses.
     */
    const { permission } = usePermission()
    const minPrice =
        (permission ? rawGrantNumber(permission, 'post', 'minimum_price_tvs') : null) ??
        STAR_PRICE_MIN_DEFAULT

    const problem = postDraftProblem(draft, {
        characterLimit: limit,
        limits: effectiveLimits,
        minPrice,
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

    async function attachVideo(file: File) {
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

    /**
     * One picker, both kinds — legacy's `BtnUpload` accepts images and video together and sorts by
     * the file's own type. A **video wins** when the selection carries both: a post takes one clip
     * or several pictures and never a mix, so something has to be dropped, and the clip is the
     * deliberate choice (nobody picks a video by accident).
     */
    async function pickFiles(files: FileList | null) {
        if (!files || files.length === 0) return
        const picked = Array.from(files)

        const video = picked.find(isAttachableVideo)
        if (video) {
            await attachVideo(video)
            return
        }

        const room = POST_IMAGE_MAX - draft.images.length
        if (room <= 0) return
        const accepted = picked.filter(file => isAttachableImage(file)).slice(0, room)
        if (accepted.length === 0) return

        const measured = await Promise.all(accepted.map(measureImage))
        setDraft(current => {
            // Pictures and a clip cannot share a post, so attaching one drops the other.
            if (current.video) URL.revokeObjectURL(current.video.previewUrl)
            return { ...current, video: null, images: [...current.images, ...measured] }
        })
        setVideoError(null)
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
                    : problem === 'price-out-of-range'
                      ? t('post_create_price_range', { min: minPrice, max: STAR_PRICE_MAX })
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
                if (!next) {
                    reset()
                    setScreen('compose')
                }
                onOpenChange(next)
            }}
        >
            <DialogContent
                className="flex max-h-[90dvh] w-full max-w-[612px] flex-col gap-0 p-0"
                data-testid={testId}
            >
                <div className="relative">
                    <DialogScreenHeader
                        title={
                            screen === 'compose' ? t('post_create_title') : t('post_settings_title')
                        }
                        /*
                         * Present only on a sub-screen, which turns the control into a back arrow —
                         * `DialogScreenHeader` makes that switch itself rather than taking a
                         * `canGoBack` boolean, so the two cannot disagree.
                         */
                        onBack={screen === 'compose' ? undefined : () => setScreen('compose')}
                        disabled={create.isPending}
                        testId={subTestId(testId, 'header')}
                    />

                    {/*
                     * Legacy's two header actions, on the trailing edge: the collection picker and
                     * the post settings. They are drawn beside the title rather than in the action
                     * bar because that is where legacy puts them, and because the bar below is
                     * already carrying the two settings that describe *who the post is for*.
                     */}
                    {screen === 'compose' ? (
                        <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                            <button
                                type="button"
                                data-testid={subTestId(testId, 'affix')}
                                aria-label={t('post_settings_title')}
                                disabled={create.isPending}
                                onClick={() => setScreen('settings')}
                                className="flex size-9 items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                            >
                                <Icon name="gear" size={20} />
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                    {screen === 'compose' ? (
                        <PostComposerBody
                            draft={draft}
                            author={author}
                            characterLimit={limit}
                            limitReached={draft.images.length >= POST_IMAGE_MAX}
                            disabled={create.isPending}
                            readingVideo={readingVideo}
                            onText={text =>
                                setDraft(current => ({ ...current, text: text.slice(0, limit) }))
                            }
                            onPickFiles={files => void pickFiles(files)}
                            onRemoveImage={removeImage}
                            onRemoveVideo={removeVideo}
                            message={message}
                            testId={testId}
                        />
                    ) : (
                        <PostSettingsPanel
                            draft={draft}
                            onChange={next => setDraft(current => ({ ...current, ...next }))}
                            minPrice={minPrice}
                            tiers={tiers}
                            disabled={create.isPending}
                            testId={subTestId(testId, 'panel')}
                        />
                    )}
                </div>

                {/*
                 * Legacy's action bar: the two settings that say **who the post is for** on the
                 * leading side, and what happens to it on the trailing one. Drawn on the composing
                 * screen only — on a settings screen the back arrow is the whole of the navigation.
                 */}
                {screen === 'compose' ? (
                    <div className="flex items-center justify-between gap-2 border-(--separator-default) border-t px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <SettingChip
                                icon={draft.audience === 'STARGAZERS' ? 'lock-simple' : 'globe'}
                                label={
                                    draft.audience === 'STARGAZERS'
                                        ? t('post_settings_members')
                                        : t('post_audience_everyone')
                                }
                                disabled={create.isPending}
                                onPress={() => setScreen('settings')}
                                testId={subTestId(testId, 'prefix')}
                            />
                            <SettingChip
                                icon="comment"
                                label={t(replyAudienceLabelKey(draft.replyAllowedUser))}
                                disabled={create.isPending}
                                onPress={() => setScreen('settings')}
                                testId={subTestId(testId, 'suffix')}
                            />
                        </div>

                        <div className="flex flex-none items-center gap-2">
                            {/*
                             * The remaining count appears only as it runs out — legacy prints it
                             * from the first keystroke, beside an empty box. 50 is far enough out
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
                                {create.isPending
                                    ? t('post_create_posting')
                                    : t('post_create_submit')}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

/**
 * One of the action bar's two settings — a glyph, a word, and a press that opens the screen it
 * belongs to.
 *
 * Legacy draws these as buttons carrying the **current value** (`BtnAudience` shows the audience,
 * `BtnReplySetting` the reply rule), which is what makes the bar a summary rather than a menu: the
 * author can see what the post is set to without opening anything.
 */
function SettingChip({
    icon,
    label,
    disabled,
    onPress,
    testId,
}: {
    icon: TeviIconName
    label: string
    disabled?: boolean
    onPress: () => void
    testId?: string
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            disabled={disabled}
            onClick={onPress}
            className="type-caption-meta flex min-w-0 items-center gap-1 rounded-full border border-(--separator-default) px-2 py-1 text-(--text-subtitle) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
        >
            <Icon name={icon} size={16} className="flex-none" />
            <span className="truncate">{label}</span>
        </button>
    )
}

/** The reply rule's own label, from the same six values the settings screen offers. */
function replyAudienceLabelKey(value: string): string {
    switch (value) {
        case 'PAID_USERS':
            return 'post_settings_reply_paid'
        case 'FOLLOWINGS':
            return 'post_settings_reply_followings'
        case 'VERIFIED_SPACES':
            return 'post_settings_reply_verified'
        case 'MENTIONED_SPACES':
            return 'post_settings_reply_mentioned'
        case 'NONE':
            return 'post_settings_reply_none'
        default:
            return 'post_settings_reply_followers'
    }
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
