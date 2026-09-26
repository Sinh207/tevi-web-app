'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import { useId, useLayoutEffect, useRef } from 'react'
import type { PostDraft } from '../lib/post-draft'
import type { ReplyComposerAuthor } from '../lib/reply-author'

/**
 * The composing half of the post dialog — who is posting, the words, and the media.
 *
 * ## The leading column is legacy's, and it is not decoration
 *
 * A 36px avatar, a 2px rule running the height of the form, and a vertical ellipsis at the foot.
 * Legacy draws exactly that (`post-form-avatar-stack`), and it reads as the start of a thread: the
 * rule and the dots say *this continues*, which is what a composer that can also quote and thread
 * is telling you. Ported rather than simplified away — it is the strongest visual cue that this is
 * Tevi's composer and not a generic one.
 *
 * ## One upload button for both kinds
 *
 * Legacy's `BtnUpload` accepts images **and** video on a single control and sorts by type. Two
 * buttons was this file's first pass, and it is a different product decision: it makes the reader
 * choose a kind before choosing a file, which the picker then asks again.
 */
export function PostComposerBody({
    draft,
    author,
    limitReached,
    disabled,
    readingVideo,
    onText,
    onPickFiles,
    onRemoveImage,
    onRemoveVideo,
    message,
    testId,
}: {
    draft: PostDraft
    author: ReplyComposerAuthor | null
    characterLimit: number
    /** No more pictures may be added — the button is still drawn, and says why by being off. */
    limitReached: boolean
    disabled: boolean
    readingVideo: boolean
    onText: (text: string) => void
    onPickFiles: (files: FileList | null) => void
    onRemoveImage: (id: string) => void
    onRemoveVideo: () => void
    message: string | null
    testId?: string
}) {
    const { t } = useTranslation()
    const inputId = useId()
    const fileRef = useRef<HTMLInputElement>(null)
    const textRef = useRef<HTMLTextAreaElement>(null)

    /**
     * Size the box to its content, between one line and the five the class caps it at.
     *
     * Keyed on the **committed** text rather than done in `onChange`, which is what `ReplyComposer`
     * does. The two differ here and the difference is visible: this composer's `onText` slices to
     * the character limit, so a paste over the limit would size the box for the words that were
     * refused. Reading state after the fact cannot disagree with what is on screen.
     *
     * `useLayoutEffect` so the height lands in the same frame as the character — in an effect the
     * box paints at its old size first, which at the moment a line wraps is a visible jump.
     */
    useLayoutEffect(() => {
        const element = textRef.current
        if (!element) return
        /*
         * `auto` first, or `scrollHeight` is measured against the height already set and the box can
         * only ever get taller — deleting a line would leave the space it occupied behind.
         */
        element.style.height = 'auto'
        /*
         * Empty clears the inline height rather than setting a measured one, so the box falls back
         * to the single row the markup asks for — the same `shrink` `ReplyComposer` does. Measuring
         * an empty textarea works too, but it pins a pixel figure that stops tracking the font.
         */
        element.style.height = draft.text ? `${element.scrollHeight}px` : ''
    }, [draft.text])

    return (
        <div className="flex min-w-0 gap-2">
            {/* The leading column: avatar, rule, dots. See the note above. */}
            <div className="flex w-9 flex-none flex-col items-center gap-1">
                <AnimatedAvatar
                    size="small"
                    thumb={author?.thumb ?? null}
                    avatarVideo={author?.avatarVideo ?? null}
                    isPremium={author?.isPremium ?? false}
                    alt=""
                    initials={
                        author?.name?.trim()
                            ? author.name.trim().slice(0, 2).toUpperCase()
                            : undefined
                    }
                    className="flex-none"
                />
                <span
                    aria-hidden="true"
                    className="w-0.5 flex-1 rounded-full bg-(--separator-default)"
                    style={{ minHeight: 12 }}
                />
                <Icon
                    name="more-vertical"
                    size={20}
                    aria-hidden
                    className="flex-none text-(--icon-disabled)"
                />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/*
                 * The identity line, always drawn — legacy's is not conditional, because a composer
                 * that can post as one of several accounts should say which one before the words go
                 * in. (The reply box hides it until the box is in use; that one sits under a post
                 * whose author is already on screen.)
                 */}
                {author ? (
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="type-dense-emphasis max-w-[200px] truncate text-(--text-title)">
                            {author.name}
                        </span>
                        <VerifiedBadge image={author.verifiedBadge} size={16} />
                        {author.isPremium ? <PremiumBadge size={18} className="flex-none" /> : null}
                        {author.slug ? (
                            <span className="type-dense-default truncate text-(--text-placeholder)">
                                {`@${author.slug}`}
                            </span>
                        ) : null}
                    </span>
                ) : null}

                <label className="sr-only" htmlFor={inputId}>
                    {t('post_create_placeholder')}
                </label>
                <textarea
                    ref={textRef}
                    id={inputId}
                    data-testid={subTestId(testId, 'input')}
                    value={draft.text}
                    /*
                     * **One row when empty**, and it grows from there. This was `rows={3}` plus a
                     * `min-h-20`, which reserved four lines of blank box under the placeholder on
                     * every open — a composer that looks half-filled before a word is in it.
                     */
                    rows={1}
                    placeholder={t('post_create_placeholder')}
                    aria-invalid={message ? true : undefined}
                    disabled={disabled}
                    onChange={event => onText(event.target.value)}
                    /*
                     * The cap is **five lines**, written as the arithmetic rather than as `max-h-30`:
                     * the two factors are the type scale's own, so a change to either moves the cap
                     * with it instead of silently turning five lines into four. Past the cap the box
                     * scrolls — the media previews and the upload button below it must stay on
                     * screen, which is what a box free to grow takes away. (Legacy's `maxRows` is 8;
                     * five is this product's call.)
                     */
                    className="type-body-default max-h-[calc(5*var(--line-height-default)*1em)] w-full resize-none overflow-y-auto bg-transparent text-(--text-title) outline-none placeholder:text-(--text-placeholder) disabled:opacity-60"
                />

                {draft.video ? (
                    <div
                        data-testid={subTestId(testId, 'slide')}
                        className="relative overflow-hidden rounded-[8px] bg-(--background-segment)"
                    >
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
                            disabled={disabled}
                            onClick={onRemoveVideo}
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
                                    disabled={disabled}
                                    onClick={() => onRemoveImage(image.id)}
                                    className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-(--background-overlay) text-(--text-on)"
                                >
                                    <Icon name="xmark" size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}

                {/*
                 * The upload control sits **under the input**, inside the body — legacy's
                 * `MediaUpload`, not its action bar. One button, both kinds, sorted by the file's
                 * own type.
                 */}
                <div className="flex items-center gap-2">
                    <input
                        ref={fileRef}
                        type="file"
                        accept={UPLOAD_ACCEPT}
                        multiple
                        hidden
                        data-testid={subTestId(testId, 'field')}
                        onChange={event => {
                            onPickFiles(event.target.files)
                            // Cleared, so picking the same file twice still fires `change`.
                            event.target.value = ''
                        }}
                    />
                    <button
                        type="button"
                        data-testid={subTestId(testId, 'trigger')}
                        aria-label={t('post_create_add_media')}
                        aria-busy={readingVideo || undefined}
                        disabled={disabled || readingVideo || limitReached}
                        onClick={() => fileRef.current?.click()}
                        /*
                         * Black, not blue. The `IconButton` around it is `#007AFF`, but that colour
                         * never reaches the glyph — legacy renders an `<img>`, and the asset's own
                         * paths are `#141414`. The button's colour only tints its ripple.
                         */
                        className="flex size-9 flex-none items-center justify-center rounded-full text-(--icon-default) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                    >
                        {/*
                         * `images`, not `image`. Legacy's `upload-media.svg` is **two stacked
                         * frames** — rendered from the real asset to identify it — which is what
                         * says "photos or a video" rather than "a photo". The single frame was the
                         * first guess.
                         */}
                        <Icon name="images" size={24} />
                    </button>
                    {readingVideo ? (
                        <span className="type-caption-meta text-(--text-placeholder)">
                            {t('post_create_reading_video')}
                        </span>
                    ) : null}
                </div>

                {message ? (
                    <p
                        data-testid={subTestId(testId, 'error')}
                        className="type-dense-default text-(--text-error)"
                    >
                        {message}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

/**
 * What the one picker accepts.
 *
 * Legacy's own list, minus the three containers its `accept` names but its validator then rejects
 * (`video/x-msvideo`, `video/x-ms-wmv`, and `video/mov`, which is not a media type at all — the
 * QuickTime one is `video/quicktime`). Offering a file the next step refuses is a picker that lies.
 */
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm'

/** `m:ss`, the badge legacy draws on a clip. */
function formatClipLength(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(whole / 60)
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}
