'use client'

import { FOLLOWING_PATH } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import Link from 'next/link'
import { useId } from 'react'
import type { SearchChannel } from '../api/types'
import { SearchChannelRow } from './search-channel-row'
import { SEARCH_SECTION_ACTION, SearchSectionHeader } from './search-section-header'

/**
 * A titled list of spaces — `/search`'s **Following** section, idle and typed, and its **Global
 * search** section.
 *
 * The Figma Search page's `Following` component: a 16/600 title in a 46px band inset 24, an
 * optional *View all* at the trailing edge (12px, the interactive blue), then `User Info` rows 12
 * apart. The same component draws Global search in the typed comp, minus the link — so one
 * component here too.
 *
 * *View all* goes to `/following` ("Click View all → điều hướng sang /following"). It is a `Link`,
 * not a button that pushes: it navigates.
 *
 * Rendered only when there is something in it — the caller checks.
 */
export function SearchFollowingList({
    title,
    channels,
    onOpen,
    viewAll = false,
    stagger = false,
    rowTestId,
    className,
    children,
}: {
    title: string
    channels: SearchChannel[]
    /** A row was pressed — records the term and the creator. */
    onOpen: (channel: SearchChannel) => void
    /** Draw *View all* → `/following`. The Following section only. */
    viewAll?: boolean
    /** Stagger the first screen's entrance — the typed results, which replace themselves. */
    stagger?: boolean
    /** Each row's `data-testid` — rendered by `SearchChannelRow`. */
    rowTestId: string
    className?: string
    /** Under the list — the global section's live region, sentinel and loader. */
    children?: React.ReactNode
}) {
    const { t } = useTranslation()
    const headingId = useId()

    return (
        <section aria-labelledby={headingId} className={className}>
            <SearchSectionHeader
                id={headingId}
                title={title}
                action={
                    viewAll && (
                        <Link
                            data-testid="search-following-view-all"
                            href={FOLLOWING_PATH}
                            className={SEARCH_SECTION_ACTION}
                        >
                            {t('search_view_all')}
                        </Link>
                    )
                }
            />

            <ul className="flex list-none flex-col gap-3 px-6 pb-3">
                {channels.map((channel, index) => (
                    <SearchChannelRow
                        key={channel.slug}
                        testId={rowTestId}
                        channelSlug={channel.slug}
                        channel={channel}
                        onOpen={() => onOpen(channel)}
                        /*
                         * First screen only, 40ms apart — rows appended by pagination are scrolled
                         * to, not revealed, and a delay there makes them look late.
                         */
                        enterDelay={stagger && index < 10 ? index * 40 : 0}
                    />
                ))}
            </ul>
            {children}
        </section>
    )
}
