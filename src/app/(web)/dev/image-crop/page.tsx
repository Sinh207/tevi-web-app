'use client'

import { ImageCropDialog } from '@features/channel'
import { Button } from '@shared/ui/button'
import { notFound } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Dev-only preview of the image cropper: `pnpm dev`, then `/dev/image-crop`. 404s in production.
 *
 * ## Why it exists
 *
 * The cropper is otherwise reachable only by signing in, owning a space, opening
 * `/settings/custom-profile` and picking a file — four steps, the first two of which a reviewer
 * on a fresh machine cannot do at all. That is how its first version shipped with the frame
 * measured in a `useLayoutEffect(…, [])`, which never ran because the frame lives inside the
 * dialog's portal: `viewport` stayed `{0, 0}` and every open showed an empty grey box.
 *
 * So this page mounts it with a generated picture and shows what comes back out — the size, the
 * dimensions, and the crop itself in both the shapes the form uses. Same convention, and the same
 * reason, as `/dev/blocked-accounts` and `/dev/space-visibility`.
 *
 * Worth exercising here: drag, wheel, pinch (a trackpad's two-finger pinch arrives as a wheel
 * event with `ctrlKey`, a touchscreen's as two pointers), the ± buttons, the slider, arrow keys
 * after tabbing into the frame, `+` / `-`, and Reset. Then check the *output* matches what the
 * frame showed — that is the assertion no unit test can make.
 */
export default function ImageCropDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const [src, setSrc] = useState<string | null>(null)
    const [type, setType] = useState('image/jpeg')
    const [shape, setShape] = useState<'rect' | 'round'>('round')
    const [aspect, setAspect] = useState(1)
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState<{ url: string; size: number; blob: Blob } | null>(null)

    /** Every object URL this page has made, so a long session does not pin twenty bitmaps. */
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

    /**
     * A deliberately awkward test picture: 2400×1000 (wider than any frame here), with a marked
     * centre and numbered corners.
     *
     * The corners are the point. A cropper that mirrors its offset, or reads the source rectangle
     * from the wrong side, produces a perfectly plausible crop of a photograph — and an obviously
     * wrong one of a picture whose corners are labelled.
     */
    const generate = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 2400
        canvas.height = 1000
        const context = canvas.getContext('2d')
        if (!context) return

        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
        gradient.addColorStop(0, '#3E2EFF')
        gradient.addColorStop(1, '#FF7A1A')
        context.fillStyle = gradient
        context.fillRect(0, 0, canvas.width, canvas.height)

        context.strokeStyle = 'rgba(255,255,255,0.35)'
        context.lineWidth = 2
        for (let x = 0; x <= canvas.width; x += 100) {
            context.beginPath()
            context.moveTo(x, 0)
            context.lineTo(x, canvas.height)
            context.stroke()
        }
        for (let y = 0; y <= canvas.height; y += 100) {
            context.beginPath()
            context.moveTo(0, y)
            context.lineTo(canvas.width, y)
            context.stroke()
        }

        context.fillStyle = '#ffffff'
        context.font = 'bold 72px sans-serif'
        context.textBaseline = 'top'
        context.fillText('TOP LEFT', 40, 30)
        context.textAlign = 'right'
        context.fillText('TOP RIGHT', canvas.width - 40, 30)
        context.textBaseline = 'bottom'
        context.fillText('BOTTOM RIGHT', canvas.width - 40, canvas.height - 30)
        context.textAlign = 'left'
        context.fillText('BOTTOM LEFT', 40, canvas.height - 30)

        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = 'bold 96px sans-serif'
        context.fillText('CENTRE', canvas.width / 2, canvas.height / 2)
        context.beginPath()
        context.arc(canvas.width / 2, canvas.height / 2, 180, 0, Math.PI * 2)
        context.lineWidth = 8
        context.strokeStyle = '#ffffff'
        context.stroke()

        canvas.toBlob(
            blob => {
                if (!blob) return
                setType(blob.type)
                setSrc(track(URL.createObjectURL(blob)))
                setOpen(true)
            },
            'image/jpeg',
            0.9,
        )
    }

    return (
        <main className="flex flex-col gap-8 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Image cropper</h1>
                <p className="type-dense-default text-(--text-body)">
                    The dialog behind the avatar and cover pickers on{' '}
                    <code className="type-dense-emphasis">/settings/custom-profile</code>. Pick a
                    shape, then either generate a labelled test image or open one of your own.
                </p>
            </header>

            <section className="flex max-w-[612px] flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={shape === 'round' ? 'primary' : 'secondary'}
                        size="medium"
                        onClick={() => {
                            setShape('round')
                            setAspect(1)
                        }}
                    >
                        Avatar — 1:1, round mask
                    </Button>
                    <Button
                        variant={shape === 'rect' ? 'primary' : 'secondary'}
                        size="medium"
                        onClick={() => {
                            setShape('rect')
                            setAspect(16 / 9)
                        }}
                    >
                        Cover — 16:9
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="medium" onClick={generate}>
                        Generate test image (2400×1000)
                    </Button>
                    <label className="type-dense-default flex cursor-pointer items-center gap-2 text-(--text-body)">
                        <span>or open a file</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="type-caption-meta"
                            onChange={event => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                setType(file.type)
                                setSrc(track(URL.createObjectURL(file)))
                                setOpen(true)
                            }}
                        />
                    </label>
                    {src && (
                        <Button variant="ghost" size="medium" onClick={() => setOpen(true)}>
                            Reopen
                        </Button>
                    )}
                </div>
            </section>

            {result && (
                <section className="flex max-w-[612px] flex-col gap-3">
                    <h2 className="type-subheading-strong text-(--text-title)">Output</h2>
                    <p className="type-caption-meta text-(--text-body)">
                        {Math.round(result.size / 1024)} KB · {result.blob.type} — and the same blob
                        rendered as both an avatar and a cover, which is where a crop that does not
                        match the frame becomes obvious.
                    </p>
                    <div className="flex flex-wrap items-start gap-6">
                        {/* biome-ignore lint/performance/noImgElement: blob: source */}
                        <img
                            src={result.url}
                            alt="Cropped output, circular"
                            className="size-[120px] rounded-full object-cover"
                        />
                        {/* biome-ignore lint/performance/noImgElement: blob: source */}
                        <img
                            src={result.url}
                            alt="Cropped output, full"
                            className="max-w-[360px] rounded-lg border border-(--separator-default)"
                        />
                    </div>
                </section>
            )}

            <ImageCropDialog
                open={open}
                onOpenChange={setOpen}
                src={src}
                type={type}
                aspect={aspect}
                shape={shape}
                title={shape === 'round' ? 'Crop profile photo' : 'Crop cover photo'}
                onCropped={blob =>
                    setResult({ url: track(URL.createObjectURL(blob)), size: blob.size, blob })
                }
            />
        </main>
    )
}
