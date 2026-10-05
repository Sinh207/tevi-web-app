'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { SearchBar } from '@shared/ui/search-bar'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import type { OrderTab } from '../api/report-types'
import { useEventOrders } from '../hooks/use-event-orders'
import { EVENT_ORDERS_HEADER } from '../lib/container'
import { EventCardState } from './event-card-state'
import { EventOrderRow } from './event-order-row'
import { EventOrderRowsSkeleton } from './event-report-skeleton'

/**
 * **Report details** — every order behind the money, in three tabs with a name filter.
 *
 * Legacy's `reportDetails`. The tabs, the search and the three list states; the screen around it
 * (`EventReportScreen`) owns the bar and the column.
 *
 * ## It was a dialog, and a route is what the dialog was approximating
 *
 * Legacy opens this in a `ResponsiveModal` — a popup on a desktop, a full-page sheet on a phone —
 * and this port started as a dialog at every width. Both were standing in for a page: the content is
 * a scrollable table of up to fifty rows with its own tab state and its own search, which is a
 * screen's worth of interaction to put behind an overlay. As a route it gets the browser's own back
 * button, survives a refresh, and drops the two things a popup forced — a `max-h-[85dvh]` cap and an
 * internal scrollport (`min-h-0`, the trap `overflow-hidden-clips-flex-child` records).
 *
 * So this component is now **just the content**: no `Dialog`, no `DialogScreenHeader`, no height cap.
 * The page scrolls.
 *
 * ## The tabs are `SegmentedControl`, and the search is the DS `SearchBar`
 *
 * Legacy uses MUI `Tabs` with an underline and a bespoke `TextField` styled into a grey pill. Both
 * have DS equivalents that already carry the app's geometry, so this is a port of the *arrangement*
 * rather than of the widgets.
 *
 * ## Three list states, not one
 *
 * Legacy renders `<Nodata/>` for **all** of "this tab has no orders", "your search matched nothing"
 * and "the request failed" — so a creator who mistyped a name, and one whose request 500'd, are both
 * told they earned nothing. They are three different facts: `isError`, `totalForTab` and the filtered
 * length tell them apart.
 */
export function EventOrdersPanel({ code }: { code: string }) {
    const { t } = useTranslation()
    const flow = useEventOrders({ code })

    /*
     * ⚠ The third tab is **"Games", not "Interactive games"** — a deliberate divergence, stated
     * here per the usual rule.
     *
     * Legacy's tab carries the full phrase because MUI `Tabs` lets a label overflow its track; the
     * DS `SegmentedControl` truncates instead, and three tabs cannot fit it in **any** of the nine
     * locales at a phone's width — measured: `Interactive ga…`. A truncated tab is worse than a
     * shorter word, and `games` is already the wire's own name for this list (`ORDER_KINDS`). The
     * full phrase is kept where it has the room: the revenue row on the report.
     */
    const TABS: { key: OrderTab; label: string }[] = [
        { key: 'tickets', label: t('event_tickets') },
        { key: 'gifts', label: t('event_gifts') },
        { key: 'games', label: t('event_games') },
    ]

    return (
        <div data-testid="event-report-panel" className="flex min-w-0 flex-1 flex-col">
            {/*
             * The controls stay put while the rows scroll under them — `top-[60px]` clears the
             * page's own sticky bar, which is `AppBar`'s fixed height. Legacy makes its tabs and its
             * search bar sticky inside the modal for the same reason: fifty rows is more than a
             * screen, and a filter you have to scroll back up to reach is a filter nobody uses.
             *
             * The **bottom hairline** is what bounds it. Without one the rows scrolling underneath
             * appear to run into the search pill — a half-row sliding out from behind a control
             * with nothing marking where the header ends. `StickyTabs` gets the same separation
             * from the page colour in its own `pb-3`; inside a card there is no gap to do that job,
             * so it takes a rule.
             *
             * ⚠ `pt-4` is not optional. Without a top padding the tab track sits flush against the
             * card's top edge and its raised pill spills over the rounded corner — the control looks
             * like it is escaping the card. It shipped that way; visible in a screenshot, invisible
             * in the markup.
             */}
            <div className={EVENT_ORDERS_HEADER}>
                {/*
                 * ⚠ `role="tablist"` on the **track**, not just `role="tab"` on the segments.
                 *
                 * This had the children marked as tabs with no tablist parent and no
                 * `aria-controls`, which is not a weaker version of the pattern — it is invalid
                 * ARIA: an orphan `role="tab"` has nothing to be a tab *of*, and a screen reader
                 * announces three unrelated controls instead of "tab 1 of 3" over a named panel.
                 * `StickyTabs` wires exactly this and I hand-rolled around it; the wiring is copied
                 * from there rather than re-invented.
                 *
                 * The DOM `id`s are unprefixed, same as `StickyTabs`: they exist for the ARIA
                 * relationship, not for automation. Locate by the testid.
                 */}
                <SegmentedControl
                    role="tablist"
                    aria-label={t('event_report_details')}
                    className="w-full"
                >
                    {TABS.map(tab => (
                        <SegmentedControlItem
                            key={tab.key}
                            data-testid="event-report-tab"
                            // The identity goes in a companion attribute, never in the id:
                            // `docs/TEST_IDS.md`. `aria-selected` is how a test reads the state.
                            data-option-value={tab.key}
                            id={`event-orders-${tab.key}-tab`}
                            aria-controls="event-orders-panel"
                            selected={flow.tab === tab.key}
                            aria-selected={flow.tab === tab.key}
                            role="tab"
                            onClick={() => flow.setTab(tab.key)}
                        >
                            <SegmentedControlItemLabel>{tab.label}</SegmentedControlItemLabel>
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>

                <SearchBar
                    data-testid="event-report-search"
                    value={flow.search}
                    onValueChange={flow.setSearch}
                    label={t('event_report_search')}
                    clearLabel={t('common_clear')}
                    placeholder={t('event_report_search')}
                />
            </div>

            {/*
             * The region the three tabs control. `aria-labelledby` names it after whichever tab is
             * selected, so a screen reader entering it is told which list this is.
             */}
            <div
                id="event-orders-panel"
                role="tabpanel"
                aria-labelledby={`event-orders-${flow.tab}-tab`}
                className="flex min-w-0 flex-1 flex-col"
            >
                {flow.isLoading ? (
                    /* The **same** rows the route's `loading.tsx` draws — one component, because
                       these were two copies of identical markup and the header beside them proved
                       what two copies do. See `EventOrderRowsSkeleton`. */
                    <EventOrderRowsSkeleton />
                ) : flow.isError ? (
                    /* `flex-1` on every state but the list: a state centres in whatever height the
                   panel has, while rows stack from the top. */
                    <EventCardState kind="error" onRetry={flow.refetch} className="flex-1 py-12" />
                ) : flow.orders.length > 0 ? (
                    <div className="flex flex-col">
                        {flow.orders.map(row => (
                            /* The key is composed in the hook — the endpoint sends no order id (B116).
                           See `KeyedOrder`. */
                            <EventOrderRow key={row.key} order={row.order} />
                        ))}
                    </div>
                ) : flow.totalForTab > 0 ? (
                    /* Matched nothing — a different fact from "earned nothing", which is the conflation
                   legacy makes. */
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                        <p className="type-dense-strong text-(--text-title)">
                            {t('event_report_no_match_title')}
                        </p>
                        <p className="type-caption-meta text-(--text-subtitle)">
                            {t('event_report_no_match_body')}
                        </p>
                    </div>
                ) : (
                    <EventCardState kind="empty" className="flex-1 py-12" />
                )}
            </div>
        </div>
    )
}
