'use client'

import { useAuth } from '@features/auth'
import { FollowedLiveCard, useFollowedLives } from '@features/channel'
import { RISE, riseDelay } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { Skeleton } from '@shared/ui/skeleton'
import { HomeEmptyState } from './home-empty-state'

/**
 * The Lives tab — which of the spaces you follow are on air.
 *
 * ## It re-uses `/following`'s hook, and draws `features/channel`'s card
 *
 * Legacy has two separate implementations of this list (`home/components/lives` and the Following
 * screen's own), which is why its live card's access rules had to be fixed twice. Here the data is
 * `useFollowedLives` and the row is `FollowedLiveCard` — both from `features/channel`, which owns
 * `followed-channels/lives/` and the `liveAccess` gating that decides whether a row opens, asks for
 * a membership, or says the stream is restricted. The card is Figma's full `Live Event Container`
 * rather than `/following`'s compact row; its own header says why the two differ.
 *
 * `home → channel` is a legal direction and nothing in `features/channel` imports this feature. The
 * two symbols that moved into that barrel to make it possible are annotated there.
 *
 * ## Two differences from `/following`, both passed as options
 *
 * - **Fifty, not ten** (`HOME_LIVE_LIMIT`) — legacy's own `PAGE_SIZE` for this tab. On `/following`
 *   the strip sits above the list the screen is about; here the list *is* the screen.
 * - **Not collapsible** — a *Show more* that hides rows behind a press makes sense for a strip and
 *   not for a tab whose entire content is those rows.
 *
 * ## Signed out is its own state
 *
 * A guest has no follow list, so "nobody you follow is live" is false for them and *Discover
 * creators* sends them to a page where every follow raises a sign-in dialog. They get the same
 * sign-in wall as the Posts tab — legacy's `noData` makes the same split, in its click handler.
 *
 * ## A failure here **is** reported, where `/following` hides it
 *
 * That hook's own note explains why the strip drops silently on error: it is optional decoration
 * over a working list, and an error card there would spend the reader's attention on the wrong
 * thing. In this tab the opposite holds — there is nothing else on screen, so silence is
 * indistinguishable from "nobody is live", which is the one thing a failed request does not know.
 */
/** Legacy's `useTabLives.PAGE_SIZE`. Exported because `HomeView` asks the same query for the tab's dot. */
export const HOME_LIVE_LIMIT = 50

/** Cards past this many arrive together — a stagger is for the first screen, not for row forty. */
const STAGGERED = 6

export function HomeLiveFeed({ testId = 'home-lives' }: { testId?: string }) {
    const { isAuthenticated, isBootstrapping } = useAuth()
    const { visible, isLoading, isError } = useFollowedLives({
        limit: HOME_LIVE_LIMIT,
        collapsible: false,
    })

    if (isBootstrapping || isLoading) return <LiveSkeleton />
    if (!isAuthenticated) return <HomeEmptyState kind="signed-out" />
    if (isError) return <HomeEmptyState kind="error" />
    if (visible.length === 0) return <HomeEmptyState kind="no-lives" />

    /*
     * A `ul`, because `FollowedLiveCard` renders an `li` — the row owns its own element and a `div`
     * parent would put list items outside a list, which is invalid and is what screen readers use to
     * announce "3 items".
     *
     * `gap-px` over the page colour below `md` (bands, as the Posts tab), `gap-3` between cards from
     * `md` — Figma's `Live Centre container`, 12 apart, 24 below the tab row.
     */
    return (
        <ul
            data-testid={testId}
            className="flex min-w-0 list-none flex-col gap-px md:gap-3 md:py-6"
        >
            {visible.map((live, index) => (
                <FollowedLiveCard
                    // `code` is the event's identity and `normalizeFollowedLives` drops rows without
                    // one, so it is always present here.
                    key={live.code}
                    live={live}
                    className={RISE}
                    style={index < STAGGERED ? riseDelay(index) : undefined}
                    testId={subTestId(testId, 'row')}
                />
            ))}
        </ul>
    )
}

/**
 * Two cards at the real card's proportions — header, 16/9 banner, the *Happening now* row, title and
 * the date block — on the same surface the cards are drawn on, so the swap moves nothing.
 */
function LiveSkeleton() {
    return (
        <div className="flex flex-col gap-px md:gap-3 md:py-6" aria-busy="true">
            {[0, 1].map(row => (
                <div
                    key={row}
                    className="flex flex-col bg-(--background-surface) px-1 py-2 md:rounded-2xl md:px-6 md:py-3"
                >
                    <div className="flex items-center gap-3 px-3 py-2">
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex flex-col gap-1">
                            <Skeleton h={14} className="w-[160px] rounded-(--radius-sm)" />
                            <Skeleton h={12} className="w-[90px] rounded-(--radius-sm)" />
                        </div>
                    </div>
                    <div className="px-3">
                        <Skeleton className="aspect-video w-full rounded-(--radius-lg)" />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                        <Skeleton h={14} className="w-[120px] rounded-(--radius-sm)" />
                        <Skeleton h={24} className="w-[84px] rounded-full" />
                    </div>
                    <div className="flex flex-col gap-3 px-3 py-2">
                        <Skeleton h={16} className="w-4/5 rounded-(--radius-sm)" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="size-9 rounded-(--radius-md)" />
                            <div className="flex flex-col gap-1">
                                <Skeleton h={14} className="w-[170px] rounded-(--radius-sm)" />
                                <Skeleton h={14} className="w-[110px] rounded-(--radius-sm)" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
