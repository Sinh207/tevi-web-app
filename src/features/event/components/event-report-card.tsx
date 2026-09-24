'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'

/**
 * The card every block of the creator's report is made of: **a titled header over a hairline, then
 * the body.**
 *
 * Legacy repeats this MUI `CardHeader` + `Divider` + `CardContent` arrangement in all seven blocks,
 * with the same padding pair (`12px` / `24px` from `md`) and the same 16/700 title, and each copy
 * re-declares it. One component, so the seven cannot drift — and so the two variations they *do*
 * need are props rather than seven near-identical files:
 *
 * - **`action`** — a figure or a control at the trailing edge of the header. *Total revenue* puts its
 *   amount there and *New members* its count.
 * - **`href`** — makes the whole header a **link**. *Revenue summary* is the one card that leads
 *   somewhere (`/report`).
 * - **`onInfo`** — a `?` beside the title that opens an explainer. *Maintenance fee details* has one
 *   in legacy, and so does the *Sustained viewers* line inside the interactive accordion.
 *
 * ## The whole header is the control, or none of it is
 *
 * *Revenue summary* is pressable in legacy — `onClick` on the `CardHeader`, with a decorative arrow
 * `IconButton` beside it that does nothing on its own. That is a control the keyboard cannot reach
 * and a screen reader cannot name. Here the header is the control, with the title as its accessible
 * name, and the chevron becomes what it always looked like: an affordance.
 *
 * ## An anchor, not a button with an `onClick` — and ⚠ `next/link`, not a bare `<a>`
 *
 * It was a `<button>` while the destination was a dialog. The destination is a **route** now, so it
 * is a link: middle-clickable, openable in a new tab, its target visible in the status bar, and
 * legible to anything that reads links. An `onClick` that calls `router.push` gives up all four for
 * nothing.
 *
 * That reasoning was right and stopped one step short: it shipped as a **bare `<a>`**, which is a
 * full document load. Every press tore down and rebuilt the entire app — the root layout, the
 * providers, and with them `SessionProviders`' whole bootstrap: a device fingerprint, `/me`,
 * permissions, balance, my-channel. For a route whose *parent segment is already mounted*, and whose
 * screen then re-reads an event it already had in the query cache. The symptom is the one reported:
 * opening the report looks like the app reloading, because it is.
 *
 * `next/link` renders a real `<a>`, so all four properties above survive intact — and the press
 * becomes a client-side navigation that keeps the layout, the providers and the cache. There was
 * never a trade-off between the two; the bare element was simply the wrong one.
 *
 * Same rule as `EventHostCard`, `EventOrderRow` and the off-air panel's *Back to …* — all of which
 * had it wrong the same way, and all of which are `Link` now. The exceptions that stay bare `<a>`
 * are the ones that genuinely leave: `EventAppHandoff`'s deep link and store link.
 */
export function EventReportCard({
    title,
    href,
    onInfo,
    infoLabel,
    action,
    children,
    className,
    testId,
}: {
    title: string
    /** Makes the whole header a link. The chevron is drawn automatically. */
    href?: string
    /** Adds a `?` beside the title. Needs `infoLabel` — it is the button's accessible name. */
    onInfo?: () => void
    infoLabel?: string
    /** The header's trailing slot — a figure, a count. */
    action?: ReactNode
    children?: ReactNode
    className?: string
    testId?: string
}) {
    const { t } = useTranslation()

    const heading = (
        <>
            <span className="type-dense-strong min-w-0 text-start text-(--text-title)">
                {title}
            </span>
            {onInfo && (
                /*
                 * A real button, and **not nested inside the header button**: nested interactive
                 * elements are invalid HTML and the browser's recovery is to hoist one out, which
                 * breaks both. So the info control is a sibling — see the header's layout below.
                 */
                <button
                    type="button"
                    data-testid={subTestId(testId, 'hint')}
                    aria-label={infoLabel ?? t('event_more_info')}
                    onClick={onInfo}
                    className="flex size-5 flex-none items-center justify-center rounded-(--radius-fill) text-(--icon-secondary) transition-colors hover:text-(--text-title)"
                >
                    <Icon name="question-circle" size={16} />
                </button>
            )}
        </>
    )

    return (
        <section
            data-testid={testId}
            className={cn('flex min-w-0 flex-col overflow-clip', EVENT_CARD, className)}
        >
            {href ? (
                /*
                 * `h2` around the link rather than a link around a heading: the heading is what a
                 * screen reader navigates by, and the link is how it is followed. Both, in the order
                 * that keeps each one's semantics.
                 */
                <h2
                    className={cn('flex min-w-0 items-center gap-1', EVENT_PADDING, 'py-3 md:py-3')}
                >
                    <Link
                        data-testid={subTestId(testId, 'trigger')}
                        href={href}
                        className="flex min-w-0 flex-1 items-center gap-1 text-start"
                    >
                        {heading}
                        <span className="ms-auto flex items-center gap-2">
                            {action}
                            <Icon
                                name="angle-right"
                                size={20}
                                className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                            />
                        </span>
                    </Link>
                </h2>
            ) : (
                <h2
                    className={cn('flex min-w-0 items-center gap-1', EVENT_PADDING, 'py-3 md:py-3')}
                >
                    {heading}
                    {action && <span className="ms-auto flex items-center">{action}</span>}
                </h2>
            )}

            {/* The hairline is the header's, so a card with no body does not end in a stray rule —
             *Total revenue* and *New members* are header-only in legacy and here. */}
            {children && (
                <>
                    <hr className="border-(--separator-default)" />
                    <div className={cn('flex min-w-0 flex-col gap-3', EVENT_PADDING)}>
                        {children}
                    </div>
                </>
            )}
        </section>
    )
}
