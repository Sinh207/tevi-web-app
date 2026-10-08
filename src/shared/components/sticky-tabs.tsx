'use client'

import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
    SegmentedControlItemRow,
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
 *
 * ## `adaptive` — the home page's `Menu`, which is both
 *
 * Figma's home tab row (`Menu`, `Mobile=True|False`) is an **underline** row on a phone and a
 * 46px **capsule** from `md` — the same breakpoint switch legacy makes with two style objects and a
 * `matchUpMd` read. Here it is one tree styled by `md:` utilities, so nothing reads the viewport in
 * JS and the server's HTML is already the right shape at both widths.
 *
 * Its selection is **one indicator that slides** between the segments rather than a style each
 * segment toggles: below `md` it is the 2px rule, from `md` the raised white pill. Same element,
 * same transition, so switching tabs reads as the mark travelling to the new tab at either width.
 * 240ms on the app's arrival curve (`shared/lib/motion.ts`); under reduced motion it just moves.
 */
export type StickyTab = {
    id: string
    label: string
    panel: ReactNode
    /**
     * Drawn before the label inside the segment — the home Lives tab's red dot. Decorative: the
     * label still has to say everything, because this is not announced.
     */
    adornment?: ReactNode
}

export type StickyTabsProps = {
    tabs: StickyTab[]
    /** Names the tablist for a screen reader — these rows have no visible heading. */
    label: string
    /**
     * Height of the page's own sticky bar; the control parks directly under it. A string for a bar
     * that moves — `var(--top-bar-inset, 0px)` follows `AppTopBarDock` as it slides.
     */
    stickyOffset?: number | string
    /** DS variant names, not shadcn's — plus `adaptive`, see the header. */
    variant?: 'pill' | 'underline' | 'adaptive'
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
     * Extra classes for each tab **panel** — `flex flex-1 flex-col` for a panel that has to fill the
     * rest of the column (home's empty feed centres itself in it). The panel is a bare `div`
     * otherwise, which no child can stretch.
     *
     * ⚠ A `display` class here beats the panel's `hidden` attribute, so with `mountAll` an inactive
     * panel would show. That is why the `hidden` variant is re-applied below; keep it if this changes.
     */
    panelClassName?: string
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
    panelClassName,
    testId,
}: StickyTabsProps) {
    const [uncontrolled, setUncontrolled] = useState(tabs[0]?.id)
    const active = value ?? uncontrolled

    const adaptive = variant === 'adaptive'
    // `adaptive` is the underline skin re-dressed from `md`; the primitive only knows its own two.
    const skin = adaptive ? 'underline' : variant
    const activeIndex = Math.max(
        0,
        tabs.findIndex(tab => tab.id === active),
    )

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
                <SegmentedControl
                    role="tablist"
                    aria-label={label}
                    variant={skin}
                    className={
                        adaptive
                            ? // The track carries the 1px rule the segments drew for themselves,
                              // because the segments give up their shadows to the indicator.
                              'relative shadow-[inset_0_-1px_0_var(--separator-default)] md:mx-auto md:h-[46px] md:max-w-[390px] md:rounded-full md:bg-linear-to-b md:from-(--background-surface) md:to-(--background-segment) md:shadow-[inset_0_0_0_1px_var(--separator-default)]'
                            : undefined
                    }
                >
                    {adaptive && tabs.length > 0 && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute bottom-0 h-0.5 bg-(--text-title) transition-[inset-inline-start] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:top-0 md:h-auto md:rounded-full md:bg-(--background-segment-focus) md:shadow-sm"
                            style={{
                                width: `${100 / tabs.length}%`,
                                insetInlineStart: `${(activeIndex * 100) / tabs.length}%`,
                            }}
                        />
                    )}
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
                            variant={skin}
                            selected={tab.id === active}
                            onClick={() => select(tab.id)}
                            className={
                                adaptive
                                    ? // Above the indicator, and without the per-segment rule it
                                      // replaces. 54 / 46 are Figma's two `Menu` heights.
                                      'relative z-10 h-[54px] bg-transparent shadow-none md:h-[46px] md:rounded-full'
                                    : undefined
                            }
                        >
                            {tab.adornment ? (
                                <SegmentedControlItemRow>
                                    {tab.adornment}
                                    <SegmentedControlItemLabel
                                        className={cn(
                                            'flex-none',
                                            adaptive && 'type-body-emphasis',
                                            adaptive && tab.id !== active && 'text-(--text-body)',
                                        )}
                                    >
                                        {tab.label}
                                    </SegmentedControlItemLabel>
                                </SegmentedControlItemRow>
                            ) : (
                                <SegmentedControlItemLabel
                                    // 16 Medium in both of Figma's `Menu` variants, selected or
                                    // not — only the colour moves. On the label, because the
                                    // segment's own `type-*` class is the primitive's.
                                    className={cn(
                                        adaptive && 'type-body-emphasis',
                                        // Figma's unselected `#666`, a step lighter than the
                                        // primitive's subtitle ink.
                                        adaptive && tab.id !== active && 'text-(--text-body)',
                                    )}
                                >
                                    {tab.label}
                                </SegmentedControlItemLabel>
                            )}
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
                        className={panelClassName && cn(panelClassName, '[&[hidden]]:hidden')}
                    >
                        {tab.panel}
                    </div>
                ) : null,
            )}
        </div>
    )
}
