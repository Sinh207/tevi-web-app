'use client'

import { SPLASH_FADE_MS, Splash } from '@shared/components/splash'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The interactive half of `/dev/splash`.
 *
 * The real cover is driven by `useSplashState`, which means it is on screen for as long as the
 * session bootstrap takes and not one frame longer — so on a warm cache it is gone before you can
 * look at it, and there is no way to ask for it again short of clearing storage and reloading.
 * That is exactly the state this page exists to make holdable.
 *
 * `Splash` is rendered directly rather than through `SplashGate`: the gate's whole job is to take
 * it away.
 */
export function SplashPreview() {
    const [open, setOpen] = useState(true)
    const [leaving, setLeaving] = useState(false)

    function replay() {
        setLeaving(true)
        // The real hook unmounts on the same timer rather than on `animationend`; mirroring that
        // here is what makes this a preview of the app's behaviour and not of a `<div>`'s.
        setTimeout(() => {
            setLeaving(false)
            setOpen(true)
        }, SPLASH_FADE_MS)
    }

    return (
        <main className="flex min-h-[var(--window-height)] flex-col items-center justify-center gap-6 p-6">
            <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="type-title-t1-bold text-(--text-title)">Splash</h1>
                <p className="type-body-default max-w-[420px] text-(--text-body)">
                    Held up until the session bootstraps — at least 600ms so it cannot blink, at
                    most 3s so a stalled bootstrap cannot keep it — then a {SPLASH_FADE_MS}ms fade.
                    Content renders underneath the whole time: this text is what the cover is
                    covering.
                </p>
            </div>

            {/* Above the cover, which is the whole reason this bar is `fixed` with a z-index of
                its own: the splash is `z-[100] inset-0` and blocks pointer events by design, so
                controls laid out in the flow underneath it are unreachable — the first version
                of this page could raise the splash and then never lower it again. Nothing here
                mirrors production; the real cover has no controls. */}
            <div className="fixed inset-x-0 bottom-8 z-[110] flex flex-wrap items-center justify-center gap-3">
                <Button variant="secondary" size="medium" onClick={() => setOpen(o => !o)}>
                    {open ? 'Hide' : 'Show'}
                </Button>
                <Button variant="primary" size="medium" onClick={replay} disabled={!open}>
                    Play fade-out
                </Button>
            </div>

            {open && <Splash leaving={leaving} />}
        </main>
    )
}
