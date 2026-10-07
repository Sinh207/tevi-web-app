import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * The panel a sub-page's content sits on — **a card from md up, nothing at all below it.**
 *
 * Legacy wraps these screens in a `<Paper>` with a white fill at every width
 * (`containers/settingPassword`). That is wrong on a phone, and the app itself says so
 * everywhere else: a surface whose left and right edges *are* the screen's edges is not a
 * card, it is just paint — the corners are cut in half, the side borders sit under the
 * bezel, and the only thing the fill buys is a second background behind a form that was
 * already legible on the first. Below md the content is therefore on `--background`
 * directly, full-bleed, exactly as the mobile app draws it.
 *
 * From md the column is capped and there is real space either side, so the panel becomes a
 * card and does the job a card does: it bounds the screen's content and separates it from
 * the page around it.
 *
 * ## What it is not
 *
 * **Not a `Card`.** The DS's `basic` variant is a padded *row* with a fixed `rounded-xl` and
 * an inset ring, drawn for a list item; this is page-sized and has to lose its frame at a
 * breakpoint. Bending the DS component into that would misrepresent it.
 *
 * **Not for a page whose content is already a surface.** A list card, a set of option cards,
 * a sticky action sheet — each of those is its own bounded thing and already stops being a
 * card below md on its own. Putting one inside this panel nests two surfaces and the inner
 * one stops reading as separate. `/settings/blocked-accounts` (a list),
 * `/settings/space-visibility` (option cards) and `/identification` (cards plus a sticky
 * action sheet) are all that shape, which is why none of them uses this.
 *
 * ## Padding, and the bar above it
 *
 * 16 below md, 24 from md. `PageBackBar` has to be given the matching pair by the page —
 * `px-4` (its own default) below md and **`md:px-0`** above, and the two numbers are not the
 * same thing:
 *
 * - **Below md** there is no frame, so the bar's back button lines up with the *content*,
 *   which is this panel's 16.
 * - **From md** there is a frame, and a frame outranks the text inside it: the eye measures
 *   the bar against the block, so any padding on the bar pulls the button inside the card's
 *   outline and the header reads as narrower than the panel under it. Zero puts the button
 *   flush with the border.
 *
 * `flex-1` below md so a short form still fills the phone (legacy's
 * `minHeight: calc(var(--window-height) - 70px)`), `md:flex-none` above so it hugs its
 * content instead of stretching a two-field form down a tall desktop window.
 */
export function PageSurface({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            className={cn(
                'flex flex-1 flex-col gap-4 p-4 md:gap-6',
                'md:mb-6 md:flex-none md:rounded-xl md:border md:border-(--separator-default)',
                'md:bg-(--background-surface) md:p-6',
                className,
            )}
            {...props}
        />
    )
}
