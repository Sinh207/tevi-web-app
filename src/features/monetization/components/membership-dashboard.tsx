'use client'

import { useRequireAuth } from '@features/auth'
import { useCurrency } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { ListHeader, ListHeaderDesc, ListHeaderText, ListHeaderTitle } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { SearchBar } from '@shared/ui/search-bar'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { SubscriberStatus } from '../api/types'
import { useMembershipTierForm } from '../hooks/use-membership-tier-form'
import { useMyMembershipTier } from '../hooks/use-my-membership-tier'
import { useSubscribers } from '../hooks/use-subscribers'
import {
    MEMBERSHIP_LIST_PANEL,
    MEMBERSHIP_PANEL,
    MEMBERSHIP_SCREEN,
    MONETIZATION_CONTAINER,
} from '../lib/container'
import { MEMBERSHIP_ART } from '../lib/illustrations'
import { starPriceOf } from '../lib/membership-tier'
import { MONETIZATION_PATH } from '../routes'
import { AnalyticsBanner } from './analytics-banner'
import { MemberRow } from './member-row'
import { MembershipActionsMenu } from './membership-actions-menu'
import { MembershipDashboardSkeleton } from './membership-dashboard-skeleton'
import { MembershipSetupForm } from './membership-setup-form'
import { MembershipTierCard } from './membership-tier-card'

/**
 * `ListHeader`'s own box: `px-4 py-3` around a 24px line, with its rule drawn as a zero-height
 * `::after`. The same constant `LedgerPanel` stacks its two sticky tiers on — measured from the
 * component rather than guessed, because being one pixel out leaves a sliver of row visible between
 * the two headers on every scroll.
 */
const PANEL_HEADER_HEIGHT = 48

/** Legacy's two tabs, in legacy's order. A table so the labels and the counts cannot drift apart. */
const TABS: SubscriberStatus[] = ['active', 'expired']

/**
 * `/monetization/membership` — the creator's tier and the people paying for it.
 *
 * ## One URL, two screens, and the bar walks between them
 *
 * Legacy holds a `view` state (`'overview' | 'setup'`) and swaps the whole page under one address.
 * Kept, and the bar is therefore **state** rather than page chrome — so it lives here and not in
 * `page.tsx`, exactly as `StarTransferView` does for the same reason. Back means "up one screen"
 * while there is one; from the overview it leaves for `/monetization`.
 *
 * `home={MONETIZATION_PATH}` rather than `/`: legacy's back button pushes the hub explicitly, and a
 * reader who opened this from a link should land there rather than on the feed.
 *
 * ## Four states, and the wall is decided by an *answered* question
 *
 * Signed-out → the sign-in wall. Unknown → the skeleton. **No tier** → the setup wall.
 * A tier → the dashboard. The third and fourth are told apart by `isKnown`, which is why a failed
 * read shows a retry rather than the wall: legacy's `initialize()` sets `hasPackages = false` on any
 * non-200, so one 502 invites a creator with paying members to "start earning".
 *
 * ## The list pages on a sentinel, not on a scroll handler
 *
 * Legacy attaches a `scroll` listener to its own container and measures `scrollTop + clientHeight +
 * 200 >= scrollHeight`, which only works because that container is the scrollport. Here the page
 * scrolls, so the app's own `useInView` sentinel does it — the same mechanism `/my-wallet` and
 * `/my-membership` use, and it costs no scroll work on the main thread.
 */
export function MembershipDashboard({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const [editing, setEditing] = useState(false)

    const tierState = useMyMembershipTier()
    const {
        tier,
        hasTier,
        isKnown,
        isLoading,
        isError,
        refetch,
        save,
        isSaving,
        remove,
        isRemoving,
    } = tierState

    const subscribers = useSubscribers({ enabled: hasTier })
    /*
     * Called once, here, and the unit passed into each row — every member row would otherwise mount
     * its own copy of a hook that answers the same thing for all of them. This is a screen the
     * figures belong to, so the currency list and the rate go out with the page.
     */
    const { currency, rate } = useCurrency()

    const form = useMembershipTierForm({
        tier,
        save,
        isSaving,
        onSaved: () => setEditing(false),
    })

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: subscribers.current.hasNextPage && !subscribers.current.isFetchingNextPage,
    })

    /*
     * Depends on the **function**, not on `subscribers.current` — that object is rebuilt every render,
     * so the effect used to re-run on all of them. `loadMore` is `useCallback`-stable and changes only
     * when its own guard does.
     */
    const loadMore = subscribers.current.loadMore
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    const screen = editing ? 'setup' : 'overview'
    const title = editing
        ? hasTier
            ? t('monetization_membership_edit_title')
            : t('monetization_membership_new_title')
        : t('monetization_membership_title')

    const bar = (
        <div className={cn('sticky top-0 z-20', MEMBERSHIP_SCREEN)}>
            <PageBackBar
                title={title}
                className={MONETIZATION_CONTAINER}
                home={MONETIZATION_PATH}
                // Legacy's switch: up one state while there is one, out of the route only from the
                // overview. `undefined` hands the decision back to the bar's own default.
                onBack={screen === 'setup' ? () => setEditing(false) : undefined}
                actions={
                    screen === 'overview' && tier ? (
                        <MembershipActionsMenu
                            tier={tier}
                            /*
                             * `subscribers.activeCount`, never `subscribers.active.count` — the
                             * second is filtered by the search box on this same screen, and a
                             * non-matching term drives it to `0`, which opens the tier-edit gate on
                             * a billing change. The hook's own field carries the full note.
                             */
                            activeCount={subscribers.activeCount}
                            onEdit={() => setEditing(true)}
                            onDelete={remove}
                            isDeleting={isRemoving}
                        />
                    ) : null
                }
            />
        </div>
    )

    const column = (content: React.ReactNode) => (
        <>
            {bar}
            <div
                className={cn(
                    MONETIZATION_CONTAINER,
                    'flex flex-1 flex-col pb-6',
                    MEMBERSHIP_SCREEN,
                    className,
                )}
            >
                {content}
            </div>
        </>
    )

    if (isLoading) return column(<MembershipDashboardSkeleton />)

    if (isError) {
        return column(
            <ChannelEmptyState
                className={cn('flex-1', MEMBERSHIP_PANEL, RISE)}
                testId="monetization-membership-error"
                tone="error"
                icon="exclamation-circle"
                title={t('monetization_membership_error_title')}
                action={
                    <Button
                        data-testid="monetization-membership-retry"
                        variant="secondary"
                        size="large"
                        onClick={refetch}
                    >
                        {t('common_retry')}
                    </Button>
                }
            />,
        )
    }

    if (!isKnown) {
        // No session: the query never ran. The wall gates the *press*, never the route.
        return column(
            <ChannelEmptyState
                className={cn('flex-1', MEMBERSHIP_PANEL, RISE)}
                testId="monetization-membership-signed-out"
                icon="crown"
                title={t('monetization_membership_signed_out_title')}
                body={t('monetization_membership_signed_out_body')}
                action={
                    <Button
                        data-testid="monetization-membership-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />,
        )
    }

    if (editing) return column(<MembershipSetupForm form={form} className="pt-2" />)

    if (!hasTier) {
        return column(
            <section
                data-testid="monetization-membership-setup-wall"
                className={cn(
                    'flex-1 items-center justify-center gap-3 px-4 py-10 text-center',
                    MEMBERSHIP_PANEL,
                    RISE,
                )}
            >
                <Image
                    src={MEMBERSHIP_ART.overview.src}
                    width={MEMBERSHIP_ART.overview.width}
                    height={MEMBERSHIP_ART.overview.height}
                    alt=""
                    aria-hidden
                    className="h-auto w-[229px] max-w-full"
                />
                <h2 className="type-title-t1-bold m-0 text-(--text-title)">
                    {t('monetization_membership_intro_title')}
                </h2>
                <p className="type-body-default m-0 max-w-[400px] text-(--text-body)">
                    {t('monetization_membership_intro_body')}
                </p>
                <Button
                    data-testid="monetization-membership-start"
                    variant="accent"
                    size="large"
                    className="mt-3 w-full max-w-[400px]"
                    onClick={() => setEditing(true)}
                >
                    {t('monetization_membership_intro_cta')}
                </Button>
            </section>,
        )
    }

    /** `null` while the tab's first page is still out — the label then prints no number at all. */
    const countFor = (tab: SubscriberStatus) =>
        tab === 'active' ? subscribers.active.count : subscribers.expired.count

    const list = subscribers.current

    return column(
        <div className="flex flex-1 flex-col gap-3">
            {/*
             * **First in the content**, which is legacy's own position (`payPerPost/content` renders
             * `<AnalyticsBanner/>` above everything). It sat under the hero for a while on the
             * argument that the tier is what the screen is about; that is a matter for whoever owns
             * the design, and they own it.
             *
             * No `range`: this screen has no date filter, so `/dashboard-analytics` opens on its own
             * default period rather than one invented here.
             */}
            <AnalyticsBanner />

            <MembershipTierCard name={tier?.name ?? ''} starPrice={starPriceOf(tier)} />

            {/*
             * ## `overflow-clip`, and it is load-bearing rather than a synonym for `hidden`
             *
             * This panel was `overflow-hidden`, which clips the rounded corners **and** makes the
             * section a scroll container. The controls below then resolve their `sticky` against
             * *that* scrollport instead of the window — and since the section never scrolls
             * internally (its height is its content) they never moved: the tabs and the search field
             * scrolled away with the rows. `overflow: clip` clips identically, respects the radius
             * identically, and creates no scrollport. `LedgerPanel` carries the same note after the
             * same bug; the symptom is nothing at all, which is why it is written down twice.
             */}
            <section
                className={cn(
                    // `flex-1` so the panel fills the column rather than leaving page colour under a
                    // short list — the same `flex-1` `/my-wallet` gives its ledger, and the reason
                    // the surface reads as the screen's plane on a phone rather than as a band.
                    'flex flex-1 flex-col overflow-clip bg-(--background-surface)',
                    // The one block that runs to the bottom of the screen: full-bleed on a phone, a
                    // card from `md`. See `MEMBERSHIP_LIST_PANEL`.
                    MEMBERSHIP_LIST_PANEL,
                )}
            >
                {/*
                 * `ListHeader`, not a hand-rolled `<h2>` with `border-b`, and the reason is the
                 * offset below rather than tidiness: the DS header draws its rule as an absolutely
                 * positioned `::after`, so the rule adds **no height** and `PANEL_HEADER_HEIGHT`
                 * is exactly what the box measures. A `border-b` makes it 49, and the controls
                 * beneath then park one pixel high — a sliver of row visible above them on every
                 * scroll. `LedgerPanel` stacks its two sticky headers on the same constant.
                 */}
                <ListHeader
                    style={{ top: APP_BAR_HEIGHT }}
                    className="sticky z-10 bg-(--background-surface)"
                >
                    <ListHeaderDesc>
                        <ListHeaderText>
                            <ListHeaderTitle as="h2">
                                {t('monetization_membership_members')}
                            </ListHeaderTitle>
                        </ListHeaderText>
                    </ListHeaderDesc>
                </ListHeader>

                {/*
                 * The whole panel head parks under the page's own sticky bar — the heading above,
                 * the tabs and the search here — so switching status or narrowing the list stays
                 * reachable however far down the reader has scrolled. `LedgerPanel` stacks its
                 * header and its month labels exactly this way.
                 *
                 * Four things this needs and none of them is optional:
                 *
                 * - **`top: APP_BAR_HEIGHT + PANEL_HEADER_HEIGHT`.** Two sticky tiers each need their
                 *   own offset: the heading parks under the 60px `PageBackBar`, and this parks one
                 *   header-height below *that*. Give both the same offset and the controls sit on
                 *   top of the word they belong to.
                 * - **`z-[9]`, under the heading's `z-10`.** The lower tier must pass *behind* the
                 *   upper one as the two meet, not through it.
                 * - **An opaque ground.** A transparent sticky block has rows sliding visibly through
                 *   its text; `--background-surface` is the panel's own fill, so there is no seam
                 *   where it sits at rest.
                 * - **The panel is `overflow-clip`** (see above), or none of this sticks at all.
                 */}
                <div
                    className="sticky z-[9] flex flex-col gap-3 bg-(--background-surface) px-4 pt-4 pb-3"
                    style={{ top: APP_BAR_HEIGHT + PANEL_HEADER_HEIGHT }}
                >
                    {/*
                     * The counts sit **in** the tab, which is what makes querying both statuses on
                     * mount the right call rather than an over-fetch — see `useSubscribers`.
                     */}
                    <SegmentedControl aria-label={t('monetization_membership_members')}>
                        {TABS.map(tab => (
                            <SegmentedControlItem
                                key={tab}
                                data-testid="monetization-membership-tab"
                                data-tab-id={tab}
                                selected={subscribers.status === tab}
                                onClick={() => subscribers.setStatus(tab)}
                            >
                                <SegmentedControlItemLabel>
                                    {t(`monetization_membership_tab_${tab}`)}
                                    {/*
                                     * The count is a **value beside the label**, not interpolated
                                     * into it. Two reasons, and legacy has neither: `count` is
                                     * i18next's plural trigger, so a key using it needs `_one` /
                                     * `_few` / `_many` forms in `ar` or it resolves to nothing; and
                                     * legacy's own `'Active [%s]'.replace('[%s]', '')` leaves a
                                     * trailing space when the tab is empty. Zero prints no number
                                     * at all, which is legacy's behaviour and the right one — a tab
                                     * reading "Expired 0" is noise.
                                     */}
                                    {(countFor(tab) ?? 0) > 0 ? (
                                        <span className="ms-1">
                                            {countFor(tab)?.toLocaleString(currentLanguage)}
                                        </span>
                                    ) : null}
                                </SegmentedControlItemLabel>
                            </SegmentedControlItem>
                        ))}
                    </SegmentedControl>

                    <SearchBar
                        data-testid="monetization-membership-search"
                        value={subscribers.search}
                        onValueChange={subscribers.setSearch}
                        label={t('monetization_membership_search')}
                        clearLabel={t('common_clear')}
                        placeholder={t('monetization_membership_search')}
                    />
                </div>

                {/*
                 * `flex-1` so the states below have room to centre in. The panel already grows to the
                 * foot of the column; without this the *content* wrapper stayed content-height, so an
                 * empty list sat tucked under the search field with the rest of the panel blank
                 * beneath it — the art reading as the top of a list rather than as the whole answer.
                 * Rows are unaffected: they fill from the top either way.
                 */}
                <div className="flex flex-1 flex-col px-4 pb-4">
                    {list.isError ? (
                        /*
                         * The state this screen shipped without. `isEmpty` is false while `isError`
                         * is true, so a failed members read fell through to the rows branch and
                         * rendered an **empty `<div>`** — a blank panel under a working header, with
                         * no message and no way to ask again. DoD §1 asks for all four states, and
                         * this is the one that costs nothing to miss and everything to hit.
                         *
                         * It replaces the list rather than sitting above it, because unlike the
                         * revenue strip on the hub there is nothing left underneath to keep reading.
                         */
                        <div
                            role="alert"
                            data-testid="monetization-membership-members-error"
                            className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
                        >
                            <p className="type-dense-default m-0 max-w-[400px] text-(--text-body)">
                                {t('monetization_membership_members_error')}
                            </p>
                            <Button
                                data-testid="monetization-membership-members-retry"
                                variant="secondary"
                                size="small"
                                onClick={list.refetch}
                            >
                                {t('common_retry')}
                            </Button>
                        </div>
                    ) : list.isLoading ? (
                        <div className="flex flex-1 items-center justify-center py-10">
                            <Loader label={t('common_loading')} />
                        </div>
                    ) : list.isEmpty ? (
                        <div
                            data-testid="monetization-membership-members-empty"
                            className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center"
                        >
                            <Image
                                src={MEMBERSHIP_ART.noMembers.src}
                                width={MEMBERSHIP_ART.noMembers.width}
                                height={MEMBERSHIP_ART.noMembers.height}
                                alt=""
                                aria-hidden
                                className="h-auto w-[190px] max-w-full"
                            />
                            <p className="type-dense-default m-0 max-w-[400px] text-(--text-body)">
                                {/*
                                 * A filtered empty list says so. Legacy prints "No active members
                                 * yet" whatever is in the search box, which tells a creator who
                                 * mistyped a name that they have no members.
                                 */}
                                {subscribers.isFiltered
                                    ? t('monetization_membership_no_match')
                                    : subscribers.status === 'active'
                                      ? t('monetization_membership_no_active')
                                      : t('monetization_membership_no_expired')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {list.rows.map(member => (
                                <MemberRow
                                    key={member.id}
                                    member={member}
                                    currency={currency}
                                    rate={rate}
                                />
                            ))}
                            {list.hasNextPage ? (
                                <div ref={sentinelRef} className="flex justify-center py-4">
                                    {list.isFetchingNextPage ? (
                                        <Loader label={t('common_loading')} />
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </section>
        </div>,
    )
}
