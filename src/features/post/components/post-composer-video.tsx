'use client'

import { formatClock } from '@shared/components/video-trimmer'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import { useRef, useState } from 'react'
import type { PostDraft } from '../lib/post-draft'

/**
 * The attached clip, with the three controls legacy puts on it — and the cover, when it applies.
 *
 * ## The overlay is legacy's `videoUpload`
 *
 * A remove disc at the top trailing corner, and along the bottom: the clip's length, *Edit video*,
 * and a mute toggle on the far side. Every one of those sits **on** the video rather than under it,
 * because the composer's vertical space is already spoken for by the caption above and the action
 * bar below.
 *
 * Legacy hides *Edit video* below `md` (`if (!matchUpMd) return null`) — a trimmer dragged with a
 * thumb on a 64px strip is a fair thing to withhold. That is kept: the button is `hidden md:flex`,
 * and a phone can still attach, preview and remove.
 *
 * One plain `<video>`, not legacy's video.js. The source is a local `blob:` the browser has already
 * measured — there is no HLS manifest to negotiate until the clip has been through the backend's
 * transcode, and by then it is not in a composer any more. video.js here would be 180 KB to play a
 * file the element plays on its own.
 *
 * ## The cover is a **paid video post's** teaser, and only that
 *
 * `Add cover` appears exactly when `buildPostBody` would send `cover_image`: a video, and an
 * audience of `STARGAZERS`. It is the picture a non-buyer sees in place of the clip, so on a free
 * post there is nothing for it to stand in front of — legacy gates it on the same pair
 * (`isCoverVideo`) and swaps it with the upload button rather than showing both.
 */
export function PostComposerVideo({
    draft,
    disabled,
    onRemoveVideo,
    onEdit,
    onPickCover,
    onRemoveCover,
    testId,
}: {
    draft: PostDraft
    disabled: boolean
    onRemoveVideo: () => void
    /** Open the trimmer. Absent below `md` is handled here, not by the caller. */
    onEdit: () => void
    onPickCover: (file: File | null) => void
    onRemoveCover: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const coverRef = useRef<HTMLInputElement>(null)
    const [muted, setMuted] = useState(true)

    const video = draft.video
    if (!video) return null

    /** Legacy's own gate, and the same one the body builder applies before sending `cover_image`. */
    const wantsCover = draft.audience === 'STARGAZERS'
    const cover = draft.coverImage

    return (
        <div className="flex flex-col gap-2">
            <div
                data-testid={subTestId(testId, 'slide')}
                className="relative w-full overflow-hidden rounded-[12px] bg-black"
                style={{ aspectRatio: video.width >= video.height ? '16 / 9' : '3 / 4' }}
            >
                <video
                    src={video.previewUrl}
                    autoPlay
                    loop
                    muted={muted}
                    playsInline
                    preload="metadata"
                    className="size-full object-contain"
                />

                <button
                    type="button"
                    data-testid={subTestId(testId, 'clear')}
                    aria-label={t('post_create_remove_video')}
                    disabled={disabled}
                    onClick={onRemoveVideo}
                    className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                    <Icon name="xmark" size={16} />
                </button>

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-2">
                    <div className="flex min-w-0 items-center gap-1">
                        <span className="type-caption-meta flex h-6 items-center rounded-full bg-black/70 px-2 text-white">
                            {formatClock(video.durationSeconds)}
                        </span>
                        {/*
                         * `pen-line`, because the set draws no scissors. *Edit video* is legacy's
                         * own label — wider than "Trim" and right to be: the dialog is where the
                         * clip is worked on, and cutting is what it does today rather than all it
                         * could ever do.
                         */}
                        <button
                            type="button"
                            data-testid={subTestId(testId, 'apply')}
                            disabled={disabled}
                            onClick={onEdit}
                            className="type-caption-meta hidden h-6 items-center gap-1 rounded-full bg-black/70 px-2 text-white transition-colors hover:bg-black/85 disabled:opacity-40 md:flex"
                        >
                            {/* 16, not legacy's 12: the sprite is typed to the DS's six sizes. */}
                            <Icon name="pen-line" size={16} className="flex-none" />
                            {t('post_create_edit_video')}
                        </button>
                    </div>

                    <button
                        type="button"
                        data-testid={subTestId(testId, 'reveal')}
                        aria-label={t(muted ? 'video_trim_unmute' : 'video_trim_mute')}
                        aria-pressed={muted}
                        onClick={() => setMuted(current => !current)}
                        className="flex size-7 flex-none items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/85"
                    >
                        <Icon name={muted ? 'volume-off-slash' : 'volume'} size={16} />
                    </button>
                </div>
            </div>

            {wantsCover ? (
                <div className="flex items-center gap-2">
                    <input
                        ref={coverRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        data-testid={subTestId(testId, 'field')}
                        onChange={event => {
                            onPickCover(event.target.files?.[0] ?? null)
                            // Cleared, so picking the same file twice still fires `change`.
                            event.target.value = ''
                        }}
                    />

                    {cover ? (
                        <>
                            {/* biome-ignore lint/performance/noImgElement: a blob: URL has nothing for next/image to optimise and no loader that accepts it. */}
                            <img
                                src={cover.previewUrl}
                                alt=""
                                data-testid={subTestId(testId, 'item')}
                                className="h-10 w-16 flex-none rounded-[6px] object-cover"
                            />
                            <CoverChip
                                label={t('post_create_change_cover')}
                                disabled={disabled}
                                onPress={() => coverRef.current?.click()}
                                testId={subTestId(testId, 'trigger')}
                            />
                            <button
                                type="button"
                                data-testid={subTestId(testId, 'remove')}
                                aria-label={t('post_create_remove_cover')}
                                disabled={disabled}
                                onClick={onRemoveCover}
                                className="flex size-8 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                            >
                                <Icon name="xmark" size={16} />
                            </button>
                        </>
                    ) : (
                        <CoverChip
                            label={t('post_create_add_cover')}
                            disabled={disabled}
                            onPress={() => coverRef.current?.click()}
                            testId={subTestId(testId, 'trigger')}
                        />
                    )}
                </div>
            ) : null}
        </div>
    )
}

/** Legacy's cover control: a 32px grey pill with the picture glyph, sitting under the clip. */
function CoverChip({
    label,
    disabled,
    onPress,
    testId,
}: {
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
            className="type-caption-meta flex h-8 items-center gap-1 rounded-full bg-(--background-segment) px-3 text-(--text-title) transition-colors hover:opacity-80 disabled:opacity-40"
        >
            <Icon name="image" size={16} className="flex-none" />
            {label}
        </button>
    )
}
