'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials, avatarImageClass } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PendingUploads } from '../../hooks/use-save-profile'
import {
    captureVideoPoster,
    imageFileError,
    isVideoTooLong,
    readVideoMeta,
    videoFileError,
} from '../../lib/media-validation'
import { AVATAR_ASPECT, COVER_ASPECT, type ProfileImages } from '../../lib/profile-form'
import { ImageCropDialog } from './image-crop-dialog'

/**
 * The cover and the avatar — the two controls on this form that are pictures rather than text.
 *
 * They live in one component because they share all of their plumbing: a hidden `<input
 * type="file">`, the same validation, the same cropper, and the same object-URL lifecycle. Split
 * in two, that plumbing exists twice and the second copy is the one that leaks a blob URL.
 *
 * ## The layout is the channel header's, deliberately
 *
 * Cover band, avatar overlapping its bottom edge by half. Not decoration — this **is** the
 * preview: the whole point of cropping a 16:9 cover is seeing where the avatar will sit on top of
 * it, and a form that shows the two pictures in separate boxes cannot show that. The numbers come
 * from `channel-header.tsx` so the preview and the real header agree.
 *
 * ## What a "pending" picture is
 *
 * A cropped blob plus a `blob:` URL for the preview. The URL goes into the form's `images` so
 * every preview on the page updates at once; the blob goes to `useSaveProfile`, which uploads it
 * and swaps in the real URL before anything is patched. The two must not be confused — see
 * `resolveImages`, which throws rather than let a `blob:` reach the API.
 */

type PickTarget = 'cover' | 'avatar'

export function ProfileMediaFields({
    images,
    name,
    isPremium,
    onCoverPicked,
    onAvatarPicked,
    onAvatarVideoPicked,
    disabled,
}: {
    images: ProfileImages
    /** The two initials the avatar falls back to — see the `alt=""` note at the image. */
    name: string
    /** Only a premium account may set a looping video avatar. Legacy gates the `accept` list. */
    isPremium: boolean
    onCoverPicked: (blob: Blob, previewUrl: string) => void
    onAvatarPicked: (blob: Blob, previewUrl: string) => void
    onAvatarVideoPicked: (
        video: NonNullable<PendingUploads['avatarVideo']>,
        previewUrl: string,
    ) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const coverInput = useRef<HTMLInputElement>(null)
    const avatarInput = useRef<HTMLInputElement>(null)

    const [crop, setCrop] = useState<{ src: string; type: string; target: PickTarget } | null>(null)

    /**
     * Whether the avatar URL failed to load — so the circle can fall back to initials.
     *
     * Reset **during render** when the URL changes, which is React's documented way to derive
     * state from a prop and the only correct one here: an effect would leave a freshly-picked
     * picture showing the *previous* one's failure for a frame, and a picked file is exactly when
     * someone is watching that circle.
     */
    const [failedThumb, setFailedThumb] = useState<string | null>(null)
    const [lastThumb, setLastThumb] = useState(images.thumb)
    if (images.thumb !== lastThumb) {
        setLastThumb(images.thumb)
        setFailedThumb(null)
    }
    const setThumbFailed = () => setFailedThumb(images.thumb)
    const showsThumb = Boolean(images.thumb) && failedThumb !== images.thumb

    /**
     * Every object URL this component has created, revoked on unmount.
     *
     * A blob URL pins the whole file in memory until the document goes away. This screen invites
     * retrying — pick, look, pick again — so without this a few attempts at a 2 MB cover is a few
     * megabytes held for the rest of the session. Revoking *eagerly* on replacement is not an
     * option: the previous URL may still be the `src` of a preview that has not re-rendered yet,
     * and revoking one that is in use blanks the image.
     */
    const created = useRef<string[]>([])
    const track = (url: string) => {
        created.current.push(url)
        return url
    }
    useEffect(() => {
        const urls = created.current
        return () => {
            for (const url of urls) URL.revokeObjectURL(url)
        }
    }, [])

    /** Reset the input's value so picking the *same* file twice fires `change` again. */
    const consume = (input: HTMLInputElement) => {
        input.value = ''
    }

    async function handleFile(file: File, target: PickTarget, input: HTMLInputElement) {
        if (target === 'avatar' && file.type.startsWith('video/')) {
            await handleVideo(file, input)
            return
        }

        const error = imageFileError(file)
        if (error) {
            toast.error(t(error))
            consume(input)
            return
        }

        setCrop({ src: track(URL.createObjectURL(file)), type: file.type, target })
        consume(input)
    }

    /**
     * A looping avatar: validate, measure, grab a poster, hand both up.
     *
     * ⚠ **No trimmer.** Legacy opens a client-side video trimmer for a clip over ten seconds (on
     * desktop) or points at the native app (on mobile). Trimming is not ported — see the note on
     * `VIDEO_MAX_SECONDS` — so a long clip is refused here with the reason and the same
     * suggestion legacy's mobile branch gives. Refusing loudly is the honest version of a missing
     * feature; silently uploading the first ten seconds would not be.
     */
    async function handleVideo(file: File, input: HTMLInputElement) {
        const error = videoFileError(file)
        if (error) {
            toast.error(t(error))
            consume(input)
            return
        }

        try {
            const meta = await readVideoMeta(file)
            if (isVideoTooLong(meta)) {
                toast.error(t('profile_video_too_long'))
                consume(input)
                return
            }

            const poster = await captureVideoPoster(file)
            if (!poster) {
                // No poster means no avatar anywhere except this channel's own header — see
                // `resolveImages`. Refused rather than uploaded half-complete.
                toast.error(t('profile_video_failed'))
                consume(input)
                return
            }

            onAvatarVideoPicked(
                {
                    file,
                    poster,
                    width: meta.width,
                    height: meta.height,
                    durationSeconds: meta.duration,
                },
                track(URL.createObjectURL(poster)),
            )
        } catch {
            toast.error(t('profile_video_failed'))
        } finally {
            consume(input)
        }
    }

    const accept = isPremium
        ? 'image/jpeg,image/png,video/mp4,video/quicktime,video/webm'
        : 'image/jpeg,image/png'

    return (
        <div className="flex flex-col">
            {/* ── cover ─────────────────────────────────────────────────────────────────── */}
            <div className="relative aspect-[402/140] w-full overflow-hidden bg-(--background-segment)">
                {images.cover && (
                    /*
                     * A plain `<img>`, not `next/image` — the same call `image-crop-dialog.tsx`
                     * makes and for the same reason: half the time this `src` is a `blob:` URL
                     * for a file that exists in this tab only, which there is nothing to
                     * optimise, cache or resize. The published header uses `next/image`
                     * (`channel-cover.tsx`); this is a two-second preview of a local file.
                     */
                    // biome-ignore lint/performance/noImgElement: blob: source, see above
                    <img
                        src={images.cover}
                        alt=""
                        className="absolute inset-0 size-full object-cover"
                    />
                )}
                <input
                    ref={coverInput}
                    type="file"
                    accept="image/jpeg,image/png"
                    hidden
                    disabled={disabled}
                    onChange={event => {
                        const file = event.target.files?.[0]
                        if (file) void handleFile(file, 'cover', event.target)
                    }}
                />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => coverInput.current?.click()}
                    // `end-3 top-3`, logical properties — `pnpm lint:rtl` fails `right`/`pr`.
                    className={cn(
                        'absolute end-3 top-3 flex size-9 items-center justify-center rounded-full',
                        'bg-overlay-default text-white backdrop-blur-sm transition-opacity',
                        'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                >
                    <Icon name="camera" weight="filled" size={20} />
                    <span className="sr-only">{t('profile_change_cover')}</span>
                </button>
            </div>

            {/* ── avatar ────────────────────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 px-3 md:px-6">
                <div className="-mt-12 flex items-end md:-mt-[76px]">
                    <div className="relative">
                        {/*
                         * `Avatar` with a plain `<img>` rather than `AnimatedAvatar`, which is the
                         * one place this form deviates from the header it mirrors.
                         *
                         * `AnimatedAvatar` plays `avatar_video.playback.url`, and a *pending*
                         * clip has no such URL — it has a `File` that has not been uploaded. So it
                         * would render a `<video>` pointing at nothing and fall back to the
                         * poster after a failed load, which is a broken-looking preview of a
                         * perfectly good pick. The poster is what every other surface in the app
                         * will show anyway (see `resolveImages`), so showing it here is also the
                         * more honest preview.
                         */}
                        <Avatar
                            size="2xl"
                            type={showsThumb ? 'image' : 'initials'}
                            className="md:size-[120px]"
                        >
                            {showsThumb ? (
                                /*
                                 * `alt=""`, and `onError` is why it matters. A picture that 404s
                                 * renders its alt text — and an avatar's alt is a person's name,
                                 * so a dead URL printed "Ada Lovelace" in 20px type sprawling out
                                 * of an 80px circle and over the cover behind it. Caught in a
                                 * screenshot, not in review.
                                 *
                                 * Two defences, because either alone leaves a hole: the empty alt
                                 * means a broken image draws nothing rather than text, and the
                                 * error flag swaps in the initials, which is a *correct* avatar
                                 * rather than an empty circle. Nothing is lost by the empty alt —
                                 * the control beside it is labelled "Change profile photo", and
                                 * the name is in the Name field two rows down.
                                 */
                                // biome-ignore lint/performance/noImgElement: blob: source
                                <img
                                    src={images.thumb ?? undefined}
                                    alt=""
                                    onError={setThumbFailed}
                                    className={avatarImageClass}
                                />
                            ) : (
                                <AvatarInitials>{name.slice(0, 2).toUpperCase()}</AvatarInitials>
                            )}
                        </Avatar>
                        {images.avatarVideo != null && (
                            <span
                                className="absolute start-1 top-1 flex size-6 items-center justify-center rounded-full bg-overlay-default text-white"
                                title={t('profile_avatar_video_set')}
                            >
                                <Icon name="play" weight="filled" size={16} aria-hidden />
                                <span className="sr-only">{t('profile_avatar_video_set')}</span>
                            </span>
                        )}
                        <input
                            ref={avatarInput}
                            type="file"
                            accept={accept}
                            hidden
                            disabled={disabled}
                            onChange={event => {
                                const file = event.target.files?.[0]
                                if (file) void handleFile(file, 'avatar', event.target)
                            }}
                        />
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => avatarInput.current?.click()}
                            className={cn(
                                'absolute end-0 bottom-0 flex size-8 items-center justify-center rounded-full',
                                'border-2 border-(--background-surface) bg-(--background-segment)',
                                'text-(--icon-secondary) transition-colors',
                                'hover:bg-(--background-segment-focus)',
                                'disabled:cursor-not-allowed disabled:opacity-50',
                            )}
                        >
                            <Icon name="camera" weight="filled" size={16} />
                            <span className="sr-only">{t('profile_change_avatar')}</span>
                        </button>
                    </div>
                </div>

                {/*
                 * The limits, on their own line **under** the avatar rather than beside it.
                 *
                 * Beside it is where they were, and on a 390px phone that left the sentence about
                 * 240px to wrap in, running it to four lines against the camera badge. Under it
                 * the same sentence has the full column and reads as what it is: a note about the
                 * control above, not a caption trying to share its row.
                 *
                 * The video half only appears for an account that may upload one — telling
                 * everyone else about a premium format they cannot use is noise.
                 */}
                <p className="type-caption-meta text-(--text-subtitle)">
                    {t('profile_avatar_hint')}
                    {isPremium ? ` ${t('profile_avatar_hint_video')}` : ''}
                </p>
            </div>

            <ImageCropDialog
                open={crop !== null}
                onOpenChange={open => {
                    if (!open) setCrop(null)
                }}
                src={crop?.src ?? null}
                type={crop?.type ?? 'image/jpeg'}
                aspect={crop?.target === 'cover' ? COVER_ASPECT : AVATAR_ASPECT}
                // The avatar is cropped square and *displayed* round everywhere in this app, so
                // the cropper masks a circle — see the mask note in the dialog.
                shape={crop?.target === 'cover' ? 'rect' : 'round'}
                title={t(crop?.target === 'cover' ? 'profile_crop_cover' : 'profile_crop_avatar')}
                onCropped={blob => {
                    const url = track(URL.createObjectURL(blob))
                    if (crop?.target === 'cover') onCoverPicked(blob, url)
                    else onAvatarPicked(blob, url)
                }}
            />
        </div>
    )
}
