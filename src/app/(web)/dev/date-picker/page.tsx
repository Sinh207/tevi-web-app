import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DatePickerPreview } from './preview'

export const metadata: Metadata = {
    title: 'Date picker',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the app's date controls: `pnpm dev`, then open `/dev/date-picker`. 404s in
 * production (`proxy.ts` stops the request; the `notFound()` below is the belt to those braces).
 *
 * It exists because all three real call sites are **behind a session**: the profile form and the
 * onboarding gate need a signed-in account, and the dashboard's range picker needs a creator with
 * figures. A calendar is also the kind of component you cannot review by reading its props — the
 * things that go wrong with it are which column the week starts in, whether the range band is
 * continuous, and whether it mirrors in Arabic.
 *
 * Copy is inlined rather than translated: a dev preview that needed i18n plumbing would be a second
 * consumer of every key. The locale row below is the exception and the point — it renders the same
 * calendar at four locales at once, which is the only way to see the week-start and numeral
 * differences side by side.
 */
export default function DevDatePickerPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Date picker</h1>
                <p className="type-dense-default text-(--text-body)">
                    `shared/components/calendar.tsx` — `react-day-picker` dressed in DS tokens, with
                    every visible string from `Intl`. The two controls built on it are `DateField`
                    (one date, in a popover) and `DateRangeDialog` (a range, in a dialog).
                </p>
            </header>

            <DatePickerPreview />
        </main>
    )
}
