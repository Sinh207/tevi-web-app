// @vitest-environment jsdom
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DialogCloseButton } from './dialog-close-button'

/**
 * Two claims, and both of them fail *silently*.
 *
 * - **Omitting `onClose` still dismisses the dialog.** That path renders through base-ui's
 *   `DialogClose` behind `Button`'s `render` prop, and a `render` that stops composing leaves a glyph
 *   that looks right and does nothing. Four dialogs rely on it (`LoginDialog`, `GetAppDialog`,
 *   `AccountSwitcherDialog`, `NotificationFilterDialog`), and every one of them is the only visible
 *   way out of itself.
 * - **The target is 40px and the glyph is 20.** `Button`'s size variant sizes any `svg` that carries
 *   no `size-*` class of its own, and a CSS class beats `Icon`'s `width`/`height` attributes — so
 *   `size="small"` drew a **16px** `xmark` inside the 40px box for as long as this component's own doc
 *   claimed 20. Measured in a browser, not read.
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(true)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent data-testid="probe-dialog">
                <p>body</p>
                <DialogCloseButton
                    data-testid="probe-close"
                    onClose={onClose}
                    className="absolute end-2 top-2"
                />
            </DialogContent>
        </Dialog>
    )
}

describe('DialogCloseButton', () => {
    it('dismisses the dialog itself when no onClose is given', () => {
        render(<Harness />)
        expect(screen.getByTestId('probe-dialog')).toBeTruthy()

        fireEvent.click(screen.getByTestId('probe-close'))

        expect(screen.queryByTestId('probe-dialog')).toBeNull()
    })

    it('hands the press to onClose instead when the caller owns the open state', () => {
        const onClose = vi.fn()
        render(<Harness onClose={onClose} />)

        fireEvent.click(screen.getByTestId('probe-close'))

        expect(onClose).toHaveBeenCalledTimes(1)
        // The caller closes; the button must not also dismiss, or a refusal to close is impossible.
        expect(screen.getByTestId('probe-dialog')).toBeTruthy()
    })

    it('is a real button carrying its own accessible name', () => {
        render(<Harness />)
        const close = screen.getByTestId('probe-close')

        expect(close.tagName).toBe('BUTTON')
        expect(close.getAttribute('aria-label')).toBe('common_close')
        // base-ui adds `role="button"` when it believes it is *not* rendering a native one — which is
        // what happens if `nativeButton` stops being stated once `render` hides the element type.
        expect(close.getAttribute('role')).toBeNull()
    })

    it('draws a 40px target around a 20px glyph', () => {
        render(<Harness />)
        const close = screen.getByTestId('probe-close')

        // jsdom computes no layout, so the claim is the classes that produce it. Both halves matter:
        // `Icon` sets `width`/`height` as **attributes**, and `Button`'s size variant sets the same
        // dimensions as a **class** on any `svg` without one — CSS wins, so the attribute alone proves
        // nothing. `size="large"`'s rule is `size-5` (20px) and agrees with it; `size="small"`'s is
        // `size-4`, which is how the glyph was 16px while this file said 20.
        expect(close.className).toContain('size-10')
        expect(close.querySelector('svg')?.getAttribute('width')).toBe('20')
        expect(close.className).toMatch(/\[&_svg:not\(\[class\*='size-'\]\)\]:size-5/)
    })
})
