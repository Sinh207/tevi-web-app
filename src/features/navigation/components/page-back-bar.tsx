'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The bar every sub-page inside `(main)` wears: back · centred title, which is the
 * arrangement the legacy pages had (`IconBtnBack` plus an absolutely centred `h1`).
 *
 * It is the page's own chrome, not the shell's — sub-pages sit outside `(tabs)`, so the
 * global top bar is not there to collide with, and this one is the only bar on screen at
 * any width.
 *
 * Two things the DS bar does not decide, because they belong to the page around it:
 *
 * - `className` is the bar's own box, so a page can hand it the *same* container the copy
 *   below uses. The sticky background stays full-bleed (that lives on the host wrapper)
 *   while the button lines up with the content — a lone icon floating at the window edge
 *   above a centred document reads like a mistake.
 * - `trailing` fills the bar on wide screens, where a phone-sized bar with one 40px button
 *   in it is 1300px of nothing. A breadcrumb is the usual answer, hence a node rather than
 *   a fixed shape.
 *
 * ## The bar's side padding is the *content's*, not the DS bar's
 *
 * `AppBar` carries `px-4`, drawn for a phone where the bar is the full width of the screen.
 * From `md` up the sub-pages stop being full-width — they become a centred column — and that
 * 16px then measures from the column's edge rather than the screen's, so the back button sits
 * inset from content that does not. On a page whose content is a **surface** (the settings
 * screens: a card with its own background and, at `md`, its own rounded corners) the eye lines
 * the button up against the card's edge and reads the bar as narrower than the page.
 *
 * Hence `md:px-0` here, and it is deliberately placed *before* `className`: pages whose column
 * carries its own padding — `LEGAL_CONTAINER` and `BRAND_CONTAINER` are `md:px-6 lg:px-8` —
 * hand that in and `twMerge` drops this, so their bar keeps matching their prose. Pages whose
 * column has no padding keep this and the bar goes flush.
 *
 * Below `md` nothing changes: the content there is full-bleed with its own 16px inset (a list
 * row's leading column, a card's padding), which is exactly what `px-4` lines the button up
 * with. The rule is the same at both ends — **match the content** — the content just changes.
 *
 * `home` is where "back" goes when there is nothing to go back to: the app opened this URL
 * directly (a shared link, a push notification), so `router.back()` would leave the site.
 * `history.length` is the only signal available for that, and it is read in the handler
 * rather than at render because it is meaningless during SSR.
 */
export function PageBackBar({
    title,
    home = '/',
    /**
     * For pages whose own masthead carries the title at some breakpoint — pass
     * `md:hidden` and the bar keeps only the back button there, instead of printing the
     * same words twice 40px apart.
     */
    titleClassName,
    trailing,
    className,
}: {
    title: string
    home?: string
    titleClassName?: string
    /** Sits next to the back button. Hide it below md yourself if it needs the room. */
    trailing?: ReactNode
    className?: string
}) {
    const router = useRouter()
    const { t } = useTranslation()

    return (
        <AppBar className={cn('md:px-0', className)}>
            <AppBarCluster className="min-w-0">
                {/*
                 * `BarIconButton` owns this treatment now — the 40px disc on `--background-surface`,
                 * the filled 24px glyph, and the two traps that come with it (`size-6` being
                 * load-bearing against `Button`'s own icon rule, and `filled` needing `pnpm icons`
                 * before the glyph exists in the subset). All of that moved to the component's own
                 * doc rather than being lost.
                 *
                 * It lives in `shared/components` because the channel page's bar needs the identical
                 * control, and it had reproduced this from memory — landing on a different component,
                 * a different box and a different glyph weight. Two sub-page bars that do not match is
                 * the bug; one shared control is the fix.
                 */}
                <BarIconButton
                    name="angle-left"
                    weight="filled"
                    mirrored
                    label={t('common_back')}
                    onClick={() => {
                        if (window.history.length > 1) router.back()
                        else router.push(home)
                    }}
                />
                {trailing}
            </AppBarCluster>
            {/*
             * Absolutely centred (the DS default), so the title stays centred on the bar
             * regardless of what the clusters weigh — which also means nothing pushes it
             * out of the way. The `max-w` is that reserve: 80 each side clears the 40px
             * button, the bar's 16 padding and room to spare, so a long title truncates
             * instead of sliding under the button.
             */}
            <AppBarTitle className={cn('max-w-[calc(100%-160px)]', titleClassName)}>
                <AppBarTitleText as="h1" className="max-w-full truncate">
                    {title}
                </AppBarTitleText>
            </AppBarTitle>
        </AppBar>
    )
}

/**
 * The breadcrumb a sub-page hands to `PageBackBar` as its `trailing` node — desktop only,
 * where the bar has room to spare and orientation is worth more than emptiness.
 *
 * An ordered list because the order is the meaning, `aria-current="page"` on the last
 * crumb, and the separator is `aria-hidden` art rather than a character screen readers
 * would announce between every step.
 */
export function PageBreadcrumb({
    label,
    items,
}: {
    label: string
    /** In order, root first. The last one is the current page and is not a link. */
    items: { label: string; href?: string }[]
}) {
    return (
        <nav aria-label={label} className="hidden min-w-0 md:block">
            <ol className="type-dense-default flex min-w-0 list-none items-center gap-2">
                {items.map((item, index) => {
                    const last = index === items.length - 1
                    return (
                        <li
                            key={item.href ?? item.label}
                            className="flex min-w-0 items-center gap-2"
                        >
                            {index > 0 ? (
                                <Icon
                                    name="angle-right"
                                    size={16}
                                    aria-hidden
                                    className="shrink-0 text-(--text-placeholder) rtl:-scale-x-100"
                                />
                            ) : null}
                            {last || !item.href ? (
                                <span
                                    aria-current={last ? 'page' : undefined}
                                    className="truncate text-(--text-title)"
                                >
                                    {item.label}
                                </span>
                            ) : (
                                <a
                                    href={item.href}
                                    className="truncate rounded-(--radius-sm) text-(--text-body) no-underline transition-colors hover:text-(--text-title) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {item.label}
                                </a>
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
