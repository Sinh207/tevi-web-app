'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { FilterMenu } from '@shared/components/filter-menu'
import { StickyTabs } from '@shared/components/sticky-tabs'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { SearchBar } from '@shared/ui/search-bar'
import { type ReactNode, useEffect, useState } from 'react'
import type { MembershipStatus } from '../../api/types'
import { useMyMemberships } from '../../hooks/holdings/use-my-memberships'
import { MY_MEMBERSHIP_BAR_HEIGHT, MY_MEMBERSHIP_CONTAINER } from '../../lib/container'
import { MY_MEMBERSHIP_ART } from '../../lib/illustrations'
import { PAYMENT_METHOD_FILTER_LABELS, PAYMENT_METHOD_FILTERS } from '../../lib/payment-methods'
import { MembershipDetailDialog } from './membership-detail-dialog'
import { MembershipRow } from './membership-row'
import { MyMembershipSkeleton } from './my-membership-skeleton'

/**
 * `/my-membership` — the whole screen, bar included.
 *
 * ## Why the bar is in here and not in `page.tsx`
 *
 * Because the payment filter lives in it. Every other sub-page in this app renders `PageBackBar` from
 * its server component and hands the title straight from `getServerT()`; this one cannot, because the
 * bar's trailing control reads and writes `useMyMemberships`' state — and a server component has no
 * way to reach into a client hook below it. So the page resolves the title on the server (metadata and
 * the `h1` still match on first paint) and hands it down as a prop, and this component owns the
 * sticky wrapper, the bar and everything under it.
 *
 * The DOM is unchanged from when the page owned it: the sticky row is full-bleed with the page's own
 * fill, and the bar's *box* is the content column, so the back button lines up with the rows rather
 * than with the window edge.
 *
 * ## One card, and it starts above the search field
 *
 * The search field, the status tabs and the rows are one surface — see `SURFACE_CARD`. The tabs are
 * the DS `Segmented Control/Underline`, whose 1px rule **is** the separator between the strip and the
 * rows, so nothing else is needed to divide them; the field sits above the strip inside the same card,
 * with the card's own padding.
 *
 * The field used to sit *outside* it, on the page background, with the card starting at the strip.
 * That read as a control floating beside the content rather than as the content's own filter, which
 * is what this fixes.
 *
 * `md:overflow-hidden` is on the **panel** and on `Shell`, never on the card or on `StickyTabs`'s
 * root: `overflow: hidden` makes an element a scroll container, and a `position: sticky` descendant
 * then sticks inside *that* box instead of to the viewport — the trap `PROFILE_PANEL` documents from
 * the other direction. The panel holds nothing sticky, so it can clip freely; the card holds the
 * strip, so it cannot.
 *
 * ## The payment filter is a menu in the bar, not a segmented control
 *
 * It was a DS pill `Segmented Control` (All · Star · Card) sitting above the tabs, which is what legacy
 * draws. Two rows of tabs stacked over one list is a lot of chrome for a screen most people open with
 * three rows in it, and the two rows are not the same *kind* of control — the status tabs switch which
 * list you are looking at, the payment filter narrows the one you are on. Moving the second into the
 * bar leaves one tab strip on the screen and gives the filter the shape it actually has: pick one of
 * three, most people never touch it.
 *
 * `FilterMenu` is the control both ledger screens already use for exactly this, so the menu, its radio
 * semantics and its keyboard handling are not re-implemented here — only the trigger is this screen's,
 * because a bar wants `BarIconButton`'s 40px disc rather than a bare 24px glyph.
 *
 * **`variant="compact"` and the `sliders-simple` glyph, by request**: the reference is the channel Live
 * tab's filter, i.e. legacy's `iconBtnFilter` — a 160-wide panel with a rule between rows and a
 * trailing `check-all` in the brand purple, opened by the tune glyph rather than a funnel. That skin
 * now lives in `FilterMenu` so this screen and the Live tab cannot drift; see its note.
 *
 * The **trigger stays the bar's 40px disc** rather than the reference's 36px rounded square, and that
 * is the one place this deviates: the reference sits in a section header with nothing beside it, while
 * this one sits 300px from a back button that *is* a 40px disc. `BarIconButton`'s own note is about
 * exactly this failure — two controls in one bar that are visibly not the same control. One prop to
 * change if the square is what was meant.
 *
 * **An applied filter has to be visible from outside the menu.** A pill states its own selection; a
 * closed menu does not, so a reader who filtered to Card would see a shorter list with nothing on
 * screen explaining why. Hence the accent fill on the trigger and the filter's name in its accessible
 * label. The reflex — a red `NotificationBadge` dot — is wrong twice: red is this app's error accent,
 * and a dot means "unread", not "on".
 *
 * ## Five states, and the empty one has three different messages
 *
 * DoD §1's loading / error / empty / success, plus **signed out** — a membership belongs to a real
 * account and this app always keeps an anonymous session, so `currentUser` being present says
 * nothing. And "empty" is three states here, because the reader's next move differs: nothing ever
 * joined, nothing matched what they typed, nothing paid the way they filtered. Which one is true is
 * `useMyMemberships`'s answer, not this component's.
 *
 * The signed-out prompt gates the **action** (`useRequireAuth` raises the login dialog) rather than
 * redirecting, per DoD §3 — the URL stays where it is, and signing in leaves the reader on the screen
 * they asked for.
 *
 * ## No "Explore creators" button, and that is deliberate
 *
 * Legacy's empty state ends in a button to `/search`. **That route does not exist in this app yet**,
 * so the button would be a primary call to action that 404s — worse than an empty state that simply
 * explains itself (the rule `ActionRows` and `DonateButton` both state: a control whose only action
 * fails is worse than no control). It is a two-line change here the day search lands.
 *
 * ## What this screen deliberately does not have: the detail sheet
 *
 * Pressing a row in legacy opens a bottom sheet with the tier's benefits, the payment history, and
 * **Cancel membership** / **Undo cancel** (`billy/v3/subscription/my-subscriptions/{id}/cancel/`,
 * `/undo-cancel/`, `/payment-histories/`). That is 900 lines across four components in legacy, it is
 * *shared with the space page's checkout stack*, and it is its own surface — so it is not part of
 * this pass. The row therefore links to the creator's space, which is a real destination, instead of
 * offering a press that opens nothing.
 *
 * Consequence to be honest about: **cancelling is not reachable from this app yet.** The screen is
 * read-only until that sheet lands. Nothing here has to change when it does — the row grows a press
 * target and the hook grows the mutations.
 */
export function MyMembershipView({ title }: { title: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()

    const {
        status,
        setStatus,
        paymentMethod,
        setPaymentMethod,
        search,
        setSearch,
        counts,
        entries,
        isLoading,
        isError,
        isUnreadable,
        isEmpty,
        isSearchEmpty,
        isFilteredEmpty,
        isSignedOut,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        refetch,
        clearFilters,
    } = useMyMemberships()

    /**
     * The sentinel, and the effect that acts on it.
     *
     * `enabled` detaches the observer once there is nothing left to fetch, rather than leaving one
     * attached to an element whose callback would do nothing — and detaching it while a page is in
     * flight is what keeps `inView` from re-firing for the whole duration of the request. `loadMore`
     * is guarded in the hook as well; belt and braces, because the failure here is a request loop
     * rather than a wrong pixel.
     */
    /**
     * The membership the detail dialog is showing, or `null` when it is closed.
     *
     * The **id**, and the row is looked up out of `entries` below.
     *
     * It used to hold the row *object*, on the reading that the dialog paints figures it already has
     * so opening one costs no request. True, and it left a snapshot on screen: cancelling invalidates
     * the list, the list re-renders with `canceled_at` set — and the open dialog kept the old object,
     * so it still read "Next charge" and still offered a live **Cancel** link. Pressing it POSTed
     * `cancel/` a second time for an already-cancelled subscription (the only guard is `isPending`).
     * Legacy does not have this: it feeds its sheet from the refetched list item.
     *
     * An id costs one `find` per render over a page of twenty rows, which is nothing, and it makes the
     * dialog a *view* of the list rather than a copy of a row.
     */
    const [selectedId, setSelectedId] = useState<string | null>(null)

    /**
     * The open row, read out of the **current** list.
     *
     * `null` once the row leaves the list — which is what should happen: a membership that no longer
     * appears under the active filter (a cancel moves nothing, but a *resubscribe* does) has nothing
     * left to show, and closing is more honest than keeping a card that no query would return.
     */
    const selectedMembership = selectedId
        ? (entries.find(entry => entry.id === selectedId) ?? null)
        : null

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    /*
     * There is nothing to filter until there is a list, so the trigger is absent — not disabled —
     * while the session is resolving or when there is no account. A disabled control in a bar is a
     * permanent 40px of dead space; an absent one leaves the bar looking the way it will look.
     */
    const canFilter = !isBootstrapping && !isSignedOut
    /** `null` when the filter is "All", which is what decides the trigger's accent. */
    const activeFilter =
        paymentMethod === '' ? null : t(PAYMENT_METHOD_FILTER_LABELS[paymentMethod])

    const body = renderBody()

    return (
        <>
            {/* Opaque and sticky, as on `/my-star` and `/settings/blocked-accounts`: the content
                scrolls under the bar, so a transparent one would show rows through the title. No
                hairline — the card below brings its own edge from `md`, and a full-bleed rule across a
                screen whose content is already a bounded surface only draws a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={title}
                    className={MY_MEMBERSHIP_CONTAINER}
                    actions={
                        canFilter ? (
                            <FilterMenu
                                testId="membership-filter"
                                options={PAYMENT_METHOD_FILTERS.map(filter => ({
                                    key: filter,
                                    label: t(PAYMENT_METHOD_FILTER_LABELS[filter]),
                                }))}
                                value={paymentMethod}
                                onChange={setPaymentMethod}
                                /* Unused: the supplied trigger brings its own name. Passed because
                                   the prop is required, and the string is the right one if the
                                   trigger is ever dropped. */
                                triggerLabel={t('my_membership_filter_trigger')}
                                variant="compact"
                                trigger={
                                    <BarIconButton
                                        data-testid="membership-filter-trigger"
                                        name="sliders-simple"
                                        /*
                                         * The name **says which filter is on**, because the glyph
                                         * cannot: `sliders-simple` ships in one weight only, so there
                                         * is no filled form to swap to, and the accent fill below is
                                         * invisible to a screen reader.
                                         */
                                        label={
                                            activeFilter
                                                ? t('my_membership_filter_trigger_active', {
                                                      value: activeFilter,
                                                  })
                                                : t('my_membership_filter_trigger')
                                        }
                                        /*
                                         * `hover:not-disabled:` matches `BarIconButton`'s own
                                         * specificity, or its surface hover would win over this
                                         * fill on pointer-over and the button would flash back to
                                         * looking unfiltered.
                                         */
                                        className={cn(
                                            activeFilter &&
                                                'bg-(--accents-indigo-active) text-(--text-on-accent) hover:not-disabled:bg-(--accents-indigo-active)',
                                        )}
                                    />
                                }
                            />
                        ) : undefined
                    }
                />
            </div>

            {/*
             * No side padding — the panel is full-bleed below `md` and the search bar above it carries
             * its own inset (see `MY_MEMBERSHIP_CONTAINER`). `md:pb-6` is what leaves the card's bottom
             * two corners something to be seen against.
             *
             * **No top padding either.** It carried `pt-2`, which put an 8px band of page background
             * between the bar and the card — a gap that only reads as a gap while the page is scrolled
             * to the top, and reads as a misalignment the rest of the time, since the content scrolls
             * *under* the bar anyway. The card meets the bar instead, which is what
             * `/settings/blocked-accounts` already does and the same reasoning `PROFILE_PANEL` gives
             * for dropping its own `md:mt-4`.
             */}
            <div className={`${MY_MEMBERSHIP_CONTAINER} flex flex-1 flex-col md:pb-6`}>{body}</div>

            {/*
             * Mounted once for the screen, not once per row: a dialog per row is a portal, a focus trap
             * and a query hook per row, for a control only one of which can ever be open. `selected` is
             * what decides both whether it is open and which membership it shows.
             */}
            <MembershipDetailDialog
                membership={selectedMembership}
                onOpenChange={open => {
                    if (!open) setSelectedId(null)
                }}
            />
        </>
    )

    /**
     * Everything below the bar.
     *
     * A function rather than early returns, because the bar has to render in every state and the
     * branches are exclusive — the alternative is repeating the bar in six places or wrapping the
     * whole thing in a nest of ternaries. It closes over the hook's values and calls no hooks itself,
     * so it is a code-organisation choice with no behaviour of its own.
     */
    function renderBody(): ReactNode {
        /*
         * The session has not resolved yet, so "signed out" is not yet true — showing the sign-in
         * prompt here would flash it at every signed-in visitor on every load. The skeleton is the
         * honest answer to "we do not know yet".
         */
        if (isBootstrapping) {
            return (
                <Shell>
                    <MyMembershipSkeleton />
                </Shell>
            )
        }

        if (isSignedOut) {
            return (
                <Shell>
                    <Message>
                        <ChannelEmptyState
                            className={RISE}
                            icon="users-simple-alt"
                            title={t('my_membership_signed_out_title')}
                            body={t('my_membership_signed_out_body')}
                            action={
                                /*
                                 * The action *is* the gate: `useRequireAuth` opens the login dialog
                                 * when there is no real account and runs the callback when there is —
                                 * and by then there is nothing left to do, because the queries un-gate
                                 * themselves and this whole branch stops rendering. Hence the empty
                                 * callback: the button is honestly "sign in", not "sign in and then X".
                                 */
                                <Button
                                    data-testid="membership-sign-in"
                                    variant="primary"
                                    size="large"
                                    onClick={requireAuth(() => undefined)}
                                >
                                    {t('auth_sign_in')}
                                </Button>
                            }
                        />
                    </Message>
                </Shell>
            )
        }

        /**
         * Which rows draw a hairline above them: every row but the first.
         *
         * Plain `index > 0`, unlike `BlockedAccountsView`'s carried flag — that list has rows
         * animating *out* at nearly zero height, so it cannot count mounted rows. Nothing leaves this
         * list without a refetch, so there is no such state to guard against.
         */
        const panel = (
            <div className="md:overflow-hidden md:rounded-b-[var(--radius-xl)]">
                {isLoading ? (
                    <MyMembershipSkeleton />
                ) : /*
                 * `isUnreadable` is checked **with** `isError` and before every empty state: the
                 * server answered, so nothing threw, but it sent a page of rows this client could
                 * not read one of. That is a failure on our side of the wire, and the three empty
                 * states below would each blame the reader for it — "you have not joined any",
                 * "nothing matched your filter". Same copy and the same retry as a failed request,
                 * because from the reader's side it is the same event.
                 */
                isError || isUnreadable ? (
                    <Message>
                        <ChannelEmptyState
                            className={RISE}
                            icon="exclamation-diamond"
                            tone="error"
                            title={t('my_membership_error_title')}
                            body={t('my_membership_error_body')}
                            action={
                                <Button
                                    data-testid="membership-retry"
                                    variant="secondary"
                                    size="large"
                                    onClick={refetch}
                                >
                                    {t('common_retry')}
                                </Button>
                            }
                        />
                    </Message>
                ) : isSearchEmpty ? (
                    <Message>
                        {/* Copy only, art shared with the states below — the design's own note is
                            that these differ by wording, and a second drawing to say the same thing
                            is not worth a request. */}
                        <ChannelEmptyState
                            className={RISE}
                            art={MY_MEMBERSHIP_ART.empty}
                            title={t('my_membership_no_results_title')}
                            body={t('my_membership_no_results_body')}
                        />
                    </Message>
                ) : isFilteredEmpty ? (
                    <Message>
                        <ChannelEmptyState
                            className={RISE}
                            art={MY_MEMBERSHIP_ART.empty}
                            title={t('my_membership_filtered_empty_title')}
                            body={t('my_membership_filtered_empty_body')}
                            action={
                                /* The one empty state with an action, because it is the one whose
                                   cause is a control the reader can reach — and that control is now
                                   a closed menu in the bar, which makes the button the faster way
                                   back. */
                                <Button
                                    data-testid="membership-clear-filters"
                                    variant="secondary"
                                    size="large"
                                    onClick={clearFilters}
                                >
                                    {t('my_membership_clear_filter')}
                                </Button>
                            }
                        />
                    </Message>
                ) : isEmpty ? (
                    <Message>
                        <ChannelEmptyState
                            className={RISE}
                            art={MY_MEMBERSHIP_ART.empty}
                            title={t('my_membership_empty_title')}
                            body={t('my_membership_empty_body')}
                        />
                    </Message>
                ) : (
                    <>
                        {/* A list of things, announced as one. A stack of `<div>`s says none of that
                            to a screen reader, which is what legacy ships. */}
                        <ul className="list-none">
                            {entries.map((membership, index) => (
                                <MembershipRow
                                    key={membership.id}
                                    membership={membership}
                                    rule={index > 0}
                                    onOpen={() => setSelectedId(membership.id)}
                                    /*
                                     * The stagger is a **first-paint** flourish, so only the first
                                     * screen gets one. Rows appended by pagination mount below the
                                     * fold and are scrolled to, not revealed — a delay there makes
                                     * them look late rather than orderly. 40ms rather than 60,
                                     * because ten rows at 60 would still be arriving 600ms in.
                                     */
                                    enterDelay={index < 10 ? index * 40 : 0}
                                    locale={currentLanguage}
                                />
                            ))}
                        </ul>

                        {/* Zero-height and outside the list, so it is neither a row nor a tab stop. */}
                        <div ref={sentinelRef} aria-hidden="true" className="h-px" />

                        {isFetchingNextPage && (
                            <div className="flex items-center justify-center py-6">
                                <Loader label={t('common_loading')} />
                            </div>
                        )}
                    </>
                )}
            </div>
        )

        /*
         * Both tabs are handed the **same** node, and that is correct rather than a shortcut:
         * `mountAll={false}` means only the open tab's panel is mounted, and which list `panel`
         * renders is decided by `status` — the same state that drives `value`. So the mounted panel
         * always belongs to the tab that is open, and there is never a second one holding stale rows.
         */
        const tabs: { id: MembershipStatus; label: string; panel: ReactNode }[] = [
            { id: 'active', label: t('my_membership_tab_active', { total: counts.active }), panel },
            {
                id: 'expired',
                label: t('my_membership_tab_expired', { total: counts.expired }),
                panel,
            },
        ]

        return (
            /*
             * **The card starts above the search field.** It used to start at the tab strip, with the
             * field sitting on the page background over it — which read as a control floating next to
             * the content rather than as the content's own filter. The field, the tabs and the rows are
             * one surface, so they get one card: `SURFACE_CARD`, rounded from `md`, full-bleed below it.
             *
             * Nothing inside paints a background of its own except the sticky strip, which has to.
             * That is what lets the card's rounded corners show through at the top — a child with a
             * fill would square them off, which is the whole reason the top rounding is *not* on the
             * strip any more.
             */
            <div className={SURFACE_CARD}>
                {/*
                 * The field's own padding, inside the card — 16 on the sides, matching the inset the
                 * DS list row gives its avatar, so the field's edge lines up with the rows below it at
                 * every width. `pb-3` rather than `p-4`: the strip under it brings its own 12 of top
                 * padding, and 16 + 12 between a field and a tab row is a gap you can see.
                 *
                 * Not sticky. Legacy makes all four of its rows sticky and pays for it with hardcoded
                 * pixel offsets at four breakpoints (`top: { xs: '183.5px', md: '192px' }`), which is
                 * wrong the moment any row above changes height. Here only the page's bar and the tab
                 * strip stick, and the strip parks under the bar by the one number both read
                 * (`MY_MEMBERSHIP_BAR_HEIGHT`).
                 */}
                <div className="px-4 pt-4 pb-3">
                    <SearchBar
                        data-testid="membership-search"
                        value={search}
                        onValueChange={setSearch}
                        label={t('my_membership_search_label')}
                        clearLabel={t('my_membership_search_clear')}
                        placeholder={t('my_membership_search_placeholder')}
                    />
                </div>

                <StickyTabs
                    testId="membership-tabs"
                    variant="underline"
                    label={t('my_membership_tabs_label')}
                    stickyOffset={MY_MEMBERSHIP_BAR_HEIGHT}
                    mountAll={false}
                    value={status}
                    onValueChange={id => setStatus(id as MembershipStatus)}
                    tabs={tabs}
                    /* Transparent: the card behind it is the fill. See the note above. */
                    className="min-w-0"
                    /*
                     * The strip is **sticky, so it always needs an opaque fill** — whatever is behind
                     * it scrolls under it, and a transparent sticky row would show the search field
                     * passing through. `StickyTabs` defaults to `bg-(--background)`, which is the
                     * *page's* colour and now the wrong one at every width, so this replaces it with
                     * the card's.
                     *
                     * `px-4` at every width so the strip's rule starts where the rows' text does,
                     * rather than the 24 the channel page uses (its card pads its panels by 24; this
                     * one does not pad its rows at all — the DS list row brings its own 16).
                     *
                     * **No rounding here.** The strip is no longer the card's top edge, and giving it
                     * one would draw a corner in the middle of a surface.
                     */
                    barClassName="bg-(--background-surface) px-4"
                />
            </div>
        )
    }
}

/**
 * The one card everything below the page's bar sits in — the search field, the tab strip and the rows.
 *
 * `--background-surface` at **every** width and rounded only from `md`: below that the content is
 * full-bleed with its own 16px insets, as the mobile app's list is, and the page background is not
 * visible around it. Same values, and the same reasoning, as `/settings/blocked-accounts`' panel —
 * including why it is Surface and not Listing (`--background-listing` is `--black` in Dark, i.e. the
 * same value as `--background`, so a Listing card disappears into the page in one theme only).
 *
 * ⚠ **No `overflow-hidden` here.** The tab strip inside is `position: sticky`, and a clipping ancestor
 * becomes its scroll container — which parks it at the bottom of the card instead of under the page's
 * bar. The trap `PROFILE_PANEL` documents from the other direction. The corners are handled by the two
 * children that actually touch them: the field's wrapper paints nothing, so the top two show through,
 * and the panel rounds the bottom two itself.
 */
export const SURFACE_CARD =
    'flex min-w-0 flex-1 flex-col bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/**
 * The pre-list states — the same card, minus the field and the strip, because there is nothing to
 * search and nothing to switch between when there is no list.
 *
 * It is literally `SURFACE_CARD`, so moving between the states — a signed-out screen that signs in
 * into a skeleton and then into rows — never changes the shape of the page around them.
 */
function Shell({ children }: { children: ReactNode }) {
    return (
        <div
            className={cn(
                SURFACE_CARD,
                // `md:overflow-hidden` so the skeleton's first row cannot paint its square corner over
                // the card's rounded one. Nothing in *this* branch is sticky, so it can clip freely —
                // which is exactly why `SURFACE_CARD` cannot carry it: the branch with the tab strip
                // in it must not become a scroll container. See the panel's note.
                'md:overflow-hidden',
            )}
        >
            {children}
        </div>
    )
}

/**
 * The box a message state sits in: centred, with a floor under it.
 *
 * `min-h-[360px]` is legacy's own number for this screen's `NoData` block, and it is here rather than
 * `flex-1` for a structural reason — `StickyTabs` wraps each panel in its own `div`, which is not part
 * of this component's flex chain, so a `flex-1` inside a panel has nothing to grow against. A floor is
 * the honest way to keep an empty state from being a 90px sliver under a tab strip, and it costs
 * nothing on the states that are taller than it.
 */
function Message({ children }: { children: ReactNode }) {
    return <div className="flex min-h-[360px] flex-col justify-center">{children}</div>
}
