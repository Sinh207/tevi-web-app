'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Loader } from '@shared/ui/loader'
import { useEnterTransition } from '../hooks/use-enter-transition'
import type { MiniAppConfig } from '../lib/app-config'
import { MiniAppMark } from './mini-app-mark'

/**
 * What fills the frame while a mini app is starting: **its own mark and its own name**, with the
 * design system's loader under them.
 *
 * ## Why not just the loader
 *
 * It was three dots in the middle of a black rectangle. A mini app is a *third-party application* on
 * a *third-party host*, so the wait is not the usual sub-second one this app's own screens have — it
 * is a cold DNS lookup, a bundle, and whatever the app does before it paints. Several seconds of
 * unattributed dots is the reader wondering whether the press registered.
 *
 * Naming what is opening answers that, and it is the same thing every native launcher does. It also
 * carries a second, quieter piece of information the tab strip cannot at this moment: **which** of
 * five tabs is the one that is still coming up.
 *
 * ## The fade is what stops a fast app from flashing
 *
 * A cached app can load in under 100ms, and a splash that appears and disappears inside that window
 * reads as a flicker rather than as feedback. So the whole thing fades in over 200ms
 * (`useEnterTransition`) — an app that beats the fade is gone before the splash is fully drawn, and
 * one that does not gets a splash that arrived rather than blinked.
 *
 * The **surface underneath does not fade in**, deliberately: it is opaque from the first frame, so a
 * frame that paints its own half-built layout mid-load is never visible through it. On the way
 * *out* it does fade — by then the app is behind it, so the splash dissolves into the thing it was
 * standing in for instead of being cut away.
 *
 * Under `prefers-reduced-motion` the fade is dropped and the splash simply appears; `Loader` already
 * holds a single frame instead of walking, so the whole state goes still.
 */
export function MiniAppSplash({
    config,
    leaving = false,
}: {
    config: MiniAppConfig
    /**
     * The app has painted and this is on its way out. Kept mounted for the length of the fade by
     * `MiniAppFrame`, which owns the timer — a splash cannot unmount itself and animate while doing
     * it.
     */
    leaving?: boolean
}) {
    const { t } = useTranslation()
    const { entered, reducedMotion } = useEnterTransition()
    const shown = entered && !leaving

    return (
        <div
            /*
             * `role="status"` on the region rather than a label on the `Loader`: the app's name is
             * the useful announcement ("Lucky Fruit, loading"), and a status region announces its
             * contents once when they appear. The loader inside is then decorative, which is what
             * `Loader` treats an unlabelled instance as.
             */
            role="status"
            /*
             * The **surface** fades too, and only on the way out. Fading it in would show the frame's
             * half-built first paint through it; fading it out is the point — the app is already
             * behind it, so the splash dissolves into the thing it was standing in for rather than
             * being cut away. `pointer-events-none` while leaving, so the last frames of the fade
             * cannot swallow a tap meant for the app.
             */
            className={cn(
                'absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-(--background-listing)',
                !reducedMotion && 'transition-opacity duration-200 ease-out',
                leaving && 'pointer-events-none opacity-0',
            )}
        >
            <div
                className={cn(
                    'flex flex-col items-center gap-3',
                    !reducedMotion && 'transition-[opacity,scale] duration-200 ease-out',
                    shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
                )}
            >
                <MiniAppMark
                    config={config}
                    px={64}
                    glyph={32}
                    /*
                     * `rounded-2xl` (24) at 64px is the platform proportion for an app icon, and the
                     * inside stroke keeps a white-plated mark from floating on a white surface — the
                     * same 1px inset ring `Card` and `GetStarHeader` use rather than a border, so it
                     * cannot add to the box.
                     */
                    className="rounded-2xl shadow-[inset_0_0_0_1px_var(--separator-default)]"
                />
                <p className="type-subheading-strong m-0 max-w-[240px] truncate px-4 text-center text-(--text-title)">
                    {config.name}
                </p>
            </div>
            <Loader />
            {/* The sentence a screen reader gets; the name above is what a sighted reader reads. */}
            <span className="sr-only">{t('miniapp_loading')}</span>
        </div>
    )
}
