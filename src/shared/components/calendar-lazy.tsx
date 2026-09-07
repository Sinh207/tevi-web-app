'use client'

import { Loader } from '@shared/ui/loader'
import dynamic from 'next/dynamic'

/**
 * The calendar, loaded only when something opens one.
 *
 * `react-day-picker` plus the `date-fns` internals it reaches for is ~15 KB gzipped that most
 * sessions never need: a date picker lives behind a button on a handful of screens. Splitting it here
 * — once — means every consumer gets the same lazy boundary and the same fallback, instead of each
 * one deciding whether to bother. Legacy's picker is imported eagerly on the dashboard, stylesheet
 * and all, whether or not it is ever opened.
 *
 * The fallback holds the grid's own height, so a dialog or popover does not resize under the reader
 * when the chunk lands. `ssr: false` because there is nothing to server-render behind a closed
 * overlay, and the component reads `window` for its locale's week start.
 */

/** Two rows of chrome plus six weeks of a 36px grid — what the real calendar measures. */
export const CALENDAR_MIN_HEIGHT = 300

export const LazyCalendar = dynamic(() => import('./calendar').then(module => module.Calendar), {
    ssr: false,
    loading: () => (
        <div
            aria-busy="true"
            className="flex items-center justify-center"
            style={{ minHeight: CALENDAR_MIN_HEIGHT }}
        >
            <Loader />
        </div>
    ),
})
