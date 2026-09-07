// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type ActionRow, ActionRows } from './action-rows'

/**
 * The three states an action row can be in, and why each is a **rendered** test rather than a
 * `Probe`: every claim here is about the element that ends up in the DOM — its tag, its `disabled`,
 * what `aria-describedby` points at — and none of them is visible from a return value.
 *
 * They all fail silently, which is the reason they are pinned at all:
 *
 * - **A `disabledReason` on a row that still has an `href` must produce a `<button>`.** `disabled` is
 *   not an anchor attribute, so a dimmed `Link` looks inert and still navigates — on press *and* on
 *   Enter. Nothing about the rendered page says so.
 * - **The reason has to reach the accessible description.** 40% opacity is not an announcement, so a
 *   screen-reader user gets a row that is simply unpressable with no explanation. `/my-star`'s Gift
 *   Star row is the live case: at a zero Star balance it dims, and the sentence saying why is the
 *   only difference from "coming soon".
 * - **A row with neither destination nor action keeps the old treatment.** `unavailableLabel` is the
 *   list-wide fallback, and the two states share every class — so a regression that collapsed them
 *   would change nothing visible and only mislabel one of them.
 */

const UNAVAILABLE = 'Coming soon'

/**
 * `Pick` rather than `Partial<ActionRow>`: the row's glyph is a **name/weight union**, and
 * `Partial` over it widens `iconWeight` to `'filled' | undefined`, which then satisfies no arm — so
 * spreading the result is a type error. Nothing here overrides the glyph anyway; what these tests
 * vary is what the row *does*.
 */
type Behaviour = Partial<Pick<ActionRow, 'href' | 'onClick' | 'disabledReason'>>

function rowsWith(overrides: Behaviour): ActionRow[] {
    return [
        {
            key: 'ready',
            label: 'Get Star',
            icon: 'plus-circle',
            tile: 'var(--accents-warning-active)',
            href: '/get-star',
        },
        {
            key: 'subject',
            label: 'Gift Star',
            icon: 'gift-simple',
            tile: 'var(--accents-indigo-active)',
            ...overrides,
        },
    ]
}

function renderRows(overrides: Behaviour) {
    render(<ActionRows testId="probe" rows={rowsWith(overrides)} unavailableLabel={UNAVAILABLE} />)
    const row = screen.getAllByTestId('probe-row').find(el => el.dataset.rowKey === 'subject')
    if (!row) throw new Error('subject row did not render')
    return row
}

/** What a screen reader would read out for the row, resolved through `aria-describedby`. */
function describedBy(row: HTMLElement): string | null {
    const id = row.getAttribute('aria-describedby')
    return id === null ? null : (document.getElementById(id)?.textContent ?? null)
}

describe('ActionRows', () => {
    it('renders a row with a destination as a link', () => {
        const row = renderRows({ href: '/somewhere' })

        expect(row.tagName).toBe('A')
        expect(row.getAttribute('href')).toBe('/somewhere')
        expect(describedBy(row)).toBeNull()
    })

    it('renders a row with only an action as an enabled button', () => {
        const row = renderRows({ onClick: () => undefined })

        expect(row.tagName).toBe('BUTTON')
        expect((row as HTMLButtonElement).disabled).toBe(false)
        expect(describedBy(row)).toBeNull()
    })

    /**
     * The one that matters. The row keeps its `href` in the data — the caller states *why* it is shut
     * rather than stripping and restoring the destination — so the component has to override both the
     * element and the attribute, not just dim it.
     */
    it('shuts a row with a disabledReason, even when it has a destination', () => {
        const row = renderRows({
            href: '/somewhere',
            disabledReason: 'You have no Star to gift yet.',
        })

        expect(row.tagName).toBe('BUTTON')
        expect((row as HTMLButtonElement).disabled).toBe(true)
        expect(row.hasAttribute('href')).toBe(false)
        expect(describedBy(row)).toBe('You have no Star to gift yet.')
    })

    it('shuts a row with an action but a reason, and announces the reason over the fallback', () => {
        const row = renderRows({ onClick: () => undefined, disabledReason: 'Not right now.' })

        expect((row as HTMLButtonElement).disabled).toBe(true)
        expect(describedBy(row)).toBe('Not right now.')
        expect(describedBy(row)).not.toBe(UNAVAILABLE)
    })

    it('keeps the not-ready treatment for a row with neither', () => {
        const row = renderRows({})

        expect(row.tagName).toBe('BUTTON')
        expect((row as HTMLButtonElement).disabled).toBe(true)
        expect(describedBy(row)).toBe(UNAVAILABLE)
    })
})
