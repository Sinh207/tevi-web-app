// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type TwoFaSetup, useTwoFaSetup } from './use-two-fa-setup'

/**
 * Turning two-step verification **on** — five screens, and exactly two network calls, both at the end.
 *
 * Tested through the hook and not the rendered flow because every claim worth pinning is a *sequence*,
 * and none of them is visible in a tree:
 *
 * - the first three steps make **no request at all** — a passcode is chosen, not checked,
 * - a mismatch on the confirm step costs nothing and spends no code,
 * - *Skip* sends `passcode_hint: ''` rather than omitting the field, and the value is frozen when the
 *   step is left rather than read at write time,
 * - the create call carries all four fields, including a passcode chosen four screens earlier,
 * - a dead code is never sent, and a refused one clears the boxes without clearing the passcode.
 *
 * The last two are the expensive ones to get wrong: `POST v1/two-fa/passcode/` is not retried and the
 * OTP cannot be re-obtained without another email, so a double-send or a spent-code retry is a flow
 * the reader has to start over.
 */

const createPasscode = vi.fn()
const sendOtp = vi.fn()

vi.mock('../api/two-fa-api', () => ({
    twoFaApi: {
        createPasscode: (...a: unknown[]) => createPasscode(...a),
        // `POST v1/recovery-email/verify/` — the code's real source, per the auth contract. This
        // was `authApi.sendOtp` (the *login* OTP) until the contract was read.
        sendRecoveryEmailOtp: (...a: unknown[]) => sendOtp(...a),
        // The rest of the model is imported by `use-two-fa-flow`, which this hook borrows two
        // constants from. Stubbed so the module graph resolves; never called from here.
        verifyPasscode: vi.fn(),
        recoverPasscode: vi.fn(),
        verifyResetOtp: vi.fn(),
        resetPasscode: vi.fn(),
    },
}))
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

function Probe({
    out,
    onEnabled,
    initialEmail,
}: {
    out: { flow?: TwoFaSetup }
    onEnabled: () => void
    initialEmail: string | undefined
}) {
    out.flow = useTwoFaSetup({ initialEmail, onEnabled })
    return null
}

/**
 * `mount(null)` is the real **first** render of this hook — mounted above the bootstrap gate, before
 * `/me` lands, so the profile address is not known yet. `null` rather than `undefined` because a
 * default parameter fires for `undefined`, which quietly handed the test the value it was written to
 * prove was missing.
 */
function mount(initialEmail: string | null = 'me@tevi.com') {
    const onEnabled = vi.fn()
    const out: { flow?: TwoFaSetup } = {}
    const view = render(
        <Probe out={out} onEnabled={onEnabled} initialEmail={initialEmail ?? undefined} />,
    )
    return {
        onEnabled,
        /** Re-render with a different profile address, the way a landing `/me` does. */
        reseed(next: string) {
            view.rerender(<Probe out={out} onEnabled={onEnabled} initialEmail={next} />)
        },
        // Through a getter: every `act` re-renders and replaces the object.
        get flow() {
            return out.flow as TwoFaSetup
        },
    }
}

/** Choose `123456` twice and land on the hint step. */
function chooseCode(harness: ReturnType<typeof mount>, code = '123456') {
    act(() => harness.flow.setPasscode(code))
    act(() => harness.flow.setConfirm(code))
}

/** From the hint step through to the code step, with a code already sent. */
async function reachCodeStep(harness: ReturnType<typeof mount>, withHint = false) {
    act(() => harness.flow.submitHint(withHint))
    await act(async () => {
        harness.flow.sendCode(true)
    })
}

/**
 * Let the countdown reach zero.
 *
 * One second at a time inside its own `act`, because the timer is a **chain** of `setTimeout`s —
 * each tick schedules the next from an effect, so a single 61-second jump fires one of them and
 * React never gets to schedule the other fifty-nine. `use-two-fa-flow.test.tsx` runs its countdown
 * the same way for the same reason.
 */
async function runOutTheCode() {
    for (let i = 0; i < 61; i += 1) {
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
    }
}

const rejection = (status: number) =>
    new ApiError({ message: `Request failed with status code ${status}`, status })

beforeEach(() => {
    createPasscode.mockReset()
    createPasscode.mockResolvedValue(undefined)
    sendOtp.mockReset()
    sendOtp.mockResolvedValue({ sid: 'sid-1' })
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    cleanup()
})

describe('choosing the passcode', () => {
    it('advances on the sixth digit without a request', () => {
        const h = mount()
        act(() => h.flow.setPasscode('123456'))
        expect(h.flow.step).toBe('reenter')
        expect(createPasscode).not.toHaveBeenCalled()
        expect(sendOtp).not.toHaveBeenCalled()
    })

    it('does not advance on a partial code', () => {
        const h = mount()
        act(() => h.flow.setPasscode('12345'))
        expect(h.flow.step).toBe('passcode')
    })

    /**
     * A **local** comparison: no request, and nothing spent. The reader is three screens from the
     * network at this point, and mistyping the confirmation must not cost them a code.
     */
    it('reports a mismatch without calling anything, and clears only the copy', () => {
        const h = mount()
        act(() => h.flow.setPasscode('123456'))
        act(() => h.flow.setConfirm('123457'))
        expect(h.flow.step).toBe('reenter')
        expect(h.flow.errorKey).toBe('auth_two_fa_mismatch')
        expect(h.flow.confirm).toBe('')
        expect(h.flow.passcode).toBe('123456')
        expect(createPasscode).not.toHaveBeenCalled()
    })

    it('reaches the hint step when both match', () => {
        const h = mount()
        chooseCode(h)
        expect(h.flow.step).toBe('hint')
        expect(h.flow.errorKey).toBeNull()
    })
})

describe('the hint', () => {
    /** Legacy's *Skip* posts `''`. An omitted field on a call that **creates** a record is not the
     * same value, and this is the assertion that keeps the two apart. */
    it('is sent as an empty string when skipped', async () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('mum'))
        await reachCodeStep(h, false)
        await act(async () => h.flow.setOtp('999999'))
        expect(createPasscode).toHaveBeenCalledWith(
            expect.objectContaining({ passcodeHint: '' }),
            'acc-1',
        )
    })

    it('is trimmed and sent when kept', async () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('  mum  '))
        await reachCodeStep(h, true)
        await act(async () => h.flow.setOtp('999999'))
        expect(createPasscode).toHaveBeenCalledWith(
            expect.objectContaining({ passcodeHint: 'mum' }),
            'acc-1',
        )
    })

    it("is capped at the write's own maximum", () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('x'.repeat(80)))
        expect(h.flow.hint).toHaveLength(50)
    })
})

describe('the recovery address', () => {
    it('refuses to send to an address that is not one', async () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.submitHint(false))
        act(() => h.flow.setEmail('not-an-address'))
        await act(async () => h.flow.sendCode(true))
        expect(sendOtp).not.toHaveBeenCalled()
        expect(h.flow.errorKey).toBe('auth_email_invalid')
        expect(h.flow.step).toBe('email')
    })

    /**
     * `POST v1/recovery-email/verify/`, which the auth contract names as the source of the OTP that
     * `POST two-fa/passcode/` redeems. Pinned because this was `user-login/send-otp/` — the *login*
     * OTP, a different code from a different family — for as long as the contract went unread.
     */
    it('asks recovery-email/verify for the code and moves to the code step', async () => {
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        expect(sendOtp).toHaveBeenCalledWith('me@tevi.com', 'acc-1')
        expect(h.flow.step).toBe('code')
        expect(h.flow.resendIn).toBe(60)
    })

    it('drops the code and its sid when the address is edited', async () => {
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        act(() => h.flow.setOtp('12'))
        act(() => h.flow.back())
        expect(h.flow.step).toBe('email')
        expect(h.flow.otp).toBe('')
        expect(h.flow.resendIn).toBe(0)
    })
})

describe('the write', () => {
    it('carries all four fields, including a passcode chosen four screens earlier', async () => {
        const h = mount()
        chooseCode(h, '246810')
        act(() => h.flow.setHint('birthday'))
        await reachCodeStep(h, true)
        await act(async () => h.flow.setOtp('999999'))
        expect(createPasscode).toHaveBeenCalledTimes(1)
        expect(createPasscode).toHaveBeenCalledWith(
            {
                passcode: '246810',
                passcodeHint: 'birthday',
                recoveryEmail: 'me@tevi.com',
                otp: '999999',
            },
            'acc-1',
        )
        expect(h.flow.step).toBe('done')
        expect(h.onEnabled).toHaveBeenCalledTimes(1)
    })

    /** Not a request per keystroke — the sixth digit is the event, and only the sixth. */
    it('fires only on the last digit', async () => {
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        for (const partial of ['9', '99', '999', '9999', '99999']) {
            await act(async () => h.flow.setOtp(partial))
        }
        expect(createPasscode).not.toHaveBeenCalled()
    })

    /**
     * A refused code clears the boxes and **keeps everything else**. Making somebody re-choose a
     * passcode because a code expired would be punishing them for the mail's timing.
     */
    it('clears the code but not the passcode when it is refused', async () => {
        createPasscode.mockRejectedValue(rejection(422))
        const h = mount()
        chooseCode(h, '135790')
        await reachCodeStep(h)
        await act(async () => h.flow.setOtp('999999'))
        expect(h.flow.errorKey).toBe('auth_two_fa_otp_invalid')
        expect(h.flow.otp).toBe('')
        expect(h.flow.passcode).toBe('135790')
        expect(h.flow.step).toBe('code')
        expect(h.onEnabled).not.toHaveBeenCalled()
    })

    it('words a server fault as a server fault, not as a wrong code', async () => {
        createPasscode.mockRejectedValue(rejection(503))
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        await act(async () => h.flow.setOtp('999999'))
        expect(h.flow.errorKey).toBe('auth_server_error')
    })

    /**
     * **A dead code is never sent.** The countdown *is* the lifetime, so past zero the server has
     * already dropped it — and its refusal would read as "wrong code", sending somebody to re-check
     * digits that were right instead of pressing Resend.
     */
    it('does not send an expired code', async () => {
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        await runOutTheCode()
        expect(h.flow.isCodeExpired).toBe(true)
        await act(async () => h.flow.setOtp('999999'))
        expect(createPasscode).not.toHaveBeenCalled()
    })

    it('refuses a resend while the countdown is running, and allows one after it', async () => {
        const h = mount()
        chooseCode(h)
        await reachCodeStep(h)
        expect(sendOtp).toHaveBeenCalledTimes(1)
        await act(async () => h.flow.resend())
        expect(sendOtp).toHaveBeenCalledTimes(1)
        await runOutTheCode()
        await act(async () => h.flow.resend())
        expect(sendOtp).toHaveBeenCalledTimes(2)
        expect(h.flow.step).toBe('code')
    })
})

/**
 * **The profile's address, and the moment it arrives.**
 *
 * This hook is mounted by `TwoFaSettings` — above the bootstrap gate, so the screen's one back button
 * can walk it — which means its first render happens before `/me` has landed and `initialEmail` is
 * `undefined`. Seeding the field from `useState`'s initial argument therefore captured the blank, and
 * the reader reached the address step four screens later with an empty input and a disabled button on
 * an account whose address the app already knew.
 *
 * The regression was invisible to the tests above: they mount with the value already present, which
 * is what the old arrangement gave it. It was found in the browser.
 */
describe('the profile address', () => {
    it('is picked up when it lands after mount', () => {
        const h = mount(null)
        expect(h.flow.email).toBe('')
        expect(h.flow.isEmailValid).toBe(false)

        h.reseed('me@tevi.com')
        // What the screen calls on the way into the flow.
        act(() => h.flow.restart())

        expect(h.flow.email).toBe('me@tevi.com')
        expect(h.flow.isEmailValid).toBe(true)
    })

    /** A reader who edits it keeps their edit — `restart` reseeds, a re-render does not. */
    it('does not overwrite what the reader typed', () => {
        const h = mount(null)
        act(() => h.flow.setEmail('other@tevi.com'))
        h.reseed('me@tevi.com')
        expect(h.flow.email).toBe('other@tevi.com')
    })
})
