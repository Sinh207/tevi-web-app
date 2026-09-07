// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

/**
 * `pending` — the one prop on this dialog whose job is entirely **visible**, and which for a while
 * only greyed two buttons out.
 *
 * It is tested here rather than at a call site because there are twenty of them and the wait is the
 * component's contract, not any one screen's: the reported symptom ("why is there no loading?") came
 * from `/gift-premium`, and the same dialog stands in front of a payout, a subscription cancel and a
 * card removal. A rendered tree is needed because the claim is about what is in the DOM.
 */

function open(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    render(
        <ConfirmDialog
            open
            onOpenChange={() => {}}
            title="Gift 12 months?"
            confirmLabel="Yes"
            cancelLabel="Close"
            onConfirm={() => {}}
            testId="gift-confirm"
            {...props}
        />,
    )
}

const confirm = () => screen.getByTestId('gift-confirm-confirm')
const cancel = () => screen.getByTestId('gift-confirm-cancel')
const loaderIn = (el: HTMLElement) => el.querySelector('[data-slot="loader"]')
/*
 * Plain DOM assertions, not `@testing-library/jest-dom`: this repo does not install those matchers
 * (`vitest.config.ts` has no setup file), so `toBeDisabled` is a silent `Invalid Chai property`.
 * `button.test.tsx` reads attributes the same way.
 */
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled

describe('ConfirmDialog — pending', () => {
    it('draws nothing extra at rest', () => {
        open()
        expect(loaderIn(confirm())).toBeNull()
        expect(isDisabled(confirm())).toBe(false)
        expect(confirm().hasAttribute('aria-busy')).toBe(false)
    })

    it('puts the working indicator on the confirm button, beside its label', () => {
        open({ pending: true })
        expect(loaderIn(confirm())).not.toBeNull()
        /*
         * **The label survives.** Replacing it with "Loading…" moves the text, changes the button's
         * width mid-press and loses the one word that says what is happening.
         */
        expect(confirm().textContent).toContain('Yes')
    })

    it('says it is working, not just that it is unavailable', () => {
        // Disabled alone tells a screen reader the control cannot be used, which is a different
        // fact from "the thing you asked for is in progress".
        open({ pending: true })
        expect(isDisabled(confirm())).toBe(true)
        expect(confirm().getAttribute('aria-busy')).toBe('true')
    })

    it('gives Cancel no indicator, and still disables it', () => {
        /*
         * One thing is running, and a spinner on the button that is *not* doing it would say the
         * opposite. It stays disabled because the action is already away — offering Cancel would
         * suggest it can be called off.
         */
        open({ pending: true })
        expect(isDisabled(cancel())).toBe(true)
        expect(loaderIn(cancel())).toBeNull()
    })

    it('refuses a press while pending, from either button', () => {
        const onConfirm = vi.fn()
        const onOpenChange = vi.fn()
        open({ pending: true, onConfirm, onOpenChange })

        confirm().click()
        cancel().click()

        expect(onConfirm).not.toHaveBeenCalled()
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('is drawn for the destructive shape too', () => {
        // The ink differs; the wait does not.
        open({ pending: true, destructive: true })
        expect(loaderIn(confirm())).not.toBeNull()
    })
})
