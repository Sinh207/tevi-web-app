'use client'

import { FIELD_SURFACE } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { nextRangeAfterPress, rangeDayCount } from '@shared/lib/date-range'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { type ReactNode, useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { LazyCalendar } from './calendar-lazy'

/**
 * "Pick a date range" — the app's one date-range picker, for every screen that needs one.
 *
 * It is in `shared/components/` rather than inside the feature that first needed it
 * (`features/analytics`) because a range picker has no domain: it takes two dates and gives two dates
 * back. The dashboard is the first caller; the earnings report, a payout export and any future report
 * filter are the next ones, and none of them should grow a second calendar. Same reasoning as
 * `shared/components/filter-menu.tsx`, which two ledger screens share.
 *
 * ## The calendar is loaded when the dialog opens, never before
 *
 * `LazyCalendar` is the shared split point — the package is ~15 KB gzipped that most sessions never
 * need, since the dialog opens from one segment of one control. See `calendar-lazy.tsx`.
 *
 * ## No error states, because the control cannot produce an invalid range
 *
 * This replaced a pair of `<input type="date">` fields that needed three validation messages —
 * incomplete, reversed, and in the future. The calendar removes all three by construction: RDP's
 * range mode orders the two ends itself, `disabled` greys out everything after `maxDate`, and
 * **Apply stays disabled until both ends exist**. A control that cannot express the mistake is worth
 * more than a sentence explaining it.
 *
 * ## Two months from `sm`, one below
 *
 * A 30-day range spans two months, so one month at a time turns "the last 30 days" into a navigation
 * exercise. The switch is a CSS-free `matchMedia` read rather than a Tailwind class because
 * `numberOfMonths` is a *prop*, not a style — rendering both and hiding one would double the grid in
 * the accessibility tree.
 */

export interface DateRangeValue {
    startMs: number
    endMs: number
}

export function DateRangeDialog({
    open,
    onOpenChange,
    value,
    onApply,
    maxDate,
    minDate,
    title,
    description,
    applyLabel,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The range in force. Seeds the calendar, so it opens on what is on screen. */
    value: DateRangeValue
    /** Both dates are whole local days; the caller decides what its own boundaries mean. */
    onApply: (from: Date, to: Date) => void
    /** Nothing after this can be picked. Defaults to today — a report has no data about tomorrow. */
    maxDate?: Date
    minDate?: Date
    /** Overrides for a screen whose wording differs; all three default to the shared copy. */
    title?: string
    description?: ReactNode
    applyLabel?: string
    /**
     * Base `data-testid`. Derives `-title`, `-start` / `-end` (the two readout cells), `-calendar`,
     * `-cancel`, `-apply`, and `-overlay` from `DialogContent`.
     *
     * Days are not tagged here: react-day-picker stamps `data-day="YYYY-MM-DD"` on every cell, so
     * a range is picked with `[data-testid='…-calendar'] [data-day='2026-11-01']` and then
     * `…[data-day='2026-11-07']`. `calendar.tsx` carries the reasoning. Apply's availability is read
     * off `disabled`, not off a different id.
     */
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    /**
     * `undefined` means "nothing picked in **this** visit", and the seed below fills it in.
     *
     * Held as a draft rather than derived outright because the reader's two presses are a draft: the
     * dialog only reports back on Apply.
     */
    const [draft, setDraft] = useState<DateRange | undefined>()
    const [twoMonths, setTwoMonths] = useState(false)

    /**
     * The range on screen: the draft if there is one, else the value the caller holds.
     *
     * Derived rather than seeded by an effect — which is what this was, and it left the **previous
     * visit's** selection on screen for the first commit after `open` flipped true: apply 7 Jan – 5
     * Feb, press `30d`, press Custom again, and the two cells and the day count under them painted the
     * old range before the effect replaced it. base-ui keeps this component mounted for its exit
     * transition, so state genuinely outlives a visit; deriving means there is no window at all.
     */
    const range = draft ?? { from: new Date(value.startMs), to: new Date(value.endMs) }

    /*
     * The draft is dropped when the dialog closes, so the next open derives from `value` again. This is
     * the only effect the seeding needs, and it runs on the way *out* rather than the way in.
     */
    useEffect(() => {
        if (open) return
        setDraft(undefined)
        setHoveredDay(null)
    }, [open])

    /*
     * The breakpoint is this repo's `sm` (612px — not Tailwind's), read once per open. A listener
     * would be the thorough version; a dialog is not resized while it is open often enough to pay for
     * one, and the calendar reflows on the next open.
     */
    useEffect(() => {
        if (!open) return
        setTwoMonths(window.matchMedia('(min-width: 612px)').matches)
    }, [open])

    /**
     * The day under the pointer while only one end is set — the **range preview**.
     *
     * A range picker that shows nothing between the first press and the second makes the reader
     * guess; every picker they have used (Airbnb, Google Analytics, Linear) paints the band as the
     * pointer moves. RDP does not do it for you, but it hands over `onDayMouseEnter`, and `selected`
     * is just props — so the preview is the real `from` with the hovered day as a provisional `to`.
     *
     * Only ever a *display* value: `range` is what Apply reads, so a preview cannot be applied by
     * accident, and it is dropped the moment the pointer leaves the grid.
     */
    const [hoveredDay, setHoveredDay] = useState<Date | null>(null)

    const from = range?.from
    const to = range?.to
    const complete = Boolean(from && to)

    /** What the grid paints: the real selection, or the half-picked range extended to the hover. */
    const painted: DateRange | undefined =
        from && !to && hoveredDay
            ? hoveredDay < from
                ? { from: hoveredDay, to: from }
                : { from, to: hoveredDay }
            : range

    /**
     * Which end the **next press** will set — the one thing the two cells exist to say.
     *
     * It is the same test `onSelect` makes below, which is what makes the marked cell a promise the
     * control keeps rather than a hint: a complete range (or an empty one) means the next press starts
     * a new one.
     */
    const nextIsStart = !from || Boolean(to)

    /** Inclusive, and blind to a time of day on either end — see `rangeDayCount`. */
    const dayCount = rangeDayCount(range)

    const dayFormat = (() => {
        try {
            return new Intl.DateTimeFormat(currentLanguage, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            })
        } catch {
            return new Intl.DateTimeFormat('en', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            })
        }
    })()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Wider than the DS's 370 dialog, because two month grids do not fit in it — and capped
                by `max-w` so a phone still gets the full-bleed-minus-margin box the DS specifies. */}
            <DialogContent className="w-auto sm:w-[600px]" data-testid={testId}>
                <DialogHeader>
                    <DialogTitle data-testid={subTestId(testId, 'title')}>
                        {title ?? t('date_range_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {description ?? t('date_range_description')}
                    </DialogDescription>
                </DialogHeader>

                {/*
                 * The two ends, as two cells rather than one sentence.
                 *
                 * A centred `21 Jan 2025 – 19 Feb 2025` said what was picked and not *which end the
                 * next press moves* — the one thing a reader mid-selection needs. Two labelled cells
                 * say both, and the active one is marked, so the control explains itself without a
                 * line of instructions. It is also the shape every picker of this kind uses, which
                 * is most of what "looks professional" means here.
                 *
                 * `aria-live` on the row, because it changes under the reader's own presses and the
                 * grid's paint is not available to a screen reader.
                 */}
                <div aria-live="polite" className="flex items-center gap-2">
                    <RangeCell
                        label={t('date_range_start')}
                        value={from ? dayFormat.format(from) : null}
                        placeholder={t('date_range_not_set')}
                        active={nextIsStart}
                        testId={subTestId(testId, 'start')}
                    />
                    {/* Flipped under `dir="rtl"` so it still points from the start cell to the end
                        one — `Icon` has no `mirrored` prop of its own (only `BarIconButton` does), so
                        it is the same `rtl:-scale-x-100` that component applies. */}
                    <Icon
                        name="arrow-right"
                        size={16}
                        aria-hidden
                        className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                    />
                    <RangeCell
                        label={t('date_range_end')}
                        value={to ? dayFormat.format(to) : null}
                        placeholder={t('date_range_not_set')}
                        active={!nextIsStart}
                        testId={subTestId(testId, 'end')}
                    />
                </div>

                {dayCount !== null ? (
                    <p className="type-caption-meta -mt-2 text-center text-(--text-subtitle)">
                        {dayCount === 1
                            ? t('date_range_one_day')
                            : t('date_range_days', { days: dayCount })}
                    </p>
                ) : null}

                <LazyCalendar
                    data-testid={subTestId(testId, 'calendar')}
                    mode="range"
                    selected={painted}
                    /*
                     * ## The range is built here, not read back from RDP
                     *
                     * `onSelect`'s first argument is the range **RDP** computed, and it is deliberately
                     * ignored. Two reasons, and each was a bug:
                     *
                     * 1. Handed a *complete* selection, RDP's range mode treats the next press as
                     *    "extend or shrink" — so opening a picker on 21 Jan – 19 Feb and pressing 5 Feb
                     *    moved the **end**. Nobody means that by pressing a day in a date picker.
                     * 2. `selected` here is the hover *preview* (see `painted`), which looks complete
                     *    to RDP while only one end is really set. So its second press came back as
                     *    `{from: 20 Feb, to: 20 Feb}` — the start silently thrown away. Measured by
                     *    walking the flow: press 5 Feb, press 20 Feb, and the cells read
                     *    `Start 20 Feb / End 20 Feb`.
                     *
                     * The rule below is the one the two cells promise: **the first press sets the
                     * start, the second closes the range** — and a press on an already-complete range
                     * starts a new one rather than nudging an edge.
                     */
                    /*
                     * The range is decided by `nextRangeAfterPress`, and RDP's own answer (the first
                     * argument) is deliberately ignored — that function explains both bugs it caused.
                     */
                    onSelect={(_rdpRange, pressedDay) => {
                        setHoveredDay(null)
                        setDraft(nextRangeAfterPress(range, pressedDay))
                    }}
                    onDayMouseEnter={day => setHoveredDay(day)}
                    onDayMouseLeave={() => setHoveredDay(null)}
                    numberOfMonths={twoMonths ? 2 : 1}
                    /*
                     * The arrows move a **page** — both months at once. Moving one month at a time
                     * with two on screen redraws the pair into a half-familiar state, and it takes
                     * twice as many presses to go anywhere.
                     */
                    pagedNavigation
                    defaultMonth={
                        /*
                         * Opens on the month the range *starts* in, not on today: a reader adjusting
                         * a 90-day window is working at its far end, and landing on today would make
                         * every visit start with two presses of "previous".
                         */
                        new Date(value.startMs)
                    }
                    startMonth={minDate}
                    endMonth={maxDate ?? new Date()}
                    disabled={[
                        { after: maxDate ?? new Date() },
                        ...(minDate ? [{ before: minDate }] : []),
                    ]}
                    /*
                     * A plain `January 2025` caption, not the month/year dropdowns `DateField` uses.
                     * A report range is picked a page or two either side of where it opens (which is
                     * the month the range *starts* in), so the dropdowns bought nothing and cost the
                     * header's calm — two select chevrons per month, four in the two-month view. A
                     * date of birth is the opposite case, thirty years back, and keeps them.
                     */
                    captionLayout="label"
                    autoFocus
                />

                <DialogFooter layout="side-by-side">
                    <Button
                        type="button"
                        variant="secondary"
                        size="large"
                        data-testid={subTestId(testId, 'cancel')}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common_cancel')}
                    </Button>
                    <Button
                        type="button"
                        variant="accent"
                        size="large"
                        // Disabled rather than validated — see the header. A half-picked range has
                        // nothing to apply.
                        disabled={!complete}
                        data-testid={subTestId(testId, 'apply')}
                        onClick={() => {
                            if (from && to) onApply(from, to)
                        }}
                    >
                        {applyLabel ?? t('date_range_apply')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * One end of the range — a label, the date, and whether the next press lands here.
 *
 * Built on the field surface (`FIELD_SURFACE`) rather than as bare text, so the two ends read as the
 * two *values* the dialog is collecting. The active one is marked with the input's own focus border
 * instead of an invented accent: it is the same "this is where your input goes" signal every form in
 * the app already uses.
 *
 * Not a button. Pressing it would have to mean something — "set this end next" — and RDP's range mode
 * decides which end a press sets from the range itself, so a cell that looked pressable would either
 * lie or need a second selection model behind it. It is a readout, and the grid is the control.
 */
function RangeCell({
    label,
    value,
    placeholder,
    active,
    testId,
}: {
    label: string
    value: string | null
    placeholder: string
    active: boolean
    testId?: string
}) {
    return (
        <div
            data-testid={testId}
            data-active={active || undefined}
            className={cn(
                FIELD_SURFACE,
                'flex min-w-0 flex-1 flex-col gap-0.5 py-2',
                active && 'border-(--input-border-focus)',
            )}
        >
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
            <span
                className={cn(
                    'type-dense-emphasis truncate',
                    value ? 'text-(--text-title)' : 'text-(--input-placeholder)',
                )}
            >
                {value ?? placeholder}
            </span>
        </div>
    )
}
