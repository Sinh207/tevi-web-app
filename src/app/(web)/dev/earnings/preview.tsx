'use client'

import { type EarningsDay, EarningsDayRow } from '@features/earnings'
import { useState } from 'react'

/**
 * The interactive half of `/dev/earnings`.
 *
 * It holds the one piece of state the real screen's view holds — which day is open — so the
 * disclosure can actually be watched, which is most of why the page exists.
 *
 * ⚠ The expanded panel here still fires the **real** detail request, because `EarningsDayRow` owns
 * its own query. Signed out, or on a day the account did not earn on, that comes back empty or
 * fails — and those are exactly the two states worth looking at, so it is left as is rather than
 * mocked. Nothing here writes.
 */
export function EarningsPreview({ days }: { days: EarningsDay[] }) {
    const [openDate, setOpenDate] = useState<number | null>(days[0]?.date ?? null)

    return (
        <div className="flex flex-col gap-3">
            {days.map(day => (
                <EarningsDayRow
                    key={day.id}
                    day={day}
                    locale="en"
                    expanded={openDate === day.date}
                    onToggle={() =>
                        setOpenDate(current => (current === day.date ? null : day.date))
                    }
                />
            ))}
        </div>
    )
}
