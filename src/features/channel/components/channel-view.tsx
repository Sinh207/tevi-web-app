'use client'

import { useBandPassed } from '@shared/hooks/use-band-passed'
import { cn } from '@shared/lib/utils'
import { ListSeparator } from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '../hooks/use-channel'
import { useChannelOwnership } from '../hooks/use-channel-ownership'
import { useChannelStats } from '../hooks/use-channel-stats'
import {
    channelVisibility,
    showsChannelActions,
    showsChannelStats,
    showsChannelTabs,
} from '../lib/channel-flags'
import type { ChannelFetchStatus } from '../lib/channel-seo'
import { CHANNEL_COLUMN, CHANNEL_CONTAINER } from '../lib/container'
import { ChannelAutoFollow } from './channel-auto-follow'
import { ChannelCampaignBanners } from './channel-campaign-banners'
import { ChannelError } from './channel-error'
import { ChannelHeader } from './channel-header'
import { ChannelHeaderSkeleton } from './channel-header-skeleton'
import { ChannelLiveRedirect } from './channel-live-redirect'
import { ChannelNsfwGate } from './channel-nsfw-gate'
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
 * | action row | Custom profile · Earning report | Member · Donate · Follow · (message, later) |
 * | tab set | posts · media · **live** · about | posts · media · about |
 * | **About blocks** | Details · Badges · **MCN** · (activity feed) | **Donate** · Details · Badges |
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
/**
 * Has this browser already hydrated a page from server HTML?
 *
 * Module scope, because it is a fact about the **document**, not about any component: the App
 * Router keeps one JS instance across client-side navigations, so a `ChannelView` that mounts after
 * this flips is one that mounted with no server markup behind it.
 *
 * It exists to tell two situations apart that otherwise look identical from inside the component,
 * and which want opposite treatment while the viewer's own body is still in flight:
 *
 * - **A hard load.** The server already painted this page — the public view, since it has no bearer.
 *   Replacing that with a skeleton would be the very stutter this is meant to remove, one step
 *   earlier.
 * - **A client-side navigation** (a tap in Following, a link from search). Nothing is on screen yet,
 *   so waiting costs a beat of skeleton and buys a screen that is right the first time it appears.
 */
let hasHydrated = false

export function ChannelView({
    slug,
    /** What the server's fetch did. `ChannelSkeleton` covers the rest. */
    fetchStatus,
}: {
    slug: string
    fetchStatus: ChannelFetchStatus
}) {
    const { channel, isViewerKnown, isLoading, isError, refetch } = useChannel(slug)
    const ownership = useChannelOwnership(channel)
    const isOwner = ownership === 'owner'
    /*
     * Read once, at mount — the value has to describe *this* mount and must not change under the
     * component, or the page would swap itself out mid-visit. The effect flips the module flag for
     * whatever mounts next.
     */
    const [mountedAfterHydration] = useState(() => hasHydrated)
    useEffect(() => {
        hasHydrated = true
    }, [])
    /**
     * Whether the sensitive-content gate has been satisfied.
     *
     * A plain boolean, and the decision lives in `features/nsfw`: the gate's panel owns both routes
     * past it — an age confirmation for this space, or turning the account's filtering off — reads
     * back a stored answer on mount, and reports through `onAllowed`. This page holds no consent
     * logic at all, which is what lets a live event and a post ask the identical question.
     *
     * Starts `false` on the server and on the first client render, so a stored `yes` costs a flash
     * of the gate. That is the safe direction; the other one flashes the content.
     */
    const [nsfwAllowed, setNsfwAllowed] = useState(false)
    const allowNsfw = useCallback(() => setNsfwAllowed(true), [])
    const visibility = channel
        ? channelVisibility({
              channel,
              ownership,
              nsfwConfirmed: nsfwAllowed,
          })
        : null

    /**
     * The header renders in every state — that is legacy's arrangement, `<Info />` above the branch
     * — but the **numbers** are their own question, and legacy answers it with `isShowChannelStats`:
     * no strip for a suspended, unpublished, protected or blocked-by-you space. See
     * `showsChannelStats`, which is that rule — asked of the resolved `visibility` rather than of the
     * payload, so the owner of a protected space and a visitor who has followed one both keep their
     * figures where legacy blanks them. It still takes the channel for the one state where the two
     * disagree in the leaking direction; its docstring has that case.
     *
     * `enabled` follows it, so a suspended space costs no stats request. Same shape legacy uses: its
     * effect is guarded by the same flag it renders on.
     */
    const showStats = Boolean(channel && visibility && showsChannelStats(channel, visibility))
    const { stats } = useChannelStats(slug, { enabled: showStats })
    /*
     * Below `sm` the bar is drawn over the cover and changes paint once the cover has scrolled out
     * from under it (`ChannelTopBar`). The cover's last pixel answers that and the bar renders it,
     * so the answer lives here, above both.
     */
    const cover = useBandPassed()

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

    /**
     * **Decide the screen once.** Until the body was fetched for *this* account, every
     * viewer-relative field on it is the server's no-bearer answer — `is_nsfw`, `is_followed`,
     * `follow_requested` and both blocks — so a screen chosen from it is a guess, and a guess that
     * turns out wrong is a page that appears and then takes itself away.
     *
     * That was reported twice from the same root: the auto-follow bar flashing for a reader who
     * already follows the space (arriving from Following, where they follow by definition), and a
     * sensitive space showing its real content before the gate. Both are the same sentence — the
     * first paint answered a question about the reader using a body that knows nothing about them.
     *
     * **Only for a mount with nothing behind it** (`mountedAfterHydration`). On a hard load the
     * server has already painted the public view, and blanking it here would trade one stutter for
     * a worse one; that path still corrects itself when the account body lands, which is the cost of
     * server-rendering a page whose answer depends on who is asking. On a client-side navigation
     * there is no such paint to protect, so the skeleton stands until the answer is real.
     *
     * `ChannelSkeleton` is the right thing to hold: it is the same shape as the page it precedes
     * (`channel-header-skeleton.tsx`, matched to the header pixel for pixel from `md` up), so the
     * screen that follows lands on top of it rather than pushing it around.
     */
    if (mountedAfterHydration && !isViewerKnown) return <ChannelSkeleton />

    /**
     * The action row, and **a sensitive space gets none of it**.
     *
     * `ChannelViewerActions` is Become-a-member and Donate (Message when it lands), and every one of
     * those acts on content the reader has not agreed to see yet: two of them move money, and the
     * third opens a conversation. Follow is not in this row — it is the fixed bar below, which the
     * sensitive state already excludes — so withholding the row withholds exactly the transactional
     * half and leaves identity alone.
     *
     * The header renders nothing in its place: `{actions}` is a bare slot in a `gap`-ed column, so an
     * absent row collapses rather than leaving the 48px hole a placeholder would.
     */
    const actions = !showsChannelActions(visibility) ? undefined : ownership === 'unknown' ? (
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
        /*
         * `stats` is threaded in for one figure: the membership dialog's "N members" line.
         * The strip above already has it, so the alternative was a second `useChannelStats`
         * inside the action row — which TanStack would dedupe into the same request, but which
         * would put a stats query inside a component that has nothing else to do with stats.
         */
        <ChannelViewerActions channel={channel} memberCount={stats?.member_count ?? null} />
    )

    return (
        <>
            <ChannelTopBar
                channel={channel}
                isOwner={isOwner}
                coverPassed={cover.passed}
                /*
                 * The art behind the bar once the cover is gone — **not** for a sensitive space. Its
                 * cover is fetched as a 64px thumbnail precisely so the full image never reaches the
                 * device, and a backdrop asking for the full-size file would undo that. A closed
                 * space's cover is on the page already (only softened), so it may be reused.
                 */
                backdropSrc={visibility?.kind === 'nsfw' ? null : channel.images.cover}
            />

            <div className={cn(CHANNEL_CONTAINER, CHANNEL_COLUMN)}>
                {/*
                 * A terminal state renders identity and an explanation and **nothing else** — no
                 * cover, no stats, no tabs, no action row. `channelVisibility` decided that once,
                 * so this is a single branch rather than the pair of independently-computed
                 * booleans legacy uses (`isShowChannelStats` / `isShowSecondaryData`), which is how
                 * those two drifted apart.
                 */}
                {
                    <>
                        {/*
                         * Renders nothing. Sits **inside** the shell branch on purpose: a visitor
                         * who cannot see the space's contents — blocked, suspended, a protected
                         * profile they do not follow — must not be forwarded into its live either.
                         * The state screen above is the answer for those, and this would talk over
                         * it. See `isExternalArrival` for who gets forwarded at all.
                         *
                         * `nsfw` is excluded for the same reason, and it is the one case that is not
                         * a wall: the header renders, so without this guard a sensitive space would
                         * forward a visitor straight into the live event whose gate they have not
                         * answered — past the gate, by redirect.
                         */}
                        {visibility.kind !== 'nsfw' && <ChannelLiveRedirect channel={channel} />}
                        <ChannelHeader
                            channel={channel}
                            stats={showStats ? stats : null}
                            actions={actions}
                            isOwner={isOwner}
                            coverEndRef={cover.ref}
                            /*
                             * Cover and avatar go out of focus for three states, at **two
                             * strengths** — the difference is what is being withheld.
                             *
                             * A sensitive space is `strong`: the art is the thing the gate exists
                             * for, so the image is fetched as a 64px thumbnail and no style toggle
                             * brings it back — and `strong` is also what withholds the bio and the
                             * links, so it is the sensitive state's whole switch, not only a filter. A closed space (unpublished, protected) is `soft`:
                             * nothing there is unsafe to look at, it is simply behind a door, so
                             * the real cover is fetched and only softened — enough to read as "not
                             * open" while still showing whose space this is.
                             *
                             * Not the blocked pair or a suspension: those say something about the
                             * *relationship* or about moderation, and the creator's own picture is
                             * not the thing being taken away. Blurring there would read as the
                             * account being hidden rather than the space being closed.
                             *
                             * ⚠ A blur is a **visual** effect, not access control — the URL is still
                             * in the markup. That is exactly why the tabs are not rendered at all
                             * for these states rather than drawn behind something.
                             */
                            blurred={
                                visibility.kind === 'nsfw'
                                    ? 'strong'
                                    : visibility.kind === 'unpublished' ||
                                        visibility.kind === 'protected'
                                      ? 'soft'
                                      : false
                            }
                        />
                        {/*
                         * The `owner-unpublished` half of the state table, and the only state
                         * that renders the whole shell *and* something extra. It sits between
                         * the header and the tabs so it is the first thing under the action
                         * row — see `channel-publish-banner.tsx` for why the tabs stay.
                         */}
                        {visibility.kind === 'owner-unpublished' && (
                            <div className="bg-(--background-surface) px-3 pb-3 md:px-6 md:pb-6">
                                <ChannelPublishBanner channel={channel} />
                            </div>
                        )}
                        {/*
                         * The owner's promo strip, in legacy's slot: after the action row, before
                         * the tabs. Published spaces only — `owner-unpublished` already has one
                         * thing to say above the tabs, and a campaign is not it.
                         */}
                        {isOwner && visibility.kind === 'normal' && <ChannelCampaignBanners />}
                        {/*
                         * Legacy's thick rule between the identity block and whatever follows it —
                         * `content/index.js` puts a `<Divider borderBottomWidth='thick' />` right
                         * here, before the branch, so it lands under the tabs, the walls and the
                         * gate alike.
                         *
                         * The DS ships it: `List/Separator` at `large` is a **6px band** of
                         * `--separator-default`, which is that divider measured. `medium` (1px) is
                         * the hairline between rows inside a list and would read as a mistake here —
                         * the point of this one is that it separates *sections*, not rows.
                         */}
                        <ListSeparator size="large" />
                        {/*
                         * The tabs, or — for a sensitive space whose gate is unanswered — the gate in
                         * their place. Not the tabs *behind* something: the threads, the live list and
                         * their requests do not exist on this render, so nothing is withheld by a
                         * blur that a devtools toggle could take back.
                         */}
                        {visibility.kind === 'nsfw' ? (
                            <ChannelNsfwGate channel={channel} onAllowed={allowNsfw} />
                        ) : showsChannelTabs(visibility) ? (
                            <ChannelTabs channel={channel} isOwner={isOwner} />
                        ) : (
                            /*
                             * A wall, in the tabs' place rather than instead of the page. Legacy
                             * does the same and it is the difference between "this space is
                             * suspended" and "something is wrong with this URL": the identity above
                             * is what tells the visitor they arrived where they meant to.
                             */
                            <ChannelStateScreen channel={channel} visibility={visibility} />
                        )}
                    </>
                }
            </div>

            {/*
             * The follow prompt, replacing the action row's Follow button.
             *
             * **Viewers of a published space only.** An owner cannot follow themselves, and the
             * terminal states (suspended, blocked, protected, NSFW) render a wall whose own CTA is
             * the follow — a bar floating over "This space has been suspended" would be offering to
             * subscribe to something that is not there. `owner-unpublished` is excluded by the same
             * rule: it is the owner's view.
             *
             * It is a sibling of the container rather than a child, because it is `fixed` — nesting
             * it inside a column that scrolls buys nothing and puts it inside that column's
             * stacking context.
             *
             * **`isViewerKnown` is what stops it flashing.** The bar hides itself on
             * `channel.is_followed`, and on the first client render that field comes from the
             * server seed, which has no bearer and therefore says `false` for everybody. So a
             * reader who already follows the space got the prompt for one paint and then watched it
             * vanish — loudest when arriving from the Following list, where they follow by
             * definition. Waiting for the account-scoped body costs a follower nothing (they were
             * never going to see it) and costs everybody else the length of one request, on a
             * prompt that does not act for ten seconds anyway.
             *
             * Same treatment as the action row above, which renders a fixed-height placeholder
             * while ownership is `'unknown'`: nothing account-relative is drawn from a guess.
             */}
            {ownership === 'viewer' && visibility.kind === 'normal' && isViewerKnown && (
                <ChannelAutoFollow channel={channel} />
            )}
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
            <div className={cn(CHANNEL_CONTAINER, CHANNEL_COLUMN)}>
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
