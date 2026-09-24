// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { normalizeGiftPackages } from '../api/gift-types'
import { EventGiftPanel } from './event-gift-panel'
import { EventGiftTray } from './event-gift-tray'

/**
 * **The catalogue's open/close gesture**, which is legacy's and is the thing this port got wrong.
 *
 * Hover *View more* and the catalogue appears; take the pointer off the **panel** and it goes. The
 * pair is easy to half-implement and impossible to see in a screenshot, and the failure mode that
 * matters is subtle: put the leave handler on the trigger instead of the panel and the catalogue
 * shuts in the gap between the two, so it can never actually be reached with the pointer that
 * opened it. That is what these assertions are for.
 *
 * `fireEvent` rather than `user-event` — the repo does not carry the latter, and `mouseEnter` /
 * `mouseLeave` are exactly the two events under test.
 */

const PACKAGES = normalizeGiftPackages({
    results: [
        {
            id: 1,
            quantity: 1,
            price: '1.00',
            product: { name: 'Rose', images: { thumb: null }, exclusive: '' },
        },
    ],
})

function renderTray(props: Partial<Parameters<typeof EventGiftTray>[0]> = {}) {
    const onOpenCatalog = vi.fn()
    const onCloseCatalog = vi.fn()
    render(
        <EventGiftTray
            packages={PACKAGES}
            isLoading={false}
            pendingId={null}
            canSend
            onSend={() => {}}
            isCatalogOpen={false}
            onOpenCatalog={onOpenCatalog}
            onCloseCatalog={onCloseCatalog}
            testId="event-gift-tray"
            {...props}
        />,
    )
    return { onOpenCatalog, onCloseCatalog, trigger: screen.getByTestId('event-gift-tray-trigger') }
}

describe('the View more control', () => {
    it('opens the catalogue on hover, which is the legacy gesture', () => {
        const { onOpenCatalog, trigger } = renderTray()
        fireEvent.mouseEnter(trigger)
        expect(onOpenCatalog).toHaveBeenCalledTimes(1)
    })

    /**
     * ⚠ The half that is easy to add and wrong: closing must belong to the **panel**, so that the
     * pointer can travel from this button to it. A `mouseLeave` here would shut the catalogue
     * before it could be reached.
     */
    it('does not close when the pointer leaves the button itself', () => {
        const { onCloseCatalog, trigger } = renderTray()
        fireEvent.mouseEnter(trigger)
        fireEvent.mouseLeave(trigger)
        expect(onCloseCatalog).not.toHaveBeenCalled()
    })

    /* Still a button: a reader with no pointer gets the same catalogue. */
    it('opens on press when the catalogue is closed', () => {
        const { onOpenCatalog, onCloseCatalog, trigger } = renderTray({ isCatalogOpen: false })
        fireEvent.click(trigger)
        expect(onOpenCatalog).toHaveBeenCalled()
        expect(onCloseCatalog).not.toHaveBeenCalled()
    })

    it('closes on press when it is already open', () => {
        const { onCloseCatalog, trigger } = renderTray({ isCatalogOpen: true })
        fireEvent.click(trigger)
        expect(onCloseCatalog).toHaveBeenCalled()
    })

    /* State is published as `aria-*`, never encoded in the testid — `docs/TEST_IDS.md`. */
    it('publishes its state as aria-expanded', () => {
        const { trigger } = renderTray({ isCatalogOpen: true })
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })
})

describe('the catalogue panel', () => {
    function renderPanel() {
        const onClose = vi.fn()
        render(
            <EventGiftPanel
                packages={PACKAGES}
                exclusive={[]}
                publishers={[]}
                recipient={null}
                onSelectRecipient={() => {}}
                pendingId={null}
                canSend
                onSend={() => {}}
                onClose={onClose}
                testId="event-gift-panel"
            />,
        )
        return { onClose, panel: screen.getByTestId('event-gift-panel') }
    }

    it('closes itself when the pointer leaves it', () => {
        const { onClose, panel } = renderPanel()
        fireEvent.mouseLeave(panel)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    /* An addition to legacy rather than a change: it has no keyboard dismissal at all. */
    it('also closes on Escape', () => {
        const { onClose } = renderPanel()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
