import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'

/**
 * The two app-store badges — brand mark, a small "Download on the" line, and the store's name.
 *
 * ## Why these two paths are hand-written when the DS sprite rule says never to draw one
 *
 * CLAUDE.md's rule is about **icons**: use the DS sprite, and if a glyph is missing, say so
 * rather than substituting a shape. These are not icons. They are Apple's and Google's own
 * **brand marks**, third-party assets with published usage rules, and no design system of ours
 * would ever ship them. The repo already makes this distinction — `features/auth/components/
 * provider-marks.tsx` inlines the same Apple mark, plus Google, Facebook, Telegram and Line, for
 * the sign-in buttons, and explains there why they live in code rather than in the sprite.
 *
 * These are copied verbatim from legacy's `dialogs/shareQr`, which is where the badges are
 * rendered today, so the shapes are the ones already shipping rather than a redraw.
 *
 * `provider-marks.tsx` is not reused because it is inside `features/auth`, and `shared/` must not
 * import a feature. Only the Apple mark would have been shared anyway: Google's **Play** logo (the
 * four-colour triangle) is a different mark from the Google "G" the sign-in button uses.
 *
 * ## Ink
 *
 * The Apple mark paints with `currentColor` rather than legacy's baked `#141414`, so the badge
 * survives dark mode — a near-black glyph on a near-black surface is invisible, and this dialog
 * has to work in both themes. The Play mark keeps its four brand colours: they are the mark.
 */
function AppleMark() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className="size-6 flex-none"
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M19.0999 19.16C19.6899 18.26 19.9099 17.8 20.3599 16.79C17.0399 15.53 16.5099 10.8 19.7899 8.98999C18.7899 7.72999 17.3799 7 16.0499 7C15.0899 7 14.4299 7.25001 13.8399 7.48001C13.3399 7.67001 12.8899 7.84 12.3299 7.84C11.7299 7.84 11.1999 7.65001 10.6399 7.45001C10.0299 7.23001 9.38994 7 8.58994 7C7.09994 7 5.50994 7.91 4.49994 9.47C3.07994 11.67 3.32995 15.79 5.61995 19.31C6.43995 20.57 7.53995 21.98 8.96995 22C9.56995 22.01 9.95994 21.83 10.3899 21.64C10.8799 21.42 11.4099 21.18 12.3399 21.18C13.2699 21.17 13.7899 21.42 14.2799 21.64C14.6999 21.83 15.0799 22.01 15.6699 22C17.1199 21.98 18.2799 20.42 19.0999 19.16Z"
                fill="currentColor"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M15.8399 2C15.9999 3.1 15.5499 4.19001 14.9599 4.95001C14.3299 5.77001 13.2299 6.41 12.1699 6.37C11.9799 5.31 12.4699 4.21999 13.0699 3.48999C13.7399 2.68999 14.8699 2.07 15.8399 2Z"
                fill="currentColor"
            />
        </svg>
    )
}

function PlayMark() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className="size-6 flex-none"
        >
            <path
                d="M11.2733 11.5495L2.82617 20.3995C2.92102 20.7357 3.09148 21.0457 3.32452 21.3059C3.55756 21.5661 3.84701 21.7696 4.17074 21.9008C4.49446 22.032 4.8439 22.0874 5.19234 22.0628C5.54078 22.0383 5.87899 21.9344 6.18112 21.7591L15.6858 16.3458L11.2733 11.5495Z"
                fill="#EA4335"
            />
            <path
                d="M19.8147 10.0451L15.7044 7.69095L11.078 11.7509L15.7233 16.3332L19.8021 14.0043C20.1635 13.8151 20.4662 13.5306 20.6773 13.1816C20.8885 12.8327 21.0002 12.4326 21.0002 12.0247C21.0002 11.6168 20.8885 11.2167 20.6773 10.8677C20.4662 10.5188 20.1635 10.2343 19.8021 10.0451H19.8147Z"
                fill="#FBBC04"
            />
            <path
                d="M2.82605 3.60583C2.77499 3.7946 2.74958 3.98938 2.75051 4.18493V19.8204C2.75102 20.0158 2.77641 20.2104 2.82605 20.3995L11.5628 11.776L2.82605 3.60583Z"
                fill="#4285F4"
            />
            <path
                d="M11.3363 12.0027L15.7046 7.69095L6.21259 2.25254C5.8555 2.0434 5.44936 1.93264 5.03553 1.93152C4.53573 1.93053 4.04933 2.09299 3.65045 2.39414C3.25157 2.69529 2.9621 3.1186 2.82617 3.59955L11.3363 12.0027Z"
                fill="#34A853"
            />
        </svg>
    )
}

const MARKS = { apple: AppleMark, play: PlayMark }

/**
 * The badge's contents — designed to sit **inside** a `Button`, not to be one.
 *
 * The store link is an `<a>` (it opens a new tab), and the button is what carries the DS frame,
 * so this is only the arrangement: mark, then the two stacked lines.
 *
 * `lead` is the small line ("Download on the"), `name` is the store. Legacy sets them at 8px/500
 * and 12.49px/600; those are `type-micro-overline` (10/500) and `type-caption-label-strong`
 * (12/600) here, the two DS styles nearest them — CLAUDE.md forbids picking a font size by hand,
 * and 8px is below anything the scale offers for good reason.
 *
 * Both lines truncate: they are translated, and "Télécharger dans l'" is a good deal wider than
 * "Download on the" in a button sharing 322px with its twin.
 */
export function StoreBadge({
    mark,
    lead,
    name,
    className,
}: {
    mark: keyof typeof MARKS
    lead: ReactNode
    name: ReactNode
    className?: string
}) {
    const Mark = MARKS[mark]
    return (
        <span className={cn('flex w-full items-center gap-2', className)}>
            <Mark />
            <span className="flex min-w-0 flex-col items-start text-start">
                <span className="type-micro-overline w-full truncate">{lead}</span>
                <span className="type-caption-label-strong w-full truncate">{name}</span>
            </span>
        </span>
    )
}
