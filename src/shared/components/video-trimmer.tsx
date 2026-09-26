'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { trimVideo } from '@shared/lib/ffmpeg'
import { subTestId } from '@shared/lib/test-id'
import {
    clampRange,
    fullRange,
    isTrimmed,
    moveEnd,
    moveStart,
    rangeDuration,
    rangeStyle,
    secondsAt,
    type TrimRange,
} from '@shared/lib/trim-range'
import { cn } from '@shared/lib/utils'
import { captureVideoFrames, revokeFrames } from '@shared/lib/video-frames'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DialogScreenHeader } from './dialog-screen-header'

/**
 * Cut a clip down to a range — legacy's `components/videoTrimmer`, ported.
 *
 * ## It lives in `shared/` because two features need it
 *
 * The post composer trims an attachment; the space's **custom profile** trims an avatar video, and
 * legacy imports the same component from both (`postForm/components/media` and
 * `channel/.../customProfile`). `features/post` may not import `features/channel` or the other way
 * round, so a trimmer owned by either is a trimmer the other cannot have. Here it depends on no
 * feature and both can reach it.
 *
 * Which also sets the shape of the props: it takes **a blob and a duration**, not a draft, not a
 * post, not an avatar. Everything it knows about the clip is in `VideoTrimmerSource`, and what it
 * answers with is a file — the caller decides what that file then becomes.
 *
 * ## The strip is drawn by the browser; ffmpeg only runs on Save
 *
 * Two different mechanisms, and keeping them apart is what makes the dialog feel instant. The
 * filmstrip is twelve `<canvas>` grabs (`shared/lib/video-frames.ts`) and appears in well under a
 * second. The core is 24 MB and is fetched **only when the reader presses Save** — which is also
 * the first moment they have committed to anything. A trimmer that loaded ffmpeg on open would sit
 * blank for seconds to show a strip it never needed it for.
 *
 * ## The preview loops the selection, and there is no play/pause
 *
 * Legacy draws one. This does not, and the reason is worth stating rather than discovering: the
 * question a trimmer answers is *is this the right cut*, so the useful behaviour is for the
 * selection — and only the selection — to play over and over while the handles move. A pause button
 * on top of that is a control whose only effect is to stop showing you the thing you came to look
 * at. (It is also the one place the icon set would have forced a new glyph: there is no `pause`.)
 *
 * Sound is off to begin with, as every autoplaying video in this app is, and `volume` /
 * `volume-off-slash` toggle it.
 */

export interface VideoTrimmerSource {
    /** The bytes to cut. */
    file: File | Blob
    /** A `blob:` (or any playable) URL for the same bytes — the caller owns and revokes it. */
    previewUrl: string
    /** Measured length. The trimmer cannot work without it and the caller always has it. */
    durationSeconds: number
    width?: number | null
    height?: number | null
}

export interface TrimmedVideo {
    /** The cut clip. Named `trimmed.mp4`; a stream copy, so the source codec is unchanged. */
    file: File
    /** How long the result is, to the tenth — the caller re-measures before trusting it. */
    durationSeconds: number
    /** Where the cut started, for a caller that wants to say so. */
    startSeconds: number
}

export function VideoTrimmer({
    open,
    source,
    onCancel,
    onTrimmed,
    testId,
}: {
    open: boolean
    /** `null` closes the dialog — a trimmer with nothing to trim draws nothing. */
    source: VideoTrimmerSource | null
    onCancel: () => void
    /** The cut clip. The trimmer closes itself after this resolves. */
    onTrimmed: (result: TrimmedVideo) => void
    /**
     * The scope, **from the caller**. `shared/` never authors one (`scripts/check-testids.mjs`
     * rejects a literal here), and this component is reached from two different features — so a
     * default baked in would also be a name neither of them chose.
     */
    testId?: string
}) {
    const { t } = useTranslation()
    const duration = source?.durationSeconds ?? 0

    const videoRef = useRef<HTMLVideoElement>(null)
    const stripRef = useRef<HTMLDivElement>(null)

    const [range, setRange] = useState<TrimRange>(() => fullRange(duration))
    const [frames, setFrames] = useState<string[]>([])
    const [muted, setMuted] = useState(true)
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState(false)

    /*
     * Opening on a different clip is a different trim. Keyed on the preview URL rather than on
     * `source`, which is a fresh object on every render of the caller and would reset the handles
     * under the reader's finger.
     */
    const previewUrl = source?.previewUrl ?? null
    useEffect(() => {
        if (!open || !previewUrl) return
        setRange(fullRange(duration))
        setFailed(false)
    }, [open, previewUrl, duration])

    /** The filmstrip. Aborted on close, and its object URLs released with it. */
    useEffect(() => {
        if (!open || !previewUrl || !(duration > 0)) return
        const controller = new AbortController()
        let made: string[] = []

        void captureVideoFrames(previewUrl, {
            durationSeconds: duration,
            signal: controller.signal,
        })
            .then(strip => {
                made = strip.urls
                if (!controller.signal.aborted) setFrames(strip.urls)
            })
            .catch(() => {
                // `captureVideoFrames` does not reject; this is belt and braces.
            })

        return () => {
            controller.abort()
            revokeFrames(made)
            setFrames([])
        }
    }, [open, previewUrl, duration])

    /**
     * Keep the playhead inside the selection, looping it.
     *
     * `timeupdate` rather than a timer: it fires from the media clock, so it stays honest while the
     * tab is throttled and while the reader is dragging. The seek back to `start` is guarded on
     * being outside the range, or every event would reset a clip that is playing correctly.
     */
    useEffect(() => {
        const video = videoRef.current
        if (!video || !open) return

        const onTime = () => {
            if (video.currentTime >= range.end || video.currentTime < range.start - 0.2) {
                video.currentTime = range.start
                void video.play().catch(() => {
                    // Autoplay refused; the reader can still scrub.
                })
            }
        }
        video.addEventListener('timeupdate', onTime)
        return () => video.removeEventListener('timeupdate', onTime)
    }, [open, range.start, range.end])

    /**
     * Drag a handle.
     *
     * Pointer events captured on the **handle**, so the drag survives the pointer leaving the strip
     * — which it does constantly, because the strip is 64px tall and a drag is a horizontal gesture
     * people make with their whole hand. Mouse-move on the window would work too and would also
     * catch every other pointer on the page.
     */
    const startDrag = useCallback(
        (which: 'start' | 'end') => (event: React.PointerEvent<HTMLButtonElement>) => {
            const strip = stripRef.current
            if (!strip) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)

            const move = (moveEvent: PointerEvent) => {
                const box = strip.getBoundingClientRect()
                const at = secondsAt(
                    moveEvent.clientX,
                    { left: box.left, width: box.width },
                    duration,
                )
                setRange(current =>
                    which === 'start'
                        ? moveStart(current, at, duration)
                        : moveEnd(current, at, duration),
                )
                /*
                 * Scrub the preview to the handle being dragged, which is the whole point of
                 * dragging it — the reader is looking for a frame, not for a number.
                 */
                const video = videoRef.current
                if (video) video.currentTime = at
            }

            const stop = () => {
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', stop)
                window.removeEventListener('pointercancel', stop)
            }

            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', stop)
            window.addEventListener('pointercancel', stop)
        },
        [duration],
    )

    /** Keyboard, because a handle that only responds to a pointer is a control half the readers cannot use. */
    const nudge = useCallback(
        (which: 'start' | 'end', delta: number) => {
            setRange(current =>
                which === 'start'
                    ? moveStart(current, current.start + delta, duration)
                    : moveEnd(current, current.end + delta, duration),
            )
        },
        [duration],
    )

    async function save() {
        if (!source || busy) return
        setBusy(true)
        setFailed(false)
        const safe = clampRange(range, duration)
        const length = rangeDuration(safe)
        try {
            const file = await trimVideo({
                file: source.file,
                startSeconds: safe.start,
                durationSeconds: length,
            })
            onTrimmed({ file, durationSeconds: length, startSeconds: safe.start })
        } catch {
            /*
             * One message, and deliberately not the error's own. What comes out of a wasm build is
             * `Error: FS error` or an exit code — text written for whoever ported ffmpeg, not for
             * somebody who wanted a shorter clip.
             */
            setFailed(true)
        } finally {
            setBusy(false)
        }
    }

    const style = rangeStyle(range, duration)
    const canSave = isTrimmed(range, duration) && !busy

    return (
        <Dialog
            open={open && source !== null}
            onOpenChange={next => {
                if (!next && !busy) onCancel()
            }}
        >
            <DialogContent
                className="flex max-h-[90dvh] w-full max-w-[512px] flex-col gap-0 overflow-hidden p-0"
                data-testid={testId}
            >
                <DialogScreenHeader
                    title={t('video_trim_title')}
                    onClose={onCancel}
                    disabled={busy}
                    testId={subTestId(testId, 'header')}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                    <div
                        className="relative w-full overflow-hidden rounded-[12px] bg-black"
                        style={{ aspectRatio: previewAspect(source) }}
                    >
                        {previewUrl ? (
                            <video
                                ref={videoRef}
                                src={previewUrl}
                                autoPlay
                                loop
                                muted={muted}
                                playsInline
                                preload="metadata"
                                data-testid={subTestId(testId, 'slide')}
                                className="size-full object-contain"
                            />
                        ) : null}

                        <button
                            type="button"
                            aria-label={t(muted ? 'video_trim_unmute' : 'video_trim_mute')}
                            aria-pressed={muted}
                            onClick={() => setMuted(current => !current)}
                            data-testid={subTestId(testId, 'reveal')}
                            /* Fixed black: it sits on the reader's own footage, not on the page. */
                            className="absolute end-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                        >
                            <Icon name={muted ? 'volume-off-slash' : 'volume'} size={16} />
                        </button>
                    </div>

                    {/*
                     * The strip. `touch-none` because a horizontal drag on a 64px band is exactly
                     * what a browser reads as a page scroll, and it steals the gesture before the
                     * pointer handlers see it.
                     */}
                    <div
                        ref={stripRef}
                        data-testid={subTestId(testId, 'list')}
                        /*
                         * ⚠ **Not `overflow-hidden`**, and the frames get their own clipping box
                         * instead. A handle is `-translate-x-1/2`, so at 0% and at 100% half of it
                         * sits outside this element — clipped here, the *start* handle was a 8px
                         * sliver against the left edge and looked like a rendering fault rather
                         * than a control. Found in a screenshot; nothing about it is a type error.
                         */
                        className="relative h-16 w-full touch-none rounded-[8px] bg-(--background-segment) select-none"
                    >
                        <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-[8px]">
                            {frames.map(url => (
                                /* biome-ignore lint/performance/noImgElement: a `blob:` frame has nothing for next/image to optimise and no loader that accepts it. */
                                <img
                                    key={url}
                                    src={url}
                                    alt=""
                                    className="h-full min-w-0 flex-1 object-cover"
                                />
                            ))}
                        </div>

                        {/* Everything outside the selection, dimmed — the band is what is kept. */}
                        {/* What the cut throws away, dimmed. Rounded to match the frames beneath. */}
                        <div
                            className="pointer-events-none absolute inset-y-0 start-0 rounded-s-[8px] bg-black/55"
                            style={{ width: style.left }}
                        />
                        <div
                            className="pointer-events-none absolute inset-y-0 end-0 rounded-e-[8px] bg-black/55"
                            style={{
                                width: `calc(100% - ${style.left} - ${style.width})`,
                            }}
                        />

                        <div
                            className="pointer-events-none absolute inset-y-0 border-(--primary-500) border-y-2"
                            style={{ left: style.left, width: style.width }}
                        />

                        <TrimHandle
                            side="start"
                            offset={style.left}
                            label={t('video_trim_handle_start')}
                            value={range.start}
                            max={duration}
                            disabled={busy}
                            onPointerDown={startDrag('start')}
                            onNudge={delta => nudge('start', delta)}
                            testId={subTestId(testId, 'prev')}
                        />
                        <TrimHandle
                            side="end"
                            offset={`calc(${style.left} + ${style.width})`}
                            label={t('video_trim_handle_end')}
                            value={range.end}
                            max={duration}
                            disabled={busy}
                            onPointerDown={startDrag('end')}
                            onNudge={delta => nudge('end', delta)}
                            testId={subTestId(testId, 'next')}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <span
                            data-testid={subTestId(testId, 'label-data')}
                            className="type-caption-meta text-(--text-subtitle)"
                        >
                            {t('video_trim_selected', {
                                length: formatClock(rangeDuration(range)),
                                total: formatClock(duration),
                            })}
                        </span>
                        <Button
                            variant="primary"
                            size="medium"
                            disabled={!canSave}
                            onClick={() => void save()}
                            data-testid={subTestId(testId, 'submit')}
                        >
                            {busy ? t('video_trim_working') : t('common_save')}
                        </Button>
                    </div>

                    {failed ? (
                        <p
                            data-testid={subTestId(testId, 'error')}
                            className="type-dense-default text-(--text-error)"
                        >
                            {t('video_trim_failed')}
                        </p>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * One handle — a real `slider`, not a div with a pointer listener.
 *
 * The ARIA role and the arrow keys are not decoration here: the strip is the only way to set the
 * range, so without them the whole dialog is pointer-only. `aria-valuetext` reads the clock rather
 * than the raw seconds, because "87" is not what anyone is choosing.
 */
function TrimHandle({
    side,
    offset,
    label,
    value,
    max,
    disabled,
    onPointerDown,
    onNudge,
    testId,
}: {
    side: 'start' | 'end'
    offset: string
    label: string
    value: number
    max: number
    disabled?: boolean
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
    onNudge: (delta: number) => void
    testId?: string
}) {
    return (
        <button
            type="button"
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(max)}
            aria-valuenow={Math.round(value)}
            aria-valuetext={formatClock(value)}
            disabled={disabled}
            data-testid={testId}
            onPointerDown={onPointerDown}
            onKeyDown={event => {
                // A second per press, ten with Shift — legacy offers no keyboard path at all.
                const step = event.shiftKey ? 10 : 1
                if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    onNudge(-step)
                } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    onNudge(step)
                }
            }}
            /*
             * `-translate-x-1/2` centres the grip on the edge it marks, and the RTL counterpart is
             * spelled out because `start`/`end` flip but a transform does not.
             */
            className={cn(
                'absolute inset-y-0 z-10 flex w-4 cursor-ew-resize items-center justify-center',
                'rounded-[4px] bg-(--primary-500) text-white outline-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                '-translate-x-1/2 rtl:translate-x-1/2',
                'disabled:cursor-not-allowed disabled:opacity-40',
            )}
            style={{ insetInlineStart: offset }}
        >
            <span
                aria-hidden="true"
                className="h-4 w-0.5 rounded-full bg-white/80"
                data-handle={side}
            />
        </button>
    )
}

/** `16/9` for landscape, `3/4` for portrait — legacy's two boxes, and it never uses the real ratio. */
function previewAspect(source: VideoTrimmerSource | null): string {
    const w = source?.width ?? 0
    const h = source?.height ?? 0
    return !w || !h || w >= h ? '16 / 9' : '3 / 4'
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatClock(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds))
    const hours = Math.floor(whole / 3600)
    const minutes = Math.floor((whole % 3600) / 60)
    const rest = whole % 60
    const pad = (value: number) => String(value).padStart(2, '0')
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}
