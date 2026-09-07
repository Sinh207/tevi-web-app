'use client'

import { StickyTabs } from '@shared/components/sticky-tabs'
import { useTranslation } from '@shared/i18n/use-translation'
import type { Channel } from '../api/types'
import { type ChannelTabId, useChannelTab } from '../hooks/use-channel-tab'
import { CHANNEL_BAR_HEIGHT, CHANNEL_PADDING } from '../lib/container'
import { ChannelAboutTab } from './channel-about-tab'
import { ChannelLiveNow } from './channel-live-now'
import { ChannelLiveTab } from './channel-live-tab'
import { ChannelThreadList } from './channel-thread-list'

/**
 * Posts · Media · (Live) · About.
 *
 * ## `live` is appended, never inserted
 *
 * The owner gets a fourth tab. It goes on the **end** so that when ownership resolves a moment after
 * the first paint, no existing tab moves and no selection is invalidated — the alternative is the tab
 * the reader was about to press sliding out from under their thumb.
 *
 * ## `mountAll={false}`, unlike brand-assets
 *
 * That page's panels are server-rendered static copy: keeping all three in the DOM is free, good for
 * crawlers, and preserves scroll position. These panels each own a paginated query, so mounting them
 * all fires Posts *and* Media *and* About on load, for tabs nobody opened. TanStack Query's 60s
 * `staleTime` makes coming back instant anyway, so there is nothing to preserve by staying mounted.
 * Legacy is the same — MUI's `TabPanel` unmounts the inactive ones.
 *
 * ## The sticky arithmetic
 *
 * `ChannelTopBar` is 60 tall at `top-0 z-20`; this row parks at `top-[60px] z-10`. The DS underline
 * track is 48, so the stack is 108 — the number any in-panel anchor wants as `scroll-mt`. The wrapper
 * needs an opaque fill of *some* kind or content scrolls visibly through it (the DS bar carries none
 * of its own); which fill is the point of `barClassName` below.
 */
export function ChannelTabs({ channel, isOwner }: { channel: Channel; isOwner: boolean }) {
    const { t } = useTranslation()

    const available: ChannelTabId[] = isOwner
        ? ['posts', 'media', 'live', 'about']
        : ['posts', 'media', 'about']
    const { active, setActive } = useChannelTab(available)

    const panels: Record<ChannelTabId, { label: string; panel: React.ReactNode }> = {
        posts: {
            label: t('channel_tab_posts'),
            /*
             * The live card sits **above** the list rather than inside it, and outside its state
             * machine: a space can be on air with no posts at all, and a live stream that
             * disappeared behind an "No posts yet" panel would be the one thing on the page that is
             * true right now, hidden by the one that is merely empty.
             *
             * `ChannelLiveNow` renders nothing when nothing is on air, so the common case adds a
             * wrapper and no markup.
             */
            panel: (
                <div className="flex min-w-0 flex-col gap-3">
                    <ChannelLiveNow channel={channel} />
                    <ChannelThreadList slug={channel.slug} kind="posts" isOwner={isOwner} />
                </div>
            ),
        },
        media: {
            label: t('channel_tab_media'),
            panel: <ChannelThreadList slug={channel.slug} kind="media" isOwner={isOwner} />,
        },
        live: {
            label: t('channel_tab_live'),
            /*
             * The tab exists, its content does not. Events come from `/core/v4/events/` with
             * page-number pagination and a state filter, which is the live plan's work — so the tab
             * is honest about being empty rather than absent, because an owner who streams expects
             * to find it and its absence would read as data loss.
             */
            panel: <ChannelLiveTab slug={channel.slug} />,
        },
        about: {
            label: t('channel_tab_about'),
            panel: <ChannelAboutTab channel={channel} isOwner={isOwner} />,
        },
    }

    return (
        <StickyTabs
            testId="channel-tabs"
            variant="underline"
            label={t('channel_tabs_label')}
            stickyOffset={CHANNEL_BAR_HEIGHT}
            mountAll={false}
            value={active}
            onValueChange={setActive}
            /*
             * Surface only from `md`, matching the header above it — below that the panels sit on the
             * page background with no card edge.
             */
            className="bg-(--background-surface) md:rounded-b-[var(--radius-xl)]"
            /**
             * The strip is **sticky, so it always needs an opaque fill** — whatever is behind it
             * scrolls under it, and a transparent sticky row shows the content passing through. So
             * this is the one part of the card that does not simply drop its background below `md`:
             * it takes the *page's* fill there and the *card's* from `md`, which is exactly the two
             * things it is sitting on at those two widths.
             *
             * `StickyTabs` defaults to `bg-(--background)`, which is already right below `md`; the
             * `md:` half is what stops it drawing a band a shade off the card. `twMerge` lets the
             * later class win.
             */
            barClassName="bg-(--background-surface) px-3 md:px-6"
            tabs={available.map(id => ({
                id,
                label: panels[id].label,
                panel: <div className={CHANNEL_PADDING}>{panels[id].panel}</div>,
            }))}
        />
    )
}
