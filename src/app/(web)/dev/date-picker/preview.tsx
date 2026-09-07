'use client'

import { LazyCalendar } from '@shared/components/calendar-lazy'
import { DateField } from '@shared/components/date-field'
import { DateRangeDialog } from '@shared/components/date-range-dialog'
import { toDateValue } from '@shared/lib/date-value'
import { Button } from '@shared/ui/button'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'

/**
 * The interactive half of `/dev/date-picker`.
 *
 * Four things worth actually looking at, and each is a section below:
 *
 * 1. **the range band** — that the middle of a selection is one continuous bar and its ends are
 *    rounded on the outer edge only;
 * 2. **the locale row** — Vietnamese starts its week on Monday, Arabic on Saturday and mirrors, and
 *    Arabic day numbers are Arabic-Indic. All three come from `Intl` plus `firstDayOfWeek`, with no
 *    locale data bundled;
 * 3. **`DateField`** — the popover, its dropdown caption (which is what makes a date of birth three
 *    presses), and the disabled days past `max`;
 * 4. **`DateRangeDialog`** — the whole dialog, including Apply staying disabled until both ends exist.
 *
 * The two inline sections use `LazyCalendar`, not `Calendar`, because that is how the app mounts it —
 * and because it *must* be client-only: an earlier version of this page imported `Calendar` directly
 * and React reported a hydration mismatch on the Vietnamese weekday header (`Th 2` from Node's ICU
 * against `Thứ 2` from Chrome's). See the note in `calendar.tsx`.
 */

/** A fixed month, so the preview looks the same tomorrow. */
const ANCHOR = new Date(2025, 1, 19)

export function DatePickerPreview() {
    const [range, setRange] = useState<DateRange | undefined>({
        from: new Date(2025, 1, 10),
        to: new Date(2025, 1, 18),
    })
    const [single, setSingle] = useState<Date | undefined>(ANCHOR)
    const [dob, setDob] = useState('1996-04-12')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [applied, setApplied] = useState<string>('—')

    return (
        <div className="flex flex-col gap-10">
            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    range · single — the band, the ends, and today's ring
                </h2>
                <div className="flex flex-wrap gap-4">
                    <div className="w-[320px] rounded-xl border border-(--separator-default) bg-(--background-surface) p-3">
                        <LazyCalendar
                            mode="range"
                            selected={range}
                            onSelect={setRange}
                            defaultMonth={ANCHOR}
                        />
                    </div>
                    <div className="w-[320px] rounded-xl border border-(--separator-default) bg-(--background-surface) p-3">
                        <LazyCalendar
                            mode="single"
                            selected={single}
                            onSelect={setSingle}
                            defaultMonth={ANCHOR}
                            // Everything after today greyed out, which is every report filter's rule.
                            disabled={{ after: new Date() }}
                        />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    four locales — week start, month names, numerals, direction
                </h2>
                <div className="flex flex-wrap gap-4">
                    {(['en', 'vi', 'ar', 'ko'] as const).map(locale => (
                        <div
                            key={locale}
                            dir={locale === 'ar' ? 'rtl' : 'ltr'}
                            className="w-[300px] rounded-xl border border-(--separator-default) bg-(--background-surface) p-3"
                        >
                            <p className="type-caption-meta pb-2 text-(--text-subtitle)">
                                {locale}
                            </p>
                            <LazyCalendar
                                locale={locale}
                                mode="range"
                                selected={range}
                                onSelect={setRange}
                                defaultMonth={ANCHOR}
                            />
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex max-w-[420px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    DateField — as the profile form and the onboarding gate use it
                </h2>
                <DateField
                    label="Date of birth"
                    value={dob}
                    onValueChange={setDob}
                    max={toDateValue(new Date())}
                    hint="Only you can see this."
                />
                <DateField
                    label="Date of birth (empty, and invalid)"
                    value=""
                    onValueChange={() => undefined}
                    error="Enter a date of birth."
                />
                <DateField
                    label="Date of birth (disabled)"
                    value={dob}
                    onValueChange={() => undefined}
                    disabled
                />
            </section>

            <section className="flex max-w-[420px] flex-col items-start gap-3">
                <h2 className="type-micro-overline text-(--text-body)">
                    DateRangeDialog — two months from `sm`, one below
                </h2>
                <Button variant="secondary" size="medium" onClick={() => setDialogOpen(true)}>
                    Open the range picker
                </Button>
                <p className="type-dense-default text-(--text-body)">Applied: {applied}</p>
                <DateRangeDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    value={{
                        startMs: new Date(2025, 0, 21).getTime(),
                        endMs: new Date(2025, 1, 19).getTime(),
                    }}
                    onApply={(from, to) => {
                        setApplied(`${toDateValue(from)} → ${toDateValue(to)}`)
                        setDialogOpen(false)
                    }}
                />
            </section>
        </div>
    )
}
