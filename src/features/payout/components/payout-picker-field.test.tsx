// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PayoutPickerField } from './payout-picker-field'

/**
 * **Which shape a choice field takes**, which is the one decision in this component a reader feels and
 * no other test can see.
 *
 * The rule: under `SEARCHABLE_FROM` rows it is a menu anchored to the field — two USDT networks or
 * four Indonesian wallets are a glance and one tap — and from there up it is a dialog with a search
 * field, because 54 banks and 250 countries have to be searched rather than read. Flip it by accident
 * and nothing breaks: a two-row modal and an unsearchable 54-row menu both "work".
 *
 * A rendered tree rather than a hook probe, because the claim *is* the markup: a `menuitemradio`
 * versus a `dialog` with a search box in it. `fireEvent`, as the other component tests here use —
 * `@testing-library/user-event` is not a dependency of this repo.
 */

function options(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        value: `v${index}`,
        label: `Option ${index}`,
    }))
}

afterEach(cleanup)

function renderField(count: number, onSelect = vi.fn()) {
    render(
        <PayoutPickerField
            testId="payout-setup-field"
            label="Network"
            dialogTitle="Choose network"
            placeholder="Select network"
            value=""
            options={options(count)}
            onSelect={onSelect}
        />,
    )
    return { onSelect, trigger: screen.getByTestId('payout-setup-field') }
}

describe('PayoutPickerField', () => {
    it('opens a short list as a menu on the field', async () => {
        const { trigger } = renderField(4)

        fireEvent.click(trigger)

        const rows = await screen.findAllByRole('menuitemradio')
        expect(rows).toHaveLength(4)
        // Nothing to search: four rows are read, not filtered.
        expect(screen.queryByTestId('payout-setup-field-search')).toBeNull()
    })

    it('opens a long list as a searchable dialog', async () => {
        const { trigger } = renderField(12)

        fireEvent.click(trigger)

        /*
         * The panel by its id rather than by `role="dialog"`: base-ui labels the popup itself and the
         * role lands on a node this component does not own, so asserting on it would be asserting on
         * the primitive. What the *caller* promised is a searchable panel of radios.
         */
        // `toBeTruthy`, not `toBeInTheDocument`: this repo does not install jest-dom's matchers.
        await waitFor(() => expect(screen.getByTestId('payout-setup-field-panel')).toBeTruthy())
        expect(screen.getByTestId('payout-setup-field-search')).toBeTruthy()
        // A `radiogroup`'s radios, not menu items — the dialog half is `PickerList`.
        expect(screen.getAllByRole('radio')).toHaveLength(12)
        expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
    })

    it('reports the picked value', async () => {
        const short = renderField(3)
        fireEvent.click(short.trigger)

        const rows = await screen.findAllByRole('menuitemradio')
        fireEvent.click(rows[1])

        await waitFor(() => expect(short.onSelect).toHaveBeenCalledWith('v1'))
    })

    it('filters the dialog on the value as well as the label', async () => {
        // A country's code is what half the world knows it by, so `US` has to find United States —
        // here the labels are `Option n` and the *values* are `vn`, so a match can only come from
        // the value.
        renderField(12)
        fireEvent.click(screen.getByTestId('payout-setup-field'))

        const search = await screen.findByTestId('payout-setup-field-search')
        fireEvent.change(search, { target: { value: 'v11' } })

        await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    })
})
