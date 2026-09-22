'use client'

import { FollowingLiveRow, useFollowedLives } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Skeleton } from '@shared/ui/skeleton'
import { HomeEmptyState } from './home-empty-state'

/**
 * The Lives tab — which of the spaces you follow are on air.
 *
 * ## It re-uses `/following`'s hook and row, and does not re-implement either
 *
 * Legacy has two separate implementations of this list (`home/components/lives` and the Following
 * screen's own), which is why its live card's access rules had to be fixed twice. Here the row is
 * `FollowingLiveRow` and the data is `useFollowedLives` — both from `features/channel`, which owns
 * `followed-channels/lives/` and the `liveAccess` gating that decides whether a row opens, asks for
 * a membership, or says the stream is restricted.
 *
 * `home → channel` is a legal direction and nothing in `features/channel` imports this feature. The
 * two symbols that moved into that barrel to make it possible are annotated there.
 *
 * ## Two differences from `/following`, both passed as options
 *
 * - **Fifty, not ten** (`LIVE_TAB_LIMIT`) — legacy's own `PAGE_SIZE` for this tab. On `/following`
 *   the strip sits above the list the screen is about; here the list *is* the screen.
 * - **Not collapsible** — a *Show more* that hides rows behind a press makes sense for a strip and
 *   not for a tab whose entire content is those rows.
 *
 * ## A failure here **is** reported, where `/following` hides it
 *
 * That hook's own note explains why the strip drops silently on error: it is optional decoration
 * over a working list, and an error card there would spend the reader's attention on the wrong
 * thing. In this tab the opposite holds — there is nothing else on screen, so silence is
 * indistinguishable from "nobody is live", which is the one thing a failed request does not know.
 */
const LIVE_TAB_LIMIT = 50

export function HomeLiveFeed({ testId = 'home-lives' }: { testId?: string }) {
    const { currentLanguage } = useTranslation()
    const { visible, isLoading, isError } = useFollowedLives({
        limit: LIVE_TAB_LIMIT,
        collapsible: false,
    })

    if (isLoading) return <LiveSkeleton />
    if (isError) return <HomeEmptyState kind="error" />
    if (visible.length === 0) return <HomeEmptyState kind="no-lives" />

    /*
     * A `ul`, because `FollowingLiveRow` renders an `li` — the row owns its own element and a `div`
     * parent would put list items outside a list, which is invalid and is what screen readers use to
     * announce "3 items".
     */
    return (
        <ul data-testid={testId} className="flex min-w-0 list-none flex-col gap-3 py-3">
            {visible.map(live => (
                <FollowingLiveRow
                    // `code` is the event's identity and `normalizeFollowedLives` drops rows without
                    // one, so it is always present here.
                    key={live.code}
                    live={live}
                    locale={currentLanguage}
                    channelSlug={live.channel?.slug ?? undefined}
                    testId={subTestId(testId, 'row')}
                />
            ))}
        </ul>
    )
}

/** Two rows, at the live card's own proportions — a 16/9 thumbnail over a two-line caption. */
function LiveSkeleton() {
    return (
        <div className="flex flex-col gap-3 py-3" aria-busy="true">
            {[0, 1].map(row => (
                <div key={row} className="flex flex-col gap-2">
                    <Skeleton className="aspect-video w-full rounded-[12px]" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-9 rounded-full" />
                        <div className="flex flex-col gap-1">
                            <Skeleton h={14} className="w-[180px] rounded-(--radius-sm)" />
                            <Skeleton h={12} className="w-[100px] rounded-(--radius-sm)" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
