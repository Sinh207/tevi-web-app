'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { PostCollection } from '../api/collection-types'
import { formatPostTimestamp } from '../lib/post-format'
import { CollectionListGlyph } from './legacy-icons'

/**
 * One collection as legacy draws it — `collection/components/collectionItem`, on both of its
 * screens: a card in the list (the whole card opens it) and the card at the top of the collection
 * itself (not a link — `disableDetail`).
 *
 * Geometry is legacy's: 12px padding on the surface, square below `md` and 16px corners from it; a
 * 56px tile on the `--background-segment` fill holding a dark pill with the post count; the name at
 * 16/600 over the date and count at 14/400; the owner's menu on the trailing edge.
 *
 * ## The menu is a sibling of the link, not inside it
 *
 * Legacy makes the whole card a click target and then has to test
 * `event.target.closest('[data-menu-container]')` so that opening the menu is not also a
 * navigation. Here the link is the card's body and the menu sits beside it, so there is nothing to
 * catch — and the link is a real `<a>`, middle-clickable, which legacy's `router.push` is not.
 */
export function CollectionCard({
    collection,
    href,
    menu,
    testId,
}: {
    collection: PostCollection
    /** Where the card leads. Omitted on the collection's own screen, where it leads nowhere. */
    href?: string
    /** The owner's menu, or nothing. */
    menu?: ReactNode
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const when = collection.created_at
        ? formatPostTimestamp(collection.created_at, currentLanguage)
        : ''
    const count = collection.post_count

    const body = (
        <>
            {/* Legacy's tile: the segment fill, 56 tall, a dark pill with the count inside. */}
            <span className="flex h-14 flex-none items-center justify-center rounded-(--radius-lg) bg-(--background-segment) px-2 py-1.5">
                <span className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-white">
                    <CollectionListGlyph />
                    <span className="type-dense-emphasis">
                        {formatCompactCount(count, currentLanguage)}
                    </span>
                </span>
            </span>

            <span className="flex min-w-0 flex-col gap-px">
                <span className="type-body-strong truncate text-(--text-title)">
                    {collection.name}
                </span>
                <span className="type-dense-default flex min-w-0 items-center gap-1 text-(--text-subtitle)">
                    {when ? (
                        <time dateTime={collection.created_at ?? undefined} className="truncate">
                            {when}
                        </time>
                    ) : null}
                    {/* Legacy's 4px dot and the count, only above zero. */}
                    {count > 0 ? (
                        <>
                            {when ? (
                                <span
                                    aria-hidden="true"
                                    className="size-1 flex-none rounded-full bg-(--text-placeholder)"
                                />
                            ) : null}
                            <span className="flex-none">
                                {t('post_collection_count', {
                                    count,
                                    formatted: formatCompactCount(count, currentLanguage),
                                })}
                            </span>
                        </>
                    ) : null}
                </span>
            </span>
        </>
    )

    return (
        <div
            data-testid={testId}
            data-option-value={collection.id}
            className="flex items-center justify-between gap-px bg-(--background-surface) p-3 md:rounded-(--radius-xl)"
        >
            {href ? (
                <Link
                    href={href}
                    data-testid={subTestId(testId, 'trigger')}
                    className="flex min-w-0 flex-1 items-center gap-3"
                >
                    {body}
                </Link>
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
            )}
            {menu}
        </div>
    )
}

/** Legacy's `SkeletonCollection`: the same card, a 67px tile, two lines and a pill. */
export function CollectionCardSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="flex items-center gap-3 bg-(--background-surface) p-3 md:rounded-(--radius-xl)"
        >
            <Skeleton h={56} className="w-[67px] flex-none rounded-(--radius-lg)" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton h={16} className="w-1/2 rounded-(--radius-sm)" />
                <Skeleton h={14} className="w-1/3 rounded-(--radius-sm)" />
            </div>
        </div>
    )
}

/**
 * The bar both collection screens open with — legacy's own, not `PageBackBar`: a floating back
 * disc on the leading edge, the title **centred**, and an optional disc on the trailing edge (the
 * list's `+`).
 *
 * Surface-filled with a hairline below `md` and on the page colour from it, exactly as legacy
 * switches (`#fff` + `1px solid #f4f4f4` → `#f4f4f4`, no rule). A three-column grid rather than
 * legacy's `space-between` with an empty `<Box />`, so the title stays centred whatever width the
 * trailing slot has.
 *
 * ## Why this is not `PageBackBar`
 *
 * `features/navigation` imports `@features/post` (`use-create-action.ts` opens the composer), so
 * this feature importing navigation back would close a barrel cycle — ESM hands one side a
 * half-initialised module, an `undefined is not a function` at render. And the shape differs
 * anyway: the DS bar left-aligns its title.
 */
export function CollectionScreenHeader({
    title,
    size = 'list',
    actions,
    testId,
}: {
    title: string
    /**
     * Legacy's two headers differ: the list's title is 18/700 with a 32px back disc, the
     * collection's 16/600 with a 40px one. `type-subheading-strong` (18/600) is the nearest style
     * to the list's — there is no 18/700 in the type scale.
     */
    size?: 'list' | 'detail'
    actions?: ReactNode
    testId?: string
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <div className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center border-(--separator-default) border-b bg-(--background-surface) px-3 py-2.5 md:border-b-0 md:bg-(--background) md:px-0">
            <div className="flex">
                <button
                    type="button"
                    aria-label={t('common_back')}
                    onClick={() => {
                        // Legacy's `handleClosePostForm`: back, or home when there is nowhere back.
                        if (window.history.length > 1) router.back()
                        else router.push('/')
                    }}
                    data-testid={subTestId(testId, 'prev')}
                    className={cn(DISC, size === 'list' ? 'size-8' : 'size-10')}
                >
                    <Icon name="angle-left" size={20} className="rtl:-scale-x-100" />
                </button>
            </div>
            <h1
                className={cn(
                    'truncate text-center text-(--text-title)',
                    size === 'list' ? 'type-subheading-strong' : 'type-body-strong',
                )}
            >
                {title}
            </h1>
            <div className="flex justify-end">{actions}</div>
        </div>
    )
}

/**
 * Legacy's floating disc — `rgba(255,255,255,.9)` with a 10px shadow. `--background-elevated` is
 * the token for something floating over a surface, and it is what keeps the disc visible in Dark,
 * where the surface itself is near-black.
 */
export const DISC =
    'flex flex-none items-center justify-center rounded-full bg-(--background-elevated) text-(--icon-default) shadow-md transition-colors hover:bg-(--background-segment)'
