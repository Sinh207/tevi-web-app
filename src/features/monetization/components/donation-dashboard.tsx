'use client'

import { useRequireAuth } from '@features/auth'
import { useCurrency } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { FilterMenu } from '@shared/components/filter-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderDesc, ListHeaderText, ListHeaderTitle } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDonationForm } from '../hooks/use-donation-form'
import { useDonationOverview } from '../hooks/use-donation-overview'
import { useMyDonationSetting } from '../hooks/use-my-donation-setting'
import {
    DONATION_CARD,
    DONATION_PANEL,
    DONATION_SCREEN,
    MONETIZATION_CONTAINER,
} from '../lib/container'
import {
    DONATION_RANGE_DAYS,
    DONATION_RANGES,
    type DonationRange,
    formatDonationRangeLabel,
} from '../lib/donation-setting'
import { DONATION_ART } from '../lib/illustrations'
import { MONETIZATION_PATH } from '../routes'
import { AnalyticsBanner } from './analytics-banner'
import { DonationActionsMenu } from './donation-actions-menu'
import { DonationDashboardSkeleton } from './donation-dashboard-skeleton'
import { DonationSetupForm } from './donation-setup-form'
import { SupporterRow } from './supporter-row'

/**
 * The two selling points legacy lists under the intro paragraph, as data.
 *
 * A table rather than markup, for the reason `methods.ts` gives — and because a bullet list built by
 * hand is where a third point gets a different gap from the first two.
 */
const INTRO_POINTS = [
    'monetization_donation_intro_point_direct',
    'monetization_donation_intro_point_more',
] as const

/**
 * `/monetization/donation` — the creator's donation offer and the people who have paid it.
 *
 * ## One URL, two screens, and the bar walks between them
 *
 * Legacy holds a `view` state (`'overview' | 'setting'`) and swaps the whole page under one address,
 * bar included — it renders `TopBar`/`Content` or `SettingTopBar`/`SettingContent`. Kept, so the bar
 * is **state** rather than page chrome and lives here rather than in `page.tsx`, exactly as
 * `MembershipDashboard` and `StarTransferView` do for the same reason. Back means "up one screen"
 * while there is one; from the overview it leaves for `/monetization`.
 *
 * `home={MONETIZATION_PATH}` because legacy's back button pushes the hub explicitly
 * (`router.push('/monetization')`), so a reader who opened this from a link lands there rather than
 * on the feed.
 *
 * ## Five states, and the wall is decided by an *answered* question
 *
 * Signed-out → the sign-in wall. Unknown → the skeleton. Failed → a retry. **No offer** → the intro
 * wall. An offer → the overview. The last two are told apart by `isKnown`, which is the difference
 * that matters: legacy's `initSetting` reads any non-200 as "no donation setting", so one 502 shows a
 * creator whose offer is live and taking money a wall inviting them to switch the feature on — and
 * pressing *Setting* there opens a **create** form over an offer that already exists.
 *
 * ## The screen keeps the page colour
 *
 * Its overview stacks a bare `--background-surface` tile in the middle of the column and its form is
 * six more of them, so painting the plane below `md` would dissolve the gaps that separate them.
 * `DONATION_CARD` carries the full argument and the reason this differs from `/monetization/membership`
 * one route away.
 *
 * ## The list does not page, because the endpoint does not
 *
 * `donations/` documents one query parameter and legacy renders `results` whole with no scroll
 * handler. So there is no sentinel here and no `loadMore` — see `creatorDonationApi.getDonations`
 * and **B104**.
 */
export function DonationDashboard({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const [editing, setEditing] = useState(false)

    const { setting, hasSetting, isKnown, isLoading, isError, refetch, save, isSaving } =
        useMyDonationSetting()

    const overview = useDonationOverview({ enabled: hasSetting })
    /*
     * Called once here and the unit passed into each row — every supporter row would otherwise
     * mount its own copy of a hook that answers the same thing for all of them. `MembershipDashboard`
     * makes the same call for the same reason.
     */
    const { currency, rate } = useCurrency()

    const form = useDonationForm({
        setting,
        save,
        isSaving,
        onSaved: () => {
            setEditing(false)
            /*
             * **A successful save says so.** Legacy raises this
             * (`messagesContext.success('Donation saved successfully')`) and the port dropped it, so
             * a creator who changed their thank-you message got no confirmation at all: leaving the
             * form is the only thing that happens, and the overview shows supporters rather than the
             * offer, so nothing on the screen they land on reflects the edit.
             *
             * It is a **toast and not an in-form message** precisely because the form closes — the
             * one place it could be written is the view being left. That is the mirror of the
             * failure path, which stays *in* the form (`docs/API_ERRORS.md`): a refusal has
             * somewhere to point and a success does not.
             *
             * Legacy's `/monetization/membership` raises nothing here and neither does ours — the
             * silence there is parity, not an oversight.
             *
             * The `id` collapses a rapid second save into one toast rather than stacking two, the
             * same call `privacy-settings` makes for its copy confirmation.
             */
            toast.success(t('monetization_donation_saved'), { id: 'monetization-donation-saved' })
        },
    })

    const screen = editing ? 'setting' : 'overview'
    const title = editing
        ? t('monetization_donation_setting_title')
        : t('monetization_donation_title')

    /**
     * Which views are painted as a surface plane below `md` — **everything except the overview**.
     *
     * - The three **walls** (failure, signed-out, no offer yet) are single blocks, and §6's
     *   single-panel rule applies to them unchanged: a wall floating on `--background` where content
     *   used to be reads as a page that failed.
     * - The **setting form** joins them, and that is the change this flag exists to carry. It was
     *   built as a stack of cards on page colour, which made a phone pay the gutter twice — once for
     *   the column and once for each card — and render its fields 326px wide on a 390px screen. It is
     *   now a plane with full-bleed bands on it (`DONATION_FORM_SECTION`), which is worth 32px of
     *   every field on the screen a creator does their typing on.
     * - The **overview** is the one view that keeps the page colour, because its supporter tile is a
     *   bare surface card floating mid-column and the `gap-3` around it *is* its separation.
     *   `DONATION_CARD` carries that argument.
     *
     * `isLoading` is excluded because the skeleton draws the overview, not a wall — painting the
     * plane under it would change the page's colour the moment the data landed, under a skeleton
     * that was otherwise correct.
     */
    const paintsPlane = !isLoading && (isError || !isKnown || editing || !hasSetting)

    const bar = (
        <div
            className={cn('sticky top-0 z-20', paintsPlane ? DONATION_SCREEN : 'bg-(--background)')}
        >
            <PageBackBar
                title={title}
                className={MONETIZATION_CONTAINER}
                home={MONETIZATION_PATH}
                // Legacy's switch: up one state while there is one, out of the route only from the
                // overview. `undefined` hands the decision back to the bar's own default.
                onBack={screen === 'setting' ? () => setEditing(false) : undefined}
                actions={
                    screen === 'overview' && setting ? (
                        <DonationActionsMenu setting={setting} onEdit={() => setEditing(true)} />
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
                    'flex flex-1 flex-col',
                    /*
                     * The form is the one view with **no bottom padding on the column**, because its
                     * Save bar is `sticky bottom-0` and owns that space itself. A `pb-6` here would
                     * sit *below* the bar's sticky container, so at the end of the scroll the bar
                     * would un-stick and hop 24px up off the bottom edge — a jump with no cause the
                     * reader can see. See `DONATION_FORM_FOOTER`.
                     */
                    !editing && 'pb-6',
                    paintsPlane && DONATION_SCREEN,
                    className,
                )}
            >
                {content}
            </div>
        </>
    )

    if (isLoading) return column(<DonationDashboardSkeleton />)

    if (isError) {
        return column(
            <ChannelEmptyState
                className={cn('flex-1', DONATION_PANEL, RISE)}
                testId="monetization-donation-error"
                tone="error"
                icon="exclamation-circle"
                title={t('monetization_donation_error_title')}
                action={
                    <Button
                        data-testid="monetization-donation-retry"
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
                className={cn('flex-1', DONATION_PANEL, RISE)}
                testId="monetization-donation-signed-out"
                icon="dollar-circle"
                title={t('monetization_donation_signed_out_title')}
                body={t('monetization_donation_signed_out_body')}
                action={
                    <Button
                        data-testid="monetization-donation-sign-in"
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

    /*
     * No top inset. The bar already carries the gap between itself and the content, and a `pt-3`
     * here added a second one — the form's first card sat further from the bar than every other
     * view's first block, which reads as the screen having shifted rather than as breathing room.
     */
    if (editing) return column(<DonationSetupForm form={form} />)

    if (!hasSetting) {
        return column(
            <section
                data-testid="monetization-donation-intro"
                className={cn(
                    /*
                     * `justify-center`, so the wall sits in the middle of the panel rather than at
                     * the top of it with the rest of the screen blank underneath. That is what
                     * `ChannelEmptyState` does for the other three walls on this screen — it carries
                     * `items-center justify-center` in its own base — and this one is hand-built
                     * because legacy's intro is a paragraph, a headed list and a CTA rather than the
                     * title/body/action that component takes. Being hand-built is exactly why it had
                     * to be given the centring by hand, and why it was the only wall missing it.
                     */
                    'flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center',
                    DONATION_PANEL,
                    RISE,
                )}
            >
                <Image
                    src={DONATION_ART.intro.src}
                    width={DONATION_ART.intro.width}
                    height={DONATION_ART.intro.height}
                    alt=""
                    aria-hidden
                    className="h-auto w-[374px] max-w-full"
                />
                <p className="type-body-default m-0 max-w-[400px] text-(--text-title)">
                    {t('monetization_donation_intro_body')}
                </p>
                <div className="flex w-full max-w-[400px] flex-col gap-2 text-start">
                    <h2 className="type-body-strong m-0 text-(--text-title)">
                        {t('monetization_donation_intro_points_title')}
                    </h2>
                    {INTRO_POINTS.map(key => (
                        <div key={key} className="flex items-start gap-2">
                            {/*
                             * Decorative: the sentence beside it is the whole content, and a
                             * screen reader announcing "check mark" before each of two selling
                             * points is noise. `--text-brand` because it is a *mark* and clears
                             * 3:1 in both modes — the split `BRAND_NOTICE` documents.
                             */}
                            <Icon
                                name="check"
                                size={20}
                                aria-hidden
                                className="mt-0.5 flex-none text-(--text-brand)"
                            />
                            <p className="type-body-default m-0 text-(--text-body)">{t(key)}</p>
                        </div>
                    ))}
                </div>
                <Button
                    data-testid="monetization-donation-start"
                    variant="accent"
                    size="large"
                    className="mt-2 w-full max-w-[400px]"
                    onClick={() => setEditing(true)}
                >
                    {t('monetization_donation_intro_cta')}
                </Button>
            </section>,
        )
    }

    const rangeLabel = (range: DonationRange) =>
        range === '7d'
            ? t('monetization_donation_range_days', { days: DONATION_RANGE_DAYS })
            : t('monetization_donation_range_month')

    return column(
        <div className="flex flex-1 flex-col gap-3">
            {/*
             * The range travels with the reader: legacy hands `/dashboard-analytics` the window the
             * table is currently filtered to, so pressing it continues the question rather than
             * restarting it. `bounds` is recomputed per render, so a dashboard left open across
             * midnight deep-links today's window rather than the one it opened on.
             */}
            <AnalyticsBanner range={overview.bounds} />

            <div className="flex flex-none items-center justify-between gap-3">
                <span className="type-dense-emphasis text-(--text-title)">
                    {formatDonationRangeLabel(overview.range, currentLanguage)}
                </span>
                {/*
                 * `FilterMenu`'s `compact` skin — legacy's own filter panel, whose numbers are
                 * known, and the same one both ledger screens and `/my-membership` use. Its
                 * `trigger` slot takes this chip so the menu is shared and the control is the
                 * page's: legacy draws a 12px label in a bordered pill with a chevron, which is not
                 * any of the three triggers that component ships.
                 *
                 * `active` is not passed, and that is deliberate rather than an omission: this list
                 * has **no unfiltered state** — one of the two ranges is always on — which is the
                 * `/following` sort case that component's own note calls out. A permanently-filled
                 * trigger would say "a filter is on" about a control that can never be off.
                 */}
                <FilterMenu
                    variant="compact"
                    /*
                     * The base id both halves derive from: the options are `…-option` (each
                     * carrying `data-option-key`) and the trigger below is `…-trigger`, which it has
                     * to name itself — `FilterMenu` hands a supplied element straight through, on
                     * the rule that whoever renders an element owns its id.
                     */
                    testId="monetization-donation-range"
                    triggerLabel={t('monetization_donation_range_label')}
                    value={overview.range}
                    onChange={key => overview.setRange(key as DonationRange)}
                    options={DONATION_RANGES.map(range => ({
                        key: range,
                        label: rangeLabel(range),
                    }))}
                    trigger={
                        <button
                            type="button"
                            data-testid="monetization-donation-range-trigger"
                            aria-label={t('monetization_donation_range_label')}
                            className={cn(
                                'type-caption-label-strong flex h-7 cursor-pointer items-center gap-0.5',
                                'rounded-lg border border-(--button-secondary-border) bg-(--button-ghost-bg) ps-2 pe-1',
                                'text-(--text-title) transition-colors hover:bg-(--background-subtle)',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                            )}
                        >
                            {rangeLabel(overview.range)}
                            <Icon name="angle-down" size={16} aria-hidden />
                        </button>
                    }
                />
            </div>

            <div
                data-testid="monetization-donation-supporter-count"
                className={cn('flex flex-none flex-col gap-1 p-4', DONATION_CARD)}
            >
                <span className="type-body-strong text-(--text-subtitle)">
                    {t('monetization_donation_total_supporters')}
                </span>
                {overview.supporterCount === null ? (
                    // Neither read has answered. A placeholder rather than `0`, which would be a
                    // claim about the creator's audience that nothing has established.
                    <Skeleton w={64} h={26} />
                ) : (
                    <span className="type-title-t2-bold text-(--text-title)">
                        {overview.supporterCount.toLocaleString(currentLanguage)}
                    </span>
                )}
            </div>

            {/*
             * ⚠ `overflow-clip`, and it is load-bearing rather than a synonym for `hidden`: with
             * `hidden` the section becomes a scroll container, and the header below resolves its
             * `sticky` against *that* scrollport instead of the window — so it never moves and
             * scrolls away with the rows. `MembershipDashboard` and `LedgerPanel` both carry the
             * post-mortem; the symptom is nothing at all, which is why it is written down a third
             * time.
             */}
            <section className={cn('flex flex-1 flex-col overflow-clip', DONATION_PANEL)}>
                {/*
                 * `ListHeader` rather than a hand-rolled `<h2>` with `border-b`: the DS header draws
                 * its rule as an absolutely positioned `::after`, so the rule adds no height and the
                 * box measures exactly 48. A `border-b` makes it 49, and anything parked beneath it
                 * sits one pixel high.
                 */}
                <ListHeader
                    style={{ top: APP_BAR_HEIGHT }}
                    className="sticky z-10 bg-(--background-surface)"
                >
                    <ListHeaderDesc>
                        <ListHeaderText>
                            <ListHeaderTitle as="h2">
                                {t('monetization_donation_supporters')}
                            </ListHeaderTitle>
                        </ListHeaderText>
                    </ListHeaderDesc>
                </ListHeader>

                {/*
                 * A **flex column that fills the panel**, so the three states that replace the list
                 * can centre themselves in it (`flex-1 justify-center` below). Without it they sit
                 * flush under the header with the rest of a full-height panel blank underneath —
                 * which reads as a list that got cut off rather than as a panel with nothing in it.
                 *
                 * The rows branch deliberately does **not** take the centring: a list starts at the
                 * top, and vertically centring three rows in a tall panel would float them.
                 */}
                <div className="flex flex-1 flex-col px-4 pb-4">
                    {overview.isError ? (
                        /*
                         * It replaces the list rather than sitting above it: unlike the revenue
                         * strip on the hub there is nothing left underneath to keep reading. The
                         * state `MembershipDashboard` shipped without, and the reason DoD §1 asks
                         * for all four.
                         */
                        <div
                            role="alert"
                            data-testid="monetization-donation-supporters-error"
                            className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
                        >
                            <p className="type-dense-default m-0 max-w-[400px] text-(--text-body)">
                                {t('monetization_donation_supporters_error')}
                            </p>
                            <Button
                                data-testid="monetization-donation-supporters-retry"
                                variant="secondary"
                                size="small"
                                onClick={overview.refetch}
                            >
                                {t('common_retry')}
                            </Button>
                        </div>
                    ) : overview.isLoading ? (
                        <div className="flex flex-1 items-center justify-center py-10">
                            <Loader label={t('common_loading')} />
                        </div>
                    ) : overview.isEmpty ? (
                        <div
                            data-testid="monetization-donation-supporters-empty"
                            className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center"
                        >
                            <Image
                                src={DONATION_ART.noSupporters.src}
                                width={DONATION_ART.noSupporters.width}
                                height={DONATION_ART.noSupporters.height}
                                alt=""
                                aria-hidden
                                className="h-auto w-[95px] max-w-full"
                            />
                            <p className="type-dense-default m-0 max-w-[400px] text-(--text-body)">
                                {/*
                                 * A range with nothing in it says so. Legacy prints "No one
                                 * supported yet" whichever range is selected, which tells a creator
                                 * who just switched to *this month* on the 1st that nobody has ever
                                 * supported them.
                                 */}
                                {overview.range === '7d'
                                    ? t('monetization_donation_no_supporters_range', {
                                          days: DONATION_RANGE_DAYS,
                                      })
                                    : t('monetization_donation_no_supporters_month')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {overview.rows.map(row => (
                                <SupporterRow
                                    key={row.id}
                                    row={row}
                                    currency={currency}
                                    rate={rate}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>,
    )
}
