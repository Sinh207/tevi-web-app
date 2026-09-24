// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EVENT_ORDERS_HEADER, EVENT_SEARCH_HEIGHT, EVENT_TABS_HEIGHT } from '../lib/container'
import { EventReportSkeleton } from './event-report-skeleton'

/**
 * The report's loading state against the page it stands in for.
 *
 * A skeleton's whole job is to reserve the real layout, and it is the one kind of component where
 * being wrong is **invisible**: it renders, it looks like a loading page, every other test passes,
 * and the only symptom is a step at the moment the view arrives — which nobody is watching for,
 * because they are watching the content.
 *
 * This one was 13px short and missing a hairline. The real header had gained `pt-4` and a
 * `border-b`, and the copy here did not, because they were two hand-written copies of the same
 * block. Measured against the live page, the real header stands at **125px**: `pt-4` 16 + a **36px**
 * segmented control + `gap-3` 12 + a **48px** search bar + `pb-3` 12 + a 1px rule. This reserved
 * 112, and drew the tab track at 40 for a control that measures 36.
 */
describe('the report skeleton reserves the real header', () => {
    it('draws the header block from the shared constant, not a copy of it', () => {
        const { container } = render(<EventReportSkeleton />)
        const header = container.firstElementChild?.firstElementChild

        expect(header?.className).toBe(EVENT_ORDERS_HEADER)
    })

    /**
     * ⚠ The heights are read off the **inline style**, which is where `Skeleton` writes them — a
     * `className="h-10"` is silently ignored, so asserting on classes here would pass while the bar
     * stayed 12px.
     */
    it('reserves the measured heights of the two controls it stands in for', () => {
        const { container } = render(<EventReportSkeleton />)
        const header = container.firstElementChild?.firstElementChild
        const [tabs, search] = [
            ...(header?.querySelectorAll('[data-slot="skeleton"]') ?? []),
        ] as HTMLElement[]

        expect(tabs.style.height).toBe(`${EVENT_TABS_HEIGHT}px`)
        expect(search.style.height).toBe(`${EVENT_SEARCH_HEIGHT}px`)
    })

    /** The numbers themselves, so a later edit has to notice it is changing a measurement. */
    it('holds the measurements taken from the live page', () => {
        expect(EVENT_TABS_HEIGHT).toBe(36)
        expect(EVENT_SEARCH_HEIGHT).toBe(48)
        expect(EVENT_ORDERS_HEADER).toContain('pt-4')
        expect(EVENT_ORDERS_HEADER).toContain('border-b')
    })
})

/**
 * ⚠ **A source read, and it is the assertion that actually holds the line.**
 *
 * Everything above tests the skeleton against a constant. What went wrong was not the skeleton
 * drifting from the constant — there was no constant — but the *real* panel and the skeleton being
 * edited independently. So the claim worth pinning is that the panel still spends the shared block
 * rather than having quietly forked it back into a class string, which is a thing no rendered
 * assertion on the skeleton can see.
 */
describe('the real panel and the skeleton share one header', () => {
    // `import.meta.url` is not a file URL under the jsdom environment — it comes back as the
    // served path — so the read is anchored on the repo root instead.
    const panel = readFileSync(
        join(process.cwd(), 'src/features/event/components/event-orders-panel.tsx'),
        'utf8',
    )

    it('the orders panel draws the shared header constant', () => {
        expect(panel).toContain('EVENT_ORDERS_HEADER')
    })

    it('the orders panel draws the shared row skeleton rather than its own copy', () => {
        expect(panel).toContain('EventOrderRowsSkeleton')
    })
})
