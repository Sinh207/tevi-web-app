// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwoStepVerificationDialog } from './two-step-verification-dialog'

/**
 * The passcode gate in front of a withdrawal, and the four claims a comment cannot hold.
 *
 * 1. **The sixth digit verifies** — there is no button, so if that does not fire nothing does.
 * 2. **The accepted code is handed back**, because the caller has to put it on its own request. A
 *    dialog that only reported "verified" would let a withdrawal go out without the field the backend
 *    enforces.
 * 3. **One request per completion.** A paste and an autofill can land in the same tick; a passcode
 *    endpoint is one of the few where a duplicate attempt can count against a lockout.
 * 4. **A rejection clears the boxes and never shows the backend's sentence.**
 */

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

const verifyPasscode = vi.fn()
vi.mock('../api/two-fa-api', () => ({
    twoFaApi: { verifyPasscode: (...args: unknown[]) => verifyPasscode(...args) },
}))
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

function show(props: Partial<Parameters<typeof TwoStepVerificationDialog>[0]> = {}) {
    const onClose = vi.fn()
    const onVerified = vi.fn()
    render(<TwoStepVerificationDialog open onClose={onClose} onVerified={onVerified} {...props} />)
    return { onClose, onVerified }
}

/** The boxes, in order. One tab stop, so they are addressed by their own testid. */
const digits = () => screen.getAllByTestId('auth-two-fa-digit') as HTMLInputElement[]

/** Type a whole code the way a person does — one `change` per box. */
function type(code: string) {
    for (const [index, digit] of [...code].entries()) {
        fireEvent.change(digits()[index], { target: { value: digit } })
    }
}

beforeEach(() => {
    verifyPasscode.mockReset()
    verifyPasscode.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('TwoStepVerificationDialog', () => {
    it('verifies on the sixth digit, with no button to press', () => {
        show()
        // The claim is that completion is the trigger — so there must be nothing else that could be.
        expect(screen.queryByRole('button', { name: /submit|confirm|continue/i })).toBeNull()

        type('12345')
        expect(verifyPasscode).not.toHaveBeenCalled()

        type('123456')
        expect(verifyPasscode).toHaveBeenCalledTimes(1)
        expect(verifyPasscode).toHaveBeenCalledWith('123456', 'acc-1')
    })

    /**
     * **The account is pinned.** Verifying as whoever happens to be active when the request goes out
     * would let a passcode proved on one account authorise a request sent as another.
     */
    it('pins the request to the active account', async () => {
        show()
        type('999111')
        await waitFor(() => expect(verifyPasscode).toHaveBeenCalled())
        expect(verifyPasscode.mock.calls[0][1]).toBe('acc-1')
    })

    it('hands the accepted code back to the caller', async () => {
        const { onVerified } = show()
        type('246810')
        await waitFor(() => expect(onVerified).toHaveBeenCalledWith('246810'))
    })

    /** A paste fills every box in one event, and that is still one completion. */
    it('verifies once for a pasted code', async () => {
        const { onVerified } = show()
        fireEvent.paste(digits()[0], {
            clipboardData: { getData: () => '135790' },
        })
        await waitFor(() => expect(onVerified).toHaveBeenCalledWith('135790'))
        expect(verifyPasscode).toHaveBeenCalledTimes(1)
    })

    /**
     * Two completions in the same tick — the shape a paste racing an SMS autofill takes. `setBusy`
     * lands on the *next* render, so only a ref can stop the second.
     */
    it('sends one request when two completions land in the same tick', async () => {
        show()
        let resolve = () => {}
        verifyPasscode.mockImplementation(
            () =>
                new Promise<void>(done => {
                    resolve = () => done()
                }),
        )
        const boxes = digits()
        type('111111')
        fireEvent.paste(boxes[0], { clipboardData: { getData: () => '222222' } })
        expect(verifyPasscode).toHaveBeenCalledTimes(1)
        resolve()
    })

    it('clears the boxes and states the refusal when the code is wrong', async () => {
        const { onVerified } = show()
        verifyPasscode.mockRejectedValue(
            new ApiError({
                message: 'Request failed with status code 422',
                status: 422,
                data: { message: 'Passcode is not correct, 2 attempts left' },
            }),
        )
        type('000000')

        await waitFor(() => expect(screen.getByTestId('auth-two-fa-error')).toBeTruthy())
        // Our key, never the backend's sentence — even a helpful one, which is English in nine locales.
        expect(screen.getByTestId('auth-two-fa-error').textContent).toBe('auth_two_fa_wrong')
        expect(screen.queryByText(/attempts left/)).toBeNull()
        // Six digits already known to be wrong are six the reader would have to delete.
        expect(digits().every(box => box.value === '')).toBe(true)
        expect(onVerified).not.toHaveBeenCalled()
    })

    /** A wrong code must be retryable — the in-flight latch has to release on the failure path too. */
    it('accepts a second attempt after a rejection', async () => {
        const { onVerified } = show()
        verifyPasscode.mockRejectedValueOnce(new ApiError({ message: 'no', status: 422 }))
        type('000000')
        await waitFor(() => expect(screen.getByTestId('auth-two-fa-error')).toBeTruthy())

        verifyPasscode.mockResolvedValueOnce(undefined)
        type('654321')
        await waitFor(() => expect(onVerified).toHaveBeenCalledWith('654321'))
    })

    /**
     * The caller's own refusal — the *write* rejected the passcode, so the dialog re-opened. Without it
     * the dialog comes back looking identical to the first time, which reads as a dropped press.
     */
    it('shows the caller-supplied reason it re-opened', () => {
        show({ error: 'This withdrawal needs your passcode.' })
        expect(screen.getByTestId('auth-two-fa-error').textContent).toBe(
            'This withdrawal needs your passcode.',
        )
    })

    /** …and drops it the moment a fresh digit is typed: it was about the code that has been replaced. */
    it('drops the caller reason once the reader starts typing', () => {
        show({ error: 'This withdrawal needs your passcode.' })
        type('1')
        expect(screen.queryByTestId('auth-two-fa-error')).toBeNull()
    })

    /**
     * **Never disabled while a check is in flight.** Disabling a focused input makes the browser drop
     * focus to `body`, so the boxes come back enabled but unfocused — nothing typed goes anywhere, and
     * on a phone the keyboard closes.
     */
    it('leaves the boxes enabled while verifying', () => {
        show()
        verifyPasscode.mockImplementation(() => new Promise<void>(() => {}))
        type('123456')
        expect(digits().every(box => box.disabled)).toBe(false)
    })
})
