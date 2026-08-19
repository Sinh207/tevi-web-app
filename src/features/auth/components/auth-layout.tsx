'use client'

import { Logo } from '@shared/ui/logo'
import Image from 'next/image'

/**
 * The shell both auth screens sit in.
 *
 * Legacy's card is 600 wide around a 400 column, so 200px of it is empty on both sides,
 * and its lift comes from a flat `0 5px 0 0` offset. This is sized to its content (420)
 * and lifted with the DS elevation ramp, which is mode-aware — the flat offset reads as
 * a mis-rendered border in dark mode.
 *
 * The brand lock-up is the logo beside the wordmark in Chella. There is no wordmark
 * asset in the DS: "Tevi" is live text in `font-brand`, which is also why it can inherit
 * the title colour and stay legible in both themes.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-background px-4 py-10">
            {/* An `<Image>` rather than a CSS `background-image` off the CDN, which is what
                legacy does and what this did until it was measured: **278KB of PNG** for
                what is four soft colour blobs on a light base — no detail to preserve, and
                exactly the kind of low-frequency image AVIF compresses to a fraction.
                Serving it through the optimizer gets AVIF and a per-device `srcset` for
                free, so a phone stops downloading the desktop-width copy.

                The source is committed rather than fetched: this is decoration that changes
                approximately never, and a login page that renders untinted because a CDN is
                unreachable is a worse trade than a one-off binary in the repo. Users never
                receive this PNG — the optimizer serves derivatives of it.

                Not `priority`: it would preload ahead of the sign-in JS, and the page is
                perfectly usable before the tint arrives. `bg-background` underneath is what
                shows until it does. */}
            <Image
                src="/auth/bg.png"
                // `alt=""` is the whole declaration that this is decorative; an
                // `aria-hidden` beside it would be the same statement twice.
                alt=""
                fill
                sizes="100vw"
                className="pointer-events-none select-none object-cover"
            />

            {/* The artwork is a light pastel gradient — legacy was light-only, so it never
                had to sit behind a dark card. A theme-aware scrim keeps the contrast honest
                in both modes instead of dropping the image in dark, which would leave two
                visibly different pages. After the image in the DOM, so it paints on top of
                it without either needing a `z-index`. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-background/25 dark:bg-background/80"
            />

            <div className="relative flex items-center gap-2">
                <Logo size={36} title={null} />
                <span className="type-title-t1-bold font-brand text-text-title">Tevi</span>
            </div>

            <div className="relative flex w-full max-w-[440px] flex-col items-center gap-5 rounded-2xl border border-separator-default bg-background-elevated/90 p-6 shadow-xl backdrop-blur-md sm:p-8">
                {children}
            </div>
        </main>
    )
}
