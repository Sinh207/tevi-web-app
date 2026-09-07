'use client'

import { htmlDir } from '@shared/i18n/settings'
import { useTranslation } from '@shared/i18n/use-translation'
import { firstDayOfWeek } from '@shared/lib/calendar-locale'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useMemo } from 'react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'

/**
 * The app's calendar — one date, several dates, or a range.
 *
 * ## Why this is `shared/components/` and not `shared/ui/`
 *
 * `shared/ui/` is the **ported** design system: a file there claims a Figma component exists and that
 * its geometry was read off the file. **The DS has no date picker** — it is the first of the five
 * families `docs/DESIGN_SYSTEM.md` lists as never ported — so there is nothing to port and this is
 * app-authored. Putting it in `shared/ui/` would assert a port that has not happened, which is the
 * same call `shared/components/field.tsx` documents about the text field. Everything visible here is
 * still a DS **token** and a `type-*` utility, so it sits inside the system even though it is not
 * from it. When the DS ships a date picker, this becomes a thin wrapper over that.
 *
 * ## Why a package, and why this one
 *
 * A calendar grid is not a small component: it is month arithmetic, a roving-focus keyboard grid
 * (arrows, PageUp/PageDown, Home/End), range preview on hover, and an `aria-label` per cell. Hand-
 * rolling it is how you end up with a control that cannot be operated without a mouse.
 *
 * `react-day-picker` v10 over the alternatives:
 *
 * - **the native `<input type="date">`** (what this replaced): free and accessible, but each browser
 *   draws its own thing, two of them cannot show a *range*, and neither can be themed — a white
 *   Chrome panel opening out of a dark Tevi dialog.
 * - **`react-aria-components`** has the best i18n and a11y story, and brings a whole runtime plus
 *   `@internationalized/date` for one control.
 * - **`react-date-range`** is what legacy uses: unmaintained, ships its own stylesheet and its own
 *   theme, and legacy loads it on **every** visit to the dashboard whether or not the picker opens.
 *
 * RDP is headless enough to be dressed entirely in our tokens (no upstream CSS is imported), takes
 * `dir` for RTL, and lets every visible string be overridden — which is the whole trick below.
 *
 * ## No locale data is bundled
 *
 * RDP formats through `date-fns` locale objects by default, which would mean importing nine of them
 * (and `fil` is not one of the nine). Instead **every formatter is replaced with `Intl`**, which
 * already knows every locale's month names, weekday names and numerals — including Arabic-Indic
 * digits, matching the rest of the app's figures. The only thing `Intl` cannot answer everywhere is
 * which day the week starts on; that is `firstDayOfWeek`, which explains itself.
 *
 * ## ⚠ Never server-render this — import `LazyCalendar`
 *
 * Every string in the grid comes from `Intl`, and **Node's ICU data is not the browser's**: rendered on
 * the server, a Vietnamese weekday header comes out `Th 2` and Chrome then renders `Thứ 2`, which React
 * reports as a hydration mismatch and repairs by throwing the tree away. Measured in the browser, on a
 * dev page that imported this module directly.
 *
 * `calendar-lazy.tsx` is therefore the door every consumer uses: `ssr: false`, so the grid is only ever
 * built where its locale data comes from. That split was already there for the bundle; this is the
 * second, harder reason it has to stay.
 *
 * ## Two months from `sm`, one below it
 *
 * A range picker showing one month makes "last 30 days" a two-step navigation. Two months is the
 * shape legacy draws and there is no room for it on a phone, so `numberOfMonths` is chosen by the
 * caller-visible `months` prop and the dialog sets it from a media query rather than guessing here.
 */

/** The parts of `DayPickerProps` a caller has no business setting — they are this component's job. */
type OwnedProps =
    | 'locale'
    | 'formatters'
    | 'labels'
    | 'weekStartsOn'
    | 'dir'
    | 'classNames'
    | 'components'

/**
 * `Omit` over a **union** collapses it — `DayPickerProps` is a discriminated union of the selection
 * modes, and a plain `Omit` produced a single object type whose `mode` was `undefined`, so
 * `mode="range"` stopped type-checking. Distributing keeps each member of the union intact.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type CalendarProps = DistributiveOmit<DayPickerProps, OwnedProps> & {
    /**
     * BCP-47 tag. Defaults to the reader's own locale; passed explicitly only by previews that
     * render several at once.
     */
    locale?: string
}

/**
 * Every class RDP needs, from tokens.
 *
 * Built once at module scope rather than per render — it is a constant, and RDP diffs it by identity
 * on every day cell.
 *
 * The two that carry the design and are easy to get wrong:
 *
 * - **`range_middle` keeps the same fill as the ends but a flat radius**, so a selected week reads as
 *   one bar rather than seven pills. The ends are rounded on their outer edge only, with `rtl:`
 *   variants: in Arabic the range's start is the *right* edge, and a hard-coded left radius puts the
 *   rounded corner on the wrong end of the bar.
 * - **`today` is a ring, not a fill.** A filled today competes with the selection, and on the day a
 *   reader selects today the two paints stack.
 */
const CLASS_NAMES = {
    root: 'relative w-full',
    months: 'relative flex flex-col gap-4 sm:flex-row sm:gap-6',
    // `relative`, because in the `around` nav layout the two buttons are positioned against the
    // *month* rather than against the root — see the note on `navLayout` below.
    month: 'relative flex w-full flex-col gap-3',
    // The 32px margins either side are the nav buttons' own width: without them a long caption
    // ("tháng 2 năm 2025") slides under the chevrons.
    month_caption: 'relative mx-8 flex h-8 items-center justify-center',
    /*
     * ## The caption, the dropdowns, and the four classes that are not a style choice
     *
     * With `captionLayout="dropdown"` RDP renders a **real `<select>` overlaid on the visible label**:
     * `caption_label` is the text, `dropdown` is a transparent select stretched across it. Style the
     * select as a visible control — the obvious first guess — and *both* render, so the caption reads
     * `January January 2025 2025`. Measured in the browser; it is why these four mirror the package's
     * own stylesheet (which this app does not import) rather than being invented.
     */
    nav: 'absolute end-0 top-0 flex h-8 items-center',
    dropdowns: 'relative inline-flex items-center gap-2',
    dropdown_root: 'relative inline-flex items-center',
    dropdown: 'absolute inset-0 z-[2] w-full cursor-pointer appearance-none border-0 opacity-0',
    caption_label:
        'type-dense-strong relative z-[1] inline-flex items-center gap-1 whitespace-nowrap border-0 text-(--text-title)',
    button_previous: cn(
        'absolute start-0 top-0 flex size-8 cursor-pointer items-center justify-center',
        'rounded-[var(--radius-fill)] border-0 bg-transparent text-(--icon-default) transition-colors',
        'hover:bg-(--button-ghost-bg-hover) disabled:cursor-not-allowed disabled:text-(--icon-disabled)',
        'outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
    ),
    button_next: cn(
        'absolute end-0 top-0 flex size-8 cursor-pointer items-center justify-center',
        'rounded-[var(--radius-fill)] border-0 bg-transparent text-(--icon-default) transition-colors',
        'hover:bg-(--button-ghost-bg-hover) disabled:cursor-not-allowed disabled:text-(--icon-disabled)',
        'outline-none focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
    ),
    month_grid: 'w-full border-collapse',
    weekdays: 'flex',
    weekday: 'type-caption-meta flex h-8 flex-1 items-center justify-center text-(--text-subtitle)',
    week: 'flex w-full',
    day: 'flex flex-1 justify-center p-0',
    day_button: cn(
        'type-dense-default flex size-9 cursor-pointer items-center justify-center',
        'rounded-[var(--radius-fill)] border-0 bg-transparent text-(--text-title) tabular-nums',
        'transition-colors hover:bg-(--button-ghost-bg-hover)',
        'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)',
        'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-(--text-disabled)',
    ),
    /*
     * The selected paints sit on the **cell**, not the button, so a range reads as a continuous band —
     * a 36px round button inside a wider cell leaves gaps between the days of one week.
     *
     * The consequence is that the button's own hover fill would paint *over* the selection: hovering
     * the end of a range put a zinc disc on top of the indigo cell and the white day number went with
     * it, so the day under the pointer looked unselected and unreadable. Measured while checking the
     * range preview. Inside a selection the paint already says where you are, so the hover is
     * suppressed there — `data-selected` is RDP's own attribute on the cell.
     */
    selected: cn(
        'bg-(--accents-indigo-active) [&>button]:text-(--text-on-accent)',
        '[&>button:hover]:bg-transparent',
    ),
    range_start: 'rounded-s-[var(--radius-fill)]',
    range_end: 'rounded-e-[var(--radius-fill)]',
    range_middle: cn(
        'rounded-none bg-(--accents-indigo-bg-active)',
        /*
         * The band's days are **Text - Title**, not Indigo.
         *
         * Indigo-on-Indigo-bg is the tempting pairing and it fails the contrast the rest of the app
         * holds to: `#007aff` on `#ebf4ff` is about 3.1:1, under the 4.5:1 a 14px figure needs
         * (`docs/DEFINITION_OF_DONE.md` §10), and on screen the middle of a selected range read as
         * washed out. The band is the state; the numbers only have to stay readable.
         */
        '[&>button]:text-(--text-title)',
        // Same reason as `selected` above: the band's own fill is the state, and a grey disc over it
        // reads as a hole in the range.
        '[&>button:hover]:bg-transparent',
    ),
    today: 'shadow-[inset_0_0_0_1px_var(--separator-strong)] rounded-[var(--radius-fill)]',
    outside: 'text-(--text-disabled) [&>button]:text-(--text-disabled)',
    disabled: 'text-(--text-disabled)',
    hidden: 'invisible',
} satisfies NonNullable<DayPickerProps['classNames']>

export function Calendar({ locale, className, ...props }: CalendarProps) {
    const { t, currentLanguage } = useTranslation()
    const tag = locale ?? currentLanguage

    /*
     * `Intl` formatters, memoised on the locale: constructing an `Intl.DateTimeFormat` is the
     * expensive part (it parses the tag and loads the locale's data), and a month grid calls each of
     * these 30–70 times per render.
     */
    const { formatters, labels, weekStartsOn, dir } = useMemo(() => {
        const format = (options: Intl.DateTimeFormatOptions) => {
            try {
                return new Intl.DateTimeFormat(tag, options)
            } catch {
                // A malformed tag must not take the calendar down — the app's fallback locale.
                return new Intl.DateTimeFormat('en', options)
            }
        }
        const caption = format({ month: 'long', year: 'numeric' })
        const weekday = format({ weekday: 'short' })
        /*
         * The day **number**, through `Intl.NumberFormat` rather than `DateTimeFormat`.
         *
         * `DateTimeFormat(locale, { day: 'numeric' })` is a *date* formatted to one field, so it keeps
         * the locale's unit: Korean renders `15일`, which is correct prose and wrong in a 36px grid
         * cell — it widened every column and read as "15 days". `NumberFormat` gives the bare figure
         * in the locale's own numerals, which is also how every other number in this app is written.
         */
        const dayNumber = (() => {
            try {
                return new Intl.NumberFormat(tag)
            } catch {
                return new Intl.NumberFormat('en')
            }
        })()
        const monthName = format({ month: 'long' })
        const year = format({ year: 'numeric' })
        const fullDate = format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

        return {
            formatters: {
                formatCaption: (month: Date) => caption.format(month),
                formatWeekdayName: (date: Date) => weekday.format(date),
                formatDay: (date: Date) => dayNumber.format(date.getDate()),
                // Both dropdown formatters take a `Date`, not a number — the month one is handed
                // the first of that month, the year one any day inside it.
                formatMonthDropdown: (month: Date) => monthName.format(month),
                formatYearDropdown: (value: Date) => year.format(value),
            },
            labels: {
                // The three strings a screen reader needs and `Intl` cannot supply. Everything else
                // RDP labels is a date, which `fullDate` above covers.
                labelPrevious: () => t('date_range_previous_month'),
                labelNext: () => t('date_range_next_month'),
                labelDayButton: (date: Date) => fullDate.format(date),
            },
            weekStartsOn: firstDayOfWeek(tag),
            dir: htmlDir(tag),
        }
    }, [tag, t])

    return (
        <DayPicker
            locale={
                /*
                 * RDP still wants a locale *object* for its own date arithmetic (which month a week
                 * belongs to, and so on). Only `weekStartsOn` matters there, and it is passed
                 * separately below — so this is deliberately the empty object rather than one of
                 * `date-fns`'s nine locale bundles, none of which would reach the browser for free.
                 */
                {}
            }
            weekStartsOn={weekStartsOn}
            dir={dir}
            formatters={formatters}
            labels={labels}
            /*
             * `around` — a chevron either side of the caption, which is the layout every date picker a
             * reader has used has. RDP's default parks both buttons in the root's trailing corner,
             * where with two months they land above the second grid and nowhere near the first.
             */
            navLayout="around"
            classNames={CLASS_NAMES}
            /*
             * ## Automation: the day handles are react-day-picker's own, and that is deliberate
             *
             * RDP stamps `data-day="YYYY-MM-DD"` on every gridcell (from `CalendarDay.isoDate`),
             * plus `data-selected`, `data-disabled`, `data-today`, `data-outside` and
             * `data-focused`. So a suite picks a day with
             * `[data-testid='…-calendar'] [data-day='2026-11-07']` and reads its state off the same
             * element — locale-independent, which the accessible name is not: RDP formats that
             * through `Intl`, so "7 November" is nine different strings and Arabic-Indic digits
             * under `ar`.
             *
             * No `data-testid` is added to the cells, and no `DayButton` override: the cells are
             * RDP's, the attributes already exist, and the default `DayButton` carries a ref and an
             * effect that focuses itself on `modifiers.focused` — replacing it to add an attribute
             * that is already there would have silently broken arrow-key navigation. The calendar's
             * own testid scopes them, which is all a caller needs to supply.
             */
            components={{
                // RDP's own chevron is an inline SVG path; the DS sprite is the app's only source of
                // glyphs. `mirrored` is not needed — RDP swaps the two buttons itself under `dir`.
                Chevron: ({ orientation }) => (
                    <Icon
                        name={orientation === 'left' ? 'angle-left' : 'angle-right'}
                        size={20}
                        aria-hidden
                    />
                ),
            }}
            className={cn('w-full', className)}
            {...props}
        />
    )
}
