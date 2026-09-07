'use client'

import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import { type ReactNode, useState } from 'react'

/**
 * A tablist that parks under the page's own sticky bar, over panels held in the DOM.
 *
 * Lifted out of `features/brand-assets/components/brand-assets-tabs.tsx` when the channel page
 * needed the same thing. Generalised rather than copied on purpose: the part that is easy to get
 * wrong is the ARIA wiring (`role`, `aria-controls`, `aria-labelledby`, roving focus), it is
 * already right, and a second hand-written copy is where it would drift.
 *
 * There is no DS `Tabs` component — `SegmentedControl` is what Figma provides, in two skins:
 * `pill` (a 36px capsule) and `underline` (a 48px track with a 2px rule, which is what a
 * full-width page-level tab row wants).
 */
export type StickyTab = {
    id: string
    label: string
    panel: ReactNode
}

export type StickyTabsProps = {
    tabs: StickyTab[]
    /** Names the tablist for a screen reader — these rows have no visible heading. */
    label: string
    /** Height of the page's own sticky bar; the control parks directly under it. */
    stickyOffset?: number
    /** DS variant names, not shadcn's. */
    variant?: 'pill' | 'underline'
    /** Controlled selection. Omit both to let the component own it. */
    value?: string
    onValueChange?: (id: string) => void
    /**
     * Keep every panel mounted and hide the inactive ones (`true`, the default), or render only
     * the active one.
     *
     * The choice is about what a panel *costs*, and the two callers differ:
     *
     * - Static server-rendered copy (brand assets) → **`true`**. Mounting all of it is free, it
     *   ends up in the document a crawler receives, switching tabs costs nothing, and each panel
     *   keeps its scroll position.
     * - Panels that each own a paginated query (a channel's posts / media / about) → **`false`**.
     *   Mounting all of them fires every request on load, for tabs nobody has opened. TanStack
     *   Query's cache makes coming back instant anyway, so there is nothing to preserve by
     *   keeping them mounted.
     */
    mountAll?: boolean
    className?: string
    /** Extra classes for the sticky wrapper — e.g. horizontal padding matching the page. */
    barClassName?: string
    /**
     * Base `data-testid`. Each tab is `${testId}-tab` and each panel `${testId}-panel`, both
     * carrying `data-tab-id={tab.id}`.
     *
     * ⚠ The DOM `id`s this component writes (`${tab.id}-tab` / `${tab.id}-panel`) are **not**
     * prefixed, so two `StickyTabs` on one page with a tab called `about` produce duplicate ids and
     * `aria-controls` resolves to the first. They exist for the ARIA relationship, not for
     * automation — locate by the testid, which is scoped by its caller's feature prefix.
     */
    testId?: string
}

export function StickyTabs({
    tabs,
    label,
    stickyOffset = 0,
    variant = 'pill',
    value,
    onValueChange,
    mountAll = true,
    className,
    barClassName,
    testId,
}: StickyTabsProps) {
    const [uncontrolled, setUncontrolled] = useState(tabs[0]?.id)
    const active = value ?? uncontrolled

    const select = (id: string) => {
        if (value === undefined) setUncontrolled(id)
        onValueChange?.(id)
    }

    return (
        <div className={cn('flex min-w-0 flex-col', className)}>
            {/* Sticky is a screen affordance; on paper the row would print as a few words above
                whichever panel happens to be open. */}
            <div
                className={cn(
                    // `bg-(--background)` is not optional: the DS bar has no fill of its own, so
                    // without it the page's content scrolls visibly through the tab row.
                    'sticky z-10 bg-(--background) print:hidden',
                    // The underline skin's rule *is* the separator between bar and panel, so
                    // padding beneath it would detach the two. The pill skin needs the gap.
                    variant === 'pill' && 'pb-3',
                    barClassName,
                )}
                style={{ top: stickyOffset }}
            >
                <SegmentedControl role="tablist" aria-label={label} variant={variant}>
                    {tabs.map(tab => (
                        <SegmentedControlItem
                            key={tab.id}
                            data-testid={subTestId(testId, 'tab')}
                            data-tab-id={tab.id}
                            id={`${tab.id}-tab`}
                            aria-controls={`${tab.id}-panel`}
                            // The item carries the variant too — the track and the segment are
                            // styled independently in the DS, so passing it only to the track
                            // renders an underline row full of pill-shaped segments.
                            variant={variant}
                            selected={tab.id === active}
                            onClick={() => select(tab.id)}
                        >
                            <SegmentedControlItemLabel>{tab.label}</SegmentedControlItemLabel>
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>
            </div>

            {tabs.map(tab =>
                mountAll || tab.id === active ? (
                    <div
                        key={tab.id}
                        data-testid={subTestId(testId, 'panel')}
                        data-tab-id={tab.id}
                        role="tabpanel"
                        id={`${tab.id}-panel`}
                        aria-labelledby={`${tab.id}-tab`}
                        hidden={tab.id !== active}
                    >
                        {tab.panel}
                    </div>
                ) : null,
            )}
        </div>
    )
}
