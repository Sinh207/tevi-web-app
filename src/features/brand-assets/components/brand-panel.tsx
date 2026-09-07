import { cn } from '@shared/lib/utils'
import { buttonVariants } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { ComponentPropsWithoutRef } from 'react'
import type { BrandDownload } from '../content/brand-assets'

/**
 * The furniture the three brand-asset panels share. Server components, all of them —
 * nothing here needs the client, including the download links (see `BrandDownloadLink`).
 */

/**
 * The measure and gutters of `/brand-assets`, as one string the page's sticky bar applies
 * too: the bar's background has to run full-bleed while its contents line up with the
 * panels underneath, and that only holds if both read this rather than each hardcoding a
 * width. Narrower than the legal pages' 1080 — these panels are images and short rows, not
 * a 70-character measure — and wider than legacy's `maxWidth='sm'` (600), which squeezed
 * three previews into a one-up carousel.
 */
export const BRAND_CONTAINER = 'mx-auto w-full max-w-[900px] md:px-6 lg:px-8'

/**
 * A tab's surface: full-bleed on a phone, a card from md — the same treatment the legal
 * pages give their document body, so the two public sub-pages read as one family.
 */
export function BrandPanel({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-6 bg-(--background-surface) px-4 py-6 md:p-8',
                'md:rounded-[var(--radius-2xl)] md:shadow-xs',
                className,
            )}
            {...props}
        />
    )
}

/** A block inside a panel: its heading, its copy, and whatever follows them. */
export function BrandSection({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
    return <section className={cn('flex min-w-0 flex-col gap-3', className)} {...props} />
}

export function BrandSectionTitle({
    as: Tag = 'h2',
    className,
    ...props
}: ComponentPropsWithoutRef<'h2'> & { as?: 'h2' | 'h3' }) {
    return (
        <Tag
            className={cn(
                'type-body-strong text-(--text-title) md:type-title-t2-semibold',
                className,
            )}
            {...props}
        />
    )
}

export function BrandSectionText({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
    return (
        <p
            className={cn('type-dense-default text-(--text-body) md:type-body-default', className)}
            {...props}
        />
    )
}

/**
 * A download, with what it weighs underneath it.
 *
 * A plain anchor with `download`, styled with the DS Button's own variants — not a
 * `<Button>` with an `onClick`. The archives are same-origin static files, so the browser
 * saves them without any of our JavaScript: the link works before hydration, survives
 * middle-click and "Save link as", and is announced as a link, which is what it is. That
 * also retires legacy's `isDownloading` state, which flipped true and false in the same
 * synchronous tick and therefore never rendered a spinner anyone saw.
 *
 * The size is not decoration. This is the one press on the page that costs real bandwidth,
 * and on a phone on mobile data "418 KB" is the difference between pressing it now and
 * pressing it later. `meta` arrives translated so this stays a server component.
 */
export function BrandDownloadLink({
    download,
    label,
    meta,
    className,
    ...props
}: Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'download'> & {
    download: BrandDownload
    label: string
    /** Already-translated "ZIP · 418 KB" line. */
    meta: string
}) {
    return (
        <div className={cn('flex flex-col items-start gap-2', className)}>
            <a
                data-testid="brand-assets-download"
                href={download.href}
                download={download.file}
                className={cn(
                    buttonVariants({ variant: 'primary', size: 'large', fullWidth: true }),
                    'no-underline sm:w-auto',
                )}
                {...props}
            >
                <Icon name="download-arrow-down" size={20} aria-hidden />
                {label}
            </a>
            <span className="type-caption-meta text-(--text-subtitle)">{meta}</span>
        </div>
    )
}
