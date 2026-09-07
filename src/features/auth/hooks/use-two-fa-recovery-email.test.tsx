// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type TwoFaRecoveryEmail, useTwoFaRecoveryEmail } from './use-two-fa-recovery-email'

/**
 * Changing the recovery address: nominate it, confirm it with a mailed code.
 *
 * Two calls, both at the auth root rather than under `two-fa/` —
 * `POST v1/recovery-email/verify/` then `PATCH v1/recovery-email/` — and this file exists because
 * three earlier shapes were each wrong in a way only a sequence can express:
 *
 * 1. **The address step must write nothing.** The first cut committed on the passcode alone with
 *    `PATCH two-fa/passcode/`, which answers `"Passcode must be 6 digits"` (it wants `new_passcode`).
 * 2. **`POST two-fa/passcode/` cannot be reused** to edit one field: it answers `422 AU001` for an
 *    account that already has a passcode.
 * 3. **There is no read-back to do.** `GET two-fa/passcode/` returns the address **masked**, so
 *    comparing it against what the reader typed would fail on every success — which is also why the
 *    field is never pre-filled from the record.
 *
 * What guards the write instead is the rule this hook shipped without: the **API's own sentence**
 * reaches the screen on a 4xx (`docs/API_ERRORS.md`). Without it the refusal in (1) surfaced as
 * "Couldn't update your recovery email", the one line that could not diagnose it.
 */

const sendRecoveryEmailOtp = vi.fn()
const saveRecoveryEmail = vi.fn()

vi.mock('../api/two-fa-api', () => ({
    twoFaApi: {
        sendRecoveryEmailOtp: (...a: unknown[]) => sendRecoveryEmailOtp(...a),
        saveRecoveryEmail: (...a: unknown[]) => saveRecoveryEmail(...a),
        // Imported by `use-two-fa-flow`, which this hook borrows `PASSCODE_LENGTH` from.
        verifyPasscode: vi.fn(),
        recoverPasscode: vi.fn(),
        verifyResetOtp: vi.fn(),
        resetPasscode: vi.fn(),
    },
}))
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

function Probe({ out, onChanged }: { out: { flow?: TwoFaRecoveryEmail }; onChanged: () => void }) {
    out.flow = useTwoFaRecoveryEmail({ onChanged })
    return null
}

function mount() {
    const onChanged = vi.fn()
    const out: { flow?: TwoFaRecoveryEmail } = {}
    render(<Probe out={out} onChanged={onChanged} />)
    return {
        onChanged,
        get flow() {
            return out.flow as TwoFaRecoveryEmail
        },
    }
}

/** Type a new address and press Continue, landing on the code step. */
async function nominate(h: ReturnType<typeof mount>, email = 'new@tevi.com') {
    act(() => h.flow.setEmail(email))
    await act(async () => h.flow.sendCode(true))
}

const rejection = (status: number, data?: unknown) =>
    new ApiError({ message: `Request failed with status code ${status}`, status, data })

async function runOutTheCode() {
    for (let i = 0; i < 61; i += 1) {
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
    }
}

beforeEach(() => {
    sendRecoveryEmailOtp.mockReset()
    sendRecoveryEmailOtp.mockResolvedValue(undefined)
    saveRecoveryEmail.mockReset()
    saveRecoveryEmail.mockResolvedValue(undefined)
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    cleanup()
})

describe('nominating the address', () => {
    it('opens empty — never on the record’s masked address', () => {
        const h = mount()
        expect(h.flow.step).toBe('email')
        expect(h.flow.email).toBe('')
        expect(h.flow.isEmailValid).toBe(false)
    })

    it('refuses to send to an address that is not one', async () => {
        const h = mount()
        await nominate(h, 'not-an-address')
        expect(sendRecoveryEmailOtp).not.toHaveBeenCalled()
        expect(h.flow.errorKey).toBe('auth_email_invalid')
        expect(h.flow.step).toBe('email')
    })

    /** `POST v1/recovery-email/verify/ { recovery_email }` — not the login OTP this once guessed. */
    it('asks recovery-email/verify for the code and moves on', async () => {
        const h = mount()
        await nominate(h)
        expect(sendRecoveryEmailOtp).toHaveBeenCalledWith('new@tevi.com', 'acc-1')
        expect(h.flow.step).toBe('code')
        expect(h.flow.resendIn).toBe(60)
    })

    /** **The address step writes nothing** — the whole reason there is a second screen. */
    it('writes nothing on the address step', async () => {
        const h = mount()
        await nominate(h)
        expect(saveRecoveryEmail).not.toHaveBeenCalled()
        expect(h.onChanged).not.toHaveBeenCalled()
    })

    it('drops the code when the address is edited', async () => {
        const h = mount()
        await nominate(h)
        act(() => h.flow.setOtp('12'))
        act(() => h.flow.back())
        expect(h.flow.step).toBe('email')
        expect(h.flow.otp).toBe('')
        expect(h.flow.resendIn).toBe(0)
    })

    it('refuses a resend while the countdown runs, and allows one after', async () => {
        const h = mount()
        await nominate(h)
        expect(sendRecoveryEmailOtp).toHaveBeenCalledTimes(1)
        await act(async () => h.flow.resend())
        expect(sendRecoveryEmailOtp).toHaveBeenCalledTimes(1)
        await runOutTheCode()
        await act(async () => h.flow.resend())
        expect(sendRecoveryEmailOtp).toHaveBeenCalledTimes(2)
    })
})

describe('the write', () => {
    it('sends the trimmed address and the code, and nothing else', async () => {
        const h = mount()
        await nominate(h, '  new@tevi.com  ')
        await act(async () => h.flow.setOtp('999999'))
        expect(saveRecoveryEmail).toHaveBeenCalledWith(
            { recoveryEmail: 'new@tevi.com', otp: '999999' },
            'acc-1',
        )
        expect(h.onChanged).toHaveBeenCalledTimes(1)
    })

    it('fires only on the last digit', async () => {
        const h = mount()
        await nominate(h)
        for (const partial of ['9', '99', '999', '9999', '99999']) {
            await act(async () => h.flow.setOtp(partial))
        }
        expect(saveRecoveryEmail).not.toHaveBeenCalled()
    })

    it('never sends a dead code', async () => {
        const h = mount()
        await nominate(h)
        await runOutTheCode()
        expect(h.flow.isCodeExpired).toBe(true)
        await act(async () => h.flow.setOtp('999999'))
        expect(saveRecoveryEmail).not.toHaveBeenCalled()
    })
})

describe('when the write is refused', () => {
    /**
     * `docs/API_ERRORS.md`: the API's own sentence wins on a refused write. `422 AU004` is the one
     * this screen is most likely to meet — "already set" — and no string of ours could explain it.
     */
    it('shows the backend’s own message', async () => {
        saveRecoveryEmail.mockRejectedValue(
            rejection(422, {
                success: false,
                code: 'AU004',
                message: 'Recovery email already set',
            }),
        )
        const h = mount()
        await nominate(h)
        await act(async () => h.flow.setOtp('999999'))
        expect(h.flow.errorText).toBe('Recovery email already set')
        expect(h.onChanged).not.toHaveBeenCalled()
    })

    /** A 5xx keeps our translated sentence: nobody phrases a server fault for a user. */
    it('keeps our own wording for a server fault', async () => {
        saveRecoveryEmail.mockRejectedValue(rejection(503, { message: 'upstream exploded' }))
        const h = mount()
        await nominate(h)
        await act(async () => h.flow.setOtp('999999'))
        expect(h.flow.errorText).toBeNull()
        expect(h.flow.errorKey).toBe('auth_server_error')
    })

    /** The code is cleared and the reader stays where they can re-send. */
    it('clears the code and stays on the step', async () => {
        saveRecoveryEmail.mockRejectedValue(rejection(422, { message: 'Invalid OTP' }))
        const h = mount()
        await nominate(h)
        await act(async () => h.flow.setOtp('999999'))
        expect(h.flow.otp).toBe('')
        expect(h.flow.step).toBe('code')
    })

    it('restarts back to an empty address step', async () => {
        const h = mount()
        await nominate(h, 'new@tevi.com')
        act(() => h.flow.restart())
        expect(h.flow.step).toBe('email')
        expect(h.flow.email).toBe('')
        expect(h.flow.errorKey).toBeNull()
        expect(h.flow.errorText).toBeNull()
    })
})
