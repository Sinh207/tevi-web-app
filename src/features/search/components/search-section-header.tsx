import { cn } from '@shared/lib/utils'

/**
 * A search section's title band — the Figma Search page's `Recents Header`: 16/600, inset 24, 12
 * above and below, with an optional trailing action (*Clear all history*, *View all*).
 *
 * One component because every section on `/search` and `/gift-star` draws it — Recents, Recent
 * creators, Following, Global search, and their skeletons — and the rows under them are inset 24.
 * The DS `ListHeader` is inset 16, which is what left the headers 8px off the rows they label.
 *
 * Hook-free, so the skeletons can use it and stay server-renderable. `id` is for the section's
 * `aria-labelledby`.
 */
export function SearchSectionHeader({
    id,
    title,
    action,
    className,
}: {
    id?: string
    title: string
    action?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('flex items-center gap-2 px-4 py-3 md:px-6', className)}>
            <h2 id={id} className="type-body-strong min-w-0 flex-1 truncate text-(--text-title)">
                {title}
            </h2>
            {action}
        </div>
    )
}

/**
 * The trailing text action — 12px in the interactive blue, its hit area padded past the 18px line
 * so it is a target and not a word. `--accents-indigo-active` rather than legacy's `#007AFF`: the
 * ramp's own blue, which inverts with the theme.
 */
export const SEARCH_SECTION_ACTION =
    "type-caption-meta relative flex-none cursor-pointer text-(--accents-indigo-active) no-underline outline-none before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
