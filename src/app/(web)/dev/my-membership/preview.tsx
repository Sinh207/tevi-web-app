'use client'

import { useAuth } from '@features/auth'
import { MY_MEMBERSHIP_CONTAINER } from '@features/membership'
import {
    type Membership,
    MembershipDetailDialog,
    MembershipRow,
    membershipKeys,
    type PaymentHistory,
    SURFACE_CARD,
} from '@features/membership/dev'
import { PageBackBar } from '@features/navigation'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { FilterMenu } from '@shared/components/filter-menu'
import { StickyTabs } from '@shared/components/sticky-tabs'
import { cn } from '@shared/lib/utils'
import { SearchBar } from '@shared/ui/search-bar'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * The interactive half of `/dev/my-membership`.
 *
 * The DS Search Bar is a **controlled** input whose three Figma states are derived rather than
 * passed — focus, and whether the field has a value — so the only way to check the port is to hold
 * the value and use it. The second instance starts with a value, which is Figma's `Searching` state
 * as it looks before anything is focused.
 */
export function MembershipSearchPreview() {
    const [empty, setEmpty] = useState('')
    const [filled, setFilled] = useState('Ada')

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="type-caption-meta text-(--text-body)">
                    Default — empty and unfocused, so no cancel button
                </span>
                <SearchBar
                    value={empty}
                    onValueChange={setEmpty}
                    label="Search memberships"
                    clearLabel="Clear search"
                    placeholder="Search"
                />
            </div>
            <div className="flex flex-col gap-1">
                <span className="type-caption-meta text-(--text-body)">
                    Searching — has a value, so the pill narrows and the cancel appears
                </span>
                <SearchBar
                    value={filled}
                    onValueChange={setFilled}
                    label="Search memberships"
                    clearLabel="Clear search"
                    placeholder="Search"
                />
            </div>
        </div>
    )
}

/**
 * The page's bar, with the payment filter in its trailing slot.
 *
 * Previewed here because the real one is only rendered for a **signed-in** account — `canFilter` in
 * `MyMembershipView` hides the trigger while the session is resolving and when there is none — so the
 * one state worth looking at is the one a signed-out developer cannot reach.
 *
 * Both trigger states are shown: default, and the accent fill an applied filter paints. That fill is
 * the whole reason the control can move off-screen into a menu — see the view's note on why a closed
 * menu has to say something about itself.
 *
 * `PageBackBar`'s back button works: it is the real component, so pressing it navigates.
 */
export function MembershipBarPreview() {
    const [method, setMethod] = useState('')

    const options = [
        { key: '', label: 'All' },
        { key: 'star', label: 'Star' },
        { key: 'card', label: 'Card' },
    ]
    const active = options.find(option => option.key === method && option.key !== '')

    return (
        <div className="flex flex-col gap-2">
            <PageBackBar
                title="My membership"
                className={MY_MEMBERSHIP_CONTAINER}
                actions={
                    <FilterMenu
                        options={options}
                        value={method}
                        onChange={setMethod}
                        triggerLabel="Filter by payment method"
                        variant="compact"
                        trigger={
                            <BarIconButton
                                name="sliders-simple"
                                label={
                                    active
                                        ? `Filter by payment method: ${active.label}`
                                        : 'Filter by payment method'
                                }
                                className={cn(
                                    active &&
                                        'bg-(--accents-indigo-active) text-(--text-on-accent) hover:not-disabled:bg-(--accents-indigo-active)',
                                )}
                            />
                        }
                    />
                }
            />
            <span className="type-caption-meta text-(--text-body)">
                Applied: {active ? active.label : 'All (no accent)'}
            </span>
        </div>
    )
}

/**
 * The content card — the real `SearchBar`, the real `StickyTabs` and real rows inside the screen's own
 * `SURFACE_CARD`.
 *
 * This exists to make one thing checkable in a browser: **the card includes the search field.** Every
 * state of the real screen except signed-out needs an account that is actually paying a creator, so
 * that composition was otherwise only verifiable by reading the JSX. The classes come from the feature
 * (`SURFACE_CARD`), so the harness cannot drift from the screen on the one property it is here to show.
 *
 * The tabs' counts and the rows are fixtures; nothing is requested. `stickyOffset` is 0 rather than the
 * screen's 60, because this preview has no page bar above it to park under.
 */
export function MembershipCardPreview({ rows }: { rows: Membership[] }) {
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('active')

    const list = (
        <div className="md:overflow-hidden md:rounded-b-[var(--radius-xl)]">
            <ul className="list-none">
                {rows.map((membership, index) => (
                    <MembershipRow
                        key={membership.id}
                        membership={membership}
                        rule={index > 0}
                        // No `onOpen`: this section previews the card's *surface*, so its rows are
                        // deliberately inert. A press target that does nothing is a dead control.
                        locale="en"
                    />
                ))}
            </ul>
        </div>
    )

    return (
        <div className={SURFACE_CARD}>
            <div className="px-4 pt-4 pb-3">
                <SearchBar
                    value={search}
                    onValueChange={setSearch}
                    label="Search memberships"
                    clearLabel="Clear search"
                    placeholder="Search"
                />
            </div>
            <StickyTabs
                variant="underline"
                label="Membership status"
                mountAll={false}
                value={status}
                onValueChange={setStatus}
                className="min-w-0"
                barClassName="bg-(--background-surface) px-4"
                tabs={[
                    { id: 'active', label: `Active (${rows.length})`, panel: list },
                    { id: 'expired', label: 'Expired (0)', panel: list },
                ]}
            />
        </div>
    )
}

/**
 * The detail dialog, opened from real rows.
 *
 * The three footers are the reason this is here, and each needs a differently-shaped membership to
 * reach: **active** gets the cancel path (with its confirm dialog), **cancelled** gets Renew, and
 * **expired** gets a sentence and no button, because re-subscribing needs a checkout this app does not
 * have. Reaching all three against a live account would mean cancelling a real subscription.
 *
 * The payment-history section will show its own error state here — it is the one part that needs a
 * bearer. That is the honest preview: everything above it is props.
 */
export function MembershipDialogPreview({ rows }: { rows: Membership[] }) {
    const [open, setOpen] = useState<Membership | null>(null)
    useSeededHistory(rows)

    return (
        <>
            <div className={SURFACE_CARD}>
                <ul className="list-none">
                    {rows.map((membership, index) => (
                        <MembershipRow
                            key={membership.id}
                            membership={membership}
                            rule={index > 0}
                            onOpen={() => setOpen(membership)}
                            locale="en"
                        />
                    ))}
                </ul>
            </div>
            <MembershipDetailDialog
                membership={open}
                onOpenChange={next => {
                    if (!next) setOpen(null)
                }}
            />
        </>
    )
}

/**
 * A year of charges, alternating Star and card, seeded straight into the query cache.
 *
 * Twelve rows so the ledger actually overflows its card — which is the only way to see the two things
 * this preview exists for: that **only the rows scroll** (the heading, its rule and the card above all
 * stay put), and that a card charge prints `$4.99` rather than being converted to Star.
 *
 * A cache seed rather than a prop, per `features/donation/dev.ts`: the dialog owns its query, and a
 * `history` prop would be a second source of truth that only this file ever uses. The keys come from
 * `@features/membership/dev`, so a rename cannot leave this silently seeding nothing.
 *
 * `activeId` is the anonymous session's id here, which is exactly what the dialog's own query key uses
 * — the app always keeps a session, so there is always an id to file this under.
 */
function useSeededHistory(rows: Membership[]) {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()

    useEffect(() => {
        for (const row of rows) {
            const history: PaymentHistory[] = Array.from({ length: 12 }, (_, index) => ({
                id: `${row.id}-h${index}`,
                // Monthly, counting back — a plausible ledger rather than twelve identical lines.
                created_at: new Date(Date.UTC(2026, 7 - index, 1, 12)).toISOString(),
                package_price: index % 2 === 0 ? 500 : 4.99,
                package_price_currency: index % 2 === 0 ? 'TVS' : 'USD',
            }))
            queryClient.setQueryData(membershipKeys.history(activeId, row.id), history)
        }
    }, [queryClient, activeId, rows])
}
