'use client'

import { accountShowSensitive, useAuth } from '@features/auth'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { useChannel } from '../hooks/use-channel'
import { useChannelOwnership } from '../hooks/use-channel-ownership'
import { useChannelStats } from '../hooks/use-channel-stats'
import { useNsfwConsent } from '../hooks/use-nsfw-consent'
import { channelVisibility, showsChannelTabs } from '../lib/channel-flags'
import type { ChannelFetchStatus } from '../lib/channel-seo'
import { CHANNEL_CONTAINER } from '../lib/container'
import { ChannelCampaignBanners } from './channel-campaign-banners'
import { ChannelError } from './channel-error'
import { ChannelHeader } from './channel-header'
import { ChannelHeaderSkeleton } from './channel-header-skeleton'
import { ChannelOwnerActions } from './channel-owner-actions'
import { ChannelPublishBanner } from './channel-publish-banner'
import { ChannelStateScreen } from './channel-state-screens'
import { ChannelTabs } from './channel-tabs'
import { ChannelTabsSkeleton } from './channel-tabs-skeleton'
import { ChannelTopBar } from './channel-top-bar'
import { ChannelTopBarSkeleton } from './channel-top-bar-skeleton'
import { ChannelViewerActions } from './channel-viewer-actions'

/**
 * The channel page's composition root — **the only file that knows the word `isOwner`**.
 *
 * ## One subtree, three swap points
 *
 * Legacy branches at the top into `ChannelCreator` and `ChannelViewer`, which duplicate eight
 * `info/*` components verbatim between them; the diff between the copies is styling drift, and that
 * drift is the actual cost of the decision.
 *
 * So most components here take **data**, not an ownership flag. But "most" is the honest word: this
 * used to claim exactly three swap points and there are **four**, and the missing one was a defect
 * rather than a tidiness question.
 *
 * | swap point | my space | your space |
 * |---|---|---|
 * | action row | Custom profile · Earning report | Follow · (member/donate/message, later) |
 * | tab set | posts · media · **live** · about | posts · media · about |
 * | **About blocks** | Details · Badges · **MCN** · (activity feed) | Details · Badges · (donate) |
 * | overflow menu | (later) | report · block · mute — (later) |
 *
 * The About row is the one that was missed: one shared component rendered MCN to everyone, publishing
 * the creator's revenue split to every visitor. See `channel-about-tab.tsx`.
 *
 * And the inverse mistake is worth naming beside it, because a surface split invites both: the stats
 * strip *is* identical on the two surfaces, and gating income on ownership there broke the creator's
 * own "Show my income" toggle. Legacy is the reference for which is which — two trees to diff, not a
 * rule to infer.
 *
 * ## `unknown` ownership renders a placeholder, not a guess
 *
 * The first paint is always the anonymous view — there is no bearer on the server, so it cannot know
 * who is asking. What must not happen is the action row flipping from "Follow · Message" to "Custom
 * profile" a beat later. So while ownership is `'unknown'` the row is a fixed-height `aria-busy`
 * block: nothing wrong is ever shown, and nothing moves when the answer arrives.
 *
 * Tabs are appended rather than replaced for the same reason — `live` joins the end when ownership
 * resolves to owner, which never displaces a tab the reader may already have selected.
 */
export function ChannelView({
    slug,
    /** What the server's fetch did. `ChannelSkeleton` covers the rest. */
    fetchStatus,
}: {
    slug: string
    fetchStatus: ChannelFetchStatus
}) {
    const { currentUser } = useAuth()
    const { channel, isLoading, isError, refetch } = useChannel(slug)
    const ownership = useChannelOwnership(channel)
    const isOwner = ownership === 'owner'
    const { isConfirmed, confirm } = useNsfwConsent(slug)
    /**
     * The account-level escape hatch, alongside the per-channel one. Legacy's gate carries a "Disable
     * filtering" checkbox that writes `nsfw_settings.show_sensitive`, so someone who has turned
     * filtering off must not be gated at all — per-channel consent alone would ask them again on every
     * space they visit.
     */
    const showsSensitive = accountShowSensitive(currentUser)

    const visibility = channel
        ? channelVisibility({
              channel,
              ownership,
              nsfwConfirmed: isConfirmed || showsSensitive,
          })
        : null

    /** Terminal screens show no numbers, so there is nothing to fetch for them. */
    const { stats } = useChannelStats(slug, {
        enabled: Boolean(visibility && showsChannelTabs(visibility)),
    })

    // The server fetched nothing usable and the client has not answered yet.
    if (!channel) {
        if (isLoading) return <ChannelSkeleton />
        return (
            <>
                {/* The bar comes first here too — an error page with no way back is a dead end, and
                    the back button needs nothing from the channel that failed to load. */}
                <ChannelTopBarSkeleton />
                <div className={cn(CHANNEL_CONTAINER, 'px-3 py-6 md:px-0')}>
                    <ChannelError
                        // A refused request and an outage read differently to a person: one is "not
                        // for you", the other is "try again". `isError` covers a client failure.
                        kind={
                            isError || fetchStatus === 'unavailable' ? 'unavailable' : 'restricted'
                        }
                        onRetry={() => refetch()}
                    />
                </div>
            </>
        )
    }

    if (!visibility) return <ChannelSkeleton />

    /*
     * **A wall is a viewer's answer, and during bootstrap everyone is a viewer.**
     *
     * `channelVisibility` maps `ownership: 'unknown'` to the viewer's view on purpose — the
     * server has no bearer, so that is the honest answer for a crawler. But `useChannelOwnership`
     * reports `'unknown'` on every client load until the session resolves, which means a creator
     * reloading their own unpublished space read "This is an unpublished space · Return to home"
     * — their own page, telling them to go home — before the shell and the publish banner
     * appeared. Same for a protected space, and an owner's own NSFW gate.
     *
     * This is the exact flash the tri-state was introduced for, one level up from where it was
     * fixed: `channel-view` placeholdered the *action row* and left the *page* guessing. The
     * action row's reasoning applies with more force here, because what is being guessed wrong
     * is the whole screen rather than two buttons.
     *
     * `normal` is deliberately not included: a public channel is the same page for everyone, so
     * a crawler and a first paint both get real content and nothing is deferred. Every state
     * this does defer is already `isIndexableChannel === false` (`channel-seo.ts`), so no page
     * that search may index is answered with a skeleton.
     */
    if (ownership === 'unknown' && visibility.kind !== 'normal') return <ChannelSkeleton />

    const actions =
        ownership === 'unknown' ? (
            /*
             * Fixed height, matching the DS `size="large"` button (48). A collapsing placeholder
             * would move the tab strip under the reader's thumb.
             *
             * It used to be an empty `<div>`, on the reasoning that `'unknown'` was a narrow state
             * only a signed-in non-owner could reach. It is not: `useChannelOwnership` now answers
             * `'unknown'` for **everyone** until the session bootstrap resolves, which is what stops
             * a creator's own space from flashing "Follow". So this slot is on screen for a beat on
             * every load, and a 48px hole reads as a broken layout where a bar reads as loading.
             */
            <Skeleton aria-busy="true" h={48} className="w-full rounded-[var(--radius-lg)]" />
        ) : isOwner ? (
            <ChannelOwnerActions channel={channel} />
        ) : (
            <ChannelViewerActions channel={channel} />
        )

    return (
        <>
            <ChannelTopBar channel={channel} />

            <div className={cn(CHANNEL_CONTAINER, 'flex flex-1 flex-col pb-16')}>
                {/*
                 * A terminal state renders identity and an explanation and **nothing else** — no
                 * cover, no stats, no tabs, no action row. `channelVisibility` decided that once,
                 * so this is a single branch rather than the pair of independently-computed
                 * booleans legacy uses (`isShowChannelStats` / `isShowSecondaryData`), which is how
                 * those two drifted apart.
                 */}
                {visibility.kind !== 'normal' && visibility.kind !== 'owner-unpublished' ? (
                    <ChannelStateScreen
                        channel={channel}
                        visibility={visibility}
                        onConfirmNsfw={confirm}
                    />
                ) : (
                    <>
                        <ChannelHeader channel={channel} stats={stats} actions={actions} />
                        {/*
                         * The `owner-unpublished` half of the state table, and the only state
                         * that renders the whole shell *and* something extra. It sits between
                         * the header and the tabs so it is the first thing under the action
                         * row — see `channel-publish-banner.tsx` for why the tabs stay.
                         */}
                        {visibility.kind === 'owner-unpublished' && (
                            <div className="px-3 pb-3 md:bg-(--background-surface) md:px-6 md:pb-6">
                                <ChannelPublishBanner channel={channel} />
                            </div>
                        )}
                        {/*
                         * The owner's promo strip, in legacy's slot: after the action row, before
                         * the tabs. Published spaces only — `owner-unpublished` already has one
                         * thing to say above the tabs, and a campaign is not it.
                         */}
                        {isOwner && visibility.kind === 'normal' && <ChannelCampaignBanners />}
                        <ChannelTabs channel={channel} isOwner={isOwner} />
                    </>
                )}
            </div>
        </>
    )
}

/**
 * The whole-page skeleton, exported because three places need the same shape: this component's own
 * loading branch, the route's `loading.tsx`, and `/my-space` while it resolves where to send you.
 *
 * **Includes the bar.** Leaving it out shifted the page down by exactly 60px the moment the channel
 * resolved — and since `loading.tsx` renders this, that jump was the first thing a visitor saw. The
 * skeleton has to reserve every fixed-height thing the loaded state renders, not just the parts that
 * happen to be inside the container.
 *
 * No hooks, so it renders on the server.
 */
export function ChannelSkeleton() {
    return (
        <>
            <ChannelTopBarSkeleton />
            <div className={cn(CHANNEL_CONTAINER, 'flex flex-1 flex-col pb-16')}>
                <ChannelHeaderSkeleton />
                {/*
                 * The tab strip and a panel's worth of rows. Without them the skeleton ended at the
                 * action row while the real page continues with a 48px track and a list — so the
                 * whole navigation appeared out of nothing on resolve. See
                 * `channel-tabs-skeleton.tsx`; `/dev/space` is where the two get compared.
                 */}
                <ChannelTabsSkeleton />
            </div>
        </>
    )
}
