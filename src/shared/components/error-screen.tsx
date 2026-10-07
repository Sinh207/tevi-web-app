import { ERROR_BACKDROP_SRC, type ErrorArt } from '@shared/lib/error-art'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * The full-screen frame the app shows when a route could not be rendered — the 404 and the error
 * boundary, which legacy draws as `pages/404` and `pages/500`.
 *
 * ## Why a shared component rather than two pages
 *
 * The two screens differ in three strings and a button. Everything else — a full-bleed pastel
 * backdrop, one large illustration, a Chella headline, a sentence, a row of actions — is one
 * layout, and it is a layout **no design-system component covers**: the DS ships no page template
 * and no error art, the same gap `ChannelEmptyState` documents. Composed from tokens and the
 * `.type-*` utilities, so it is an arrangement of DS parts rather than a new one.
 *
 * It lives in `shared/components/` because its callers are `app/error.tsx` and `app/not-found.tsx`,
 * boundary files that belong to no feature. It is a **server component** on purpose: `not-found.tsx`
 * is an RSC and must stay one, and nothing here needs state.
 *
 * ## Three deliberate divergences from `web-app`
 *
 * 1. **The backdrop is Light-only** — see `ERROR_BACKDROP_SRC`. Legacy has one theme.
 * 2. **The headline is Chella 700, not Chella-Black.** `pnpm fonts` ships one weight, because the
 *    type scale stops at 700 and nothing else could reach the others (`docs/DESIGN_SYSTEM.md`).
 *    Legacy's buttons are Chella-ExtraBold for the same reason they are here plain DS `Button`s.
 * 3. **The body is 18/400, not 20/400.** The DS type scale has no 20px regular, and CLAUDE.md
 *    forbids setting `font-size` by hand; `type-subheading-default` is the nearest step down.
 *
 * The sticker outline on the headline *is* ported, but token-driven — see below.
 */
export function ErrorScreen({
    art,
    title,
    body,
    actions,
    testId,
    className,
}: {
    art: ErrorArt
    /** May carry a `\n`; the headline is `whitespace-pre-line`, as legacy's is. */
    title: string
    /** One or two sentences. Legacy's 404 has two paragraphs, its 500 one. */
    body?: ReactNode
    /** The buttons. Omitted entirely inside a webview, which has the native header's back control. */
    actions?: ReactNode
    testId?: string
    className?: string
}) {
    return (
        <main
            data-testid={testId}
            className={cn(
                'relative isolate flex min-h-[var(--window-height)] flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center md:gap-10 md:px-6',
                /*
                 * The 40px band is legacy's; the insets are **added** to it rather than replacing
                 * it, which is the bug the first cut of this had. Unconditional on purpose: neither
                 * the website's shell nor the webview's is in this tree — a boundary replaces
                 * whatever was there — so there is nobody else to keep the headline off the notch,
                 * and `env()` is 0 on every device that does not have one.
                 */
                'pt-[calc(var(--spacing-7)+env(safe-area-inset-top))] pb-[calc(var(--spacing-7)+env(safe-area-inset-bottom))]',
                className,
            )}
        >
            <Image
                src={ERROR_BACKDROP_SRC}
                alt=""
                fill
                /*
                 * `sizes="100vw"` because it is exactly that — without it `next/image` warns and
                 * serves the widest candidate to every phone.
                 */
                sizes="100vw"
                /*
                 * `-z-10` under the content, `dark:hidden` because the mesh is near-white, and
                 * `priority` because it is the page's ground: a lazy background is a screen that
                 * paints blank and then tints itself. 11 KB, so the preload costs nothing.
                 */
                className="-z-10 object-cover dark:hidden"
                priority
            />
            <Image
                src={art.src}
                /*
                 * Decorative: the headline under it says the same thing in words, so an `alt` would
                 * have a screen reader announce the state twice — the mistake legacy makes with
                 * `alt='Tevi - img 404'`.
                 */
                alt=""
                width={art.width}
                height={art.height}
                /*
                 * Capped at the art's own intrinsic width, never a constant, for the reason
                 * `ChannelEmptyState` sets out at length: Brand draws each piece at the size it is
                 * meant to be seen, and `w-full` alone silently upscales the narrower one.
                 */
                style={{ maxWidth: art.width }}
                className={cn('h-auto w-full', RISE)}
                /* This *is* the Largest Contentful Paint on this screen — never lazy. */
                priority
            />
            <div className={cn('flex flex-col items-center gap-4', RISE)} style={riseDelay(1)}>
                <h1
                    className="font-brand type-heading-h1-bold whitespace-pre-line text-(--text-title) uppercase"
                    /*
                     * Legacy's sticker outline, ported through tokens instead of its `#fff`/`#000`.
                     *
                     * The 1px halo is the **page ground** and the 3px offset is the **ink**, which is
                     * the relationship legacy hard-codes: in Light the two resolve to white and near
                     * -black, i.e. byte-for-byte what `web-app` draws. In Dark they invert with the
                     * ramp and the effect stays legible, which a literal port could not do — CLAUDE.md
                     * forbids raw hex precisely because the Zinc ramp flips between modes.
                     */
                    style={{
                        textShadow:
                            '1px 1px 0 var(--background), -1px -1px 0 var(--background), 3px 3px 0 var(--text-title)',
                    }}
                >
                    {title}
                </h1>
                {body && (
                    <div className="type-subheading-default flex max-w-[560px] flex-col text-(--text-body)">
                        {body}
                    </div>
                )}
            </div>
            {actions && (
                <div
                    className={cn('flex flex-wrap items-center justify-center gap-4', RISE)}
                    style={riseDelay(2)}
                >
                    {actions}
                </div>
            )}
        </main>
    )
}
